/**
 * Shared Postgres pool for the agents runtime.
 *
 * Reuses the same DATABASE_URL convention as `database.js`. Lives in its own
 * module so agent code never imports the giant `database.js` for one query.
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

let _pool = null;

export function getPool() {
    if (_pool) return _pool;
    if (!process.env.DATABASE_URL) {
        throw new Error('[agents/db] DATABASE_URL is not set.');
    }
    _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== 'false' }
            : false,
    });
    _pool.on('error', (err) => {
        console.error('❌ [agents/db] Pool error:', err.message);
    });
    return _pool;
}

export async function closePool() {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}
