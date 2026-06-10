import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { registerUser, uniqueEmail, nextIp, TEST_PASSWORD } from './helpers.js';

describe('auth', () => {
    describe('POST /api/auth/register', () => {
        it('rejects an invalid email', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .set('X-Forwarded-For', nextIp())
                .send({ email: 'not-an-email', password: TEST_PASSWORD, name: 'X' });
            expect(res.status).toBe(400);
            expect(res.body.errors).toBeDefined();
        });

        it('rejects a password shorter than 8 chars', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .set('X-Forwarded-For', nextIp())
                .send({ email: uniqueEmail(), password: 'short', name: 'X' });
            expect(res.status).toBe(400);
        });

        it('registers a user, sets an httpOnly cookie, and grants the pro (Standard) plan', async () => {
            const email = uniqueEmail();
            const res = await request(app)
                .post('/api/auth/register')
                .set('X-Forwarded-For', nextIp())
                .send({ email, password: TEST_PASSWORD, name: 'New User' });
            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe(email);
            expect(res.body.user.plan).toBe('pro');
            expect(res.body.user.email_code).toMatch(/^brief-[a-f0-9]+$/);
            const cookie = res.headers['set-cookie']?.join(';') ?? '';
            expect(cookie).toContain('token=');
            expect(cookie).toContain('HttpOnly');
        });

        it('rejects a duplicate email', async () => {
            const { email } = await registerUser(app);
            const res = await request(app)
                .post('/api/auth/register')
                .set('X-Forwarded-For', nextIp())
                .send({ email, password: TEST_PASSWORD, name: 'Dup' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already exists/i);
        });

        it('rate-limits registrations from the same IP (3/hour)', async () => {
            const ip = nextIp();
            for (let i = 0; i < 3; i++) {
                await request(app)
                    .post('/api/auth/register')
                    .set('X-Forwarded-For', ip)
                    .send({ email: uniqueEmail(), password: TEST_PASSWORD, name: 'RL' });
            }
            const res = await request(app)
                .post('/api/auth/register')
                .set('X-Forwarded-For', ip)
                .send({ email: uniqueEmail(), password: TEST_PASSWORD, name: 'RL' });
            expect(res.status).toBe(429);
        });
    });

    describe('POST /api/auth/login', () => {
        it('logs in with correct credentials and sets a cookie', async () => {
            const { email, password } = await registerUser(app);
            const res = await request(app)
                .post('/api/auth/login')
                .set('X-Forwarded-For', nextIp())
                .send({ email, password });
            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe(email);
            expect(res.headers['set-cookie'].join(';')).toContain('token=');
        });

        it('rejects a wrong password', async () => {
            const { email } = await registerUser(app);
            const res = await request(app)
                .post('/api/auth/login')
                .set('X-Forwarded-For', nextIp())
                .send({ email, password: 'definitely-wrong-pw' });
            expect(res.status).toBe(401);
        });

        it('rejects an unknown email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set('X-Forwarded-For', nextIp())
                .send({ email: uniqueEmail(), password: TEST_PASSWORD });
            expect(res.status).toBe(401);
        });

        it('rate-limits repeated attempts from one IP (5/15min)', async () => {
            const ip = nextIp();
            const email = uniqueEmail();
            let lastStatus;
            for (let i = 0; i < 6; i++) {
                const res = await request(app)
                    .post('/api/auth/login')
                    .set('X-Forwarded-For', ip)
                    .send({ email, password: 'wrong' });
                lastStatus = res.status;
            }
            expect(lastStatus).toBe(429);
        });
    });

    describe('GET /api/auth/me', () => {
        it('returns the user when authenticated', async () => {
            const { cookie, email } = await registerUser(app);
            const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe(email);
        });

        it('returns 401 without a cookie', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(401);
        });

        it('returns 401 for a garbage token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', 'token=not.a.jwt');
            expect(res.status).toBe(401);
        });
    });

    describe('PATCH /api/auth/profile', () => {
        it('updates name and language', async () => {
            const { cookie } = await registerUser(app);
            const res = await request(app)
                .patch('/api/auth/profile')
                .set('Cookie', cookie)
                .send({ name: 'Renamed', language: 'es' });
            expect(res.status).toBe(200);
            const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
            expect(me.body.user.name).toBe('Renamed');
            expect(me.body.user.language).toBe('es');
        });
    });

    describe('POST /api/auth/logout', () => {
        it('revokes the token server-side (token_version bump)', async () => {
            const { cookie } = await registerUser(app);
            const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
            expect(out.status).toBe(200);
            // The OLD cookie must no longer authenticate — revocation is server-side.
            const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
            expect(me.status).toBe(401);
        });
    });
});
