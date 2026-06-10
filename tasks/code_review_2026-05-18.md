# Code Review - Brevis App - 2026-05-18

**Mode:** FULL (baseline — first run under diff-only/full-sweep protocol; future weeks will pick the mode automatically)
**Reason for mode:** Baseline; protocol change effective 2026-05-19
**Previous review:** tasks/code_review_2026-05-11.md
**HEAD:** `1f1b027`  •  **Previous HEAD:** `d4cb70a`
**Commits since last review:** 1 (`1f1b027 chore: agent-stack working state`)
**npm audit:** 0/0/0/0/0 (250 deps)

## Executive Summary

**BLUF**

- **2 new [High] findings in code that was previously out of scope** — both in the knowledge-graph / KB stack (`graph-routes.js`, `graph-ai.js`, `ai-service.js:compileKnowledgeBase/queryKnowledgeBase`). One is a prompt-injection vector via unfenced user content; the other is an unvalidated `extractionPrompt` field that lets a Premium user replace the system prompt of the entity extractor. Last week's review explicitly said "ready for production" but did not audit these files — that gap is now closed.
- **All 7 hardening fixes from 2026-05-04 remain intact**, and last week's deferred [Low] (`createNewsletter` extra SELECT) is **FIXED** this week via the auto-tag cache (`database.js:293-326`, `server.js:695-700`). Aging tracker is otherwise clean. `npm audit`: **0/0/0/0/0** across 250 deps.
- **One [Medium] dependency issue:** `multer@^1.4.5-lts.1` is end-of-life and carries CVE-2025-47935 / 47944 (multipart DoS). `npm audit` does not flag it because the EOL status is metadata, not an advisory match. 5 upload routes touch it — upgrade to `2.x` is ~30 min including smoke test.

---

## What changed this week

### Repository state

- **`main` HEAD:** `1f1b027 chore: agent-stack working state` (single commit since 2026-05-11). Mostly additive — agent runtime, migrations 001/002, content/marketing markdown, and the auto-tag cache fix.
- **Working tree:** Four untracked `scheduled/brevis-content-engine/content-2026-05-{12,14,15,18}.md` files — agent output, expected.
- **Remote pull:** Sandbox cannot reach GitHub (host-key/SSH not provisioned). Review was done against local HEAD, which already matches `origin/main`.

### `npm audit`

```
found 0 vulnerabilities (prod 221, dev 29, optional 2, total 250)
```

### `npm outdated` (notable lines only)

| Package | Current | Latest | Note |
|---|---|---|---|
| multer | 1.4.5-lts.2 | **2.1.1** | 1.x is EOL — see [Medium] below |
| express | 4.22.1 | 5.2.1 | Major bump, defer |
| stripe | 14.25.0 | 22.1.1 | API surface stable; defer |
| @anthropic-ai/sdk | 0.92.0 | 0.96.0 | Minor; safe to bump |
| openai | 4.104.0 | 6.38.0 | We barely use this — defer or remove |

### Changes verified vs. 2026-05-11

- ✅ **[FIXED] `createNewsletter` extra SELECT** (last week's only open [Low]). Now backed by `getUserAutoTagEnabled` with 5-min TTL + explicit invalidation on `PATCH /api/auth/profile`. Verified at `database.js:293-326` and `server.js:695-700`.
- ✅ All 7 hardening fixes from 2026-05-04 still in place (fail-closed auth, safeFetch + DNS pinning, SRI, per-route rate limiters, `is_read` validator, Stripe webhook `default:` branch, AI input pre-flight bound).
- ✅ **Agent runtime (`agents/runtime/`, `agents/tools/`) reviewed.** Kill-switch + per-agent daily budget caps (default $1), server-side tool allowlist (`registry.js:60-78`), `db_lookup` uses named templates so the LLM cannot author SQL (`db-tools.js:14-70`), all queries parameterized, no hardcoded secrets, reuses production SSL config (`runtime/db.js:14-32`). **Clean.**
- ✅ **Migrations 001/002 reviewed.** Parameter-free DDL, idempotent (`IF NOT EXISTS`), `pg_notify` trigger payload is built from controlled columns. **Clean.**

---

## New findings

### [High] [ai-service.js:451-545] — KB compile/query prompts skip `<user_content>` delimiters

`compileKnowledgeBase` (lines 469-545) and `queryKnowledgeBase` (lines 635-651) interpolate `tagName`, newsletter titles, senders, summaries, and the user's free-text `question` straight into the prompt template via `${...}` — without the `<user_content>...</user_content>` fencing that the existing `SYSTEM_PROMPT` relies on (the pattern used in `generateSummary`). Newsletter bodies are attacker-controllable (anyone can email a forwarded "newsletter" with crafted text), and the resulting content reaches Premium users' KB queries.

**Fix:** Wrap every interpolated user field in `<user_content>...</user_content>` and ensure `system: SYSTEM_PROMPT` is passed on all KB calls. ~30 min.

**Status:** New (file added since last comprehensive review).

### [High] [graph-routes.js:358-377] + [graph-ai.js:55-62] — User-supplied `extractionPrompt` becomes the system prompt with no validation

`POST /api/graph/profiles` validates `name`, `entityTypes`, `relationshipTypes` but **does not validate `extractionPrompt`** (line 358-362). The body field is stored verbatim into `profile.extraction_prompt` and later passed directly into `client.messages.create({ system: systemPrompt, ... })` for every entity extraction the user runs. A Premium user can fully replace Brevis's extraction system prompt — exfiltrate other context concatenated into prompts, return malicious JSON that pollutes their own knowledge graph, or burn unbounded Anthropic spend by ordering max-length outputs.

Blast radius is one user's account + the Anthropic bill on that user's runs (still meaningful — daily budget caps exist on the agent runtime but **not** on the graph extraction path).

**Fix:** Add `body('extractionPrompt').optional().isString().isLength({ max: 4000 })` and prepend an immutable safety preamble in `graph-ai.js:55-62`. ~15 min.

**Status:** New.

### [Medium] [package.json:31] — `multer@^1.4.5-lts.1` is EOL with known CVEs

Multer 1.x reached end-of-life. CVE-2025-47935 and CVE-2025-47944 (DoS via crafted multipart) affect this line. `npm audit` returns 0 because the advisories are filed under the package metadata rather than as a transitive match. Affected routes (5):

- `/api/news-builder/upload-word`
- `/api/news-builder/upload-file`
- `/api/newsletters/upload-pdf`
- `/api/webhook/email`
- `/api/subscriptions/import-opml`

**Fix:** `npm i multer@^2.0.0`, smoke-test the 5 routes (API surface used is just the constructor + `.single()` / `.none()` — should be drop-in). ~30 min.

**Status:** New (called out explicitly in this week's review checklist; previous reviews leaned on `npm audit` exit code only).

### [Medium] [server.js:1884] — Webhook secret compared with `!==` instead of timing-safe

`if (providedSecret !== webhookSecret)` — vulnerable in principle to timing-based secret recovery. Realistic exploitability over public HTTPS is low, but the fix is trivial.

**Fix:** `crypto.timingSafeEqual(Buffer.from(providedSecret||''), Buffer.from(webhookSecret))` with a length pre-check. ~5 min.

**Status:** New observation (the check itself is older; the comparison style was never flagged).

### [Medium] [graph-routes.js:269-289, kb-routes.js:174-191] — Background tasks swallow errors past response

`setImmediate(async () => { ... })` runs after `res.json(...)` returns. If `extractAndStoreGraph` / `compileKB` throws an unhandled rejection, only `console.error` records it; **nothing pages, no row is written to `agent_runs`** (these paths bypass the agent runtime), and the in-memory task object is the only trace — lost on restart. Cost-bearing AI calls can fail invisibly.

**Fix:** Wrap with try/catch + structured `log.error`, and persist failure state to DB so a restart doesn't drop it. ~45 min.

**Status:** New.

### [Medium] [graph-routes.js:83, kb-routes.js:78] — In-memory task maps don't survive restart or scale beyond one process

`extractionTasks` / `compilationTasks` are module-level `Map`s. On a Railway redeploy or horizontal scale, in-flight tasks vanish and the client polls a 404 forever. Also: `setTimeout(() => extractionTasks.delete(taskId), 10*60*1000)` leaks if the user never polls.

**Fix:** Move to a `kb_tasks` / `graph_tasks` DB row, or at minimum cap to an LRU. ~1 hr.

**Status:** New.

### [Low] [auth.js:69-85] — Legacy `authMiddleware` export still present

The fallback `authMiddleware` that does **not** verify `token_version` is still exported alongside the safe `makeAuthMiddleware`. Nothing in `server.js` imports the legacy one today (verified via grep), but its continued existence is a footgun for any future contributor.

**Fix:** Delete the export or rename to `__unsafeLegacyAuthMiddleware`. ~5 min.

**Status:** New observation.

### [Low] Function length — three handlers still >100 lines

Same set as last week — `cleanTextContent` (~122 lines including adjacent helpers), Stripe webhook handler (lines 1756-1867, 112 lines), email webhook handler (lines 1876-1980, 105 lines). Not a security issue. Refactor candidates only.

**Status:** Carryover.

---

## Summary by severity

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | — |
| **High** | **2** | KB prompt injection; unvalidated `extractionPrompt` |
| Medium | 4 | multer EOL; webhook secret timing; setImmediate error swallowing; in-memory task maps |
| Low | 2 | Legacy `authMiddleware` export; >100-line handlers (carryover) |

---

## Top 3 to ship this week

1. **Fence user content in the KB/graph prompts** (`ai-service.js:compileKnowledgeBase` + `queryKnowledgeBase`, `graph-ai.js:queryGraphNaturalLanguage`). Wrap `tagName`, newsletter fields, entity names, and `question` in `<user_content>...</user_content>` and ensure `SYSTEM_PROMPT` is set on every call. **~30 min.**
2. **Validate + cap `extractionPrompt`** at `graph-routes.js:358-377`. Add `body('extractionPrompt').optional().isString().isLength({ max: 4000 })` and prepend an immutable safety preamble in `graph-ai.js:55-62`. **~15 min.**
3. **Upgrade `multer` to 2.x** (`package.json:31`). Verify the 5 upload routes still parse correctly. **~30 min + smoke test.**

Stretch: persist graph/KB background task state to DB; switch webhook secret comparison to `crypto.timingSafeEqual`.

---

## Aging tracker

| Issue | First flagged | Weeks open | Status | Severity |
|---|---|---|---|---|
| `createNewsletter` extra SELECT | 2026-04-27 | **CLOSED** | ✅ | ~~Low~~ |
| KB prompt injection (no `<user_content>`) | **2026-05-18** | 1 | OPEN | **High** |
| `extractionPrompt` unvalidated | **2026-05-18** | 1 | OPEN | **High** |
| `multer@1.x` EOL | **2026-05-18** | 1 | OPEN | Medium |
| Webhook secret non-timing-safe | **2026-05-18** | 1 | OPEN | Medium |
| `setImmediate` swallowed errors (graph/KB) | **2026-05-18** | 1 | OPEN | Medium |
| In-memory task maps (graph/KB) | **2026-05-18** | 1 | OPEN | Medium |
| Legacy `authMiddleware` export | **2026-05-18** | 1 | OPEN | Low |

---

## Verification performed

- `git log --since='2026-05-11'` — single commit (`1f1b027`).
- `npm audit` — 0 vulnerabilities across 250 deps.
- `npm outdated` — captured the multer 1.x / 2.x gap.
- Static review of `server.js` (2,268 lines), `database.js` (707), `ai-service.js` (729), `public/app.html` (2,940), `package.json`, plus expanded coverage of `auth.js`, `graph-routes.js`, `graph-ai.js`, `graph-profiles.js`, `kb-routes.js`, `kb-service.js`.
- Grep for hardcoded secrets (`sk-`, `sk_live`, `sk_test`, `AKIA`, `ghp_`, `xoxb-`, password/secret = "..."): **none found** outside `.env.example` placeholders.
- Confirmed all 7 hardening fixes from 2026-05-04 remain intact.
- Confirmed last week's open [Low] is closed.
- Verified the two [High] findings by reading the source (`graph-routes.js:350-385`, `ai-service.js:460-545`).

**Status:** Production is stable; 2 [High] findings require near-term fixes (graph/KB stack — not blocking active customers but ship within the week). GH issues filed for both Highs.
