// Content-cleaning helpers for inbound email and imports.
// Moved verbatim from server.js during the 2026-06 architecture refactor.

export function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

export function cleanForwardedContent(html) {
    if (!html) return '';

    // Remove common forwarding headers and signatures
    let cleaned = html;

    // Remove Gmail forwarding header
    cleaned = cleaned.replace(/---------- Forwarded message ---------[\s\S]*?<br\s*\/?>\s*<br\s*\/?>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>---------- Forwarded message ---------<\/div>[\s\S]*?(?=<div|<table|<p|$)/gi, '');

    // Remove "From:", "Date:", "Subject:", "To:" lines at the beginning (forwarding metadata)
    cleaned = cleaned.replace(/<div[^>]*>From:[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>Date:[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>Subject:[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>To:[\s\S]*?<\/div>/gi, '');

    // Remove blockquote wrapping (often used for forwarded content)
    cleaned = cleaned.replace(/<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/gi, '$1');

    // Remove empty divs and excessive whitespace
    cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
    cleaned = cleaned.replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/gi, '<br><br>');

    return cleaned.trim();
}

export function cleanTextContent(text) {
    if (!text) return '';

    let cleaned = text;

    // Remove forwarding headers
    cleaned = cleaned.replace(/---------- Forwarded message ---------[\s\S]*?\n\n/gi, '');
    cleaned = cleaned.replace(/^From:.*\n/gim, '');
    cleaned = cleaned.replace(/^Date:.*\n/gim, '');
    cleaned = cleaned.replace(/^Subject:.*\n/gim, '');
    cleaned = cleaned.replace(/^To:.*\n/gim, '');

    // Remove image placeholders like [image: description] or [cid:...]
    cleaned = cleaned.replace(/\[image:[^\]]*\]/gi, '');
    cleaned = cleaned.replace(/\[cid:[^\]]*\]/gi, '');

    // Remove excessive newlines
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    return cleaned.trim();
}
