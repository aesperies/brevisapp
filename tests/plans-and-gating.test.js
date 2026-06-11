import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { registerUser, createNewsletter, setPlan } from './helpers.js';

describe('plans & AI gating', () => {
    it('GET /api/plans exposes the 3-tier model with correct capability flags', async () => {
        const res = await request(app).get('/api/plans');
        expect(res.status).toBe(200);
        const plans = res.body;
        expect(plans.free.canSummarize).toBe(false);
        expect(plans.free.canReport).toBe(false);
        expect(plans.standard.canSummarize).toBe(true);
        expect(plans.standard.canReport).toBe(false);
        expect(plans.premium.canSummarize).toBe(true);
        expect(plans.premium.canReport).toBe(true);
        // 'pro' is the legacy alias for standard — must stay for old clients
        expect(plans.pro.canSummarize).toBe(true);
    });

    it('blocks summary generation for free users (403, no AI call)', async () => {
        const { cookie, user } = await registerUser(app);
        const newsletter = await createNewsletter(app, cookie);
        await setPlan(user.id, 'free');

        const res = await request(app)
            .post(`/api/newsletters/${newsletter.id}/summary`)
            .set('Cookie', cookie);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/upgrade/i);
    });

    it('blocks report generation for standard users (premium-only)', async () => {
        const { cookie, user } = await registerUser(app);
        const newsletter = await createNewsletter(app, cookie);
        await setPlan(user.id, 'standard');

        const res = await request(app)
            .post('/api/newsletters/report')
            .set('Cookie', cookie)
            .send({ newsletterIds: [newsletter.id] });
        expect(res.status).toBe(403);
    });

    it('returns a cached summary without calling the AI', async () => {
        // A newsletter that already has a summary in the user's language must be
        // served from the DB — generateSummary would fail here (dummy API key),
        // so a 200 proves the cache path.
        const { cookie, user } = await registerUser(app);
        const newsletter = await createNewsletter(app, cookie);
        const { getDb } = await import('../database.js');
        await getDb().query(
            "UPDATE newsletters SET summary = 'cached bullet points', summary_language = (SELECT language FROM users WHERE id = $2) WHERE id = $1",
            [newsletter.id, user.id]
        );

        const res = await request(app)
            .post(`/api/newsletters/${newsletter.id}/summary`)
            .set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.summary).toBe('cached bullet points');
    });

    it('gates the knowledge graph behind Standard+', async () => {
        const { cookie, user } = await registerUser(app);
        await setPlan(user.id, 'free');
        const res = await request(app).get('/api/graph/stats').set('Cookie', cookie);
        expect(res.status).toBe(403);
    });

    it('gates KB querying behind Premium', async () => {
        const { cookie, user } = await registerUser(app);
        await setPlan(user.id, 'standard');
        const res = await request(app)
            .post('/api/kb/1/query')
            .set('Cookie', cookie)
            .send({ question: 'what happened this week?' });
        expect(res.status).toBe(403);
    });
});
