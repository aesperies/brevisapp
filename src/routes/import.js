import express from 'express';

import { dbHelpers } from '../../database.js';
import { extractAndStoreGraph } from '../../graph-extractor.js';
import { asyncHandler } from '../utils/errors.js';
import { detectPlatform, fetchGenericContent, extractTweetId, fetchFullThread } from '../services/import.js';
import { authMiddleware } from '../middleware/auth.js';
import { importLimiter } from '../middleware/rate-limits.js';

export function createImportRouter() {
const router = express.Router();

// === URL Import & Bookmarklet ===


router.post('/api/import/url', importLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const platform = detectPlatform(url);

        if (platform === 'linkedin') {
            return res.status(400).json({
                error: 'linkedin_not_supported',
                message: 'LinkedIn posts cannot be imported via URL. Use the bookmarklet to save LinkedIn posts.'
            });
        }

        if (platform === 'twitter') {
            const tweetId = extractTweetId(url);
            if (!tweetId) {
                return res.status(400).json({ error: 'Could not parse tweet URL. Use a link like https://x.com/user/status/123...' });
            }

            const threadData = await fetchFullThread(tweetId);
            if (!threadData?.tweet) {
                return res.status(502).json({ error: 'Could not fetch tweet. It may be deleted, private, or Twitter is blocking requests.' });
            }

            const tweet = threadData.tweet;
            const thread = threadData.thread;
            const authorName = tweet.author?.name || 'Unknown';
            const authorHandle = tweet.author?.screen_name || '';

            let content;
            if (thread.length > 1) {
                content = thread.map((t, i) =>
                    `<p><strong>${i + 1}/${thread.length}</strong> ${t.text}</p>`
                ).join('\n');
            } else {
                content = `<p>${tweet.text}</p>`;
            }

            const firstTweetText = (thread[0]?.text || tweet.text || '').substring(0, 80);
            const title = thread.length > 1
                ? `Thread by @${authorHandle} (${thread.length} tweets): ${firstTweetText}...`
                : `@${authorHandle}: ${firstTweetText}...`;

            const newsletter = await dbHelpers.createNewsletter(
                req.user.id,
                title,
                `@${authorHandle} (${authorName})`,
                content,
                url,
                { source: 'twitter' }
            );

            console.log(`✅ Imported tweet (${thread.length} tweet${thread.length > 1 ? 's' : ''} in thread):`, title);
            // Knowledge Graph: extract entities in background
            setImmediate(() => {
                extractAndStoreGraph(newsletter.id, req.user.id, { language: req.user.language || 'en' })
                    .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
            });
            res.json(newsletter);
        } else {
            // Scraping genérico para cualquier URL
            const genericContent = await fetchGenericContent(url);
            if (!genericContent) {
                return res.status(400).json({ error: 'Could not fetch content from this URL' });
            }

            const newsletter = await dbHelpers.createNewsletter(
                req.user.id,
                genericContent.title,
                genericContent.author,
                genericContent.content,
                url,
                { source: 'url' }
            );

            console.log(`✅ Imported generic URL:`, genericContent.title);
            // Knowledge Graph: extract entities in background
            setImmediate(() => {
                extractAndStoreGraph(newsletter.id, req.user.id, { language: req.user.language || 'en' })
                    .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
            });
            res.json(newsletter);
        }
}));

return router;
}
