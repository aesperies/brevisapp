import { beforeAll, afterAll } from 'vitest';
import { getDb } from '../database.js';

// Safety rail: refuse to run against anything that isn't the dedicated test DB.
if (!process.env.DATABASE_URL?.endsWith('/brevis_test')) {
    throw new Error(
        `Refusing to run tests: DATABASE_URL must point at brevis_test, got ${process.env.DATABASE_URL}`
    );
}

beforeAll(async () => {
    const db = getDb();
    // Schema is created by server.js's setupDatabase() at import time (idempotent).
    // Wipe all data so every test file starts clean. schema_migrations is kept.
    const { rows } = await db.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
    `);
    if (rows.length > 0) {
        const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
        await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
});

afterAll(async () => {
    await getDb().end();
});
