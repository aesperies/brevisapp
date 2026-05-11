/**
 * LLM provider abstraction.
 *
 * The runtime calls `llmComplete({ provider, model, messages, tools, system })`
 * and gets back `{ text, toolCalls, usage: { input_tokens, output_tokens, cost_usd } }`.
 *
 * Provider selection:
 *   - explicit per-call: `{ provider: 'stub' | 'anthropic' | 'openai' }`
 *   - else env: `LLM_DEFAULT_PROVIDER` (default 'stub' for safety in tests)
 *
 * The runtime's *generic* message format:
 *   - { role: 'user'|'assistant'|'system', content: string }
 *   - { role: 'tool', toolCallId, content: string }   // result of a previous tool call
 *   - { role: 'assistant', content: string, toolCalls: [{id, name, args}] }
 *
 * Each provider adapts to/from this shape.
 */
import Anthropic from '@anthropic-ai/sdk';

const PROVIDERS = {};

// ─── Pricing table (USD per million tokens) ──────────────────────────────────
// Sourced from Anthropic public pricing as of May 2026. Update when prices change.
// If the model isn't listed, falls back to a conservative high default so cost
// can never silently go to zero.
const PRICING_PER_M_TOKENS = {
    'claude-opus-4-6':            { input: 15.00, output: 75.00 },
    'claude-sonnet-4-6':          { input:  3.00, output: 15.00 },
    'claude-haiku-4-5':           { input:  1.00, output:  5.00 },
    'claude-haiku-4-5-20251001':  { input:  1.00, output:  5.00 },
    // Legacy aliases
    'claude-3-5-sonnet-latest':   { input:  3.00, output: 15.00 },
    'claude-3-5-haiku-latest':    { input:  1.00, output:  5.00 },
};
const DEFAULT_PRICING = { input: 5.00, output: 25.00 }; // pessimistic fallback

function priceUsd(model, inputTokens, outputTokens) {
    const p = PRICING_PER_M_TOKENS[model] ?? DEFAULT_PRICING;
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

// ─── stub provider: deterministic, free, used for smoke-test + offline tests ─
PROVIDERS.stub = async function stubComplete({ messages, system }) {
    const last = messages[messages.length - 1];
    const userText = typeof last?.content === 'string' ? last.content : '(non-text)';
    const text = `[stub-llm] You said: "${userText.slice(0, 200)}". (system prompt was ${system?.length ?? 0} chars.)`;
    return {
        text,
        toolCalls: [],
        usage: {
            input_tokens: Math.ceil((system?.length ?? 0) / 4) + Math.ceil(userText.length / 4),
            output_tokens: Math.ceil(text.length / 4),
            cost_usd: 0,
        },
    };
};

// ─── anthropic provider ─────────────────────────────────────────────────────
let _anthropicClient = null;
function getAnthropic() {
    if (_anthropicClient) return _anthropicClient;
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('[llm/anthropic] ANTHROPIC_API_KEY is not set.');
    }
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return _anthropicClient;
}

/**
 * Convert generic messages → Anthropic messages.
 * Anthropic semantics:
 *   - assistant turns with tool calls: content is an array with text + tool_use blocks
 *   - tool results: encoded as a `user` message with `tool_result` content blocks
 *   - 'system' messages are NOT in the array; they go to the top-level `system` param
 */
function toAnthropicMessages(generic) {
    const out = [];
    let pendingToolResults = [];

    const flushToolResults = () => {
        if (pendingToolResults.length === 0) return;
        out.push({ role: 'user', content: pendingToolResults });
        pendingToolResults = [];
    };

    for (const m of generic) {
        if (m.role === 'system') continue; // handled separately
        if (m.role === 'tool') {
            pendingToolResults.push({
                type: 'tool_result',
                tool_use_id: m.toolCallId,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            });
            continue;
        }
        // Any non-tool message flushes pending tool results first.
        flushToolResults();
        if (m.role === 'assistant') {
            const blocks = [];
            if (m.content) blocks.push({ type: 'text', text: m.content });
            if (Array.isArray(m.toolCalls)) {
                for (const tc of m.toolCalls) {
                    blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} });
                }
            }
            out.push({ role: 'assistant', content: blocks });
        } else {
            // user
            out.push({
                role: 'user',
                content: typeof m.content === 'string'
                    ? m.content
                    : [{ type: 'text', text: JSON.stringify(m.content) }],
            });
        }
    }
    flushToolResults();
    return out;
}

PROVIDERS.anthropic = async function anthropicComplete({ model, system, messages, tools }) {
    const client = getAnthropic();
    const finalModel = model ?? 'claude-sonnet-4-6';
    const resp = await client.messages.create({
        model: finalModel,
        max_tokens: 4096,
        system: system ?? undefined,
        messages: toAnthropicMessages(messages),
        ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    });

    // Parse content blocks into text + toolCalls.
    let text = '';
    const toolCalls = [];
    for (const block of resp.content ?? []) {
        if (block.type === 'text') {
            text += (text ? '\n' : '') + block.text;
        } else if (block.type === 'tool_use') {
            toolCalls.push({
                id: block.id,
                name: block.name,
                args: block.input ?? {},
            });
        }
    }

    const inputTokens = resp.usage?.input_tokens ?? 0;
    const outputTokens = resp.usage?.output_tokens ?? 0;
    return {
        text,
        toolCalls,
        usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: priceUsd(finalModel, inputTokens, outputTokens),
        },
    };
};

// ─── openai provider: deferred ──────────────────────────────────────────────
PROVIDERS.openai = async function openaiComplete(_args) {
    throw new Error(
        '[llm] openai provider not wired yet. Brevis already has the openai dep; wire if cross-provider needed.'
    );
};

// ─── public entry point ─────────────────────────────────────────────────────
export async function llmComplete(args) {
    const provider = args.provider
        ?? process.env.LLM_DEFAULT_PROVIDER
        ?? 'stub';
    const fn = PROVIDERS[provider];
    if (!fn) throw new Error(`[llm] unknown provider: ${provider}`);
    return fn(args);
}

export const __providers = PROVIDERS; // exported for tests
export { priceUsd, toAnthropicMessages, PRICING_PER_M_TOKENS };
