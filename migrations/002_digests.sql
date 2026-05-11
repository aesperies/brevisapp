-- Migration 002: Digests
--
-- The Digest feature is implemented as the Editor agent's job. These tables
-- hold per-user digest configuration, the tag-filter junction, and a run log
-- that joins to newsletter_drafts (added in 001) for the rendered output.
--
-- Schedule semantics:
--   - cadence='daily':   fires every day at time_of_day (in user's timezone)
--   - cadence='weekly':  fires every day_of_week (0=Sunday..6=Saturday) at time_of_day
--   - cadence='monthly': fires on day_of_month (1..28; capped to avoid Feb 30)
--
-- The Editor agent's "is this digest due?" check reads `last_sent_at` and
-- compares against the next-fire time per cadence. UNIQUE (digest_id,
-- scheduled_for) on digest_runs guards against double-sends across server
-- restarts or duplicate ticks.

CREATE TABLE IF NOT EXISTS digests (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    cadence         TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
    -- Schedule fields. Only the relevant ones are read per cadence.
    time_of_day     TIME NOT NULL DEFAULT '07:00:00',
    day_of_week     SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),       -- weekly only; 0=Sun
    day_of_month    SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),     -- monthly only; capped
    timezone        VARCHAR(64) NOT NULL DEFAULT 'America/New_York',    -- IANA name
    -- Behavior
    paused          BOOLEAN NOT NULL DEFAULT FALSE,
    language        CHAR(2),                                           -- override user.language; NULL = inherit
    -- Bookkeeping
    last_sent_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS digests_user_idx ON digests (user_id);
CREATE INDEX IF NOT EXISTS digests_due_scan_idx
    ON digests (paused, cadence)
    WHERE paused = FALSE;

-- Junction: which tag-set drives a digest's content filter.
-- Many-to-many: a digest can include multiple tags (OR semantics).
CREATE TABLE IF NOT EXISTS digest_tags (
    digest_id   INT NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
    tag_id      INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (digest_id, tag_id)
);

CREATE INDEX IF NOT EXISTS digest_tags_tag_idx ON digest_tags (tag_id);

-- Run log: one row per fire (or attempted fire) of a digest.
CREATE TABLE IF NOT EXISTS digest_runs (
    id              BIGSERIAL PRIMARY KEY,
    digest_id       INT NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
    scheduled_for   TIMESTAMPTZ NOT NULL,             -- the moment this run was supposed to fire
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'running'   -- 'running' | 'completed' | 'failed' | 'skipped_no_content'
                    CHECK (status IN ('running', 'completed', 'failed', 'skipped_no_content')),
    -- Cross-link to the agent run that produced this digest (NULL for skipped).
    agent_run_id    UUID,
    -- Cross-link to the rendered draft (NULL for failed/skipped).
    draft_id        BIGINT REFERENCES newsletter_drafts(id) ON DELETE SET NULL,
    error_message   TEXT
);

-- Idempotency guard: double-sends across restarts / duplicate ticks are
-- physically impossible.
CREATE UNIQUE INDEX IF NOT EXISTS digest_runs_unique_slot_idx
    ON digest_runs (digest_id, scheduled_for);

CREATE INDEX IF NOT EXISTS digest_runs_digest_started_idx
    ON digest_runs (digest_id, started_at DESC);

-- Touch updated_at on UPDATE.
CREATE OR REPLACE FUNCTION digests_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS digests_touch_updated_at_trg ON digests;
CREATE TRIGGER digests_touch_updated_at_trg
    BEFORE UPDATE ON digests
    FOR EACH ROW EXECUTE FUNCTION digests_touch_updated_at();
