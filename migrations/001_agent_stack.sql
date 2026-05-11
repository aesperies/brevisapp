-- Migration 001: Agent Stack v1
-- Creates the tables that back the multi-agent runtime.
-- Tables: agent_runs, agent_events, agent_kill_switch, agent_budget, newsletter_drafts
-- See tasks/todo.md ("ACTIVE SPRINT — Agent Stack v1") for context.

-- =============================================================================
-- agent_runs: log of every agent invocation. The single source of truth for
-- "what did the agents do today?" Used by Ops agent for digests + paging,
-- and by Antonio for spot-checks.
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_runs (
    id              BIGSERIAL PRIMARY KEY,
    agent_name      TEXT NOT NULL,                 -- 'editor' | 'growth' | 'sales' | 'support' | 'engineer' | 'ops' | 'orchestrator'
    run_id          UUID NOT NULL,                 -- groups all log rows for one invocation
    parent_run_id   UUID,                          -- if spawned by orchestrator/another agent, the caller's run_id
    triggered_by    TEXT NOT NULL,                 -- 'cron' | 'event:<event_name>' | 'manual' | 'orchestrator'
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed' | 'killed' | 'budget_exceeded'
    step_index      INT NOT NULL DEFAULT 0,        -- monotonic per run_id; 0 = start
    step_kind       TEXT NOT NULL,                 -- 'start' | 'llm_call' | 'tool_call' | 'tool_result' | 'finish' | 'error'
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Cost / token accounting (per step; sum to get the run total)
    input_tokens    INT NOT NULL DEFAULT 0,
    output_tokens   INT NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS agent_runs_agent_started_idx
    ON agent_runs (agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_run_id_idx
    ON agent_runs (run_id, step_index);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx
    ON agent_runs (status) WHERE status IN ('failed', 'killed', 'budget_exceeded');

-- =============================================================================
-- agent_events: the comms layer. Agents publish events; other agents subscribe
-- via Postgres LISTEN/NOTIFY (channel = 'agent_event'). Acts as an audit log too.
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_events (
    id            BIGSERIAL PRIMARY KEY,
    event_name    TEXT NOT NULL,                  -- e.g. 'signup.created', 'trial.day_5', 'metric.spike', 'ticket.received', 'pr.failed'
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    emitted_by    TEXT NOT NULL,                  -- agent name or 'system'
    emitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Processing trace: which agents acknowledged/handled this event
    handled_by    TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_events_name_emitted_idx
    ON agent_events (event_name, emitted_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_emitted_idx
    ON agent_events (emitted_at DESC);

-- Notify channel trigger: every insert into agent_events fires a NOTIFY so
-- subscribed agents wake up immediately rather than polling.
CREATE OR REPLACE FUNCTION notify_agent_event() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('agent_event', json_build_object(
        'id', NEW.id,
        'event_name', NEW.event_name,
        'emitted_by', NEW.emitted_by
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_events_notify_trigger ON agent_events;
CREATE TRIGGER agent_events_notify_trigger
    AFTER INSERT ON agent_events
    FOR EACH ROW EXECUTE FUNCTION notify_agent_event();

-- =============================================================================
-- agent_kill_switch: per-agent pause flag. Runtime checks this on every loop
-- iteration. `enabled = false` halts that agent immediately. Antonio (or Ops
-- agent on a threshold breach) flips this row to disable a misbehaving agent
-- without redeploying.
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_kill_switch (
    agent_name    TEXT PRIMARY KEY,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    reason        TEXT,                            -- why disabled (free-text)
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by    TEXT                             -- 'antonio' | 'ops' | 'auto'
);

-- Seed: all 6 agents + orchestrator enabled by default.
INSERT INTO agent_kill_switch (agent_name, enabled, updated_by)
VALUES
    ('editor',       TRUE, 'system'),
    ('growth',       TRUE, 'system'),
    ('sales',        TRUE, 'system'),
    ('support',      TRUE, 'system'),
    ('engineer',     TRUE, 'system'),
    ('ops',          TRUE, 'system'),
    ('orchestrator', TRUE, 'system')
ON CONFLICT (agent_name) DO NOTHING;

-- =============================================================================
-- agent_budget: per-agent daily $ ceiling. Runtime sums today's cost_usd from
-- agent_runs and refuses to start a new step if the next call would exceed
-- daily_cap_usd. On breach: status='budget_exceeded', Ops gets paged.
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_budget (
    agent_name      TEXT PRIMARY KEY,
    daily_cap_usd   NUMERIC(10, 2) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults. Conservative on Day 1; raise after observing real usage.
INSERT INTO agent_budget (agent_name, daily_cap_usd) VALUES
    ('editor',       10.00),
    ('growth',        3.00),
    ('sales',         3.00),
    ('support',       3.00),
    ('engineer',      5.00),
    ('ops',           1.00),
    ('orchestrator',  2.00)
ON CONFLICT (agent_name) DO NOTHING;

-- =============================================================================
-- newsletter_drafts: where Editor writes drafts during dry-run mode (Day 2).
-- Each row is an unsent draft for one (user_id, scheduled_for) slot. On Day 3
-- when Editor flips live, drafts get sent and `sent_at` populated.
-- =============================================================================
CREATE TABLE IF NOT EXISTS newsletter_drafts (
    id               BIGSERIAL PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id           UUID NOT NULL,                -- which Editor run produced this
    language         CHAR(2) NOT NULL,             -- 'en' | 'es'
    subject          TEXT NOT NULL,
    html_body        TEXT NOT NULL,
    text_body        TEXT,
    source_count     INT NOT NULL DEFAULT 0,       -- how many source items consolidated
    metric_claims    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- list of {claim, source, verified}
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at          TIMESTAMPTZ,                  -- NULL until actually sent
    review_status    TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'sent'
    review_notes     TEXT
);

CREATE INDEX IF NOT EXISTS newsletter_drafts_user_idx
    ON newsletter_drafts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS newsletter_drafts_pending_idx
    ON newsletter_drafts (review_status, created_at DESC)
    WHERE sent_at IS NULL;
