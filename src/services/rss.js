// RSS subscription fetching: SSRF-safe feed parsing + the 30-minute cron.
// Moved verbatim from server.js during the 2026-06 architecture refactor.

import Parser from 'rss-parser';
import { dbHelpers } from '../../database.js';
import { safeFetch } from '../utils/safe-fetch.js';

const rssParser = new Parser();

/**
 * SSRF-safe wrapper around rssParser.parseURL.
 * `rssParser.parseURL` does its own DNS lookup, which would re-open the
 * rebinding window we close in safeFetch. Fetch the body via safeFetch
 * (DNS pinned to validated IP) and feed it to parseString instead.
 */
export async function safeParseRssUrl(url, { timeoutMs = 20000 } = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await safeFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0; +https://brevisapp.com)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
            },
            redirect: 'manual',
            signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
            throw new Error(`RSS feed redirected (status ${response.status}); refusing to follow`);
        }
        if (!response.ok) {
            throw new Error(`RSS feed returned status ${response.status}`);
        }
        const body = await response.text();
        return await rssParser.parseString(body);
    } finally {
        clearTimeout(timeoutId);
    }
}

// RSS fetch cron - runs every 30 minutes
let rssCronRunning = false;
export async function fetchAllRSSFeeds() {
    if (rssCronRunning) {
        console.log('⏭️  RSS cron skipped — previous run still in progress');
        return;
    }
    rssCronRunning = true;
    try {
        const db = dbHelpers.getDb();
        const subs = await db.query('SELECT s.*, u.id as uid FROM subscriptions s JOIN users u ON s.user_id = u.id');

        for (const sub of subs.rows) {
            try {
                // safeParseRssUrl re-validates the URL on every cron run (preventing
                // DNS rebinding via subscriptions that were valid at signup but later
                // pointed to internal IPs) and pins DNS to the validated IP.
                const feed = await safeParseRssUrl(sub.url, { timeoutMs: 20000 });
                const sender = feed.title || sub.name || 'RSS Feed';

                for (const item of (feed.items || []).slice(0, 10)) {
                    // Deduplicate by URL (item.link) — title-based dedup was fragile and caused missed updates
                    const itemUrl = item.link || '';
                    if (itemUrl) {
                        const existing = await db.query(
                            'SELECT id FROM newsletters WHERE user_id = $1 AND url = $2',
                            [sub.user_id, itemUrl]
                        );
                        if (existing.rows.length > 0) continue;
                    } else {
                        // Fallback: title+sender dedup for items with no URL
                        const existing = await db.query(
                            'SELECT id FROM newsletters WHERE user_id = $1 AND title = $2 AND sender = $3',
                            [sub.user_id, item.title || 'Untitled', sender]
                        );
                        if (existing.rows.length > 0) continue;
                    }

                    // Route through the helper so sender_key is derived and auto-tagging
                    // runs on RSS items just like every other ingest path.
                    await dbHelpers.createNewsletter(
                        sub.user_id,
                        item.title || 'Untitled',
                        sender,
                        item.content || item.contentSnippet || '',
                        item.link || '',
                        { source: 'rss', feedUrl: sub.url }
                    );
                }

                await db.query('UPDATE subscriptions SET last_fetched = NOW() WHERE id = $1', [sub.id]);
            } catch (e) {
                console.error('⚠️  RSS fetch error for', sub.url, ':', e.message);
            }
        }
        console.log('✅ RSS feeds fetched at', new Date().toISOString());
    } catch (e) {
        console.error('❌ RSS cron error:', e);
    } finally {
        rssCronRunning = false;
    }
}

/** Start the 30-minute RSS cron + a one-off fetch 10s after boot. */
export function startRssCron() {
    setInterval(fetchAllRSSFeeds, 30 * 60 * 1000);
    setTimeout(fetchAllRSSFeeds, 10000);
}
