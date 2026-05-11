# Hardening PR — 2026-05-04

All 10 carry-overs from the 2026-04-27 review + 2 working-tree issues + 1 newly-surfaced HIGH npm-audit finding are fixed. Files are written to disk. Commit was blocked by a concurrent git process holding `.git/index.lock` — the user (or the other agent) needs to commit when their work clears.

## BLUF

- **3 Mediums + 6 Lows + 2 working-tree issues + 1 HIGH dep CVE — all closed.**
- **`safeFetch` + `safeParseRssUrl` close the DNS-rebinding window** by pinning the validated IP to the connection via a custom `lookup` on the http(s) Agent. IPv6 + IPv4-mapped + CGNAT + AWS metadata all explicitly blocked. 21/21 isPrivateIP unit cases pass.
- **`auth.js` now fails closed (503)** instead of silently downgrading to no-token-version-check during DB hiccups. Revoked JWTs no longer slip through after password reset.
- **`auto_tag_enabled` now cached** with a 5-minute TTL plus explicit invalidation on PATCH /api/auth/profile — drops N queries/cycle to 1/user/5min on the RSS cron path. Verified: 5/5 cache assertions pass.
- **AI input pre-flight cap at 320K chars** — InputTooLargeError → 413 via the existing global error handler. Bounds worst-case API spend per request. Verified: oversized requests blocked, normal-size requests pass through.

## Fixes applied (file × line × what)

| # | File | Lines | Issue | Fix |
|---|---|---|---|---|
| 1 | `.gitignore` | +2 | `.claude/` ignored, lockfile sentinels too | Added `.claude/` and `.~lock.*#` |
| 2 | `auth.js` | 56-65 | Fail-open on DB error → revoked JWTs validate | 503 + log; fail-closed |
| 3 | `server.js` | 1-7 | New imports for SSRF helper | `http`, `https`, `net` |
| 4 | `server.js` | 1004-1110 | DNS rebinding bypass | `validateUrlForFetch` returns IP+family; `isPrivateIP` rewritten with full IPv6, IPv4-mapped, CGNAT, AWS metadata coverage; `safeFetch` pins lookup |
| 5 | `server.js` | 1120-1167 | `fetchGenericContent` | Uses `safeFetch` |
| 6 | `server.js` | 1525-1562 | News-builder URL fetches | Use `safeFetch` |
| 7 | `server.js` | 2004-2032 | RSS direct parseURL re-resolves DNS | Added `safeParseRssUrl(url)` |
| 8 | `server.js` | 2055, 2100, 2143 | Three RSS sites | All routed through `safeParseRssUrl` |
| 9 | `server.js` | 333-380 | Missing rate limiters | Added `kindleLimiter` (10/hr/user), `newsletterCrudLimiter` (600/15min/user), `waitlistLimiter` (5/hr/IP) |
| 10 | `server.js` | 854, 859, 1234, 1250, 1287, 1908 | Apply new limiters | Wired into routes |
| 11 | `server.js` | 1234-1248 | PATCH `/newsletters/:id` no boolean validator | Added `body('is_read').optional().isBoolean().toBoolean()` + 400 on bad input |
| 12 | `server.js` | 1742-1753 | Stripe webhook silent on unknown event types | Added `default:` branch with `console.warn` |
| 13 | `server.js` | 695-700 | Cache miss after PATCH `auto_tag_enabled` | Calls `invalidateUserAutoTagCache(userId)` |
| 14 | `public/app.html` | 1365-1387 | 6 CDN scripts no SRI | sha384 `integrity=` + `crossorigin="anonymous"` on canonical + jsdelivr fallbacks |
| 15 | `public/app.html` | 2434-2470 | Import handler no client URL guard, no dedupe | Added `^https?://` guard + `prev.filter(n => n.id !== normalized.id)` |
| 16 | `public/app.html` | 1948-1968, 2616-2630 | Settings dirty-check broken on auto-tag toggle | Snapshot initial settings via useRef on modal open |
| 17 | `database.js` | 293-330 | `auto_tag_enabled` SELECT on every ingest | Added `getUserAutoTagEnabled(userId)` cache + `invalidateUserAutoTagCache(userId)` |
| 18 | `database.js` | 482-491 | `createNewsletter` uses cache | Calls `getUserAutoTagEnabled` |
| 19 | `ai-service.js` | 1-50 | No input-token pre-flight | `MAX_INPUT_CHARS = 320_000`, `estimateInputChars`, `InputTooLargeError` (statusCode 413, isOperational), pre-flight in `anthropicRequest` |
| 20 | `package-lock.json` | npm audit fix | New axios HIGH CVE (prototype pollution / parseReviver) | `npm audit fix` → 0 vulns |

## Verification performed

- `node --check` on `server.js`, `database.js`, `ai-service.js`, `auth.js`, `lib/auto-tagger.js`, `lib/sender-key.js` — **all clean.**
- `node --test lib/sender-key.test.js` — **25/25 pass** (no regressions).
- `isPrivateIP` smoke test (21 cases): IPv4 (127, 10, 172.16-31 with boundary, 192.168, 169.254 incl AWS metadata, 100.64/10 CGNAT incl boundary, 0, public 8.8.8.8 / 1.1.1.1), IPv6 (::1, ::, fe80, fc00, fd00, public Cloudflare), IPv4-mapped (::ffff:127.0.0.1 + ::ffff:8.8.8.8), unknown → safe-default-private. **21/21 pass.**
- AI input cap smoke test: 400K-char request blocked with `code='INPUT_TOO_LARGE' statusCode=413 isOperational=true`. Small request passes pre-flight. **PASS.**
- `auto_tag_enabled` cache test: read#1 hits DB, read#2 cache, read#3 stale (cached), invalidate→read#4 refetches new value, user-isolation confirmed. **5/5 PASS.**
- `npm audit` → **0 vulnerabilities** (was 1 HIGH — axios CVE GHSA-3w6x-2g7m-8v23).

## Commit

The working tree was on `feature/agent-stack` with concurrent unrelated WIP (new agent stack additions: `agents/`, `migrations/`, `@anthropic-ai/sdk`, `pglite`, etc.). My hardening fixes only touched the 6 listed files + `package-lock.json` (audit fix).

**Suggested commit when the lock clears:**

```
git add .gitignore auth.js database.js ai-service.js public/app.html server.js package-lock.json
git commit -m "security: close 9 carry-overs + dns rebinding + axios CVE

- auth.js: fail closed (503) on DB errors instead of bypassing token_version
- server.js: safeFetch/safeParseRssUrl pin DNS to validated IP across all 4 user-controlled URL sites (generic import, news builder, RSS subscribe, RSS cron); isPrivateIP rewritten with IPv6/CGNAT/AWS-metadata coverage
- server.js: rate limit Kindle send (10/hr), newsletter CRUD (600/15min), waitlist (5/hr/IP)
- server.js: PATCH /newsletters/:id validates is_read as boolean
- server.js: stripe webhook logs unhandled event types via default branch
- public/app.html: SRI sha384 + crossorigin=anonymous on all 6 CDN scripts (canonical + jsdelivr fallbacks)
- public/app.html: import handler validates http(s):// + de-dupes by id
- public/app.html: settings dirty-check via useRef snapshot (auto-tag toggle now persists)
- database.js: getUserAutoTagEnabled cache (5min TTL) + invalidateUserAutoTagCache hook
- ai-service.js: MAX_INPUT_CHARS=320K pre-flight; InputTooLargeError → 413
- .gitignore: .claude/ + .~lock.*#
- npm audit fix: axios HIGH (prototype pollution)

Closes carry-overs from tasks/code_review_2026-04-27.md and 2026-05-04.md.
All tests pass (lib/sender-key.test.js 25/25). npm audit clean.
"
```
