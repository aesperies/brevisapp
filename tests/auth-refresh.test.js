import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { getDb } from '../database.js';
import { registerUser, uniqueEmail, nextIp, TEST_PASSWORD } from './helpers.js';

// Pull a single "name=value" cookie out of a Set-Cookie array.
function cookie(setCookie, name) {
    const hit = (setCookie || []).find((c) => c.startsWith(name + '='));
    return hit ? hit.split(';')[0] : null;
}

describe('refresh-token rotation', () => {
    it('login issues both an access and a refresh cookie', async () => {
        const { email } = await registerUser(app);
        const res = await request(app)
            .post('/api/auth/login')
            .set('X-Forwarded-For', nextIp())
            .send({ email, password: TEST_PASSWORD });
        const sc = res.headers['set-cookie'];
        expect(cookie(sc, 'token')).toBeTruthy();
        expect(cookie(sc, 'refresh_token')).toBeTruthy();
        // Refresh cookie is scoped to /api/auth, httpOnly.
        const refreshLine = sc.find((c) => c.startsWith('refresh_token='));
        expect(refreshLine).toMatch(/HttpOnly/i);
        expect(refreshLine).toMatch(/Path=\/api\/auth/i);
    });

    it('rotates the refresh token and lets the old one be detected as reuse', async () => {
        const { cookie: setCookie } = await registerUser(app);
        const refresh = cookie(setCookie, 'refresh_token');

        const first = await request(app)
            .post('/api/auth/refresh').set('X-Forwarded-For', nextIp())
            .set('Cookie', refresh);
        expect(first.status).toBe(200);
        const rotated = cookie(first.headers['set-cookie'], 'refresh_token');
        expect(rotated).toBeTruthy();
        expect(rotated).not.toBe(refresh);

        // The NEW token works...
        const second = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp()).set('Cookie', rotated);
        expect(second.status).toBe(200);

        // ...but presenting the ORIGINAL (already-rotated) token is reuse/theft:
        // rejected, and the whole chain is burned.
        const reuse = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp()).set('Cookie', refresh);
        expect(reuse.status).toBe(401);
        expect(reuse.body.reason).toBe('reuse');

        // After reuse detection even the latest rotated token is dead.
        const latest = cookie(second.headers['set-cookie'], 'refresh_token');
        const afterBurn = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp()).set('Cookie', latest);
        expect(afterBurn.status).toBe(401);
    });

    it('rejects refresh with no cookie', async () => {
        const res = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(401);
    });

    it('rejects an expired refresh token', async () => {
        const { cookie: setCookie, user } = await registerUser(app);
        const refresh = cookie(setCookie, 'refresh_token');
        // Force this user's refresh tokens to the past.
        await getDb().query(
            "UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 day' WHERE user_id = $1",
            [user.id]
        );
        const res = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp()).set('Cookie', refresh);
        expect(res.status).toBe(401);
        expect(res.body.reason).toBe('expired');
    });

    it('logout revokes the refresh token', async () => {
        const { cookie: setCookie } = await registerUser(app);
        const refresh = cookie(setCookie, 'refresh_token');
        const out = await request(app).post('/api/auth/logout').set('X-Forwarded-For', nextIp()).set('Cookie', setCookie);
        expect(out.status).toBe(200);
        const res = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp()).set('Cookie', refresh);
        expect(res.status).toBe(401);
    });

    it('a refreshed access token authenticates protected routes', async () => {
        const { cookie: setCookie } = await registerUser(app);
        const refresh = cookie(setCookie, 'refresh_token');
        const r = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp()).set('Cookie', refresh);
        const newAccess = cookie(r.headers['set-cookie'], 'token');
        const me = await request(app).get('/api/auth/me').set('X-Forwarded-For', nextIp()).set('Cookie', newAccess);
        expect(me.status).toBe(200);
        expect(me.body.user).toBeTruthy();
    });
});
