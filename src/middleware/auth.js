// DB-backed authMiddleware: validates JWT signature AND token_version
// (revoked on password change). Moved verbatim from server.js during the
// 2026-06 architecture refactor.

import { getDb } from '../../database.js';
import { makeAuthMiddleware } from '../../auth.js';

export const authMiddleware = makeAuthMiddleware(async (userId) => {
    const db = getDb();
    const result = await db.query('SELECT token_version, plan, language, trial_end_date FROM users WHERE id = $1', [userId]);
    return result.rows[0] ?? { token_version: 0 };
});
