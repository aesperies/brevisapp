# Brevis Daily Metrics — 2026-04-13 (09:01 CEST)

## [HIGH] CRITICAL BLOCKER — Agent could not fetch data

The scheduled run executed inside the Cowork sandbox, which has no network path to the GitHub API (`api.github.com` → HTTP 403 from proxy) and no `gh` CLI installed. No metrics were collected.

**This is a known constraint** — per auto-memory (`brevis_daily_metrics_launchd.md`), this agent is supposed to run locally via launchd, not via the Cowork scheduled-task runner. Today's 9am run fired from the wrong runner.

## Metrics Summary

- Open Issues: **unavailable** (API unreachable)
- Open PRs: **unavailable** (API unreachable)
- Last Commit: **unavailable** (API unreachable)
- New issues since yesterday: **unavailable** (API unreachable)

## Recommended Action ([High])

Disable or delete the duplicate Cowork-side scheduled task for `brevis-daily-metrics` so only the local launchd job fires at 9am. Two options:

1. **Preferred** — remove the Cowork scheduled task; keep launchd as the single source of truth.
2. **Alternative** — if the Cowork runner should own this job, a tunnel/token to GitHub must be wired into the sandbox; today it has neither.

Until one of the above is done, expect a blocker report at 9am every day.

## Self-Audit

- Cross-reference check: auto-memory entry `brevis_daily_metrics_launchd.md` confirms the sandbox cannot reach GitHub — this run's failure matches that prior-known state, not a regression.
- No fabricated metrics included (per `feedback_never_fabricate_metrics.md`).
