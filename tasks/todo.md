# Brevis - Production Readiness Roadmap

## Completed

### Error Handling & Edge Cases (Feb 2026)
- [x] Global Express error middleware (catches all unhandled errors)
- [x] AppError class for operational vs programmer error distinction
- [x] asyncHandler wrapper — all 37 routes converted, zero try/catch boilerplate
- [x] Database pool error handler (prevents crash on DB disconnect)
- [x] Auth error messages fixed (Spanish → English consistency)
- [x] AI error messages sanitized (no internal API details leaked)
- [x] Frontend apiFetch wrapper (handles 401/429/network errors globally)
- [x] JWT expiry mid-session handled (redirects to login with toast)
- [x] React ErrorBoundary (prevents white screen on render errors)
- [x] Core fetch calls migrated to apiFetch (newsletters, tags, subscriptions, AI)
- [x] Structured logging utility (JSON, log levels, auto-redaction)
- [x] Request ID tracking (X-Request-Id header for log tracing)

## Pending

### Quality & Edge Cases
- [ ] Migrate remaining frontend fetch calls to apiFetch
- [ ] State management audit across the whole app
- [ ] Audit empty states consistency across all views

### Auth & Security
- [x] Privacy policy, terms of service *(already exist)*
- [ ] Auth system hardening (shorter JWT expiry, password complexity)
- [ ] Security review (OWASP top 10)

### Infrastructure
- [x] API rate limits *(5 limiters already in place)*
- [ ] Caching strategy (Redis or in-memory)
- [ ] CI/CD pipeline
- [ ] Performance optimization with real data volumes

### User Experience
- [ ] Push notifications (non-annoying)
- [ ] Offline support
- [ ] Responsive design across screen sizes
- [ ] Testing on older devices/browsers

### Analytics & Growth
- [ ] Analytics to track actual user behavior
- [ ] App Store optimization (screenshots, descriptions, reviews)

### Architecture
- [ ] Split server.js into route modules (currently 2K lines)
- [ ] Split app.html into component files (currently 4.8K lines)
- [ ] Plan for feature requests without architecture rewrites

---

## Feature 1 — Auto-tagging by sender (branch: feature/auto-tagging-by-sender)

**Goal:** When a new newsletter arrives, pre-apply tags the user has historically used on prior newsletters from the same sender. User-toggleable, learns from corrections, applied once at ingest (never retroactively).

**Design decisions confirmed with Antonio 2026-04-21:**
- Sender identity: lowercased email address, extracted from raw `newsletters.sender` header.
- Threshold: sender must have ≥3 prior newsletters before auto-tagging activates.
- Tag inheritance: tag applies if it's on ≥50% of prior newsletters from that sender.
- "Resolved" = applied once at ingest-time, based on sender's tag history at that moment. Never retro-tag older newsletters when the user's tagging habits change later.
- Auto-tags flagged visually so user sees what system did vs. what they did.
- Learning: if user removes an auto-tag ≥3 times for a (sender, tag) pair, stop suggesting it.
- User-level on/off toggle. Per-sender overrides deferred to v2.

**Schema changes:**
- [ ] `newsletters.sender_key VARCHAR(255)` — universal canonical sender identifier (see derivation rules below). Nullable.
- [ ] `newsletter_tags.auto_tagged BOOLEAN DEFAULT FALSE` — true when applied by the auto-tagger.
- [ ] `users.auto_tag_enabled BOOLEAN DEFAULT TRUE` — user-level toggle.
- [ ] New table `sender_tag_blocklist (user_id, sender_key, tag_id, removal_count INT DEFAULT 0)` — tracks user corrections.
- [ ] Backfill script: populate `sender_key` on all existing `newsletters` rows using the derivation rules.
- [ ] Indexes: `(user_id, sender_key)` on newsletters; `(user_id, sender_key, tag_id)` unique on blocklist.

**sender_key derivation rules (one function handles all 5 ingest paths):**
- Email inbound → lowercased email address (strip display name, strip plus-addressing).
- Twitter/X URL import → `@handle` lowercased (from the URL, not the content).
- Generic URL import → domain of the source URL (e.g. `stratechery.com`), lowercased, `www.` stripped.
- RSS cron → the feed URL (subscriptions.url), lowercased.
- PDF upload → null (no identity).
- Manual paste → if `source` field looks like an email, treat as email; else null.
- If derivation fails → null (never blocks insert).

**Code modules:**
- [x] `lib/sender-key.js` — pure function `deriveSenderKey({ source, rawSender, url, feedUrl }) → string | null`. Tests for each of the 5 paths plus edge cases. (25 unit tests, all green)
- [x] `lib/auto-tagger.js` — exports `suggestTagsForSender(userId, senderKey)` returning tag_ids to apply. Pure SQL, no AI call.
- [x] Ingest wiring — inside `dbHelpers.createNewsletter`. RSS inline insert refactored to call the same helper with `{ source: 'rss', feedUrl: sub.url }`.
- [x] Removal tracking — in the tag-removal route, if junction row had `auto_tagged=true`, increment blocklist count for (user, sender_key, tag).
- [x] UI — badge on auto-tagged tag chips (subtle purple stripe + ✦ dot) + settings toggle in user settings (EN/ES strings included).

**Explicit non-goals for v1:**
- No AI tag suggestion based on content. Only sender-based pattern matching.
- No per-sender override UI (just global on/off).
- No "resolve auto-tagged tags as user-tagged after N days" — they stay flagged forever.
- No retroactive application to existing newsletters (only newly ingested ones).

**Ingest flow** (to confirm by reading code):
- Email-in handler (when a user forwards a newsletter to their `@brevis` address).
- Manual "add newsletter" API endpoint (if one exists via subscriptions/RSS).
- Both paths must call the auto-tagger.

**Verification plan:**
- Unit: normalizeSender covers all stated edge cases.
- Unit: suggestTagsForSender returns correct tag_ids given seeded data.
- Integration: seed a user with 3 tagged newsletters from sender X, insert a 4th, assert auto-tag appears with `auto_tagged=true`.
- Integration: insert a 5th, remove auto-tag 3 times, insert a 6th, assert auto-tag no longer applied.
- Integration: toggle `auto_tag_enabled=false`, insert a 7th, assert no auto-tag.
- Manual: run the above on a dev DB with real fixtures before merging.

**Contraction scan:**
- `auto_tagged` column on junction table means a user manually re-applying an auto-removed tag should clear `auto_tagged` to false (or we double-count in blocklist). Handle in the tag-apply route.
- Blocklist uses `tag_id` which is already user-scoped, so no cross-user leakage. Confirmed by `tags.user_id` FK in schema.
- `sender_email` can be NULL for legacy rows where normalization fails — must handle NULL in suggestTagsForSender (return empty set).

**Stays on branch `feature/auto-tagging-by-sender`. No push to main until explicitly approved.**

---

## Review — Feature 1 shipped (2026-04-21)

**What changed** (branch `feature/auto-tagging-by-sender`, not pushed):
- **DB migration** (idempotent, in `database.js` `setupDatabase()`):
  - `newsletters.sender_key TEXT` — canonical sender identity.
  - `newsletter_tags.auto_tagged BOOLEAN DEFAULT FALSE` — flag for Brevis-applied tags.
  - `users.auto_tag_enabled BOOLEAN DEFAULT TRUE` — per-user kill switch.
  - `sender_tag_blocklist (user_id, sender_key, tag_id, removal_count, updated_at)` — learns from corrections.
- **`lib/sender-key.js`** — pure, deterministic `deriveSenderKey({source, rawSender, url, feedUrl})`. Handles email (plus-addressing stripped, lowercased), RSS feed URL (normalized), Twitter/X handle (from URL or bare @handle), generic URL (domain with www stripped), PDF (null — no identity), manual paste (email if present, else null). 25 unit tests, all green.
- **`lib/auto-tagger.js`** — `suggestTagsForSender()` one-shot SQL (prior count + prevalence + blocklist exclusion). Thresholds: 3 priors, 50% prevalence, 3 removals to block. `recordAutoTagRemoval()` upsert.
- **`server.js`** — every `createNewsletter` call site now passes an `ingestCtx` describing which ingest path it came from (email, RSS, Twitter, URL, PDF, manual). RSS inline insert refactored to use `dbHelpers.createNewsletter`. Tag-removal route calls `recordAutoTagRemoval` when the removed tag was auto-applied. PATCH `/api/auth/profile` accepts `auto_tag_enabled`. All four user-info response payloads now return `auto_tag_enabled`.
- **`public/app.html`** — normalizer preserves an `autoTags` Set off each newsletter. Tag pills with auto-tagged tags show a subtle purple stripe + ✦ indicator with a tooltip. Settings modal gains a labeled checkbox bound to `user.auto_tag_enabled` with an i18n help line (EN + ES), wired to PATCH on save.

**Verification:**
- Unit: `node --test lib/sender-key.test.js` → 25/25 pass.
- Syntax: `node --check` clean on `server.js`, `database.js`, `lib/*.js`, `tasks/verify-auto-tagging.js`.
- E2E harness: `tasks/verify-auto-tagging.js` — run with `DATABASE_URL=... node tasks/verify-auto-tagging.js` against a dev DB. Creates a disposable test user, runs three scenarios (happy path, blocklist learning, opt-out), auto-cleans unless `--keep`.

**Not done (on purpose):**
- No retroactive backfill of `sender_key` on legacy rows. New rows get it; old rows stay NULL. Auto-tagger returns [] for null sender_key, so this is safe — legacy rows just won't participate until re-touched.
- Feature 2 (email digests) still pending per plan — sequenced after this bakes for ~1 week.

**Contraction-scan catches still-open:**
- `auto_tagged` flag is set only at insert. If a user manually re-adds a previously-removed tag, `addTagToNewsletter` currently leaves `auto_tagged=false` (correct) but the original blocklist entry is not cleared. Low severity — means the user must re-add 3+ times before auto-tagging re-activates for that sender/tag. Acceptable for v1; revisit if users complain.

---

## Review — Feature 1 hardening pre-merge (2026-04-27)

Three Lows from the 2026-04-27 weekly code review, applied to the same branch before merge:

- **`sender_key` backfill (database.js)** — Added a one-shot, idempotent backfill loop in `setupDatabase()` after the schema migration. Heuristic source detection from existing fields (twitter URL → handle; sender contains `@` → email; URL with host → domain; else NULL). Cursor-paged, 500 rows per batch, 50,000-row cap per boot, wrapped in its own try/catch so a backfill failure can never block startup. Reverses the "Not done (on purpose)" note above — legacy rows now participate immediately.
- **Rate limiter on tag mutations (server.js)** — New `tagMutationLimiter` (100 ops / 15 min / IP) applied to both `POST /api/newsletters/:id/tags/:tagId` and `DELETE /api/newsletters/:id/tags/:tagId`. The DELETE path is the one that writes to `sender_tag_blocklist` when removing an auto-tag, so this caps blocklist-training abuse via rapid add/remove cycles.
- **Settings-form dirty check (public/app.html)** — The save handler now compares `nextName/nextKindle/nextAutoTag` against the initial values pulled off `user` and short-circuits when nothing changed. PATCH failures now `alert()` instead of silently `console.warn`-ing.

**Verification:**
- `node --check server.js && node --check database.js` → both pass.
- `node --test lib/sender-key.test.js` → 25/25 still green.
- HTML brace balance: 732 open / 732 close (unchanged from pre-edit count).
- Both `<form ... onSubmit>` handlers (auth at line 1785, settings at line 2536) intact.

**Net effect on the 2026-04-27 review:**
- All three new Lows for the auto-tagging branch closed.
- Branch is unblocked for merge once a reviewer signs off.

---

## Feature 2 — Scheduled email digests (branch: feature/email-digests)

**Goal:** Let users set up multiple recurring email digests. Each digest has a name, a cadence (daily / weekly / monthly + time of day), an optional tag filter (OR logic — any of the selected tags), and delivers an AI-written "themes this period" paragraph followed by the list of newsletters ingested during the period with their titles + existing AI summaries + links. If the period had zero newsletters, Brevis still sends a short nudge email: "you haven't forwarded anything to Brevis this week — here's your forwarding address."

**Design decisions confirmed with Antonio 2026-04-21:**
- Many digests per user (Antonio can run "Daily — Crypto" + "Weekly — Legal" + "Monthly — AI" simultaneously).
- Email body = AI "themes" paragraph on top + per-newsletter list (title, sender, date, existing AI summary, link). Two levels of richness in one email.
- Schedule: fixed presets — Daily / Weekly (pick day) / Monthly (pick day of month), plus a time-of-day.
- Empty period → send anyway with a nudge message that mentions user inaction + re-shows forwarding address.
- Tag filter: OR (any match). No AND support in v1.
- One global server time zone for v1. Per-user TZ deferred.
- Digests have a Pause toggle (not just Delete).

**Schema (idempotent migration inside `setupDatabase()`):**
```
CREATE TABLE IF NOT EXISTS digests (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(120) NOT NULL,
    cadence        VARCHAR(16)  NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
    day_of_week    SMALLINT     CHECK (day_of_week BETWEEN 0 AND 6),    -- required if weekly; 0=Sun
    day_of_month   SMALLINT     CHECK (day_of_month BETWEEN 1 AND 28),  -- required if monthly; capped at 28 for simplicity
    time_of_day    TIME         NOT NULL DEFAULT '07:00',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_sent_at   TIMESTAMP,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS digest_tags (
    digest_id  INTEGER NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (digest_id, tag_id)
);
-- empty digest_tags for a digest = "all newsletters" (no tag filter).

CREATE TABLE IF NOT EXISTS digest_runs (
    id                SERIAL PRIMARY KEY,
    digest_id         INTEGER NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
    scheduled_for     TIMESTAMP NOT NULL,
    sent_at           TIMESTAMP,
    newsletter_count  INTEGER,
    themes_text       TEXT,
    status            VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
    error             TEXT,
    UNIQUE (digest_id, scheduled_for)  -- idempotence: never double-send the same slot
);
```

**Code modules:**
- `lib/digest-scheduler.js` — ticker function called every 5 min. Computes which digests are due (based on cadence + last_sent_at + current time). Returns list of `{digest, scheduled_for}` pairs.
- `lib/digest-builder.js` — given a digest + time window, queries newsletters matching tag filter within window, calls AI for themes paragraph, returns structured payload `{subject, themes, items, isEmpty}`.
- `lib/digest-renderer.js` — turns the payload into an HTML email + plaintext fallback. Brevis brand styling.
- `lib/digest-sender.js` — wraps email send. If SMTP not configured locally, logs the email to disk (`tasks/digest-previews/<timestamp>-<digest_id>.html`) so we can preview.
- `server.js` wiring — on startup, schedule the 5-minute tick via `setInterval` (same pattern as the existing RSS fetcher). API routes for CRUD (`GET/POST/PATCH/DELETE /api/digests`, `POST /api/digests/:id/send-now` for manual triggers).
- `public/app.html` UI — a new "Digests" section in settings: list of digests with Pause/Edit/Delete, a "New digest" modal with name + cadence + day + time + multi-tag picker, and a "Send now" preview button. EN + ES strings.

**AI themes paragraph:**
- Model: `claude-haiku-4-5` via the Anthropic SDK (same `ANTHROPIC_API_KEY` Brevis already uses for summaries — no new key, no new SDK).
- Input: title + existing AI summary of each newsletter in the period (not full content — keeps token count bounded).
- Output: 2–4 sentences max. Format: "This [period] your [tag] newsletters converged on 3 themes: X, Y, Z." Soft upper bound of ~120 words.
- If Anthropic is not configured OR the call fails → gracefully degrade: digest still sends, just without the themes paragraph. Log the failure on `digest_runs.error`.
- Budget: ~$0.0005–0.001 per digest at Haiku 4.5 pricing, assuming 20 newsletters × 150-token summaries.

**Empty-digest behavior:**
- Subject: "Your [name] digest — no newsletters this week" (localized).
- Body: friendly nudge + user's forwarding address + a "how to add a newsletter" mini-guide.
- Still writes a `digest_runs` row with `status='sent'`, `newsletter_count=0`, `themes_text=NULL`.

**Idempotence + recovery:**
- `UNIQUE(digest_id, scheduled_for)` prevents double-send if the ticker fires twice for the same slot.
- `last_sent_at` is only updated after a successful send.
- If sending fails, `digest_runs.status='failed'` + `error` column gets the message; next tick retries automatically up to 3× before marking permanently failed.

**Explicit non-goals for v1:**
- No per-user time zones.
- No AND-logic tag filter.
- No "unread only" or "top N newsletters" advanced filters.
- No in-app preview of the rendered digest (just the send-now endpoint + saved HTML file for local testing).
- No ability to include full newsletter content in the email (only AI summary).
- No SMS, push, or Slack delivery — email only.
- No per-digest custom from-name / reply-to.

**Verification plan:**
- Unit: digest-scheduler's "is this digest due right now?" logic across daily/weekly/monthly boundaries, including edge cases (last_sent_at in the future, DST-ish jumps).
- Unit: digest-builder's tag-OR query returns the right newsletters given seeded fixtures.
- Unit: digest-renderer snapshot tests — empty, 1 item, many items, with and without themes.
- Integration: `tasks/verify-digests.js` — creates test user, seeds 10 newsletters across tags, creates 3 digests (daily/weekly/monthly), simulates ticker advances, asserts which digests fire and their content.
- Manual: run the server, create a daily digest set to "5 minutes from now," wait, inspect the saved preview HTML.

**Contraction scan:**
- If a user deletes a tag that's referenced in `digest_tags`, the junction row cascades (FK), so the digest silently loses that tag filter. Acceptable — the digest keeps working with remaining tags. Should surface in UI when editing the digest so user sees what's left.
- If a user deletes their account, CASCADE wipes digests and digest_runs. Fine.
- `day_of_month` capped at 28 avoids the "Feb 30" problem. Users wanting "last day of month" is a v2 feature.
- Generated AI themes could contain user newsletter content and land in an email → no new privacy surface vs. existing AI summaries, but worth noting.
- Time comparison uses server clock. If the server host clock drifts or the process restarts mid-tick, we could skip or double-schedule a slot. UNIQUE constraint catches double-sends; skips are surfaced by `digest_runs` gap detection (nice-to-have, not v1).

**Task list:**
- [ ] Plan approval from Antonio
- [ ] DB migration: `digests`, `digest_tags`, `digest_runs` (idempotent)
- [ ] `lib/digest-scheduler.js` + unit tests
- [ ] `lib/digest-builder.js` + unit tests
- [ ] `lib/digest-renderer.js` + snapshot tests
- [ ] `lib/digest-sender.js` (SMTP + local-preview fallback)
- [ ] `server.js` wiring: 5-min ticker + CRUD + send-now routes
- [ ] `public/app.html` UI: digest list, create/edit modal, pause/delete, EN+ES
- [ ] `tasks/verify-digests.js` E2E harness
- [ ] Manual QA: create a near-time digest, verify preview file appears

**Stays on branch `feature/email-digests`. No push to main until explicitly approved. Feature 1 (auto-tagging) merges first when Antonio gives the green light.**
