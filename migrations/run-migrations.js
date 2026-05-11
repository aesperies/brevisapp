#!/usr/bin/env node
/**
 * Brevis migration runner.
 *
 * Usage: `npm run migrate`
 *
 * - Ensures `schema_migrations` table exists.
 * - Reads every `migrations/*.sql` in lexicographic order.
 * - Skips files already recorded in `schema_migrations`.
 * - Runs each remaining file inside a transaction; records filename on success.
 *
 * No external deps beyond `pg` and `dotenv` (already in package.json).
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ [migrate] DATABASE_URL is not set. Aborting.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== 'false' }
            : false,
    });

    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        const applied = new Set(
            (await client.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename)
        );

        const files = readdirSync(__dirname)
            .filter(f => f.endsWith('.sql'))
            .sort();

        if (files.length === 0) {
            console.log('ℹ️  [migrate] No .sql files in migrations/ — nothing to do.');
            return;
        }

        let ranAny = false;
        for (const filename of files) {
            if (applied.has(filename)) {
                console.log(`✓  [migrate] ${filename} (already applied)`);
                continue;
            }
            const sql = readFileSync(path.join(__dirname, filename), 'utf8');
            console.log(`→  [migrate] applying ${filename} ...`);
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (filename) VALUES ($1)',
                    [filename]
                );
                await client.query('COMMIT');
                console.log(`✅ [migrate] ${filename} applied.`);
                ranAny = true;
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`❌ [migrate] ${filename} failed:`, err.message);
                throw err;
            }
        }

        if (!ranAny) {
            console.log('ℹ️  [migrate] All migrations already applied. Database is current.');
        } else {
            console.log('✅ [migrate] Done.');
        }
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(err => {
    console.error('❌ [migrate] Fatal:', err);
    process.exit(1);
});
