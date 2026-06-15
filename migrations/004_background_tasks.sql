-- Background AI task state (graph extraction, KB compilation) moves from
-- in-memory Maps to the DB: tasks survive restarts/redeploys, clients polling
-- a task no longer get phantom 404s after a deploy, and failures of
-- cost-bearing AI calls leave a queryable record.
CREATE TABLE IF NOT EXISTS background_tasks (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       VARCHAR(32) NOT NULL,
    status     VARCHAR(16) NOT NULL DEFAULT 'running',
    progress   INTEGER NOT NULL DEFAULT 0,
    meta       JSONB,
    result     JSONB,
    error      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_tasks_user
    ON background_tasks (user_id, created_at DESC);
