#!/usr/bin/env node
/**
 * CLI for invoking agents manually.
 *
 * Usage:
 *   node agents/runtime/cli.js hello                          # Day-1 smoke test
 *   node agents/runtime/cli.js editor:dryrun --user-id 42     # Day-2 Editor dry-run
 *   node agents/runtime/cli.js editor:dryrun --user-id 42 --digest-id 7
 *   node agents/runtime/cli.js editor:dryrun --user-id 42 --period-days 7
 */
import { runAgent } from './index.js';
import { closePool } from './db.js';
import '../tools/index.js'; // side-effect: registers all production tools
import { EDITOR_AGENT } from '../editor/agent.js';

// ─── Day-1 hello agent: stub provider, smoke-test only ──────────────────────
const HELLO_AGENT = {
    name: 'hello',
    description: 'Smoke-test agent. Calls echo + db_now, then exits.',
    systemPrompt: 'You are a smoke-test agent. Call echo with a short message, then call db_now, then say done.',
    model: 'stub',
    provider: 'stub',
    tools: ['echo', 'db_now'],
    maxSteps: 5,
};

// ─── arg parsing (tiny, dep-free) ────────────────────────────────────────────
function parseFlags(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            flags[key] = true;
        } else {
            flags[key] = next;
            i++;
        }
    }
    return flags;
}

// ─── command: editor:dryrun ──────────────────────────────────────────────────
async function runEditorDryrun(flags) {
    const userId = Number(flags['user-id']);
    if (!userId) {
        console.error('❌ [cli] editor:dryrun requires --user-id <int>');
        process.exit(1);
    }
    const digestId = flags['digest-id'] ? Number(flags['digest-id']) : null;
    const periodDays = flags['period-days'] ? Number(flags['period-days']) : 7;

    const now = new Date();
    const from = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    const userMessage =
        `Build a digest in dry-run mode.\n` +
        `user_id: ${userId}\n` +
        (digestId ? `digest_id: ${digestId}\n` : `digest_id: (use the user's first non-paused digest, or fall back to "all newsletters in period" if the user has no digest configured)\n`) +
        `period: ${from.toISOString()} to ${now.toISOString()} (${periodDays} day window)\n\n` +
        `Follow the steps in your system prompt. Verify every numeric claim. Persist via draft_create. ` +
        `Reply with the one-line summary.`;

    console.log(`→  [cli] editor:dryrun  user=${userId}  digest=${digestId ?? 'auto'}  window=${periodDays}d`);
    const result = await runAgent(EDITOR_AGENT, {
        triggeredBy: 'manual',
        initialMessages: [{ role: 'user', content: userMessage }],
        vars: { user_id: userId, digest_id: digestId, period_days: periodDays },
    });

    console.log('✅ [cli] run complete:');
    console.log(`   run_id:  ${result.runId}`);
    console.log(`   status:  ${result.status}`);
    console.log(`   steps:   ${result.steps}`);
    console.log(`   cost:    $${result.totalCostUsd.toFixed(6)}`);
    console.log(`   output:  ${result.lastText.slice(0, 300)}`);
}

// ─── command: hello (Day-1 smoke test) ───────────────────────────────────────
async function runHello() {
    const result = await runAgent(HELLO_AGENT, {
        triggeredBy: 'manual',
        initialMessages: [{ role: 'user', content: `Hello agent, please confirm you're alive.` }],
    });
    console.log('✅ [cli] hello complete:');
    console.log(`   run_id:  ${result.runId}`);
    console.log(`   status:  ${result.status}`);
    console.log(`   steps:   ${result.steps}`);
    console.log(`   cost:    $${result.totalCostUsd.toFixed(6)}`);
    console.log(`   output:  ${result.lastText.slice(0, 200)}`);
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
    const cmd = process.argv[2] ?? 'hello';
    const flags = parseFlags(process.argv.slice(3));

    if (cmd === 'hello') {
        await runHello();
    } else if (cmd === 'editor:dryrun') {
        await runEditorDryrun(flags);
    } else {
        console.error(`❌ [cli] unknown command: ${cmd}`);
        console.error('Known commands: hello, editor:dryrun');
        process.exit(1);
    }

    await closePool();
}

main().catch(async (err) => {
    console.error('❌ [cli] fatal:', err);
    await closePool().catch(() => {});
    process.exit(1);
});
