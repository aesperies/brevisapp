import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { getDb } from '../database.js';
import { registerUser, createNewsletter, setPlan } from './helpers.js';

describe('observability', () => {
    it('/metrics is 404 when METRICS_TOKEN is unset', async () => {
        delete process.env.METRICS_TOKEN;
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(404);
    });

    it('/metrics requires the bearer token and serves Prometheus text', async () => {
        process.env.METRICS_TOKEN = 'test-metrics-token';
        try {
            const unauth = await request(app).get('/metrics');
            expect(unauth.status).toBe(401);

            const res = await request(app)
                .get('/metrics')
                .set('Authorization', 'Bearer test-metrics-token');
            expect(res.status).toBe(200);
            expect(res.text).toContain('brevis_http_requests_total');
            expect(res.text).toContain('process_cpu_user_seconds_total');
        } finally {
            delete process.env.METRICS_TOKEN;
        }
    });

    it('high-cardinality paths are reduced to :id in metric labels', async () => {
        const { routeLabel } = await import('../src/observability.js');
        expect(routeLabel('/api/newsletters/12345')).toBe('/api/newsletters/:id');
        expect(routeLabel('/api/graph/tasks/extract-7-99-1718000000000')).toBe('/api/graph/tasks/:id');
        expect(routeLabel('/api/webhook/email/super-secret-token-value')).toBe('/api/webhook/email');
        expect(routeLabel('/assets/app-abc123.js')).toBe('static');
    });
});

describe('background task persistence', () => {
    it('persists extraction tasks to the DB and reports failure state', async () => {
        const { cookie, user } = await registerUser(app);
        await setPlan(user.id, 'premium');
        const newsletter = await createNewsletter(app, cookie);

        const start = await request(app)
            .post(`/api/graph/extract/${newsletter.id}`)
            .set('Cookie', cookie);
        expect(start.status).toBe(200);
        const { taskId } = start.body;
        expect(taskId).toMatch(/^extract-/);

        // Task row exists in the DB immediately (restart-proof)
        const row = await getDb().query('SELECT * FROM background_tasks WHERE id = $1', [taskId]);
        expect(row.rows).toHaveLength(1);
        expect(row.rows[0].user_id).toBe(user.id);
        expect(row.rows[0].kind).toBe('extract');

        // The background AI call fails (dummy API key) — poll until the task
        // records that failure durably.
        let task;
        for (let i = 0; i < 40; i++) {
            const res = await request(app)
                .get(`/api/graph/tasks/${taskId}`)
                .set('Cookie', cookie);
            expect(res.status).toBe(200);
            task = res.body;
            if (task.status !== 'running') break;
            await new Promise((r) => setTimeout(r, 250));
        }
        expect(['failed', 'completed']).toContain(task.status);
        expect(task.newsletterId).toBe(newsletter.id);
    }, 30000);

    it("does not expose another user's task", async () => {
        const alice = await registerUser(app);
        await setPlan(alice.user.id, 'premium');
        const newsletter = await createNewsletter(app, alice.cookie);
        const start = await request(app)
            .post(`/api/graph/extract/${newsletter.id}`)
            .set('Cookie', alice.cookie);
        const { taskId } = start.body;

        const bob = await registerUser(app);
        await setPlan(bob.user.id, 'premium');
        const res = await request(app)
            .get(`/api/graph/tasks/${taskId}`)
            .set('Cookie', bob.cookie);
        expect(res.status).toBe(404);
    });
});
