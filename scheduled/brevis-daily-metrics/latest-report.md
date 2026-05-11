# Brevis Daily Metrics — 2026-04-07

## CRITICAL FLAGS

- **2 Critical security/reliability issues carried forward 2+ weeks** from the 2026-03-27 code review (see details below). These need immediate attention.
- **3 files with uncommitted local changes** (ai-service.js, auth.js, database.js, server.js) — ensure these are committed or stashed.

---

## Repository Snapshot

| Metric | Value |
|---|---|
| **Repo** | github.com/aesperies/brevisapp |
| **Branch** | main |
| **Last Commit** | `8a28557` — Apr 6, 2026 — "Fix 8 security/reliability issues from 2026-03-27 code review" |
| **Uncommitted Changes** | 3 modified files (ai-service.js, database.js, server.js) + auth.js staged |
| **Open Remote Branches** | 5 (4 claude/* WIP branches + 1 review branch) |

## Recent Commits (Last 5)

| Date | Hash | Message |
|---|---|---|
| 2026-04-06 | `8a28557` | Fix 8 security/reliability issues from 2026-03-27 code review |
| 2026-03-20 | `53c63d0` | Fix 9 security and code quality issues from weekly code review |
| 2026-03-19 | `29b615f` | Redesign landing page hero with premium visual treatment |
| 2026-03-02 | `c118f4b` | Translate AI summaries when user changes language |
| 2026-02-25 | `d62adb5` | Reduce spacing and font sizes throughout landing page |

## Activity Since Yesterday

- **1 commit** on Apr 6: security/reliability fixes from code review

## Open Issues from Code Review (2026-04-06)

### Critical (fix this week)
1. **[server.js:1312-1315]** `generate-from-project` fetch without timeout — 2 weeks old
2. **[server.js:1615]** Webhook secret exposed in URL path/query params — 2 weeks old

### Important (carried forward)
3. **[database.js:14]** SSL verification disabled in production — since Mar 13
4. **[auth.js:8-13]** JWT 30-day TTL without revocation on password change
5. **[server.js:1848-1852]** RSS deduplication based on title, not URL
6. **[server.js:1835-1870]** RSS cron without timeout or concurrency control — since Mar 20
7. **[server.js:1739-1787]** `/api/subscriptions` without rate limiter — since Mar 20
8. **[nodemailer]** Installed version (6.x) doesn't match package.json (^8.0.2)

## Notes

- GitHub API/web access was unavailable from sandbox — open issues/PRs count from remote could not be verified. Metrics sourced from local git clone.
- The Apr 6 commit addressed 8 issues from the Mar 27 code review, but the Apr 6 review report indicates none of the critical/important items are fully resolved yet. Verify whether the commit changes were pushed and deployed.

---
*Generated automatically by Brevis Daily Metrics Agent — 2026-04-07 09:00 UTC*
