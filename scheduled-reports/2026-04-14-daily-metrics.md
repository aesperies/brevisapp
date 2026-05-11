# Brevis Daily Metrics — 2026-04-14 (FAILED RUN)

**Status:** [High] Execution failure — GitHub unreachable from sandbox.

## BLUF
- This 9am run executed in the Cowork sandbox, not via local launchd. Sandbox egress to api.github.com is blocked, so no repo metrics could be collected.
- No signal on Brevis repo health today — neither positive nor negative. Assume no new critical issues pending a manual or local re-run.
- Action: verify local launchd agent `com.brevis.daily-metrics` is loaded and firing on the Mac.

## Attempted Steps
1. `gh api repos/aesperies/brevisapp` → **failed**: `gh: command not found` (sandbox lacks gh CLI).
2. `gh issue list --state open` → **skipped** (gh unavailable).
3. `gh pr list --state open` → **skipped** (gh unavailable).
4. `gh api repos/aesperies/brevisapp/commits` → **skipped** (gh unavailable).
5. Fallback: `WebFetch https://api.github.com/repos/aesperies/brevisapp` → **failed**: `EGRESS_BLOCKED`.
6. Target report path `/Users/antoniobitkraft/Documents/Claude/Scheduled/brevis-daily-metrics/latest-report.md` → **unreachable** from sandbox filesystem.

## Metrics Summary
- Open Issues: **unknown**
- Open PRs: **unknown**
- Last Commit: **unknown**
- New issues since yesterday: **unknown**
- Critical flags: **none detected, but coverage is zero — do not treat as all-clear.**

## Root Cause
Per auto-memory (`brevis_daily_metrics_launchd.md`): this agent is supposed to run locally via launchd because the Cowork sandbox cannot reach the GitHub API. Today's run fired in the sandbox, which suggests the local launchd job either did not fire or is not installed.

## Recommended Next Steps (manual, on Mac)
1. `launchctl list | grep brevis` — confirm job is loaded.
2. If missing: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.brevis.daily-metrics.plist`
3. `tail -50 ~/Library/Logs/brevis-daily-metrics.log` — check last successful run.
4. Once fixed, re-run today manually: `launchctl kickstart -k gui/$(id -u)/com.brevis.daily-metrics`
