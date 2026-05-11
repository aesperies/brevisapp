# Code Review - Brevis App - 2026-04-20

## Executive Summary

**BLUF**

- **Strong week for security hardening.** HTTPS→HTTPS redirect, HSTS with 1-year max-age, server-side logout with `token_version` bump, and CSP with strict directives all shipped in one commit (`8245472`). The auth/session surface is now materially harder to attack.
- **`npm audit` ran cleanly this week** (the sandbox could reach the registry) — **9 vulnerabilities surfaced, including 4 high-severity in transitive deps** (`@xmldom/xmldom`, `lodash`, `path-to-regexp`, `picomatch`) plus a **direct-dependency moderate in `nodemailer`** (SMTP command injection, CVE in `<= 8.0.4`). All auto-fixable via `npm audit fix` — run it.
- **Two High-severity items are now 2 weeks overdue:** the `innerHTML` XSS sink in the React mount-error fallback (`public/app.html:2731`) and the absence of Subresource Integrity on CDN scripts. No other High or Critical items open.

---

## ✅ Resolved since last review (2026-04-13)

Moderate progress this week — the security-focused commit (`8245472 security: HTTPS redirect, HSTS, server-side logout`) shipped three defenses at once:

- **[New this week] Server-side logout now bumps `token_version`** (`server.js:669-697`) — All active sessions for the logging-out user are invalidated across every device. This is a stronger logout semantic than cookie-clear-only.
- **[New this week] HSTS + HTTPS redirect** (`server.js:163-168, 183-188`) — `x-forwarded-proto` is checked and any HTTP request is 301'd to HTTPS; HSTS is set with `maxAge: 31536000`, `includeSubDomains: true`, `preload: true`.
- **[New this week] Tightened CSP** (`server.js:171-189`) — `defaultSrc: 'self'`, `connectSrc: 'self'`, `frameSrc: 'self' + blob:`. Script CDNs are explicitly whitelisted (unpkg, cdnjs, jsdelivr). No `'unsafe-eval'`.
- **[Medium → resolved] `PATCH /api/newsletters/:id` validation exposure** — The endpoint now only accepts a single field (`is_read`) and ignores everything else (`server.js:1177-1191`). The attack surface the previous review flagged has been removed, though type validation on `is_read` itself is still missing (see Low finding below).

---

## STILL OPEN (carried over)

### [High] [public/app.html:2731] — XSS via exception message in error fallback *(open since 2026-04-13 — 2 weeks)*

**Status:** Unchanged. The React mount error fallback still concatenates `e.message` directly into `innerHTML`:

```js
rootEl.innerHTML = '<div style="...">...<p>React failed to mount: ' + (e && e.message) + '</p></div>';
```

A crafted error message containing HTML (e.g., from corrupted component state or malicious data triggering a render error) would execute in the user's browser. **This is a drop-in, one-line fix** — swap `innerHTML` for `textContent` on a constructed element. Escalating priority: 2 weeks open on a High finding with a trivial patch is anomalous.

---

### [Medium] [public/app.html:1352-1358] — CDN scripts loaded without Subresource Integrity (SRI) *(open since 2026-04-13 — 2 weeks)*

**Status:** Unchanged. Six external scripts (React, React-DOM, Babel, DOMPurify, vis.js, and the jsdelivr fallbacks via `document.write`) still load without `integrity` attributes. A compromise of any of unpkg/cdnjs/jsdelivr permits arbitrary JS execution in every Brevis user's browser. The `document.write` fallback pattern (lines 1353, 1355) amplifies the blast radius because it bypasses even the DOM-parser's script-tag handling.

**Fix:** Pin versions (already done) and add `integrity="sha384-..."` + `crossorigin="anonymous"` on each `<script>`. For each URL: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.

---

### [Medium] [.gitignore] — `.claude/` directory still not excluded from git *(open since 2026-04-06 — 2 weeks)*

**Status:** Unchanged. `.gitignore` contains `node_modules/`, `.env`, `*.db*`, `*.log`, `.DS_Store`, `dist/`, `build/`, `.vscode/`, `.idea/`, `db.json` — no `.claude/`. The working copy currently has 4 worktrees under `.claude/worktrees/` (`loving-williamson`, `zealous-gates`, `cranky-gould`, `strange-chandrasekhar`), each a full codebase duplicate. These were flagged as Untracked in `git status` but remain one `git add .` away from being committed.

**Fix:**
```bash
echo '.claude/' >> .gitignore
git rm -r --cached .claude/ 2>/dev/null
```

---

### [Low] [server.js:1223] — `POST /api/newsletters/:id/kindle` lacks rate limiting *(open since 2026-04-13)*

**Status:** Unchanged. The endpoint calls `sendEmail()` against a user-controlled `kindle_email` address. An attacker who compromises a session could rapidly spam Kindle devices or trigger SendGrid rate limits / reputation damage on the sending domain. Auth requirement mitigates but doesn't eliminate.

**Fix:** Apply a dedicated `kindleLimiter` (e.g., 10 sends / hour / user) — rate-limit by user ID, not IP, since IP-based limits don't work well behind Railway's load balancer.

---

### [Low] [server.js] — Newsletter CRUD endpoints lack rate limiting *(open since 2026-04-13)*

**Status:** Unchanged. `GET /api/newsletters`, `GET /:id`, `DELETE /:id` still have no limiter.

---

### [Low] [server.js:1826] — `POST /api/waitlist` lacks rate limiting *(open since 2026-04-13)*

**Status:** Unchanged. `express-validator` checks the email but nothing rate-limits requests. Trivially abusable to fill the waitlist table.

---

## NEW FINDINGS

### [High] [package.json / package-lock.json] — 9 dependency vulnerabilities surfaced by `npm audit` (4 high)

**`npm audit` output (registry reachable this week):**

| Package | Version range affected | Severity | Type | Fix available |
|---|---|---|---|---|
| `@xmldom/xmldom` | `<0.8.12` | **High** | Transitive | ✅ `npm audit fix` |
| `lodash` | `<=4.17.23` | **High** | Transitive | ✅ `npm audit fix` |
| `path-to-regexp` | `<0.1.13` | **High** | Transitive (Express 4) | ✅ `npm audit fix` |
| `picomatch` | `<=2.3.1` | **High** | Transitive (nodemon, dev) | ✅ `npm audit fix` |
| `nodemailer` | `<=8.0.4` | Moderate | **Direct** (`^8.0.2`) | ✅ `npm audit fix` |
| `axios` | `1.0.0 - 1.14.0` | Moderate | Transitive (openai) | ✅ `npm audit fix` |
| `brace-expansion` | `4.0.0 - 5.0.4` | Moderate | Transitive (nodemon, dev) | ✅ `npm audit fix` |
| `follow-redirects` | `<=1.15.11` | Moderate | Transitive | ✅ `npm audit fix` |
| `mailparser` | `2.3.1 - 3.9.5` | Low | **Direct** (`^3.9.4`) | ✅ `npm audit fix` |

**Highest-risk items for Brevis specifically:**

1. **`nodemailer <=8.0.4` — SMTP command injection via `envelope.size` and CRLF in transport `name` option** (GHSA-c7w3-x93f-qmm8, GHSA-vvjj-xcjg-gr5g). Brevis uses nodemailer for password resets, email verification, and Kindle sends. The injection vectors are in options the server controls, so exploitation requires attacker influence over those options — currently low exposure, but upgrading is the correct posture.
2. **`path-to-regexp <0.1.13` — ReDoS via crafted route parameters** (GHSA-37ch-88jc-xwx2). Transitive from Express 4. Express 5 ships the patched version. This can be triggered pre-auth via a crafted URL matching a route with multiple parameters — Brevis has `/api/newsletters/:id/tags/:tagId`, `/api/graph/nodes/:id`, etc.
3. **`axios 1.0.0 - 1.14.0` — SSRF + cloud metadata exfiltration via header injection** (GHSA-3p68-rc4w-qgx5, GHSA-fvcv-3m26-pcqx). Transitive from `openai`. OpenAI is only used for TTS in Brevis; attacker would need influence over request params to exploit.

**Action:** Run `npm audit fix` (all 9 have safe fixes available). Then verify server still starts + integration tests pass. Follow up by upgrading direct deps flagged in last week's dependency table (`stripe ^14 → ^21`, `openai ^4 → ^6`, `multer ^1 → ^2`) — all still stale.

---

### [Medium] [auth.js:56-59] — `authMiddleware` fails open on DB errors, silently defeating `token_version` revocation

**Problem:** The DB-backed auth middleware wraps its `token_version` check in a try/catch that falls back to accepting the token if the DB lookup throws:

```js
try {
    const userData = await getUserData(decoded.id);
    // ... token_version comparison ...
} catch {
    // If DB check fails, allow the request through (fail-open to avoid total outage)
    req.user = decoded;
}
```

**Why this matters:** The entire point of `token_version` is that after password reset or server-side logout, old JWTs are invalidated immediately. But if the DB is unreachable (connection pool exhausted, transient network issue, Postgres failover), every revoked JWT silently re-validates for the duration of the outage. An attacker who stole a session token and had the user perform password reset would get a grace window whenever the DB hiccups.

**Fix:** Fail closed on auth. Return 503 ("Service temporarily unavailable — please try again") when `getUserData` throws. Or, at minimum, fail open only on connection-layer errors (`ECONNREFUSED`, `ETIMEDOUT`) and fail closed on query errors. Also add logging: `log.error('auth DB check failed', { reqId: req.id, userId: decoded.id, err: e.message })` so the outage is visible.

```js
try {
    const userData = await getUserData(decoded.id);
    const currentVersion = typeof userData === 'object' ? (userData.token_version ?? 0) : (userData ?? 0);
    if ((decoded.tv ?? 0) !== currentVersion) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    req.user = typeof userData === 'object' ? { ...decoded, ...userData } : decoded;
} catch (err) {
    log.error('auth DB check failed', { reqId: req.id, userId: decoded.id, err: err.message });
    return res.status(503).json({ error: 'Service temporarily unavailable' });
}
```

---

### [Low] [server.js:962-991] — DNS rebinding bypass in `validateUrlForFetch`

**Problem:** `validateUrlForFetch()` resolves the hostname to an IP and rejects private ranges, then returns `{safe: true}`. The subsequent `fetch(url, ...)` call triggers its own independent DNS lookup. An attacker controlling DNS for `rebind.attacker.com` can respond with a public IP on the first query (passes validation) and a private IP on the second query (the actual fetch). Result: a server-side request to `169.254.169.254`, `10.x.x.x`, etc.

This is a well-known SSRF bypass pattern, particularly relevant for:
- `fetchGenericContent()` (URL import)
- `fetchAllRSSFeeds()` via `rssParser.parseURL(sub.url)` — and the RSS cron doesn't even call `validateUrlForFetch` at cron time; only at subscribe time
- `news-builder/generate-from-project` URL fetching

**Fix options (pick one):**
1. Resolve DNS once, verify public, then `fetch(`${protocol}//${ip}`, { headers: { Host: hostname } })` — forces the same IP you validated.
2. Use an HTTP agent that pins the IP after validation (`undici` with custom dispatcher, `ssrf-req-filter` package).
3. Operate the fetcher behind a proxy that enforces egress IP allowlist (simplest at infra level).

**Also:** `rssParser.parseURL()` in the cron (line 1962) and in `POST /api/subscriptions` (line 1881) runs with no SSRF filter of its own — the subscribe-time check is the only validation, and the cron re-fetches without re-validating. If an attacker subscribes to `rebind.attacker.com/rss` with a public IP at subscribe time, every subsequent cron fetch can resolve to internal infrastructure.

**Priority rationale:** Low because the validation layer still catches the common cases (direct private-IP URLs, `localhost`, etc.) and exploitation requires attacker-controlled DNS. But the internal-metadata-endpoint vector on Railway/AWS makes it worth patching.

---

### [Low] [server.js:1177-1191] — `PATCH /api/newsletters/:id` accepts `is_read` without type validation

**Problem:** The PATCH endpoint was tightened to a single field (`is_read`), which is good. But there's no `express-validator` check on the field itself:

```js
if (req.body.is_read !== undefined) {
    updates.is_read = req.body.is_read;
}
```

`req.body.is_read` could be `"not a number"`, an object, or an array, and it would flow through to `dbHelpers.updateNewsletter()`. The DB column is `INTEGER DEFAULT 0`, so Postgres will reject non-coercible values at query time, but it means errors bubble up as 500s instead of 400s, and invalid payloads waste a DB round-trip.

**Fix:**
```js
app.patch('/api/newsletters/:id', authMiddleware, [
    body('is_read').optional().isBoolean().toInt()
], asyncHandler(async (req, res) => {
    // ... errors check ...
    const updates = {};
    if (req.body.is_read !== undefined) updates.is_read = req.body.is_read ? 1 : 0;
    // ...
}));
```

---

### [Low] [server.js:1711] — Stripe webhook returns 200 on unrecognized event types without logging

**Problem:** The webhook `switch(event.type)` handles 5 event types (`checkout.session.completed`, `customer.subscription.updated|deleted|paused`, `invoice.payment_failed`). For anything else (`customer.subscription.created`, `customer.updated`, `invoice.paid`, etc.), control falls through to `res.json({ received: true })` with no log entry. If Stripe adds a new event you should handle (e.g., `customer.subscription.trial_will_end` → send a "your trial ends in 3 days" email), you'll never know.

**Fix:** Add a `default:` branch that logs the event type at `info` level. Optionally send a Sentry/Slack alert for events in an "unexpected but not silent" allowlist.

---

## Code quality observations

### server.js (2,079 lines, +34 from 2,045 last week)

- Growth rate: +34 lines for the HTTPS redirect + HSTS + server-side logout work. Reasonable.
- **Monolith risk continues.** 45+ route handlers, 6 distinct rate limiters, auth/newsletter/tag/Stripe/webhook/RSS logic all in one file. Refactoring into `routes/` modules remains the top maintainability item. Not a security issue — flagging for the aging tracker.
- **`asyncHandler` applied consistently.** No unhandled promise rejections visible.
- **Logging is tidy.** Structured JSON, PII redaction (email, token, password) in `log._emit`. No new unmasked email logs this week.

### database.js (538 lines, unchanged)

- Still zero SQL injection vectors. All queries parameterized, whitelist on update fields.
- `findValidPasswordReset` remains atomic (UPDATE ... RETURNING). Good.
- SSL config: `rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== 'false'` — defaults to `true`, which is correct. Confirmed downgrade from last week stands.

### ai-service.js (683 lines, unchanged)

- Prompt injection defense (`<user_content>` delimiters + explicit system instruction) is preserved on all 5 generation functions. No regressions.
- `CLAUDE_MODEL = 'claude-sonnet-4-20250514'` — current.
- No input token pre-flight validation before batch API calls (still open from last week, Low).

### auth.js (81 lines, unchanged)

- Fail-open behavior on DB errors is the main concern (Medium finding above).
- `token_version` logic is otherwise solid.
- Backwards-compat static `authMiddleware` (lines 66-81) still exported — verify no route uses it by accident. Search for `import { authMiddleware }` usage: only `auth.js` itself re-exports it.

### public/app.html (2,736 lines)

- Two `dangerouslySetInnerHTML` usages (lines 2339, 2347) both pipe through `DOMPurify.sanitize()`. Correct.
- The innerHTML XSS at line 2731 is the outlier.
- `public/index.html:1837` uses `el.innerHTML = el.dataset[lang]`. Data comes from static `data-en` / `data-es` attributes set by the developer — not user input. Not exploitable.

### graph-routes.js + kb-routes.js (427 + 301 lines)

- Both apply `express-validator` + `rateLimit` + `authMiddleware` consistently on every route. No findings.
- `requirePlan('premium')` gate is used on expensive endpoints (`/api/graph/query`, `/api/kb/:id/query`, `/api/graph/profiles`). Correct.

---

## Aging tracker

| Issue | First flagged | Weeks open | Current severity |
|---|---|---|---|
| XSS in React error fallback (app.html:2731) | 2026-04-13 | **2 weeks** | High |
| Missing SRI on CDN scripts | 2026-04-13 | 2 weeks | Medium |
| `.claude/` not in .gitignore | 2026-04-06 | 2 weeks | Medium |
| Kindle endpoint no rate limit | 2026-04-13 | 1 week | Low |
| Newsletter CRUD no rate limit | 2026-04-13 | 1 week | Low |
| Waitlist no rate limit | 2026-04-13 | 1 week | Low |
| AI batch input not token-validated | 2026-04-13 | 1 week | Low |
| server.js monolith | 2026-04-13 | 1 week | N/A (maintainability) |

Two High-severity items aging past 1 week is the primary concern.

---

## Positive observations

- **Security-focused commit shipped three defenses in one PR.** HTTPS redirect, HSTS, and server-side logout with token_version bump are all material improvements. Logout now invalidating tokens across devices is the right pattern — even ahead of what many production apps do.
- **`npm audit` works from the sandbox this week** — the registry 403 that blocked prior reviews has cleared. Dependency review can now be mechanical.
- **No hardcoded secrets anywhere** in `server.js`, `database.js`, `ai-service.js`, `auth.js`, or `package.json`. Confirmed via targeted grep.
- **All DB queries parameterized.** Zero SQL injection vectors across `database.js` (538 lines), `graph-database.js`, `kb-database.js`.
- **Prompt injection mitigation holds on all 5 AI generation functions.** The `<user_content>` delimiter pattern is consistent, with the system prompt explicitly instructing the model to treat delimited content as data.
- **CSP is strict.** `defaultSrc: 'self'`, no `'unsafe-eval'`, explicit CDN allowlist. No `data:` URIs in `scriptSrc`. This gives additional defense-in-depth against the residual XSS finding.
- **Rate limiters everywhere they should be.** Auth (5 / 15m), register (3 / hr), AI (30 / 15m), import (20 / 15m), subscription (30 / 15m), webhook (30 / min), plus dedicated limiters in `graph-routes.js` and `kb-routes.js`. Only gaps are the Low items listed above.

---

## Summary

| Severity | Open | Resolved this week | Newly introduced |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 2 (1 carried XSS, 1 new npm audit) | 0 | 1 (dependency vulns) |
| Medium | 3 (2 carried, 1 new auth fail-open) | 1 (PATCH validation tightened) | 1 |
| Low | 7 (4 carried, 3 new) | 0 | 3 |

**Overall assessment:** Security posture improved this week via HTTPS/HSTS/CSP/logout hardening. The two highest-priority items are (1) **run `npm audit fix`** — it resolves 9 vulns including 4 High — and (2) **patch the 2-week-old XSS sink at `app.html:2731`** — a one-line fix that has been sitting. Also recommend adding `.claude/` to `.gitignore` before it accidentally lands in a commit. The `auth.js` fail-open behavior is worth addressing before Brevis has any real traffic volume where DB hiccups become a realistic availability event.

---

## Recommended actions this week (ranked)

1. **`npm audit fix`** — 10 minutes, fixes 9 vulns including 4 High. Verify server starts + login works post-upgrade.
2. **Patch `app.html:2731`** — replace `innerHTML` concatenation with `textContent`. 5 minutes.
3. **Add `.claude/` to `.gitignore`** + `git rm -r --cached .claude/`. 2 minutes.
4. **Fail closed in `auth.js`** for DB errors, log the error. 10 minutes.
5. **Add SRI to CDN scripts in `app.html`** — 20 minutes (compute 6 hashes, paste).

---

*Automated code review generated 2026-04-20 by Brevis Weekly Code Review Agent. Review each finding before making changes.*
