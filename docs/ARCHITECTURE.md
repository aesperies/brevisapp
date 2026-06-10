# Brevis — Architecture

_Last updated: 2026-06-10 (architecture-overhaul PR)._

## Overview

Brevis is a newsletter aggregation + AI summarization SaaS. Node.js/Express
monolith on PostgreSQL, deployed to Railway (nixpacks), Claude API for
summarization, Stripe for billing, SendGrid for inbound email forwarding and
outbound transactional email. The frontend is a React SPA served from
`public/app.html` (CDN React, no build step — modernization tracked as a
separate workstream).

Staying a monolith is deliberate: split into services only when a real scaling
bottleneck appears.

## Layout

```
server.js                 # Bootstrap only: middleware stack, router mounts, error
                          # middleware, listen. Exports `app` for tests.
src/
├── clients.js            # Stripe + OpenAI clients, STRIPE_PRICES
├── middleware/
│   ├── auth.js           # DB-backed JWT middleware (token_version revocation)
│   ├── rate-limits.js    # All 10 rate limiters
│   └── uploads.js        # Shared multer instance (25MB, memory storage)
├── routes/               # One router per domain; routes keep FULL paths
│   ├── auth.js           # register/login/profile/logout, email verify, Google OAuth
│   ├── newsletters.js    # CRUD, PDF upload, summary/kindle/audio/brief/report
│   ├── news-builder.js   # Word/file upload, template generation
│   ├── import.js         # URL/tweet import (SSRF-guarded)
│   ├── tags.js           # Tag CRUD + newsletter↔tag (auto-tag blocklist learning)
│   ├── billing.js        # /api/plans, Stripe checkout/portal/webhook
│   ├── webhooks.js       # SendGrid inbound email webhook (timing-safe secret)
│   ├── subscriptions.js  # RSS subscriptions + OPML import
│   └── misc.js           # waitlist, /health
├── services/
│   ├── email.js          # SendGrid-or-SMTP unified sender
│   ├── import.js         # URL/tweet content fetching
│   └── rss.js            # SSRF-safe feed parsing + 30-min cron
└── utils/
    ├── logger.js         # Structured JSON logs w/ PII redaction
    ├── errors.js         # AppError + asyncHandler
    ├── content.js        # Forwarded-email cleaning, URL extraction
    └── safe-fetch.js     # SSRF validation + DNS-pinned fetch (node-fetch)

database.js               # pg pool (20 conns), schema setup, dbHelpers
auth.js                   # JWT sign/verify + makeAuthMiddleware factory
ai-service.js             # Claude calls, PLANS, plan gating, KB compile/query
graph-*.js                # Knowledge graph (Standard+; NL query Premium)
kb-*.js                   # Knowledge bases (create Standard+; query Premium)
migrations/               # SQL files + transactional runner (schema_migrations)
agents/                   # Autonomous agent runtime (ops tooling, not request path)
tests/                    # Vitest + Supertest integration suite
```

## Request path

HTTPS redirect → helmet (CSP/HSTS) → CORS whitelist → **/api/v1 rewrite** →
JSON body (raw for Stripe webhook) → cookieParser → request-id → static →
graph/kb mounts → domain routers → RSS cron guard → landing/404/SPA fallback →
error middleware.

### API versioning

`/api/v1/<x>` is rewritten to `/api/<x>` before body parsing and routing — one
canonical route table, both prefixes supported forever. New clients should use
`/api/v1`.

### Auth

JWT in an httpOnly cookie (30d). Every authenticated request re-checks
`users.token_version` in the DB; logout/password-change bumps it, revoking all
sessions everywhere. The middleware fails CLOSED (503) if the DB check errors.

### Plans

3 tiers (`ai-service.js: PLANS`): free (no AI), standard/pro $12 (summaries,
briefs, graph), premium $29 (+reports, KB queries, custom graph profiles).
`canUserPerformAction` gates every AI route; graph/kb routers gate by plan
hierarchy. `pro` is the legacy DB alias for standard — keep both keys.

### Outbound fetch safety

Anything that fetches a user-supplied URL (URL import, news-builder, RSS) goes
through `safeFetch`: protocol check, private-IP/localhost rejection across all
resolved addresses, then the connection is pinned to the validated IP via a
custom agent `lookup` (DNS-rebinding defense). Redirects are refused. RSS feeds
are re-validated on every cron run.

### Prompt-injection defense

All user-derived text interpolated into Claude prompts is fenced in
`<user_content>` tags, and `SYSTEM_PROMPT` instructs the model to treat fenced
content as data. Custom graph extraction prompts (premium) are length-capped
and always preceded by an immutable safety preamble.

## Testing

`npm test` — Vitest + Supertest against a dedicated local `brevis_test`
database (never dev/prod; `tests/setup.js` hard-refuses other DB names; tables
truncated between files). Rate limiters are exercised by rotating
`X-Forwarded-For` (the app trusts 1 proxy hop). AI success paths are not
called live — gating and cache paths are tested instead.

CI (`.github/workflows/ci.yml`) runs the suite against a Postgres 15 service
container plus `npm audit --omit=dev --audit-level=high` on every PR/push.

## Local dev

```
npm install
createdb brevis_db        # or: docker compose up db
npm run migrate
npm run dev
```

Or full stack in Docker: `docker compose up --build` (app on :3000, Postgres on
host :5433). Production deploy is Railway via nixpacks (`node server.js`); the
Dockerfile exists for parity and future hosts.

## Known debt (tracked in tasks/todo.md)

- Frontend: single-file SPA, runtime Babel — needs a build step (next PR).
- `newsletters.is_read` is INTEGER (SQLite heritage) — route coerces; migrate
  to BOOLEAN eventually.
- Graph/KB background tasks keep state in in-memory Maps (lost on restart).
- Prompts hardcoded in ai-service.js — versioned prompt files planned.
- No refresh-token rotation (token_version revocation is the interim).
