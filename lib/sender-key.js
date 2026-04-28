// Derives a universal canonical sender identifier ("sender_key") for a newsletter.
//
// Why: auto-tagging matches new newsletters against the user's prior tagging
// history for the same "sender." Brevis ingests newsletters from 5 different
// paths (email, RSS, Twitter/X, generic URL scrape, PDF upload, manual paste),
// each of which carries a different notion of "sender." This function produces
// one comparable string across all of them.
//
// Returns null when no reliable identity is available — the caller should skip
// auto-tagging in that case.
//
// Pure function. No I/O. No AI. Deterministic.

/**
 * @param {Object} ctx
 * @param {string} [ctx.source]    One of: 'email' | 'rss' | 'twitter' | 'url' | 'pdf' | 'manual'
 * @param {string} [ctx.rawSender] The raw sender string passed to createNewsletter (From header, feed title, @handle, etc.)
 * @param {string} [ctx.url]       The canonical URL of the item (used for 'twitter' and 'url' sources)
 * @param {string} [ctx.feedUrl]   The RSS feed URL (used for 'rss' source)
 * @returns {string|null}
 */
export function deriveSenderKey({ source, rawSender, url, feedUrl } = {}) {
    switch (source) {
        case 'email':
            return extractEmail(rawSender);
        case 'twitter':
            return extractTwitterHandle(url) || extractTwitterHandle(rawSender);
        case 'url':
            return extractDomain(url);
        case 'rss':
            return normalizeUrl(feedUrl);
        case 'pdf':
            return null;
        case 'manual':
            // Manual paste: treat as email if rawSender looks like one, else null.
            // (Matching on arbitrary free-text is too noisy to be useful.)
            return extractEmail(rawSender);
        default:
            // Unknown source: try email extraction as a best-effort fallback.
            return extractEmail(rawSender);
    }
}

/**
 * Extract a lowercased email address from a raw From header or free-text string.
 * Strips display names, angle brackets, and plus-addressing (foo+tag@bar.com → foo@bar.com).
 * Returns null if no valid email is found.
 */
export function extractEmail(s) {
    if (!s || typeof s !== 'string') return null;
    // Match the first email-ish token in the string (RFC 5322 is overkill for our use).
    const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!m) return null;
    let email = m[0].toLowerCase();
    // Strip plus-addressing: the part after `+` before `@` is a user-controlled alias
    // and would fragment our sender identity (foo+a@bar vs foo+b@bar are the same person).
    const atIdx = email.indexOf('@');
    const plusIdx = email.indexOf('+');
    if (plusIdx > -1 && plusIdx < atIdx) {
        email = email.slice(0, plusIdx) + email.slice(atIdx);
    }
    return email;
}

/**
 * Extract a Twitter/X handle (as "@handle" lowercased) from a URL or text.
 * Supports twitter.com, x.com. Returns null if no handle can be identified.
 */
export function extractTwitterHandle(s) {
    if (!s || typeof s !== 'string') return null;
    // Prefer handle from a URL path: twitter.com/{handle}/... or x.com/{handle}/...
    const urlMatch = s.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\b/i);
    if (urlMatch) return '@' + urlMatch[1].toLowerCase();
    // Fallback: bare @handle in text.
    const atMatch = s.match(/@([A-Za-z0-9_]{1,15})\b/);
    if (atMatch) return '@' + atMatch[1].toLowerCase();
    return null;
}

/**
 * Extract the lowercased host from a URL, strip a leading "www." and any port.
 * Returns null if the URL is missing, malformed, or has no host.
 */
export function extractDomain(s) {
    if (!s || typeof s !== 'string') return null;
    try {
        // URL constructor requires a scheme; prepend http:// if missing so bare "stratechery.com/foo" works.
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`;
        const u = new URL(withScheme);
        let host = u.hostname.toLowerCase();
        if (host.startsWith('www.')) host = host.slice(4);
        return host || null;
    } catch {
        return null;
    }
}

/**
 * Normalize a URL for use as a sender_key: lowercased scheme+host+path, trailing slash trimmed,
 * fragment and query stripped. Used for RSS feeds where the feed URL is the stable identity.
 */
export function normalizeUrl(s) {
    if (!s || typeof s !== 'string') return null;
    try {
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`;
        const u = new URL(withScheme);
        const host = u.hostname.toLowerCase();
        let path = u.pathname || '';
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
        return `${u.protocol}//${host}${path}`;
    } catch {
        return null;
    }
}
