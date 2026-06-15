// All API rate limiters in one place.
// Moved verbatim from server.js during the 2026-06 architecture refactor.

import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: { error: 'Too many registration attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Token refresh is frequent legitimate traffic (every ~15 min per active user,
// plus load-time bursts), so it gets a generous bound — just enough to stop a
// bot hammering the endpoint with garbage tokens. NOT the strict login limiter.
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many refresh attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for AI/expensive operations (summaries, briefs, reports, audio, news builder)
export const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 AI requests per 15 min per IP
    message: { error: 'Too many AI requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for URL imports and file uploads
export const importLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many import requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for subscription management (add/delete/import)
export const subscriptionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 subscription changes per 15 min per IP
    message: { error: 'Too many subscription requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for email webhook (prevent flooding)
export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 emails per minute
    message: { error: 'Too many webhook requests' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for newsletter↔tag mutations (POST /:id/tags/:tagId, DELETE /:id/tags/:tagId).
// The DELETE path now writes to sender_tag_blocklist when the user removes an auto-tag, so
// rapid add/remove cycles can train the blocklist. Bound is generous for normal usage
// (a power user editing tags on dozens of newsletters in a session) but stops automation.
export const tagMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many tag changes, please slow down' },
    standardHeaders: true,
    legacyHeaders: false
});

// Per-user limiter for Kindle send (the endpoint dispatches mail to a user-controlled
// kindle_email address; throttle to prevent abuse / mailcost runaway).
export const kindleLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 sends/hour
    message: { error: 'Too many Kindle sends, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `kindle:${req.user.id}` : req.ip)
});

// Light limiter for newsletter CRUD reads (GET list, GET item) and DELETE.
// Intent is to stop scrapers, not to bother power users.
export const newsletterCrudLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 600, // ~40/min — well above any human pattern
    message: { error: 'Too many newsletter requests, please slow down' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `nlcrud:${req.user.id}` : req.ip)
});

// Waitlist limiter — keyed by IP since the user is unauthenticated.
// 5 signups/hour per IP is plenty for a real human and stops fill-the-table spam.
export const waitlistLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Too many waitlist signups from this network, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});
