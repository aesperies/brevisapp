import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { registerUser, createNewsletter } from './helpers.js';

// /api/v1/* must behave exactly like /api/* — same routers, one URL rewrite.
describe('API v1 prefix', () => {
    it('serves /api/v1/plans identically to /api/plans', async () => {
        const v1 = await request(app).get('/api/v1/plans');
        const legacy = await request(app).get('/api/plans');
        expect(v1.status).toBe(200);
        expect(v1.body).toEqual(legacy.body);
    });

    it('authenticates and reads newsletters under /api/v1', async () => {
        const { cookie } = await registerUser(app);
        const created = await createNewsletter(app, cookie, { title: 'v1 path test' });

        const res = await request(app)
            .get(`/api/v1/newsletters/${created.id}`)
            .set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('v1 path test');
    });

    it('returns 401 for protected v1 routes without auth', async () => {
        const res = await request(app).get('/api/v1/auth/me');
        expect(res.status).toBe(401);
    });

    it('returns JSON 404 for unknown v1 endpoints', async () => {
        const res = await request(app).get('/api/v1/definitely-not-a-route');
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/json/);
    });
});
