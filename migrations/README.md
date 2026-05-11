# Brevis Migrations

Numbered SQL files applied in order against the Postgres database identified by `DATABASE_URL`.

## How to apply

```bash
npm run migrate
```

The runner (`migrations/run-migrations.js`):
1. Ensures a `schema_migrations` table exists.
2. Reads every `migrations/*.sql` file in lexicographic order.
3. Skips any whose filename is already recorded in `schema_migrations`.
4. Runs each remaining file inside a transaction; on success, records the filename.

## Conventions

- Filenames: `NNN_short_description.sql` (zero-padded 3-digit prefix).
- One logical change per file. Keep them small enough to read in one screen.
- Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc., so re-running by hand against a fresh DB is safe even before the runner sees it.
- Never edit a migration file after it has been applied to any environment. Add a new file instead.

## Why a tiny custom runner instead of `node-pg-migrate`?

Brevis already uses `pg` directly with no ORM. A 50-line runner keeps the dependency graph small and the behavior obvious. We can swap to `node-pg-migrate` later if we ever need up/down migrations or JS-based migrations; YAGNI for now.
