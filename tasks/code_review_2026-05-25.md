# Code Review - Brevis App - 2026-05-25

**Mode:** INCREMENTAL
**Reason for mode:** 0 commits since last review, week 4 of month, 7 days since last sweep — no triggers met for FULL.
**Previous review:** tasks/code_review_2026-05-18.md
**HEAD:** `1f1b027`  •  **Previous HEAD:** `1f1b027` (unchanged)
**Commits since last review:** 0
**npm audit:** 0/0/4/0/0 (was 0/0/0/0/0 last week — see [Medium] below)

## Executive Summary

**BLUF**

- **Zero code changes this week.** `git log 1f1b027..HEAD` is empty. No diff to review, no new code paths, no regressions possible from our side. All 8 carryover findings from 2026-05-18 are still OPEN and have aged by one week (none yet shipped).
- **Two newly-published Moderate npm advisories** landed against deps we already had: `qs` (GHSA-q8mj-m7cp-5q26, transitive via `express` + `body-parser`) and `brace-expansion` (GHSA-jxxr-4gwj-5jf2). Both are DoS-class with narrow trigger conditions; both auto-fixable with `npm audit fix`. Risk to Brevis is low but the close cost is ~2 minutes — should ship this week regardless.
- **No new [High] or [Critical] findings.** Hardcoded-secret scan: clean. The 2 [High]s and 4 [Medium]s from 2026-05-18 (KB prompt fencing, `extractionPrompt` validation, multer EOL, webhook timing, setImmediate error swallow, in-mem task maps) all remain unaddressed in code — these are the real ship list, not the new advisories.

---

## What changed this week

### Repository state

- **`main` HEAD:** `1f1b027 chore: agent-stack working state` — unchanged since 2026-05-18. No commits, no merges, no working-tree changes worth flagging (scheduled content agent output `scheduled/brevis-content-engine/content-*.md` files are expected).
- **Remote pull:** Sandbox cannot reach GitHub (same constraint as last week). Review run against local HEAD, which already matches `origin/main` per last week's verification.

### `npm audit` delta

Last week: 0/0/0/0/0 across 250 deps. This week: 0/0/4/0/0. The deltas are **newly-published advisories**, not new code:

```
brace-expansion  5.0.2-5.0.5    GHSA-jxxr-4gwj-5jf2   DoS (numeric range bypasses max)
qs               6.11.1-6.15.1  GHSA-q8mj-m7cp-5q26   DoS (TypeError on null in comma arrays)
  ↳ body-parser  1.20.3-1.20.4  (transitive)
  ↳ express      4.21.0-4.22.1  (transitive)
```

All four lines resolve via `npm audit fix`. Express stays on 4.x — the fix bumps the patch range, not the major.

### `npm outdated` (notable lines only)

Same picture as last week: `multer 1.4.5-lts.2 → 2.1.1` (EOL, already tracked Medium), `express 4.22.1 → 5.2.1` (defer), `stripe 14.25.0 → 22.1.1` (defer), `openai 4.104.0 → 6.39.0` (consider removal — not heavily used), `@anthropic-ai/sdk 0.92.0 → 0.98.0` (minor, safe), `helmet 7.2.0 → 8.2.0` (major, defer), `nodemailer 8.0.5 → 8.0.8` (patch — safe to take).

---

## New findings

### [Medium] [package-lock.json] — Two new transitive DoS advisories (qs, brace-expansion)

Both published since 2026-05-18; both fixed by `npm audit fix` (no major bumps, no breaking API changes). Brevis exposure is limited — `qs` parses the querystring on every request (DoS reachable in theory via crafted `?` with `comma=true` and an injected null, but our routes use simple key=value patterns), and `brace-expansion` is only hit during glob expansion in dev tooling. Practical risk is low, fix cost is ~2 minutes including a re-audit.

**Fix:** `npm audit fix && npm audit` (verify it returns to 0).
**Status:** New (advisories published this week against existing deps).

---

No new code-level findings — there is no new code.

---

## Summary by severity

| Severity | New this week | Carried over | Total open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 2 | 2 |
| Medium | 1 (npm advisories) | 4 | 5 |
| Low | 0 | 2 | 2 |

---

## Top 3 to ship this week

Carryovers dominate — last week's top-3 is still this week's top-3:

1. **Fence user content in KB/graph prompts** (`ai-service.js:451-545`, `graph-ai.js`). Wrap `tagName`, newsletter fields, entity names, `question` in `<user_content>...</user_content>`. **~30 min.** [High, aging 1 wk]
2. **Validate + cap `extractionPrompt`** at `graph-routes.js:358-377`. Add `body('extractionPrompt').optional().isString().isLength({ max: 4000 })` + immutable safety preamble. **~15 min.** [High, aging 1 wk]
3. **`npm audit fix`** to close the two new Moderates, then **upgrade `multer` to ^2.0.0** + smoke-test the 5 upload routes. **~5 min + 30 min smoke.** [Medium]

Stretch: persist graph/KB background task state to DB; switch webhook secret comparison to `crypto.timingSafeEqual`.

---

## Aging tracker

| Issue | First flagged | Weeks open | Status | Severity |
|---|---|---|---|---|
| KB prompt injection (no `<user_content>`) | 2026-05-18 | **2** | OPEN | **High** |
| `extractionPrompt` unvalidated | 2026-05-18 | **2** | OPEN | **High** |
| `multer@1.x` EOL | 2026-05-18 | **2** | OPEN | Medium |
| Webhook secret non-timing-safe | 2026-05-18 | **2** | OPEN | Medium |
| `setImmediate` swallowed errors (graph/KB) | 2026-05-18 | **2** | OPEN | Medium |
| In-memory task maps (graph/KB) | 2026-05-18 | **2** | OPEN | Medium |
| Legacy `authMiddleware` export | 2026-05-18 | **2** | OPEN | Low |
| >100-line handlers (`server.js`, `cleanTextContent`) | 2026-04-13 | **6** | OPEN | Low |
| `qs` + `brace-expansion` DoS advisories | **2026-05-25** | 1 | OPEN | Medium |

**Aging note:** All seven 2026-05-18 findings are now 2 weeks open with no remediation. Recommend treating the two [High]s as P0 for next week — neither requires more than ~45 min of work combined.

---

## Verification performed

- `git log 1f1b027..HEAD` — empty. Confirmed HEAD unchanged via `git rev-parse HEAD` → `1f1b027ebe2d1dd9ec17705031611c1ac24183fc`.
- `npm audit` — 4 Moderate (qs transitive + brace-expansion), confirmed both new this week.
- `npm outdated` — captured; same picture as last week plus `nodemailer 8.0.5 → 8.0.8` and `@anthropic-ai/sdk 0.92.0 → 0.98.0`.
- Hardcoded-secret grep (`sk-`, `sk_live`, `sk_test`, `AKIA`, `ghp_`, `xoxb-`, PEM headers) — **none found** outside `.env.example`.
- Spot-checked carryovers still present in code:
  - `auth.js:70` — `export function authMiddleware(req, res, next)` still exported ✓ still OPEN.
  - `package.json` — `"multer": "^1.4.5-lts.1"` ✓ still OPEN.
  - `ai-service.js:148-225` confirms `<user_content>` fencing pattern exists in `generateSummary` but is NOT applied in `compileKnowledgeBase`/`queryKnowledgeBase` (lines 451-545) — ✓ still OPEN.
  - `graph-routes.js` — no `extractionPrompt` validator hit on grep ✓ still OPEN.
- No new top-level `.js`/`.mjs`/`.html` files, no `package.json` changes — INCREMENTAL mode correctly chosen.

**Status:** Production stable. Zero new code-level risk introduced this week (zero new code). Recommend prioritizing the two aged [High]s for the next deploy window — neither blocks customers today but both are ~15-30 min fixes that should not sit open into week 3.
