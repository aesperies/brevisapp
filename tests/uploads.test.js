import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { registerUser } from './helpers.js';

// Smoke coverage for the multer-backed upload routes (multer 2.x upgrade).
describe('file uploads (multer)', () => {
    it('accepts a plain-text file on /api/news-builder/upload-file', async () => {
        const { cookie } = await registerUser(app);
        const res = await request(app)
            .post('/api/news-builder/upload-file')
            .set('Cookie', cookie)
            .attach('file', Buffer.from('hello newsletter world'), {
                filename: 'notes.txt',
                contentType: 'text/plain',
            });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('notes.txt');
        expect(res.body.content).toContain('hello newsletter world');
    });

    it('rejects an unsupported mime type', async () => {
        const { cookie } = await registerUser(app);
        const res = await request(app)
            .post('/api/news-builder/upload-file')
            .set('Cookie', cookie)
            .attach('file', Buffer.from('\x00\x01binary'), {
                filename: 'blob.bin',
                contentType: 'application/octet-stream',
            });
        expect(res.status).toBe(400);
    });

    it('rejects missing file on /api/newsletters/upload-pdf', async () => {
        const { cookie } = await registerUser(app);
        const res = await request(app)
            .post('/api/newsletters/upload-pdf')
            .set('Cookie', cookie);
        expect(res.status).toBe(400);
    });

    it('rejects a non-PDF mime on /api/newsletters/upload-pdf', async () => {
        const { cookie } = await registerUser(app);
        const res = await request(app)
            .post('/api/newsletters/upload-pdf')
            .set('Cookie', cookie)
            .attach('file', Buffer.from('not a pdf'), {
                filename: 'fake.pdf',
                contentType: 'text/plain',
            });
        expect(res.status).toBe(400);
    });

    it('parses OPML on /api/subscriptions/import-opml (multer .single under 2.x)', async () => {
        const { cookie } = await registerUser(app);
        // Empty OPML — exercises the multipart path without network feed fetches.
        const res = await request(app)
            .post('/api/subscriptions/import-opml')
            .set('Cookie', cookie)
            .attach('file', Buffer.from('<opml><body></body></opml>'), {
                filename: 'feeds.opml',
                contentType: 'text/xml',
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/no feeds/i);
    });
});
