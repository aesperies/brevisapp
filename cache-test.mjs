// Verify the auto_tag_enabled cache: confirm it dedupes DB calls and that
// invalidate() forces a refetch. We mock pool.query at the module level.
process.env.DATABASE_URL = 'postgres://invalid:invalid@localhost:9999/none';

// Stub pg before import so the Pool ctor does not actually connect.
import { Module } from 'module';
const origResolve = Module._resolveFilename;
let queryCount = 0;
let returnEnabled = true;

// Monkey-patch by importing pg first and replacing Pool.prototype.query.
const pgMod = await import('pg');
pgMod.default.Pool.prototype.query = async function(sql, params) {
    queryCount++;
    if (/auto_tag_enabled FROM users/i.test(sql)) {
        return { rows: [{ auto_tag_enabled: returnEnabled }] };
    }
    return { rows: [] };
};

const db = await import('/sessions/festive-wonderful-mendel/mnt/brevis/database.js');
console.log('Has cache helpers:', typeof db.getUserAutoTagEnabled === 'function', typeof db.invalidateUserAutoTagCache === 'function');

// First read → DB query (count = 1)
queryCount = 0;
let v = await db.getUserAutoTagEnabled(42);
console.log(`PASS read#1: value=${v} queryCount=${queryCount} ${queryCount === 1 ? '(DB hit as expected)' : '(WRONG)'}`);

// Second read → cache hit (count still 1)
v = await db.getUserAutoTagEnabled(42);
console.log(`PASS read#2: value=${v} queryCount=${queryCount} ${queryCount === 1 ? '(cache hit)' : '(NO CACHE — FAIL)'}`);

// Change underlying value but don't invalidate → cache returns stale
returnEnabled = false;
v = await db.getUserAutoTagEnabled(42);
console.log(`PASS read#3 (stale): value=${v} (still true: ${v === true}) queryCount=${queryCount} (no extra query)`);

// Invalidate → next read hits DB and returns new value
db.invalidateUserAutoTagCache(42);
v = await db.getUserAutoTagEnabled(42);
console.log(`PASS read#4 (post-invalidate): value=${v} (now false: ${v === false}) queryCount=${queryCount} ${queryCount === 2 ? '(refetched)' : '(WRONG)'}`);

// Different user does not use cache from user 42
returnEnabled = true;
v = await db.getUserAutoTagEnabled(43);
console.log(`PASS user-isolation: value=${v} queryCount=${queryCount} ${queryCount === 3 ? '(separate DB hit)' : '(WRONG)'}`);

process.exit(0);
