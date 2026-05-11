/**
 * Brevis Agent Runtime.
 *
 * Loads an agent definition, opens a session (run_id), runs the loop:
 *   1. check kill-switch    — halt if disabled
 *   2. check budget         — halt if today's cost > daily_cap
 *   3. call llmComplete     — get model output + tool calls
 *   4. dispatch tool calls  — log results, feed back into next iteration
 *   5. log every step       — to agent_runs
 *   6. exit when:           — model returns no tool calls (done) OR
 *                             max_steps reached OR
 *                             kill-switch flips OR
 *                             budget exceeded
 *
 * Mirrors Google ADK's LLM-Agent + Runner + Session split, but in plain
 * Node/JS against Postgres. ~250 LOC target.
 */
import { randomUUID } from 'crypto';
import { getPool } from './db.js';
import { llmComplete } from './llm.js';
import { dispatchTool, toolDefsForLlm } from '../tools/registry.js';

const DEFAULT_MAX_STEPS = 20;

/**
 * Conservative defaults for an unseeded agent. Used by `ensureAgentDefaults`
 * so the safety rails are NEVER fail-open just because someone forgot to
 * insert seed rows.
 *
 * Daily cap is intentionally tiny ($1) — a runaway loop hits it fast and Ops
 * pages. Bump per-agent caps explicitly via INSERT/UPDATE on `agent_budget`.
 */
const UNSEEDED_AGENT_DEFAULT_BUDGET_USD = 1.00;

/**
 * @typedef {Object} AgentDef
 * @property {string} name              - 'editor' | 'growth' | etc.
 * @property {string} description       - what the agent does
 * @property {string} systemPrompt      - the agent's system message
 * @property {string} model             - e.g. 'claude-sonnet-4-6' (used by anthropic provider)
 * @property {string[]} tools           - tool names this agent is allowed to call
 * @property {string} [provider]        - 'stub' | 'anthropic' | 'openai' (defaults to env)
 * @property {number} [maxSteps]        - default 20
 */

/**
 * @typedef {Object} RunContext
 * @property {string} triggeredBy       - 'cron' | 'event:<name>' | 'manual' | 'orchestrator'
 * @property {string} [parentRunId]     - if spawned by another agent
 * @property {Array<{role:string, content:string}>} initialMessages
 * @property {Object} [vars]            - any extra context the agent can read
 */

/**
 * Run an agent end-to-end.
 * @param {AgentDef} agent
 * @param {RunContext} ctx
 * @returns {Promise<{runId: string, status: string, steps: number, totalCostUsd: number, lastText: string}>}
 */
export async function runAgent(agent, ctx) {
    if (!agent?.name) throw new Error('[runtime] agent.name required');
    if (!ctx?.triggeredBy) throw new Error('[runtime] ctx.triggeredBy required');

    const pool = getPool();
    const runId = randomUUID();
    const messages = [...(ctx.initialMessages ?? [])];
    const maxSteps = agent.maxSteps ?? DEFAULT_MAX_STEPS;
    let stepIndex = 0;
    let totalCostUsd = 0;
    let lastText = '';
    let status = 'running';

    // ── Safety rail #0: ensure both rails actually have rows for this agent.
    // Without this, an unseeded agent runs fail-open (no kill-switch row →
    // isAgentEnabled defaults true; no budget row → checkBudget defaults
    // unlimited). Idempotent: ON CONFLICT DO NOTHING preserves existing seeds.
    await ensureAgentDefaults(pool, agent.name);

    await logStep(pool, {
        agent_name: agent.name,
        run_id: runId,
        parent_run_id: ctx.parentRunId ?? null,
        triggered_by: ctx.triggeredBy,
        step_index: stepIndex++,
        step_kind: 'start',
        status: 'running',
        payload: { description: agent.description, tools: agent.tools, vars: ctx.vars ?? {} },
    });

    try {
        while (stepIndex < maxSteps) {
            // ── Safety rail #1: kill-switch ──────────────────────────────────
            if (!await isAgentEnabled(pool, agent.name)) {
                status = 'killed';
                await logStep(pool, {
                    agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                    step_kind: 'error', status, error_message: 'kill-switch disabled',
                });
                break;
            }

            // ── Safety rail #2: budget ───────────────────────────────────────
            const budgetCheck = await checkBudget(pool, agent.name);
            if (!budgetCheck.ok) {
                status = 'budget_exceeded';
                await logStep(pool, {
                    agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                    step_kind: 'error', status,
                    error_message: `daily cost $${budgetCheck.spentToday} >= cap $${budgetCheck.cap}`,
                });
                break;
            }

            // ── LLM call ─────────────────────────────────────────────────────
            const result = await llmComplete({
                provider: agent.provider,
                model: agent.model,
                system: agent.systemPrompt,
                messages,
                // Convert allowlisted tool names to full LLM-shaped defs.
                tools: toolDefsForLlm(agent.tools),
            });
            totalCostUsd += result.usage?.cost_usd ?? 0;
            await logStep(pool, {
                agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                step_kind: 'llm_call',
                payload: { text: result.text, toolCallCount: result.toolCalls.length },
                input_tokens: result.usage?.input_tokens ?? 0,
                output_tokens: result.usage?.output_tokens ?? 0,
                cost_usd: result.usage?.cost_usd ?? 0,
            });
            lastText = result.text;

            // ── Done? ────────────────────────────────────────────────────────
            if (!result.toolCalls || result.toolCalls.length === 0) {
                status = 'completed';
                break;
            }

            // ── Dispatch tool calls ──────────────────────────────────────────
            messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });
            for (const call of result.toolCalls) {
                if (!agent.tools.includes(call.name)) {
                    await logStep(pool, {
                        agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                        step_kind: 'error',
                        error_message: `tool "${call.name}" not in allowlist for agent "${agent.name}"`,
                        payload: { call },
                    });
                    messages.push({
                        role: 'tool',
                        toolCallId: call.id,
                        content: `ERROR: tool "${call.name}" is not in this agent's allowlist.`,
                    });
                    continue;
                }
                await logStep(pool, {
                    agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                    step_kind: 'tool_call',
                    payload: { name: call.name, args: call.args, id: call.id },
                });
                let toolResult;
                try {
                    toolResult = await dispatchTool(call.name, call.args, {
                        agentName: agent.name,
                        runId,
                        vars: ctx.vars ?? {},
                    });
                } catch (toolErr) {
                    toolResult = { ok: false, error: toolErr.message };
                }
                await logStep(pool, {
                    agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                    step_kind: 'tool_result',
                    payload: { name: call.name, result: toolResult },
                });
                messages.push({
                    role: 'tool',
                    toolCallId: call.id,
                    content: JSON.stringify(toolResult),
                });
            }
        }

        if (status === 'running') {
            // Hit max_steps without completing — count as failed for visibility.
            status = 'failed';
            await logStep(pool, {
                agent_name: agent.name, run_id: runId, step_index: stepIndex++,
                step_kind: 'error', status,
                error_message: `max_steps (${maxSteps}) reached without completion`,
            });
        }
    } catch (err) {
        status = 'failed';
        await logStep(pool, {
            agent_name: agent.name, run_id: runId, step_index: stepIndex++,
            step_kind: 'error', status, error_message: err.message,
            payload: { stack: err.stack?.split('\n').slice(0, 5).join('\n') },
        });
    }

    // ── Final 'finish' row closes the run ────────────────────────────────────
    await pool.query(
        `INSERT INTO agent_runs (agent_name, run_id, parent_run_id, triggered_by,
                                 ended_at, status, step_index, step_kind, payload, cost_usd)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, 'finish', $7::jsonb, $8)`,
        [agent.name, runId, ctx.parentRunId ?? null, ctx.triggeredBy, status,
         stepIndex, JSON.stringify({ totalCostUsd, lastText: lastText.slice(0, 500) }),
         totalCostUsd]
    );

    return { runId, status, steps: stepIndex, totalCostUsd, lastText };
}

// ────────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────────

async function logStep(pool, row) {
    await pool.query(
        `INSERT INTO agent_runs (agent_name, run_id, parent_run_id, triggered_by,
                                 status, step_index, step_kind, payload,
                                 input_tokens, output_tokens, cost_usd, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)`,
        [
            row.agent_name,
            row.run_id,
            row.parent_run_id ?? null,
            row.triggered_by ?? 'unknown',
            row.status ?? 'running',
            row.step_index,
            row.step_kind,
            JSON.stringify(row.payload ?? {}),
            row.input_tokens ?? 0,
            row.output_tokens ?? 0,
            row.cost_usd ?? 0,
            row.error_message ?? null,
        ]
    );
}

/**
 * Insert default rows in agent_kill_switch + agent_budget for this agent
 * if (and only if) they don't already exist. Idempotent.
 *
 * Defaults: enabled=true, daily_cap_usd=$1. The conservative cap means a
 * runaway agent gets paused fast — operators raise it explicitly when they
 * understand the agent's real cost profile.
 */
async function ensureAgentDefaults(pool, agentName) {
    await pool.query(
        `INSERT INTO agent_kill_switch (agent_name, enabled, updated_by)
         VALUES ($1, TRUE, 'runtime-autoseed')
         ON CONFLICT (agent_name) DO NOTHING`,
        [agentName]
    );
    await pool.query(
        `INSERT INTO agent_budget (agent_name, daily_cap_usd)
         VALUES ($1, $2)
         ON CONFLICT (agent_name) DO NOTHING`,
        [agentName, UNSEEDED_AGENT_DEFAULT_BUDGET_USD]
    );
}

async function isAgentEnabled(pool, agentName) {
    const r = await pool.query(
        'SELECT enabled FROM agent_kill_switch WHERE agent_name = $1',
        [agentName]
    );
    // After ensureAgentDefaults a row always exists; this is a guard for
    // direct callers of isAgentEnabled (tests, ops scripts).
    if (r.rows.length === 0) return true;
    return r.rows[0].enabled === true;
}

async function checkBudget(pool, agentName) {
    const r = await pool.query(
        `SELECT
            COALESCE((SELECT daily_cap_usd FROM agent_budget WHERE agent_name = $1), NULL) AS cap,
            COALESCE(SUM(cost_usd), 0) AS spent_today
         FROM agent_runs
         WHERE agent_name = $1
           AND started_at >= date_trunc('day', NOW())`,
        [agentName]
    );
    const row = r.rows[0];
    if (row.cap == null) return { ok: true, cap: null, spentToday: Number(row.spent_today) };
    const cap = Number(row.cap);
    const spent = Number(row.spent_today);
    return { ok: spent < cap, cap, spentToday: spent };
}

/**
 * Emit an event onto the bus (other agents subscribed via LISTEN/NOTIFY pick it up).
 */
export async function emitEvent({ eventName, payload, emittedBy }) {
    const pool = getPool();
    await pool.query(
        `INSERT INTO agent_events (event_name, payload, emitted_by)
         VALUES ($1, $2::jsonb, $3)`,
        [eventName, JSON.stringify(payload ?? {}), emittedBy ?? 'system']
    );
}
