// Refresh-token rotation with reuse detection. The raw token lives only in the
// user's httpOnly cookie; we store sha256(raw). Each refresh rotates: the old
// row is marked rotated and linked to its replacement. Presenting an
// already-rotated (or revoked) token is treated as theft — the whole chain is
// revoked and the user's access tokens are killed via token_version bump.

import crypto from 'crypto';
import { getDb } from '../../database.js';

// 30-day refresh window (overridable for tests). Access-token TTL lives in auth.js.
const REFRESH_TTL_MS = parseInt(process.env.REFRESH_TOKEN_TTL_MS || String(30 * 24 * 60 * 60 * 1000), 10);

function hash(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Issue a fresh refresh token for a user; returns the RAW token (cookie value). */
export async function issueRefreshToken(userId) {
    const raw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await getDb().query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, hash(raw), expiresAt]
    );
    return raw;
}

/**
 * Exchange a raw refresh token for a new one (rotation). Returns:
 *   { ok: true, raw, userId }                — rotated successfully
 *   { ok: false, reason: 'invalid'|'expired'|'reuse' }
 * On 'reuse' the entire chain is revoked and token_version bumped (theft response).
 */
export async function rotateRefreshToken(rawToken) {
    if (!rawToken) return { ok: false, reason: 'invalid' };
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [hash(rawToken)]);
    const row = rows[0];
    if (!row) return { ok: false, reason: 'invalid' };

    // Already rotated or explicitly revoked → reuse/theft. Burn the chain.
    if (row.revoked || row.rotated_at) {
        await revokeAllForUser(row.user_id);
        return { ok: false, reason: 'reuse' };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, reason: 'expired' };
    }

    const newRaw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const ins = await db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
        [row.user_id, hash(newRaw), expiresAt]
    );
    await db.query(
        'UPDATE refresh_tokens SET rotated_at = NOW(), replaced_by = $1 WHERE id = $2',
        [ins.rows[0].id, row.id]
    );
    return { ok: true, raw: newRaw, userId: row.user_id };
}

/** Revoke a single refresh token (logout of this device). No-op if unknown. */
export async function revokeRefreshToken(rawToken) {
    if (!rawToken) return;
    await getDb().query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [hash(rawToken)]);
}

/**
 * Revoke every refresh token for a user AND bump token_version (kills all
 * access tokens). Used on reuse-detection and password reset.
 */
export async function revokeAllForUser(userId) {
    const db = getDb();
    await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE', [userId]);
    await db.query('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1', [userId]);
}
