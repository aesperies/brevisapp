#!/usr/bin/env node
/**
 * Day-1 verification harness for Agent Stack v1.
 *
 * Spins up an in-process pglite Postgres, applies migration 001, then exercises:
 *   - schema is correct (tables exist, seeds present, NOTIFY trigger fires)
 *   - kill-switch can disable an agent
 *   - budget guard refuses to overspend
 *   - newsletter_drafts FK works
 *
 * Run: `node tasks/verify-agent-stack.mjs`
 *
 * NOTE: this does NOT exercise the runtime end-to-end (the runtime uses
 * pg.Pool, pglite is a different driver). For full E2E, run `npm run migrate`
 * and `npm run agents:hello` against your real DATABASE_URL.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

let failed = 0;
function check(name, cond, detail = '') {
    if (cond) {
        console.log(`  ✅ ${name}`);
    } else {
        console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

const db = new PGlite();
console.log('▸ pglite booted\n');

// Stub the users table that newsletter_drafts FKs to. Mirrors the real Brevis
// schema (database.js) so db_lookup templates that reference these columns
// (name, language, plan, is_active) work in this in-memory harness too.
await db.exec(`
    CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) DEFAULT 'Test User',
        language VARCHAR(5) DEFAULT 'es',
        plan VARCHAR(20) DEFAULT 'free',
        is_active INT DEFAULT 1
    );
`);

// Apply our migration.
const sql = readFileSync(path.join(REPO, 'migrations/001_agent_stack.sql'), 'utf8');
try {
    await db.exec(sql);
    console.log('✅ migration 001_agent_stack.sql applied cleanly\n');
} catch (err) {
    console.error('❌ migration failed:', err.message);
    process.exit(1);
}

// ─── Schema checks ──────────────────────────────────────────────────────────
console.log('── Schema ──');
const tables = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
`)).rows.map(r => r.table_name);
for (const t of ['agent_runs', 'agent_events', 'agent_kill_switch', 'agent_budget', 'newsletter_drafts']) {
    check(`table ${t} exists`, tables.includes(t));
}

// ─── Seed checks ────────────────────────────────────────────────────────────
console.log('\n── Seeds ──');
const sw = (await db.query('SELECT agent_name, enabled FROM agent_kill_switch ORDER BY agent_name')).rows;
const expectedAgents = ['editor', 'engineer', 'growth', 'ops', 'orchestrator', 'sales', 'support'];
check('kill-switch seeded for all 7 agents', sw.length === 7);
check('every seed agent enabled', sw.every(r => r.enabled));
check('seed agent names correct',
    JSON.stringify(sw.map(r => r.agent_name).sort()) === JSON.stringify(expectedAgents));

const bg = (await db.query('SELECT agent_name, daily_cap_usd FROM agent_budget ORDER BY agent_name')).rows;
check('budget seeded for all 7 agents', bg.length === 7);
check('all budgets > 0', bg.every(r => Number(r.daily_cap_usd) > 0));

// ─── NOTIFY trigger ─────────────────────────────────────────────────────────
console.log('\n── NOTIFY trigger ──');
const trig = (await db.query(`
    SELECT trigger_name FROM information_schema.triggers
    WHERE event_object_table = 'agent_events'
`)).rows;
check('agent_events_notify_trigger present',
    trig.some(r => r.trigger_name === 'agent_events_notify_trigger'));

// pglite's LISTEN/NOTIFY support is partial; we only assert the trigger exists.
// Real LISTEN/NOTIFY behavior is verified against real Postgres on Antonio's box.

// ─── Functional: kill-switch ────────────────────────────────────────────────
console.log('\n── Kill-switch ──');
await db.exec(`
    UPDATE agent_kill_switch SET enabled = false, reason = 'test', updated_by = 'verifier'
    WHERE agent_name = 'editor'
`);
const editorEnabled = (await db.query(
    `SELECT enabled FROM agent_kill_switch WHERE agent_name = 'editor'`
)).rows[0].enabled;
check('editor kill-switch flips to false', editorEnabled === false);
await db.exec(`UPDATE agent_kill_switch SET enabled = true WHERE agent_name = 'editor'`);

// ─── Functional: agent_runs append + cost sum ───────────────────────────────
console.log('\n── agent_runs + cost sum ──');
await db.exec(`
    INSERT INTO agent_runs (agent_name, run_id, triggered_by, step_index, step_kind, cost_usd)
    VALUES
        ('editor', '00000000-0000-0000-0000-000000000001', 'manual', 0, 'start',    0),
        ('editor', '00000000-0000-0000-0000-000000000001', 'manual', 1, 'llm_call', 0.42),
        ('editor', '00000000-0000-0000-0000-000000000001', 'manual', 2, 'finish',   0)
`);
const sumRow = (await db.query(`
    SELECT COALESCE(SUM(cost_usd), 0) AS spent
    FROM agent_runs
    WHERE agent_name = 'editor' AND started_at >= date_trunc('day', NOW())
`)).rows[0];
check('cost sum for today returns 0.42', Number(sumRow.spent) === 0.42, `got ${sumRow.spent}`);

// ─── Functional: newsletter_drafts FK + default review_status ──────────────
console.log('\n── newsletter_drafts ──');
await db.exec(`INSERT INTO users (email) VALUES ('test@brevis.local')`);
const userId = (await db.query('SELECT id FROM users LIMIT 1')).rows[0].id;
await db.exec(`
    INSERT INTO newsletter_drafts (user_id, run_id, language, subject, html_body)
    VALUES (${userId}, gen_random_uuid(), 'en', 'Test', '<p>hi</p>')
`);
const draft = (await db.query(`
    SELECT subject, language, review_status, sent_at FROM newsletter_drafts
`)).rows[0];
check('draft inserted', draft.subject === 'Test');
check('default review_status = pending', draft.review_status === 'pending');
check('default sent_at is NULL', draft.sent_at == null);

// ─── Functional: NOTIFY-trigger insert (event row created) ──────────────────
console.log('\n── agent_events insert ──');
await db.exec(`
    INSERT INTO agent_events (event_name, payload, emitted_by)
    VALUES ('signup.created', '{"user_id": 1}'::jsonb, 'system')
`);
const ev = (await db.query(`SELECT event_name, emitted_by FROM agent_events`)).rows[0];
check('event row inserted', ev?.event_name === 'signup.created' && ev?.emitted_by === 'system');

// ─── Functional: ensureAgentDefaults idempotency contract ──────────────────
// Mirrors what runAgent() does on every invocation. Verifies that:
//   (1) an unseeded agent name gets a kill-switch row (enabled=true) on first call
//   (2) it also gets a budget row with the conservative $1 default
//   (3) calling again does NOT overwrite (ON CONFLICT DO NOTHING)
console.log('\n── ensureAgentDefaults (auto-seed) ──');
const UNSEEDED = 'phantom_agent';
// First call (simulates runAgent's autoseed)
await db.exec(`
    INSERT INTO agent_kill_switch (agent_name, enabled, updated_by)
    VALUES ('${UNSEEDED}', TRUE, 'runtime-autoseed')
    ON CONFLICT (agent_name) DO NOTHING;
    INSERT INTO agent_budget (agent_name, daily_cap_usd)
    VALUES ('${UNSEEDED}', 1.00)
    ON CONFLICT (agent_name) DO NOTHING;
`);
const seeded = (await db.query(
    `SELECT enabled, updated_by FROM agent_kill_switch WHERE agent_name = '${UNSEEDED}'`
)).rows[0];
check('autoseed inserted kill-switch (enabled=true, by=runtime-autoseed)',
    seeded?.enabled === true && seeded?.updated_by === 'runtime-autoseed');
const seededBudget = (await db.query(
    `SELECT daily_cap_usd FROM agent_budget WHERE agent_name = '${UNSEEDED}'`
)).rows[0];
check('autoseed inserted budget at $1.00 default',
    Number(seededBudget?.daily_cap_usd) === 1.00);

// Now flip enabled=false and re-run autoseed — must NOT overwrite.
await db.exec(`
    UPDATE agent_kill_switch SET enabled = FALSE, reason = 'operator paused'
    WHERE agent_name = '${UNSEEDED}';
    INSERT INTO agent_kill_switch (agent_name, enabled, updated_by)
    VALUES ('${UNSEEDED}', TRUE, 'runtime-autoseed')
    ON CONFLICT (agent_name) DO NOTHING;
`);
const stillDisabled = (await db.query(
    `SELECT enabled, reason FROM agent_kill_switch WHERE agent_name = '${UNSEEDED}'`
)).rows[0];
check('autoseed is idempotent (does not re-enable a paused agent)',
    stillDisabled?.enabled === false && stillDisabled?.reason === 'operator paused');

// ─── Day 2: migration 002 + digest schema ──────────────────────────────────
console.log('\n── Day 2: migration 002_digests.sql ──');
// Brevis production schema dependencies that 002 needs (newsletters, tags, newsletter_tags).
// Stub them with the same shapes Brevis defines in database.js.
await db.exec(`
    CREATE TABLE newsletters (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        sender VARCHAR(255),
        content TEXT,
        summary TEXT,
        url VARCHAR(1000),
        is_read INT DEFAULT 0,
        date_added TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE tags (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(20) DEFAULT '#000000'
    );
    CREATE TABLE newsletter_tags (
        newsletter_id INT NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
        tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (newsletter_id, tag_id)
    );
`);

const sql002 = readFileSync(path.join(REPO, 'migrations/002_digests.sql'), 'utf8');
try {
    await db.exec(sql002);
    console.log('  ✅ migration 002_digests.sql applied cleanly');
} catch (err) {
    console.error('  ❌ migration 002 failed:', err.message);
    failed++;
}

const t002 = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('digests','digest_tags','digest_runs')
`)).rows.map(r => r.table_name);
check('table digests exists', t002.includes('digests'));
check('table digest_tags exists', t002.includes('digest_tags'));
check('table digest_runs exists', t002.includes('digest_runs'));

// CHECK constraint on cadence
let cadenceRejected = false;
try {
    await db.exec(`
        INSERT INTO users (email) VALUES ('day2-bad@brevis.local');
        INSERT INTO digests (user_id, name, cadence)
        VALUES ((SELECT id FROM users WHERE email='day2-bad@brevis.local'), 'Bad', 'hourly');
    `);
} catch (_err) {
    cadenceRejected = true;
}
check("cadence='hourly' rejected by CHECK constraint", cadenceRejected);

// UNIQUE (digest_id, scheduled_for) on digest_runs
await db.exec(`
    INSERT INTO users (email) VALUES ('day2@brevis.local');
    WITH u AS (SELECT id FROM users WHERE email='day2@brevis.local')
    INSERT INTO digests (user_id, name, cadence)
    SELECT u.id, 'Daily AM', 'daily' FROM u;
`);
const digestId = (await db.query(`SELECT id FROM digests WHERE name='Daily AM'`)).rows[0].id;
await db.exec(`
    INSERT INTO digest_runs (digest_id, scheduled_for, status)
    VALUES (${digestId}, '2026-05-04T07:00:00Z', 'completed')
`);
let dupRejected = false;
try {
    await db.exec(`
        INSERT INTO digest_runs (digest_id, scheduled_for, status)
        VALUES (${digestId}, '2026-05-04T07:00:00Z', 'completed')
    `);
} catch (_err) {
    dupRejected = true;
}
check('UNIQUE (digest_id, scheduled_for) blocks duplicate run rows', dupRejected);

// ─── Day 2: db_lookup template SQL exercises ──────────────────────────────
console.log('\n── Day 2: db_lookup template SQL ──');

// Read template SQL strings from the source so we exercise the same literals
// agents will use at runtime.
const dbToolsSrc = readFileSync(path.join(REPO, 'agents/tools/db-tools.js'), 'utf8');
function extractTemplateSql(name) {
    const re = new RegExp(`${name}:\\s*\\{[\\s\\S]*?sql:\\s*\`([\\s\\S]*?)\``);
    const m = dbToolsSrc.match(re);
    return m ? m[1] : null;
}

// Seed fixtures for newsletters + tags
const userIdRow = (await db.query(`SELECT id FROM users WHERE email='day2@brevis.local'`)).rows[0];
const uid = userIdRow.id;
await db.exec(`
    INSERT INTO tags (user_id, name, color) VALUES
        (${uid}, 'work', '#ff0000'),
        (${uid}, 'reading', '#00ff00');
    INSERT INTO newsletters (user_id, title, sender, summary, date_added) VALUES
        (${uid}, 'AI weekly', 'tech@example.com', 'big update', NOW() - INTERVAL '1 day'),
        (${uid}, 'Legal brief', 'law@example.com', 'court case', NOW() - INTERVAL '3 days'),
        (${uid}, 'Finance recap', 'fin@example.com', 'q1 results', NOW() - INTERVAL '8 days');
    INSERT INTO newsletter_tags (newsletter_id, tag_id)
    SELECT n.id, (SELECT id FROM tags WHERE user_id=${uid} AND name='work')
    FROM newsletters n WHERE n.user_id=${uid} AND n.title='AI weekly';
    INSERT INTO newsletter_tags (newsletter_id, tag_id)
    SELECT n.id, (SELECT id FROM tags WHERE user_id=${uid} AND name='reading')
    FROM newsletters n WHERE n.user_id=${uid} AND n.title='Legal brief';
`);

// user_profile
const userProfileSql = extractTemplateSql('user_profile');
check('user_profile template SQL extracted', !!userProfileSql);
const upRows = (await db.query(userProfileSql, [uid])).rows;
check('user_profile returns active user',
    upRows.length === 1 && upRows[0].email === 'day2@brevis.local');

// digests_for_user
const digestsForUserSql = extractTemplateSql('digests_for_user');
check('digests_for_user template SQL extracted', !!digestsForUserSql);
const dfu = (await db.query(digestsForUserSql, [uid])).rows;
check('digests_for_user returns 1 active digest', dfu.length === 1 && dfu[0].name === 'Daily AM');

// newsletters_for_digest, no tag filter — last 7 days should give 2 (1 day, 3 day; 8 day excluded)
const nfdSql = extractTemplateSql('newsletters_for_digest');
check('newsletters_for_digest template SQL extracted', !!nfdSql);
const fromIso = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
const toIso = new Date(Date.now() + 60 * 1000).toISOString();
const nfd = (await db.query(nfdSql, [uid, fromIso, toIso, null])).rows;
check('newsletters_for_digest returns 2 in 7-day window (no tag filter)', nfd.length === 2);

// With tag filter: only 'work' tag → 1 result ('AI weekly')
const workTagId = (await db.query(`SELECT id FROM tags WHERE user_id=${uid} AND name='work'`)).rows[0].id;
const nfdWork = (await db.query(nfdSql, [uid, fromIso, toIso, [workTagId]])).rows;
check('newsletters_for_digest with tag filter returns just the tagged item',
    nfdWork.length === 1 && nfdWork[0].title === 'AI weekly');

// count_newsletters_for_user = 3
const cnflSql = extractTemplateSql('count_newsletters_for_user');
check('count_newsletters_for_user returns 3', (await db.query(cnflSql, [uid])).rows[0].n === 3);

// ─── Day 2: verify_metric extractNumbers + literal-source verification ──────
console.log('\n── Day 2: verify_metric ──');
const { extractNumbers } = await import(path.join('file://', REPO, 'agents/tools/verify-metric.js'));
check('extractNumbers parses "we have 47 users this week"',
    JSON.stringify(extractNumbers('we have 47 users this week')) === '[47]');
check('extractNumbers handles decimals',
    JSON.stringify(extractNumbers('open rate is 42.5%')) === '[42.5]');
check('extractNumbers handles multiple numbers',
    JSON.stringify(extractNumbers('128 newsletters across 5 tags')) === '[128,5]');
check('extractNumbers returns [] on no number',
    extractNumbers('nothing here').length === 0);

await db.close();

console.log(`\n${failed === 0 ? '✅ All checks passed.' : `❌ ${failed} check(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);
