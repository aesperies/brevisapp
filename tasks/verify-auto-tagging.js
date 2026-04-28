// tasks/verify-auto-tagging.js
// End-to-end verification for Feature 1 — Auto-tagging by sender.
//
// Runs three scenarios against a live Brevis Postgres DB:
//   A. Happy path         — 3 tagged newsletters from sender X, 4th gets auto-tagged.
//   B. Blocklist learning — remove auto-tag 3× from same sender/tag, new one stops inheriting.
//   C. User opt-out       — auto_tag_enabled=false skips auto-tagging entirely.
//
// Usage:
//   DATABASE_URL=postgres://... node tasks/verify-auto-tagging.js
//
// Safe to re-run: creates a disposable test user scoped to this run and cleans up
// (unless you pass --keep to leave fixtures in place for manual inspection).
//
// Does NOT touch your production user. Identifies fixtures by email prefix
// "autotag-verify-<timestamp>@brevis-test.local".

import pg from 'pg';
import { dbHelpers, generateEmailCode } from '../database.js';

const { Pool } = pg;

const KEEP = process.argv.includes('--keep');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const stamp = Date.now();
const testEmail = `autotag-verify-${stamp}@brevis-test.local`;

let userId;

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.log(`  ❌ ${label}`); if (detail) console.log(`     ${detail}`); process.exitCode = 1; }

async function setup() {
    console.log(`\n→ Creating test user ${testEmail}`);
    const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, name, email_code, plan, auto_tag_enabled)
         VALUES ($1, 'x', 'AutoTag Verify', $2, 'free', TRUE)
         RETURNING id`,
        [testEmail, generateEmailCode()]
    );
    userId = rows[0].id;

    // Seed two tags the test will apply.
    await pool.query(
        `INSERT INTO tags (user_id, name, color) VALUES ($1, 'Crypto', '#8C5AFF'), ($1, 'Legal', '#FFD23F')`,
        [userId]
    );
}

async function insertNewsletter(sender, title, tagNames = []) {
    // Use the real helper so sender_key derivation + auto-tagger runs.
    const n = await dbHelpers.createNewsletter(
        userId,
        title,
        sender,
        'test content',
        null,
        { source: 'email', rawSender: sender }
    );
    for (const name of tagNames) {
        const t = await pool.query(`SELECT id FROM tags WHERE user_id=$1 AND name=$2`, [userId, name]);
        if (t.rows[0]) await dbHelpers.addTagToNewsletter(n.id, t.rows[0].id, false);
    }
    return n;
}

async function getTagsFor(newsletterId) {
    const { rows } = await pool.query(
        `SELECT t.name, nt.auto_tagged
         FROM newsletter_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.newsletter_id = $1
         ORDER BY t.name`,
        [newsletterId]
    );
    return rows;
}

async function scenarioA_happyPath() {
    console.log('\n[A] Happy path — 4th newsletter inherits tags from first 3');
    const sender = 'Morning Brew <crew@morningbrew.com>';
    await insertNewsletter(sender, 'MB #1', ['Crypto']);
    await insertNewsletter(sender, 'MB #2', ['Crypto']);
    await insertNewsletter(sender, 'MB #3', ['Crypto']);
    const fourth = await insertNewsletter(sender, 'MB #4', []);
    const tags = await getTagsFor(fourth.id);
    const auto = tags.filter(t => t.auto_tagged);
    if (auto.length === 1 && auto[0].name === 'Crypto') pass('4th newsletter got "Crypto" auto-tagged');
    else fail('4th newsletter should have exactly one auto-tag (Crypto)', JSON.stringify(tags));
}

async function scenarioB_blocklist() {
    console.log('\n[B] Blocklist learning — 3 removals train Brevis to stop inheriting');
    const sender = 'The Information <news@theinformation.com>';
    await insertNewsletter(sender, 'TI #1', ['Legal']);
    await insertNewsletter(sender, 'TI #2', ['Legal']);
    await insertNewsletter(sender, 'TI #3', ['Legal']);

    // Insert 3 more newsletters — each gets auto-tagged Legal, then we remove it.
    const tagRow = await pool.query(`SELECT id FROM tags WHERE user_id=$1 AND name='Legal'`, [userId]);
    const tagId = tagRow.rows[0].id;
    const senderKey = 'news@theinformation.com';

    for (let i = 0; i < 3; i++) {
        const n = await insertNewsletter(sender, `TI auto-remove #${i + 1}`, []);
        const before = await getTagsFor(n.id);
        if (!before.some(t => t.name === 'Legal' && t.auto_tagged)) {
            fail(`round ${i + 1} — expected auto-tag "Legal" before removal`, JSON.stringify(before));
            return;
        }
        const removed = await dbHelpers.removeTagFromNewsletter(n.id, tagId);
        if (removed && removed.auto_tagged) {
            // Caller (server.js route) is responsible for recording; replicate here.
            const { recordAutoTagRemoval } = await import('../lib/auto-tagger.js');
            await recordAutoTagRemoval(pool, userId, senderKey, tagId);
        }
    }

    // 4th one after 3 removals should NOT auto-tag.
    const after = await insertNewsletter(sender, 'TI after-blocklist', []);
    const tags = await getTagsFor(after.id);
    if (!tags.some(t => t.name === 'Legal' && t.auto_tagged)) pass('After 3 removals, "Legal" no longer auto-applies');
    else fail('Blocklist failed to stop "Legal" auto-tag', JSON.stringify(tags));
}

async function scenarioC_optOut() {
    console.log('\n[C] User opt-out — auto_tag_enabled=false skips auto-tagging');
    await pool.query(`UPDATE users SET auto_tag_enabled=FALSE WHERE id=$1`, [userId]);
    const sender = 'Stratechery <ben@stratechery.com>';
    await insertNewsletter(sender, 'S #1', ['Crypto']);
    await insertNewsletter(sender, 'S #2', ['Crypto']);
    await insertNewsletter(sender, 'S #3', ['Crypto']);
    const fourth = await insertNewsletter(sender, 'S #4', []);
    const tags = await getTagsFor(fourth.id);
    if (tags.length === 0) pass('Opt-out respected — no auto-tag applied');
    else fail('Opt-out failed — tags applied despite auto_tag_enabled=false', JSON.stringify(tags));
    await pool.query(`UPDATE users SET auto_tag_enabled=TRUE WHERE id=$1`, [userId]);
}

async function cleanup() {
    if (KEEP) {
        console.log(`\n(skipping cleanup — inspect user_id=${userId}; email=${testEmail})`);
        return;
    }
    console.log('\n→ Cleaning up fixtures');
    await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);
    // Cascades via FK remove tags, newsletters, junction rows, blocklist.
}

(async () => {
    try {
        await setup();
        await scenarioA_happyPath();
        await scenarioB_blocklist();
        await scenarioC_optOut();
    } catch (err) {
        console.error('\n💥 Verification crashed:', err);
        process.exitCode = 1;
    } finally {
        try { await cleanup(); } catch (e) { console.warn('cleanup failed:', e.message); }
        await pool.end();
    }
})();
