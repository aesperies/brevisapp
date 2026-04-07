# Knowledge Graph Integration Guide

## What was built (new files — no existing code touched yet)

| File | Purpose |
|------|---------|
| `graph-extractor.js` | Two-pass extraction pipeline (deterministic + LLM) |
| `graph-service.js` | Entity resolution (race-safe), graph CRUD, community detection, vis.js formatting |
| `graph-profiles.js` | Configurable extraction profiles (VC/Legal, General, Crypto/Web3, custom) |
| `graph-ai.js` | Claude API calls with prompt injection protection + language support |
| `graph-database.js` | Database migration — creates graph tables + unique constraints on startup |
| `graph-routes.js` | Express router with rate limiting, async extraction, plan gating |

## Tier Model

- **No free tier** — all graph features require Standard or Premium
- **Standard ($12/mo):** Full graph, extraction, preset profiles
- **Premium ($29/mo):** + Natural language queries, custom profiles
- **No extraction quotas** — cost per newsletter is ~$0.034, margins are healthy

## Changes needed in existing files to activate

### 1. `database.js` — Add graph table creation

```javascript
// At the top, add import:
import { setupGraphTables } from './graph-database.js';

// Inside setupDatabase(), after the existing CREATE TABLE statements
// (after the "subscriptions" table creation), add:
await setupGraphTables(pool);
```

### 2. `server.js` — Mount graph routes + hook extraction

```javascript
// At the top, add imports:
import { createGraphRouter } from './graph-routes.js';
import { extractAndStoreGraph } from './graph-extractor.js';

// After authMiddleware is defined (~line 30), mount the router:
app.use('/api/graph', authMiddleware, createGraphRouter());

// In the email webhook handler, after newsletter creation (~line 1751):
// After: const newsletter = await dbHelpers.createNewsletter(...)
// Add (async, non-blocking — passes user's language preference):
setImmediate(() => {
    extractAndStoreGraph(newsletter.id, user.id, { language: user.language || 'en' })
        .catch(err => console.error('📊 [Graph] Background extraction failed:', err.message));
});

// Do the same in any other newsletter creation paths:
// - POST /api/newsletters (manual creation)
// - POST /api/import/url (URL import)
// - POST /api/newsletters/upload-pdf (PDF upload)
// - RSS feed ingestion loop
// Always pass { language: user.language || 'en' } in options
```

### 3. `ai-service.js` — Export the extraction function

```javascript
// At the bottom, re-export for backward compatibility:
export { extractKnowledgeGraph } from './graph-ai.js';
```

### 4. `public/app.html` — Add Knowledge Graph tab (Phase 2)

This is the frontend work — adding vis.js visualization. Not needed for backend to work.

## API Endpoints (all under `/api/graph`, all require Standard+ plan)

| Method | Path | Plan | Description |
|--------|------|------|-------------|
| GET | `/stats` | Standard+ | Graph statistics |
| GET | `/data` | Standard+ | Full vis.js graph (supports `?types=`, `?relationships=`, `?search=`, `?minMentions=`, `?includeInferred=`, `?from=`, `?to=`) |
| GET | `/nodes` | Standard+ | List entities |
| GET | `/nodes/:id` | Standard+ | Entity detail + connections + newsletters |
| PATCH | `/nodes/:id` | Standard+ | Edit entity |
| DELETE | `/nodes/:id` | Standard+ | Remove entity |
| POST | `/nodes/merge` | Standard+ | Merge duplicate entities |
| GET | `/communities` | Standard+ | List detected communities |
| POST | `/communities/refresh` | Standard+ | Re-run community detection |
| POST | `/extract/:newsletterId` | Standard+ | **Async** — returns `taskId` immediately |
| GET | `/tasks/:taskId` | Standard+ | Check extraction task status |
| POST | `/extract-batch` | Standard+ | Backfill existing newsletters |
| POST | `/query` | **Premium** | Natural language graph query |
| GET | `/profiles` | Standard+ | List extraction profiles |
| POST | `/profiles` | **Premium** | Create custom profile |
| POST | `/profiles/preset` | Standard+ | Apply preset profile |
| DELETE | `/profiles/:id` | Standard+ | Delete profile |
| GET | `/newsletter/:id/entities` | Standard+ | Entities for a newsletter |

## Security Measures Applied

- **Prompt injection:** Content sanitized (angle brackets → fullwidth), double-fenced with BEGIN/END markers
- **Rate limiting:** 120 reads / 60 writes / 30 extractions per 15 minutes
- **Input caps:** Max 75 entities, 100 relationships per extraction
- **Transaction safety:** Merge and delete operations wrapped in BEGIN/COMMIT
- **Race condition:** Entity resolution uses ON CONFLICT for concurrent safety
- **Multi-tenant:** Every query includes user_id — verified by Security agent

## Language Alignment

Extraction respects the user's `language` field from their profile:
- English (`en`): All entity names in English form, responses in English
- Spanish (`es`): Entity names in Spanish where applicable, responses in Spanish
- Language flows through: `routes → extractor → graph-ai → Claude prompt`
