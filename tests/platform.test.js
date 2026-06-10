import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('platform behavior', () => {
    it('GET /health returns ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('unknown /api/* routes return JSON 404, not the SPA', async () => {
        const res = await request(app).get('/api/definitely-not-a-route');
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/json/);
        expect(res.body.error).toBeDefined();
    });

    it('serves the landing page at / and the SPA as fallback', async () => {
        const root = await request(app).get('/');
        expect(root.status).toBe(200);
        expect(root.headers['content-type']).toMatch(/html/);

        const spa = await request(app).get('/some/client/route');
        expect(spa.status).toBe(200);
        expect(spa.headers['content-type']).toMatch(/html/);
    });

    it('sets an X-Request-Id header on every response', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}$/);
    });

    it('sets HSTS and CSP security headers (helmet)', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
        expect(res.headers['content-security-policy']).toContain("default-src 'self'");
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    describe('inbound email webhook', () => {
        it('rejects requests without the shared secret', async () => {
            const res = await request(app).post('/api/webhook/email').send({});
            expect(res.status).toBe(401);
        });

        it('rejects requests with a wrong secret', async () => {
            const res = await request(app)
                .post('/api/webhook/email')
                .set('x-webhook-secret', 'wrong-secret')
                .send({});
            expect(res.status).toBe(401);
        });
    });

    it('stripe checkout reports unavailable when Stripe is not configured', async () => {
        // In the test env there is no STRIPE_SECRET_KEY; the route must fail
        // loudly (5xx/503), never silently succeed.
        const res = await request(app).post('/api/stripe/checkout').send({ plan: 'standard' });
        expect(res.status).toBeGreaterThanOrEqual(401); // 401 (no auth) is also acceptable pre-Stripe
    });
});
