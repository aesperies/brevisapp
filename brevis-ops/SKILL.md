---
name: brevis-ops
description: "Brevis operational skill for managing the brevisapp codebase — deployment, bug triage, feature development, database management, and production operations. Use this skill whenever working on Brevis code, fixing bugs, deploying changes, managing the database, reviewing PRs, or making any changes to the brevisapp repository. Triggers on: 'fix this bug', 'deploy brevis', 'check the server', 'update the landing page', 'add a feature', 'database migration', 'check logs', 'stripe setup', or any development/ops task related to brevisapp."
---

# Brevis Operations Skill

## Project Overview

Brevis is an AI-powered newsletter management SaaS for professionals. This skill contains everything needed to operate, maintain, and develop the codebase.

**Repository:** github.com/aesperies/brevisapp
**Stack:** Node.js + Express, PostgreSQL, React 18 (CDN), Claude Sonnet 4 API
**Deployment:** Railway (primary), with Nixpacks containerization
**Domain:** brevisapp.com

## Architecture

```
brevis/
├── server.js           # Main backend (2K lines, 69 endpoints) — Express API
├── database.js         # PostgreSQL pool + schema + helpers
├── ai-service.js       # Claude API integration (summaries, briefs, reports)
├── auth.js             # JWT middleware (30-day TTL)
├── public/
│   ├── app.html        # Full React SPA (4.8K lines, single file)
│   ├── index.html      # Landing page
│   ├── sw.js           # Service worker (PWA)
│   └── manifest.json   # PWA manifest
├── i18n/               # Translation files (es.json, en.json)
├── tasks/              # Code reviews, todo, lessons
└── nixpacks.toml       # Deployment config
```

## Key Patterns

### API Endpoints
All routes follow this pattern:
```javascript
router.method('/path', authenticate, [validators], asyncHandler(async (req, res) => {
  // authenticate middleware sets req.user
  // asyncHandler catches async errors → global error handler
}));
```

### Error Handling
- `AppError` class for operational errors (throw new AppError('message', statusCode))
- `asyncHandler` wraps all route handlers
- Global error middleware in server.js catches everything
- Structured logging with request ID tracking

### Authentication
- JWT tokens stored in httpOnly cookies (30-day expiry)
- `authenticate` middleware on all protected routes
- Plan checking: `req.user.plan` — 'free', 'standard', 'premium'
- Trial: `req.user.trial_end_date` — 15-day trial from registration

### AI Service
- Uses Claude claude-sonnet-4-20250514 via direct API calls (not SDK)
- Three output types: summary (1024 tokens), brief (2048), report (4096)
- Retry logic: 3 attempts with exponential backoff for rate limits
- Summaries cached in `newsletters.summary` column

### Database
- PostgreSQL with pg connection pooling (max 20 connections)
- Schema auto-migrates on server startup (CREATE TABLE IF NOT EXISTS)
- Key tables: users, newsletters, tags, newsletter_tags, subscriptions
- Foreign keys with ON DELETE CASCADE

## Common Operations

### Bug Fix Workflow
1. Read the relevant file(s) to understand current behavior
2. Identify root cause — check error handling, auth, validation
3. Apply minimal fix — don't refactor adjacent code unless directly related
4. Verify fix doesn't break existing functionality
5. Update tasks/lessons.md if the bug reveals a pattern

### Adding a New API Endpoint
1. Add route in server.js following existing pattern
2. Include `authenticate` middleware if protected
3. Add rate limiter if it's a resource-intensive operation
4. Add input validation with express-validator
5. Use asyncHandler wrapper
6. Add structured logging for the new endpoint
7. Update public/app.html if frontend needs to call it

### Deployment
1. Push to main branch: `git push origin main`
2. Railway auto-deploys from main
3. Database migrations run automatically on server startup
4. Monitor logs via Railway dashboard

### Database Operations
- Connection string: DATABASE_URL environment variable
- SSL: DATABASE_SSL_VERIFY controls strictness
- Backup: Railway provides automated backups
- Manual: `pg_dump brevis_db > backup-$(date +%Y%m%d).sql`

## Known Issues (as of March 2026)

### Critical
- news-builder/generate-from-project missing timeout on external fetches
- Webhook secret exposed in URL path (should use header only)

### Important
- Database SSL verification disabled (rejectUnauthorized: false)
- JWT lacks revocation on password change
- RSS deduplication uses title instead of URL
- Stripe at v14.10.0 (latest is 20+)

## Pricing Tiers (Updated April 2026)

| Tier | Price | Newsletters | AI Features |
|------|-------|-------------|-------------|
| Free | $0/mo | 10/month | None |
| Professional | $12/mo | Unlimited | Summaries + Batch Brief |
| Premium | $29/mo | Unlimited | + Full Reports + Newsletter Gen + Priority |

Annual: 2 months free ($120/yr Pro, $290/yr Premium)

## Environment Variables
See .env.example in the repo root for the full list. Critical ones:
- DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY
- FRONTEND_URL (for CORS), EMAIL_DOMAIN (for newsletter forwarding)
- SENDGRID_API_KEY or SMTP_* variables for email
