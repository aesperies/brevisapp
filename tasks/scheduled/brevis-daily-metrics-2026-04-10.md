# Brevis Daily Metrics — 2026-04-10

## BLUF
- **[High]** GitHub API egress is blocked in this sandbox; live issue/PR counts could not be fetched. Report is based on local git state only.
- **[Low]** No new local commits since 2026-04-08. Repo is clean and in sync with `origin/main`.
- **[Low]** No critical security/server/payment flags surfaced from local state.

## Metrics Summary
- **Open Issues:** Unavailable (GitHub API blocked — `EGRESS_BLOCKED` on api.github.com and github.com; `gh` CLI not installed in sandbox)
- **Open PRs:** Unavailable (same reason)
- **Last Commit (local):** 2026-04-08 17:39 CET — `b0127ab feat: add competitive landing pages, SEO blog posts, and campaign assets`
- **New issues since yesterday:** Unknown (API blocked)
- **Branch state:** `main` up to date with `origin/main`, working tree clean

## Recent Commits (local, last 5)
1. `b0127ab` — feat: add competitive landing pages, SEO blog posts, and campaign assets
2. `5a2d2fe` — fix: KB query argument mismatch + robust JSON parsing for query responses
3. `986adb4` — fix: article_type null on KB insert + open registration for everyone
4. `4864f50` — fix: handle markdown code fences in KB compilation JSON response
5. `00064b4` — fix: reshape source data for KB compilation + add getTagName

## Critical Flags
None detected from local state. Live vulnerability/CI/payment checks require API access.

## Action Required
To restore full daily metrics, one of the following is needed:
1. Add `api.github.com` and `github.com` to the sandbox egress allowlist, **or**
2. Install `gh` CLI in the sandbox environment, **or**
3. Run this scheduled task from a host with direct GitHub access.

## Notes
- Target save path `/Users/antoniobitkraft/Documents/Claude/Scheduled/brevis-daily-metrics/latest-report.md` is outside the sandbox mount; this copy was written to the Brevis workspace folder instead.
