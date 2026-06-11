import { describe, it, expect, vi } from 'vitest';
import { extractUrls, cleanForwardedContent, cleanTextContent } from '../src/utils/content.js';
import { maskEmail, log } from '../src/utils/logger.js';

describe('content utils', () => {
    it('extractUrls finds http(s) URLs', () => {
        expect(extractUrls('see https://a.com and http://b.org/x now')).toEqual([
            'https://a.com',
            'http://b.org/x',
        ]);
        expect(extractUrls('no links here')).toEqual([]);
    });

    it('cleanForwardedContent strips Gmail forwarding metadata', () => {
        const html = '<div>From: someone@x.com</div><div>Subject: hi</div><p>Real content</p>';
        const out = cleanForwardedContent(html);
        expect(out).toContain('Real content');
        expect(out).not.toContain('From:');
        expect(out).not.toContain('Subject:');
    });

    it('cleanForwardedContent unwraps gmail_quote blockquotes', () => {
        const html = '<blockquote class="gmail_quote"><p>kept body</p></blockquote>';
        const out = cleanForwardedContent(html);
        expect(out).toContain('kept body');
        expect(out).not.toContain('blockquote');
    });

    it('cleanTextContent removes headers, image placeholders, excess newlines', () => {
        const text = 'From: a@b.c\nSubject: x\nHello\n[image: logo]\n[cid:123]\nworld\n\n\n\n\n!';
        const out = cleanTextContent(text);
        expect(out).toContain('Hello');
        expect(out).toContain('world');
        expect(out).not.toContain('[image:');
        expect(out).not.toContain('[cid:');
        expect(out).not.toMatch(/\n{4,}/);
    });

    it('handles empty input', () => {
        expect(cleanForwardedContent('')).toBe('');
        expect(cleanTextContent(null)).toBe('');
    });
});

describe('logger', () => {
    it('maskEmail keeps 2 chars + domain', () => {
        expect(maskEmail('antonio@delaesperanza.com')).toBe('an***@delaesperanza.com');
        expect(maskEmail('not-an-email')).toBe('***');
        expect(maskEmail(null)).toBe('***');
    });

    it('redacts email/token/password fields in log meta', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        log.info('test entry', { email: 'secret@user.com', token: 'tok_123', password: 'hunter2' });
        const line = spy.mock.calls.at(-1)[0];
        expect(line).not.toContain('secret@user.com');
        expect(line).not.toContain('tok_123');
        expect(line).not.toContain('hunter2');
        expect(line).toContain('se***@user.com');
        expect(line).toContain('[REDACTED]');
        spy.mockRestore();
    });
});
