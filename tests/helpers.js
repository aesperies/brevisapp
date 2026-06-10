import request from 'supertest';
import { getDb } from '../database.js';

let ipCounter = 0;

// Each virtual user gets a unique source IP so the per-IP rate limiters
// (3 registrations/hour, 5 logins/15min) don't throttle the suite itself.
// server.js sets `trust proxy: 1`, so the X-Forwarded-For value becomes req.ip.
export function nextIp() {
    ipCounter += 1;
    return `10.99.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

let emailCounter = 0;
export function uniqueEmail() {
    emailCounter += 1;
    return `user${Date.now()}_${emailCounter}@test.brevisapp.com`;
}

export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * Register a fresh user and return { user, cookie, ip, email, password }.
 * The returned cookie authenticates subsequent requests.
 */
export async function registerUser(app, overrides = {}) {
    const email = overrides.email ?? uniqueEmail();
    const password = overrides.password ?? TEST_PASSWORD;
    const ip = nextIp();
    const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', ip)
        .send({ email, password, name: overrides.name ?? 'Test User' });
    if (res.status !== 200) {
        throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    const cookie = res.headers['set-cookie'];
    return { user: res.body.user, cookie, ip, email, password };
}

/** Directly set a user's plan in the DB (registration always grants 'pro'). */
export async function setPlan(userId, plan) {
    await getDb().query('UPDATE users SET plan = $1, trial_end_date = NULL WHERE id = $2', [
        plan,
        userId,
    ]);
}

/** Create a newsletter for the given authenticated cookie; returns the created row. */
export async function createNewsletter(app, cookie, fields = {}) {
    const res = await request(app)
        .post('/api/newsletters')
        .set('Cookie', cookie)
        .send({
            title: fields.title ?? 'Test Newsletter',
            source: fields.source ?? 'sender@example.com',
            content: fields.content ?? 'Some newsletter content for testing purposes.',
            ...fields,
        });
    if (res.status !== 200 && res.status !== 201) {
        throw new Error(`createNewsletter failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.newsletter ?? res.body;
}
