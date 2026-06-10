import express from 'express';

import { dbHelpers } from '../../database.js';
import { asyncHandler } from '../utils/errors.js';
import { safeParseRssUrl } from '../services/rss.js';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/uploads.js';
import { subscriptionLimiter } from '../middleware/rate-limits.js';

export function createSubscriptionsRouter() {
const router = express.Router();

// ============= SUBSCRIPTION / RSS ROUTES =============


router.get('/api/subscriptions', authMiddleware, asyncHandler(async (req, res) => {
    const db = dbHelpers.getDb();
    const result = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
}));

router.post('/api/subscriptions', subscriptionLimiter, authMiddleware, asyncHandler(async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Normalize URL: add /feed if it's a substack URL without it
    url = url.trim().replace(/\/+$/, '');
    if (url.includes('substack.com') && !url.endsWith('/feed')) {
        url = url + '/feed';
    }
    if (!url.startsWith('http')) url = 'https://' + url;

    // Validate it's a working RSS feed (safeParseRssUrl performs SSRF validation
    // and DNS pinning internally — no separate validateUrlForFetch needed).
    let feedName;
    try {
        const feed = await safeParseRssUrl(url);
        feedName = feed.title || url.replace(/https?:\/\//, '').split('/')[0];
    } catch (e) {
        if (e?.code === 'URL_BLOCKED') {
            return res.status(400).json({ error: `Invalid feed URL: ${e.reason}` });
        }
        return res.status(400).json({ error: 'Could not read RSS feed. Make sure the URL is correct.' });
    }

    const db = dbHelpers.getDb();
    // Check for duplicates
    const existing = await db.query('SELECT id FROM subscriptions WHERE user_id = $1 AND url = $2', [req.user.id, url]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Already subscribed' });

    const result = await db.query(
        'INSERT INTO subscriptions (user_id, url, name) VALUES ($1, $2, $3) RETURNING *',
        [req.user.id, url, feedName]
    );
    console.log('✅ Subscription added:', feedName, 'for user', req.user.id);
    res.json(result.rows[0]);
}));

router.post('/api/subscriptions/import-opml', subscriptionLimiter, authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const opmlContent = req.file.buffer.toString('utf-8');
    // Simple OPML parser: extract xmlUrl attributes
    const urlMatches = opmlContent.match(/xmlUrl="([^"]+)"/gi) || [];
    const urls = urlMatches.map(m => m.match(/xmlUrl="([^"]+)"/i)[1]);

    if (urls.length === 0) return res.status(400).json({ error: 'No feeds found in OPML file' });

    const db = dbHelpers.getDb();
    let added = 0;
    for (const url of urls) {
        try {
            const existing = await db.query('SELECT id FROM subscriptions WHERE user_id = $1 AND url = $2', [req.user.id, url]);
            if (existing.rows.length > 0) continue;

            let feedName = url.replace(/https?:\/\//, '').split('/')[0];
            try {
                // safeParseRssUrl performs SSRF validation + DNS pinning;
                // URL_BLOCKED errors fall through to the catch and skip the feed.
                const feed = await safeParseRssUrl(url);
                if (feed.title) feedName = feed.title;
            } catch (e) {
                if (e?.code === 'URL_BLOCKED') {
                    console.warn('⚠️  OPML import: blocked URL:', url, e.reason);
                    continue;
                }
                /* use URL as name on benign parse failures */
            }

            await db.query('INSERT INTO subscriptions (user_id, url, name) VALUES ($1, $2, $3)', [req.user.id, url, feedName]);
            added++;
        } catch (e) { /* skip invalid feeds */ }
    }

    console.log('✅ OPML import: added', added, 'feeds for user', req.user.id);
    res.json({ added, total: urls.length });
}));

router.delete('/api/subscriptions/:id', subscriptionLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const db = dbHelpers.getDb();
    await db.query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
}));

return router;
}
