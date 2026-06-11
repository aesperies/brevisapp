import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { registerUser, createNewsletter } from './helpers.js';

describe('tags', () => {
    it('requires auth', async () => {
        expect((await request(app).get('/api/tags')).status).toBe(401);
    });

    it('creates, lists, and deletes a tag', async () => {
        const { cookie } = await registerUser(app);

        const created = await request(app)
            .post('/api/tags')
            .set('Cookie', cookie)
            .send({ name: 'finance', color: '#FF0000' });
        expect(created.status).toBe(200);
        expect(created.body.name).toBe('finance');

        const list = await request(app).get('/api/tags').set('Cookie', cookie);
        expect(list.body.some((t) => t.id === created.body.id)).toBe(true);

        const del = await request(app)
            .delete(`/api/tags/${created.body.id}`)
            .set('Cookie', cookie);
        expect(del.status).toBe(200);

        const after = await request(app).get('/api/tags').set('Cookie', cookie);
        expect(after.body.some((t) => t.id === created.body.id)).toBe(false);
    });

    it('rejects an empty tag name and a malformed color', async () => {
        const { cookie } = await registerUser(app);
        expect(
            (await request(app).post('/api/tags').set('Cookie', cookie).send({ name: '' })).status
        ).toBe(400);
        expect(
            (
                await request(app)
                    .post('/api/tags')
                    .set('Cookie', cookie)
                    .send({ name: 'ok', color: 'red' })
            ).status
        ).toBe(400);
    });

    it('attaches and detaches a tag on a newsletter', async () => {
        const { cookie } = await registerUser(app);
        const newsletter = await createNewsletter(app, cookie);
        const tag = (
            await request(app).post('/api/tags').set('Cookie', cookie).send({ name: 'ai' })
        ).body;

        const attach = await request(app)
            .post(`/api/newsletters/${newsletter.id}/tags/${tag.id}`)
            .set('Cookie', cookie);
        expect(attach.status).toBe(200);
        expect(attach.body.tags.some((t) => t.id === tag.id)).toBe(true);

        const detach = await request(app)
            .delete(`/api/newsletters/${newsletter.id}/tags/${tag.id}`)
            .set('Cookie', cookie);
        expect(detach.status).toBe(200);
        expect(detach.body.tags.some((t) => t.id === tag.id)).toBe(false);
    });

    it("cannot attach another user's tag", async () => {
        const alice = await registerUser(app);
        const bob = await registerUser(app);
        const newsletter = await createNewsletter(app, alice.cookie);
        const bobTag = (
            await request(app).post('/api/tags').set('Cookie', bob.cookie).send({ name: 'bobs' })
        ).body;

        const res = await request(app)
            .post(`/api/newsletters/${newsletter.id}/tags/${bobTag.id}`)
            .set('Cookie', alice.cookie);
        expect(res.status).toBe(404);
    });
});
