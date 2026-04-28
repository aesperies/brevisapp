// Auto-tagger: given a user and a canonical sender_key, return the tag_ids
// that should be auto-applied to a newly-ingested newsletter.
//
// Rules (see tasks/todo.md "Feature 1 — Auto-tagging by sender"):
//   1. Sender must have ≥ MIN_PRIOR newsletters from this user before auto-tagging activates.
//   2. Any tag appearing on ≥ MIN_PREVALENCE of those prior newsletters inherits.
//   3. Tags in sender_tag_blocklist (removal_count ≥ REMOVAL_THRESHOLD) are excluded.
//
// The function is read-only — it never writes to the DB. The caller inserts
// the junction rows with auto_tagged=true.

export const MIN_PRIOR = 3;
export const MIN_PREVALENCE = 0.5;
export const REMOVAL_THRESHOLD = 3;

/**
 * @param {import('pg').Pool} pool
 * @param {number}            userId
 * @param {string|null}       senderKey
 * @returns {Promise<number[]>} tag_ids to apply (empty array when nothing qualifies)
 */
export async function suggestTagsForSender(pool, userId, senderKey) {
    if (!senderKey) return [];

    // One round-trip: count prior newsletters from this sender_key, count
    // how many of them carry each tag, exclude blocklisted tags.
    // Self-join against newsletter_tags to compute prevalence per tag.
    const { rows } = await pool.query(
        `
        WITH prior AS (
            SELECT id
            FROM newsletters
            WHERE user_id = $1 AND sender_key = $2
        ),
        prior_count AS (
            SELECT COUNT(*)::int AS n FROM prior
        ),
        tag_counts AS (
            SELECT nt.tag_id, COUNT(*)::int AS c
            FROM newsletter_tags nt
            JOIN prior p ON p.id = nt.newsletter_id
            GROUP BY nt.tag_id
        )
        SELECT tc.tag_id
        FROM tag_counts tc, prior_count pc
        WHERE pc.n >= $3
          AND tc.c::float / pc.n >= $4
          AND NOT EXISTS (
              SELECT 1 FROM sender_tag_blocklist b
              WHERE b.user_id = $1
                AND b.sender_key = $2
                AND b.tag_id = tc.tag_id
                AND b.removal_count >= $5
          )
        `,
        [userId, senderKey, MIN_PRIOR, MIN_PREVALENCE, REMOVAL_THRESHOLD]
    );
    return rows.map(r => r.tag_id);
}

/**
 * Increment the removal counter when a user deletes an auto-applied tag.
 * Idempotent upsert — first removal inserts with count=1, subsequent removals
 * bump the counter. Caller should only invoke this when the removed junction
 * row had auto_tagged=true (pure user-applied removals shouldn't train the blocklist).
 *
 * @param {import('pg').Pool} pool
 * @param {number}            userId
 * @param {string}            senderKey
 * @param {number}            tagId
 */
export async function recordAutoTagRemoval(pool, userId, senderKey, tagId) {
    if (!senderKey) return;
    await pool.query(
        `
        INSERT INTO sender_tag_blocklist (user_id, sender_key, tag_id, removal_count, updated_at)
        VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, sender_key, tag_id)
        DO UPDATE SET removal_count = sender_tag_blocklist.removal_count + 1,
                      updated_at = CURRENT_TIMESTAMP
        `,
        [userId, senderKey, tagId]
    );
}
