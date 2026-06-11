import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { registerUser, createNewsletter } from './helpers.js';

describe('newsletters', () => {
    it('requires auth for list and create', async () => {
        expect((await request(app).get('/api/newsletters')).status).toBe(401);
        expect(
            (await request(app).post('/api/newsletters').send({ title: 't', content: 'c' })).status
        ).toBe(401);
    });

    it('creates a newsletter and returns it in the list', async () => {
        const { cookie } = await registerUser(app);
        const created = await createNewsletter(app, cookie, { title: 'My Daily Brief' });
        expect(created.id).toBeDefined();
        expect(created.title).toBe('My Daily Brief');

        const list = await request(app).get('/api/newsletters').set('Cookie', cookie);
        expect(list.status).toBe(200);
        expect(list.body.some((n) => n.id === created.id)).toBe(true);
    });

    it('rejects creation with missing title or content', async () => {
        const { cookie } = await registerUser(app);
        const noTitle = await request(app)
            .post('/api/newsletters')
            .set('Cookie', cookie)
            .send({ content: 'body only' });
        expect(noTitle.status).toBe(400);

        const noContent = await request(app)
            .post('/api/newsletters')
            .set('Cookie', cookie)
            .send({ title: 'title only' });
        expect(noContent.status).toBe(400);
    });

    it('fetches a single newsletter by id', async () => {
        const { cookie } = await registerUser(app);
        const created = await createNewsletter(app, cookie);
        const res = await request(app).get(`/api/newsletters/${created.id}`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(created.id);
    });

    it('updates is_read via PATCH', async () => {
        const { cookie } = await registerUser(app);
        const created = await createNewsletter(app, cookie);
        const res = await request(app)
            .patch(`/api/newsletters/${created.id}`)
            .set('Cookie', cookie)
            .send({ is_read: true });
        expect(res.status).toBe(200);

        const fetched = await request(app)
            .get(`/api/newsletters/${created.id}`)
            .set('Cookie', cookie);
        expect(fetched.body.is_read).toBe(true);
    });

    it('rejects non-boolean is_read', async () => {
        const { cookie } = await registerUser(app);
        const created = await createNewsletter(app, cookie);
        const res = await request(app)
            .patch(`/api/newsletters/${created.id}`)
            .set('Cookie', cookie)
            .send({ is_read: 'maybe' });
        expect(res.status).toBe(400);
    });

    it('deletes a newsletter', async () => {
        const { cookie } = await registerUser(app);
        const created = await createNewsletter(app, cookie);
        const del = await request(app)
            .delete(`/api/newsletters/${created.id}`)
            .set('Cookie', cookie);
        expect(del.status).toBe(200);

        const after = await request(app)
            .get(`/api/newsletters/${created.id}`)
            .set('Cookie', cookie);
        expect(after.status).toBe(404);
    });

    it('isolates newsletters between users', async () => {
        const alice = await registerUser(app);
        const bob = await registerUser(app);
        const created = await createNewsletter(app, alice.cookie, { title: 'Alice private' });

        const asBob = await request(app)
            .get(`/api/newsletters/${created.id}`)
            .set('Cookie', bob.cookie);
        expect(asBob.status).toBe(404);

        const bobList = await request(app).get('/api/newsletters').set('Cookie', bob.cookie);
        expect(bobList.body.some((n) => n.id === created.id)).toBe(false);
    });
});
