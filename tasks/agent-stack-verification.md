# Agent Stack v1 — Verification Log

This file records what was tested and where, so the next person (or agent) can audit the safety rails without re-doing the work.

---

## Day 1 — May 4, 2026

### Automated (in-sandbox, against PGlite)

Run with: `node tasks/verify-agent-stack.mjs`

- ✅ Migration `001_agent_stack.sql` applies cleanly against a fresh DB.
- ✅ All 5 tables created: `agent_runs`, `agent_events`, `agent_kill_switch`, `agent_budget`, `newsletter_drafts`.
- ✅ Kill-switch seeded for all 7 agents (editor, growth, sales, support, engineer, ops, orchestrator), all enabled by default.
- ✅ Budget seeded for all 7 agents with positive daily caps.
- ✅ `agent_events_notify_trigger` is present (fires `pg_notify('agent_event', ...)` on insert).
- ✅ Kill-switch row update flips `enabled` correctly.
- ✅ `cost_usd` sum-for-today query returns the right number (used by runtime budget guard).
- ✅ `newsletter_drafts` accepts a row with the FK to `users`, defaults `review_status='pending'` and `sent_at=NULL`.
- ✅ `agent_events` accepts an event insert.

### Syntax + import resolution (Node 22)

- ✅ `agents/runtime/db.js`, `llm.js`, `index.js`, `cli.js`
- ✅ `agents/tools/registry.js`
- ✅ `migrations/run-migrations.js`
- ✅ ESM imports resolve cleanly: runtime exports `runAgent`, `emitEvent`; registry exports `registerTool`, `dispatchTool`, `listTools`; llm exports `llmComplete`, `__providers`.

### NOT yet verified (requires real Postgres on Antonio's box)

- ⚠ `LISTEN/NOTIFY` actually wakes a subscribed client. PGlite has partial NOTIFY support; the trigger is present, but a real subscriber roundtrip needs real Postgres.
- ⚠ End-to-end runtime loop (`npm run agents:hello`) against a real DB. Pending Antonio runs `npm run migrate && npm run agents:hello`.
- ⚠ Full multi-agent isolation (one agent crash doesn't take down others) — Day-6 replay harness covers this.

### Manual run on your box (do these in order)

```bash
cd ~/dev/brevis
npm install                     # picks up @electric-sql/pglite devDep
npm run migrate                 # applies migrations/001_agent_stack.sql
psql $DATABASE_URL -c "SELECT agent_name, enabled FROM agent_kill_switch;"
npm run agents:hello            # smoke-test the runtime end-to-end
psql $DATABASE_URL -c "SELECT agent_name, run_id, step_kind, status FROM agent_runs ORDER BY id DESC LIMIT 10;"
```

Expected output of `npm run agents:hello`: a `hello` run completes in ≤5 steps with status `completed` and cost $0 (stub provider). The `agent_runs` table should show start → llm_call → finish rows.

If anything misbehaves, the kill-switch is your friend. Use UPSERT — the migration only seeds the 7 production agents, so a plain UPDATE for an unseeded agent (like `hello`) silently affects zero rows and `isAgentEnabled` defaults to `true`, making the rail a false pass:

```sql
INSERT INTO agent_kill_switch (agent_name, enabled, reason, updated_by)
VALUES ('hello', false, 'investigating', 'antonio')
ON CONFLICT (agent_name) DO UPDATE
SET enabled = EXCLUDED.enabled,
    reason = EXCLUDED.reason,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();
```

### Real-DB run, May 4, 2026

Run by Claude on Antonio's box, against the real Postgres in `.env`.

**Environment**
- ✅ Node v24.10.0 (≥ 18 required)
- ✅ `DATABASE_URL` present in `.env`
- ✅ No Brevis dev server running (port 3000 free, no `node ... server` process)
- ⚠ Git status not clean (expected): `agents/`, `migrations/`, `tasks/todo.md` and other Day-1 work staged but uncommitted, per "do not commit yet" instruction.

**STEP 2 — install + migrate**
- ✅ `npm install` — up to date, 0 vulnerabilities, 247 packages.
- ✅ `npm run migrate` — applied `001_agent_stack.sql` once, then printed `✅ [migrate] Done.`
- ✅ `agent_kill_switch` seed: 7 rows (editor, engineer, growth, ops, orchestrator, sales, support), all `enabled=true`.
- ✅ `agent_budget` seed: 7 rows with the daily caps from the migration ($10 editor, $5 engineer, $3 growth/sales/support, $2 orchestrator, $1 ops).

**STEP 3 — runtime smoke test**
- ✅ `npm run agents:hello` → `status=completed`, `steps=2`, `cost=$0.000000`. Stub LLM produced the canned echo response.
- ✅ `agent_runs` shows the expected 3-row trail per run: `start` (step_index=0) → `llm_call` (1) → `finish` (2).

**STEP 4 — safety rails**

Kill-switch:
- ⚠ Pre-existing verification command list assumed a `hello` row already existed in `agent_kill_switch`. The migration only seeds the 7 production agents, so a plain `UPDATE ... WHERE agent_name='hello'` updates 0 rows and the rail does **not** trigger (because `isAgentEnabled` defaults to `true` when the row is missing, see `agents/runtime/index.js:231`). Worked around by running `INSERT ... ON CONFLICT (agent_name) DO UPDATE SET enabled=false`.
- ✅ With `enabled=false`, `npm run agents:hello` returned `status=killed`, `cost=$0`, no LLM call logged. Re-enabled cleanly afterward.

Budget:
- ✅ `INSERT INTO agent_budget` with cap=$0.001 + a fake $0.01 `agent_runs` row → `npm run agents:hello` returned `status=budget_exceeded`, `cost=$0`, no LLM call logged.
- ✅ Cleanup: deleted the budget row, all hello `agent_runs` rows (10 rows from this verification session), and the inserted hello kill-switch row. Baseline restored: 7 rows each in `agent_kill_switch` / `agent_budget`, 0 rows in `agent_runs`.

**Outcome:** Day 1 GREEN. All five Day-1 checklist items verified end-to-end against real Postgres. Both safety rails proven to halt the runtime before any LLM spend. One small footgun in the verification command list noted above and captured in `tasks/lessons.md`.

### Day-1 follow-up — root-cause fix to the fail-open default

The lesson above (rule #2: "When a safety rail's 'off path' relies on row presence, write a unit test that exercises the no-row case") pointed at a real correctness issue, not just a doc bug: an unseeded agent ran with NO budget cap and a default-true kill-switch. Fixing only the doc would have left the next operator one forgotten seed away from a runaway $-loop.

Applied in code (`agents/runtime/index.js`):
- New `ensureAgentDefaults(pool, agent.name)` runs at the top of every `runAgent()` invocation. Idempotent ON CONFLICT DO NOTHING — preserves any existing seed.
- Inserts default `agent_kill_switch` row (enabled=true, updated_by='runtime-autoseed') if missing.
- Inserts default `agent_budget` row at the conservative `UNSEEDED_AGENT_DEFAULT_BUDGET_USD = $1.00`/day cap. A runaway loop hits the cap fast and Ops pages.

Verification (re-ran `node tasks/verify-agent-stack.mjs`): all 22 checks pass, including 3 new ones for the autoseed contract:
- ✅ autoseed inserts kill-switch row (enabled=true, updated_by='runtime-autoseed')
- ✅ autoseed inserts budget row at the $1.00 default
- ✅ autoseed is idempotent — re-running does NOT re-enable a paused agent (won't undo an operator's pause)

Doc fix also applied: the canonical command list above now uses INSERT ... ON CONFLICT instead of bare UPDATE, so even direct DB operators can't trip the same footgun. The runtime auto-seed makes it impossible by construction; the doc fix makes it readable.

---

## Day 2 — in-sandbox checks complete; real-DB run pending

### What shipped

- **Anthropic SDK wired** (`@anthropic-ai/sdk` v0.92, dependency, not dev). Provider in `agents/runtime/llm.js` converts the runtime's generic message format ↔ Anthropic's content-block/tool-use format. Pricing table (Sonnet 4.6 / Haiku 4.5 / Opus 4.6) computes `cost_usd` per call; falls back to a pessimistic default for unknown models so cost can't silently round to zero.
- **Tool registry refactored** to use object-style definitions (`{name, description, inputSchema, handler}`) so we can pass real JSON Schema to Anthropic's `input_schema`. Day-1 stub tools (`echo`, `db.now`) updated to the new shape.
- **Migration 002_digests.sql** — `digests`, `digest_tags`, `digest_runs` per the original Digest plan from `tasks/todo.md`, with cascade FKs, `UNIQUE (digest_id, scheduled_for)` to block double-sends, `CHECK (cadence IN ('daily','weekly','monthly'))`, and a `digests_touch_updated_at` trigger.
- **Tools added:** `db.lookup` (5 named templates: `user_profile`, `digests_for_user`, `newsletters_for_digest`, `count_users_total`, `count_newsletters_for_user`), `draft.create` (writes to `newsletter_drafts`), `verify_metric` (fabrication guard, supports `db.lookup` + `literal` source kinds, optional tolerance %).
- **Editor agent** (`agents/editor/agent.js`) — system prompt, model `claude-sonnet-4-6`, allowlist `['db.lookup', 'verify_metric', 'draft.create']`, `maxSteps: 12`. NO `newsletter.send` in allowlist on Day 2 — physically can't send.
- **CLI command** `npm run agents:editor:dryrun -- --user-id N [--digest-id M] [--period-days K]`.

### Automated (in-sandbox, against PGlite — 35 total checks pass)

Run with: `node tasks/verify-agent-stack.mjs`

Day-1 checks (22) all still pass. Day-2 additions:

- ✅ `migrations/002_digests.sql` applies cleanly.
- ✅ Tables `digests`, `digest_tags`, `digest_runs` created.
- ✅ `cadence='hourly'` rejected by CHECK constraint (only daily/weekly/monthly allowed).
- ✅ `UNIQUE (digest_id, scheduled_for)` blocks duplicate `digest_runs` rows.
- ✅ `db.lookup` template SQL extracted from `agents/tools/db-tools.js` source.
- ✅ `user_profile` returns the active user.
- ✅ `digests_for_user` returns the user's active (non-paused) digest with tag arrays.
- ✅ `newsletters_for_digest` returns 2-of-3 in a 7-day window (8-day-old item correctly excluded).
- ✅ `newsletters_for_digest` with tag-id filter returns just the tagged item.
- ✅ `count_newsletters_for_user` returns 3 from seeded fixtures.
- ✅ `extractNumbers` parses `"47 users this week"` → `[47]`.
- ✅ `extractNumbers` handles decimals: `"42.5%"` → `[42.5]`.
- ✅ `extractNumbers` handles multiples: `"128 newsletters across 5 tags"` → `[128, 5]`.
- ✅ `extractNumbers` returns `[]` on text with no numbers.

### NOT yet verified (requires real Postgres + ANTHROPIC_API_KEY on Antonio's box)

- ⚠ Anthropic provider end-to-end against the real API (`llmComplete({provider: 'anthropic', model: 'claude-sonnet-4-6', ...})`). Pricing math vs. real `usage` object.
- ⚠ Editor agent end-to-end: `npm run agents:editor:dryrun -- --user-id <real_id>`. Pulls a real user's newsletters, drafts a real digest, persists to `newsletter_drafts`. NOT SENT.
- ⚠ `verify_metric` against `db.lookup` source kind in the live agent loop (literal source already covered above).
- ⚠ Tool-allowlist enforcement in real loop (e.g., Editor tries to call `newsletter.send` — should be blocked, logged as an error, agent continues).

### Manual run on your box (Day 2 — in this order)

```bash
cd ~/dev/brevis
git pull   # if needed
npm install                              # picks up @anthropic-ai/sdk
npm run migrate                          # applies 002_digests.sql
psql $DATABASE_URL -c "\d digests"
psql $DATABASE_URL -c "\d digest_runs"

# Pick a real user for the dry-run. Need at least 1 newsletter in the period.
psql $DATABASE_URL -c "SELECT id, email, language, plan FROM users WHERE is_active=1 LIMIT 5;"

# Run the Editor in dry-run (NOTHING IS SENT). Replace 42 with a real user id.
ANTHROPIC_API_KEY=sk-... LLM_DEFAULT_PROVIDER=anthropic \
  npm run agents:editor:dryrun -- --user-id 42 --period-days 7

# Check the draft was written
psql $DATABASE_URL -c "SELECT id, user_id, language, subject, source_count, review_status, LENGTH(html_body) AS html_len, jsonb_array_length(metric_claims) AS metric_count FROM newsletter_drafts ORDER BY id DESC LIMIT 3;"

# Inspect the draft body if you want
psql $DATABASE_URL -c "SELECT html_body FROM newsletter_drafts ORDER BY id DESC LIMIT 1;" | less

# Inspect the run log — every step Editor took, with cost
psql $DATABASE_URL -c "SELECT step_index, step_kind, status, input_tokens, output_tokens, cost_usd FROM agent_runs WHERE agent_name='editor' ORDER BY id DESC LIMIT 20;"

# Cost for this Editor run
psql $DATABASE_URL -c "SELECT SUM(cost_usd) AS total_cost FROM agent_runs WHERE agent_name='editor' AND started_at > NOW() - INTERVAL '5 minutes';"
```

Expected:
- A draft row appears in `newsletter_drafts` with `review_status='pending'`, `sent_at=NULL`.
- `agent_runs` shows the run trail: start → llm_call → tool_call(db_lookup × 3-ish) → tool_result × 3-ish → llm_call → tool_call(verify_metric × N) → tool_call(draft_create) → finish.
- Total cost typically $0.05–$0.20 for a 7-day window with a few newsletters.
- The draft's HTML body should NOT contain any number that wasn't verified — check the `metric_claims` jsonb array (`verified: true` for every entry, or numbers absent entirely).
- Cost-query caveat: the per-run cost shown in the CLI output is authoritative. The SQL query above (`SELECT SUM(cost_usd) ... WHERE agent_name='editor' AND started_at > NOW() - INTERVAL '5 minutes'`) double-counts because the runtime writes a roll-up `cost_usd` on the `finish` row in addition to the per-step `llm_call` rows. Fix is queued — see Day-2 real-DB run notes below. For an accurate SQL number, append `AND step_kind != 'finish'`.

### Day 2 — Real-DB run, May 5–6, 2026

Run by Claude on Antonio's box, against the real Postgres in `.env`, ANTHROPIC_API_KEY freshly populated from Railway. Crossed midnight twice during the session — Day 1 verification was May 4; Day 2 prep + bug-fix iterations were May 5; final cost query landed on May 6.

**Environment**
- ✅ `ANTHROPIC_API_KEY` populated in `.env` (was empty line on entry; loaded length=108). Must also be set in Railway.
- ✅ `npm install` clean (251 packages, 0 vulns) — `@anthropic-ai/sdk@0.92` already installed from prior Day-2 prep.
- ✅ `npm run migrate` applied `002_digests.sql`. `\d digests`, `\d digest_runs`, `\d digest_tags` all confirm tables + CHECK constraints + the `UNIQUE (digest_id, scheduled_for)` index + the `digests_touch_updated_at_trg` trigger.
- ⚠ Local dev DB was empty (0 users, 0 newsletters, 0 of anything). Could not pick "a real user with ≥3 newsletters in the last 7 days." Seeded a synthetic fixture instead — `/tmp/brevis_day2_seed.sql`: 1 user (`editor-dryrun-test@brevis.local`, language=es, plan=pro), 5 tags (Tech / Crypto / AI / VC / Politica), 5 newsletters dated last 5 days with mixed numeric and qualitative summaries, 1 active digest (daily, no tag filter). Idempotent via stable email — drop with `DELETE FROM users WHERE email='editor-dryrun-test@brevis.local'` (cascades).

**Bugs found during the run (all fixed before declaring GREEN)**

1. **[High] Anthropic rejects dotted tool names.** First Editor LLM call returned `400 invalid_request_error: tools.0.custom.name: String should match pattern '^[a-zA-Z0-9_-]{1,128}$'`. Root cause: tools registered with dots (`db.lookup`, `db.now`, `draft.create`) — Anthropic's tool-name regex disallows dots. Day 1's hello agent didn't surface this because it used the `stub` provider; Day-2 in-sandbox checks tested templates and schemas without round-tripping through the real Anthropic API. **Fix:** renamed `db.lookup → db_lookup`, `db.now → db_now`, `draft.create → draft_create` across the registry, both tool files, the editor agent, the CLI hello agent, and `verify_metric`'s `source_kind` enum (kept consistent for readability — Anthropic doesn't validate enum values, but the dotted convention had no functional benefit). Updated comments in `tasks/verify-agent-stack.mjs`. Added a `TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,128}$/` validation at `registerTool` so this can't regress silently — verified it throws on `'newsletter.send'` and on duplicate-name registration.

2. **[Medium] `db_lookup` tool description didn't expose per-template parameter names.** After the rename, Editor pulled user_profile and digests_for_user fine, then called `newsletters_for_digest` with `{user_id, start_date, end_date, tag_ids, digest_id}` — but the template signature is `(user_id, from_iso, to_iso, tag_ids_or_null)`. The handler does `args.params?.[p] ?? null`, so wrong keys silently coalesce to NULL → SQL becomes `date_added >= NULL` → returns 0 rows. Editor then tried to recover, ran out of steps, failed. **Fix:** rebuilt the tool description string to enumerate each template with its exact parameter signature (`newsletters_for_digest(user_id, from_iso, to_iso, tag_ids_or_null): ...`) plus an explicit warning that wrong keys silently null-coalesce.

3. **[Low] `maxSteps` on the Editor agent was set to 12, which counts log rows not LLM iterations.** The runtime increments `step_index` on every row written (start, llm_call, each tool_call, each tool_result, error). One LLM call with K parallel tool_use blocks burns 1 + 2K rows. A realistic Editor run (3 db_lookups, 5+ verify_metrics, 1 draft_create) needs 35–40 rows. **Fix:** bumped `maxSteps` to 50. Better long-term: count only LLM iterations, not log rows — queued for a follow-up.

4. **[Medium] Cost double-count in `agent_runs`.** The runtime writes `cost_usd = totalCostUsd` on the `finish` row in addition to per-step `cost_usd` on each `llm_call` row. `SUM(cost_usd) WHERE run_id=X` therefore returns 2×. The CLI's `result.totalCostUsd` is authoritative (sums llm_call rows in memory). The budget guard's query (`SUM(cost_usd) ... started_at >= today`) over-counts and would trip the daily cap at half the configured value. **Fix queued (not applied this session — out of scope of "verify Day 2"):** zero out `cost_usd` on the finish row and put `totalCostUsd` into the payload only; OR change the budget guard to `WHERE step_kind != 'finish'`. Adding to lessons. Workaround documented in the canonical command list above.

**STEP 4 — Editor end-to-end (after fixes)**
- ✅ `LLM_DEFAULT_PROVIDER=anthropic npm run agents:editor:dryrun -- --user-id 3 --digest-id 1 --period-days 7` → `status=completed`, `steps=36`, `cost=$0.1486`.
- ✅ Run trail (run_id `b76fa9eb-f95c-449d-9148-f3ba5ac72971`):
  - `start` (1) → `llm_call` (1) → `db_lookup(user_profile)` × 1 → `db_lookup(digests_for_user)` × 1 → `db_lookup(newsletters_for_digest)` × 1 → 5 newsletters returned.
  - Then 8 × `verify_metric` (literal source_kind, against each newsletter's summary text) — all returned `verified=true` for the claims that survived; the agent had additionally floated 2 candidate claims that *did not* match source text and dropped them.
  - Then 1 × `draft_create` → `draft_id=1`, then `finish`.

**STEP 5 — Draft inspection (draft_id=1)**
- ✅ `language='es'` matches user.
- ✅ `subject='Tu resumen semanal: IA, crypto y venture capital'` (48 chars, < 60).
- ✅ `source_count=5` matches the 5 seeded newsletters.
- ✅ `review_status='pending'`, `sent_at=NULL` — never sent, as expected for dry-run.
- ✅ `metric_claims` (length 8): every entry has `verified=true`. Two entries explicitly note that an *original* claim failed verification and was rephrased — `'3 mega-rondas'` was dropped (rephrased to "Varias rondas Serie B superaron los 100 M EUR"); `'2 directivas'` was dropped (rephrased to "varias directivas", keeping the `18 meses` figure that did verify).
- ✅ html_body fabrication audit: every quantitative number in the body (47, 250, 1.2 B USD, 98.500, 5.200, 145 B USD, 100 M EUR, 18 meses) maps to a `metric_claims` entry with `verified=true`. The other digits in the body are dates (`27 abril`, `4 mayo`, `2026`, `2026-05-04`) and URL fragments (`issue-217`, `europe-week-18`) — not quantitative claims. No orphan numbers.

**STEP 6 — Cost**
- ✅ Authoritative run cost (CLI): `$0.1486`. Well under the $0.30 ceiling.
- ⚠ The doc's SQL cost query returned `$0.2972` (exactly 2×) — this is the cost double-count bug above. Fixed conceptually but the runtime still writes the duplicate; until the runtime fix lands, either use the CLI number or filter `WHERE step_kind != 'finish'`.

**STEP 7 — Tool-allowlist test (rogue entry + registerTool guard)**
- ⚠ Test as scripted in the task description ("add `newsletter.send` to the Editor's tools list, observe runtime block the call") *silently passes* — it does NOT exercise the runtime allowlist guard at `agents/runtime/index.js:143`. Reason: `toolDefsForLlm(agent.tools)` filters out unregistered names *before* the LLM call, so Anthropic never sees `newsletter.send` and never returns a tool_use for it. With the rogue entry in place, the Editor completed normally with `draft_id=2`, no error rows, 3 distinct tools called (`db_lookup`, `verify_metric`, `draft_create`).
- 🔍 Implication: the runtime's `if (!agent.tools.includes(call.name))` guard at line 143 is *defense-in-depth that can't fire under normal operation* — Anthropic only returns tool_use for names we sent it, and we only send names that are both in `agent.tools` AND in the registry. The real allowlist enforcement is `toolDefsForLlm`'s filter step. Worth simplifying the runtime to make this explicit; logged as a follow-up.
- ✅ Stronger registration-level test: invoking `registerTool({ name: 'newsletter.send', ... })` correctly throws `[tools] registerTool(newsletter.send): name must match /^[a-zA-Z0-9_-]{1,128}$/`. Duplicate-name registration also correctly throws. The new regex guard is the live enforcement layer.
- ✅ Editor's allowlist reverted to `['db_lookup', 'verify_metric', 'draft_create']`.

**Outcome:** Day 2 GREEN. Editor produces a verified, on-language, on-budget draft against real Anthropic, fabrication guard catches and drops unverified numbers as designed, dry-run honors `sent_at=NULL`, `newsletter_send` is physically not in the allowlist, registry rejects malformed tool names. Three follow-ups queued (cost double-count, dead-code allowlist guard, maxSteps semantics) — none are blockers for Day 3.
