// URL / tweet import helpers for the bookmarklet and /api/import/url.
// Moved verbatim from server.js during the 2026-06 architecture refactor.
// fetchFullThread talks to fixed public hosts (fxtwitter, twimg syndication)
// and keeps the global fetch; fetchGenericContent goes through safeFetch
// (SSRF validation + DNS pinning) because the URL is user-controlled.

import { safeFetch } from '../utils/safe-fetch.js';

export function detectPlatform(url) {
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
    if (/linkedin\.com/i.test(url)) return 'linkedin';
    return 'unknown';
}

export async function fetchGenericContent(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        let response;
        try {
            // safeFetch validates the URL and pins DNS to the validated IP
            // so the connect cannot be redirected to an internal address by
            // an attacker-controlled DNS server between validation and fetch.
            response = await safeFetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0)' },
                redirect: 'manual',
                signal: controller.signal
            });
        } catch (err) {
            if (err?.code === 'URL_BLOCKED') {
                console.error('URL blocked:', url, err.reason);
                return null;
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
        // Reject redirects to prevent SSRF bypass via redirect to internal IP
        if (response.status >= 300 && response.status < 400) return null;
        const html = await response.text();

        // Extraer metadata con regex (sin cheerio para simplicidad)
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);

        const title = ogTitleMatch?.[1] || titleMatch?.[1] || new URL(url).hostname;
        const description = ogDescMatch?.[1] || descMatch?.[1] || '';
        const author = authorMatch?.[1] || new URL(url).hostname;

        // Extraer contenido del body (simplificado)
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        let content = bodyMatch?.[1] || '';
        content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
        content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        content = content.substring(0, 5000);

        return { title, author, content: `<p>${description}</p><p>${content}</p>` };
    } catch (error) {
        console.error('Error fetching generic URL:', error);
        return null;
    }
}

export function extractTweetId(url) {
    const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/);
    return match ? match[1] : null;
}

export async function fetchFullThread(tweetId) {
    // Primary: fxtwitter — single API call, returns thread data if available
    try {
        const res = await fetch(`https://api.fxtwitter.com/x/status/${tweetId}`, {
            headers: { 'User-Agent': 'BREVIS/1.0' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.tweet) {
                const tweet = data.tweet;
                // fxtwitter may include continuation tweets in thread.tweets
                const continuationTweets = tweet.thread?.tweets || [];
                const allTweets = continuationTweets.length > 0
                    ? [tweet, ...continuationTweets]
                    : [tweet];
                return { tweet, thread: allTweets };
            }
        }
    } catch (e) { /* fallback */ }

    // Fallback: syndication API
    try {
        const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`);
        if (res.ok) {
            const synData = await res.json();
            const tweet = {
                id: tweetId,
                text: synData.text || '',
                author: { name: synData.user?.name, screen_name: synData.user?.screen_name },
            };
            return { tweet, thread: [tweet] };
        }
    } catch (e) { /* give up */ }

    return null;
}
