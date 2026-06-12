// DB-backed store for background AI tasks (graph extraction, KB compilation).
// Replaces the in-memory Maps that lost task state on every restart/redeploy
// (clients polling a task got phantom 404s). See migrations/004.

import { getDb } from '../../database.js';
import { backgroundTasksTotal } from '../observability.js';
import { log } from '../utils/logger.js';

const RETENTION_DAYS = 7;

/** Create a task row. Also opportunistically prunes rows older than 7 days. */
export async function createTask({ id, userId, kind, meta = {} }) {
    const db = getDb();
    await db.query(
        `INSERT INTO background_tasks (id, user_id, kind, status, progress, meta)
         VALUES ($1, $2, $3, 'running', 0, $4)`,
        [id, userId, kind, JSON.stringify(meta)]
    );
    // Fire-and-forget retention sweep; never block or fail the request path.
    db.query(`DELETE FROM background_tasks WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`)
        .catch((err) => log.warn('[tasks] retention sweep failed', { message: err.message }));
}

export async function updateTask(id, fields) {
    const db = getDb();
    const sets = ['updated_at = NOW()'];
    const values = [];
    let i = 1;
    for (const col of ['status', 'progress', 'error']) {
        if (fields[col] !== undefined) {
            sets.push(`${col} = $${i++}`);
            values.push(fields[col]);
        }
    }
    if (fields.result !== undefined) {
        sets.push(`result = $${i++}`);
        values.push(JSON.stringify(fields.result));
    }
    values.push(id);
    await db.query(`UPDATE background_tasks SET ${sets.join(', ')} WHERE id = $${i}`, values);
    if (fields.status === 'completed' || fields.status === 'failed') {
        const kind = id.split('-')[0];
        backgroundTasksTotal.inc({ kind, outcome: fields.status });
    }
}

/** Fetch a task scoped to its owner; returns the legacy task JSON shape. */
export async function getTask(id, userId) {
    const db = getDb();
    const { rows } = await db.query(
        'SELECT * FROM background_tasks WHERE id = $1 AND user_id = $2',
        [id, userId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
        taskId: r.id,
        userId: r.user_id,
        status: r.status,
        progress: r.progress,
        result: r.result,
        error: r.error,
        startedAt: r.created_at,
        ...(r.meta || {}),
    };
}
