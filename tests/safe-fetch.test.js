import { describe, it, expect } from 'vitest';
import { safeFetch, validateUrlForFetch, isPrivateIP } from '../src/utils/safe-fetch.js';

describe('safeFetch (SSRF guard + DNS pin)', () => {
    it('blocks localhost, private ranges, and non-http protocols', async () => {
        for (const url of [
            'http://localhost:3000/x',
            'http://127.0.0.1/x',
            'http://10.0.0.1/x',
            'http://169.254.169.254/latest/meta-data',
            'ftp://example.com/x',
        ]) {
            const v = await validateUrlForFetch(url);
            expect(v.safe, url).toBe(false);
        }
    });

    it('treats IPv6 loopback/link-local/mapped-private as private', () => {
        expect(isPrivateIP('::1')).toBe(true);
        expect(isPrivateIP('fe80::1')).toBe(true);
        expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true);
        expect(isPrivateIP('2606:2800:21f:cb07:6820:80da:af6b:8b2c')).toBe(false);
    });

    // Network test (example.com — stable, used by GitHub runners too).
    // Regression guard: on Node >=20 autoSelectFamily calls the agent's custom
    // `lookup` with {all:true}; the legacy 3-arg callback form made EVERY
    // safeFetch call fail with ERR_INVALID_IP_ADDRESS, silently breaking URL
    // import and all RSS fetching. This exercises the real connect path.
    it('fetches a public URL through the DNS-pinned agent', async () => {
        const res = await safeFetch('https://example.com/', {
            headers: { 'User-Agent': 'Brevis-test/1.0' },
            redirect: 'manual',
        });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(400);
    }, 20000);
});
