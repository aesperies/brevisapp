import crypto from 'crypto';
import express from 'express';
import { simpleParser } from 'mailparser';

import { dbHelpers } from '../../database.js';
import { extractAndStoreGraph } from '../../graph-extractor.js';
import { maskEmail } from '../utils/logger.js';
import { asyncHandler } from '../utils/errors.js';
import { extractUrls, cleanForwardedContent, cleanTextContent } from '../utils/content.js';
import { upload } from '../middleware/uploads.js';
import { webhookLimiter } from '../middleware/rate-limits.js';

export function createWebhooksRouter() {
const router = express.Router();

router.get('/api/config/email-domain', (req, res) => {
    res.json({
        domain: process.env.EMAIL_DOMAIN || 'mail.brevisapp.com'
    });
});

// ============= EMAIL WEBHOOK =============

router.post('/api/webhook/email/:secret?', webhookLimiter, upload.none(), asyncHandler(async (req, res) => {
    // Verify webhook secret. SendGrid Inbound Parse can't send custom headers
    // and strips query params + basic-auth credentials on redirects, so the only
    // reliable transport is a high-entropy secret in the URL path itself:
    //   POST /api/webhook/email/<EMAIL_WEBHOOK_SECRET>
    // Header `x-webhook-secret` is also accepted for clients that can send it.
    // NOTE: never log req.originalUrl or req.url here — the secret is in the path.
        const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('❌ Email webhook: EMAIL_WEBHOOK_SECRET not configured — rejecting request');
            return res.status(503).json({ error: 'Webhook not configured' });
        }
        const providedSecret = req.params.secret || req.headers['x-webhook-secret'];
        const secretsMatch = (() => {
            if (!providedSecret) return false;
            const a = Buffer.from(providedSecret, 'utf8');
            const b = Buffer.from(webhookSecret, 'utf8');
            if (a.length !== b.length) return false;
            return crypto.timingSafeEqual(a, b);
        })();
        if (!secretsMatch) {
            console.error('❌ Email webhook: invalid or missing secret');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log('📧 Webhook received from SendGrid');
        console.log('📦 Body fields:', Object.keys(req.body));

        let toEmail, fromEmail, subject, content;

        let htmlContent = '';
        let textContent = '';

        // SendGrid can send parsed fields (text/html) or raw email in 'email' field
        if (req.body.text || req.body.html) {
            // Parsed mode: text and html are separate fields
            toEmail = req.body.to || '';
            fromEmail = req.body.from || '';
            subject = req.body.subject || 'Untitled';
            htmlContent = req.body.html || '';
            textContent = req.body.text || '';
            console.log('📨 Using parsed mode (text/html fields)');
        } else if (req.body.email) {
            // Raw mode: full MIME email in 'email' field - parse it
            console.log('📨 Using raw mode (email field), parsing with mailparser...');
            const parsed = await simpleParser(req.body.email);
            toEmail = req.body.to || parsed.to?.text || '';
            fromEmail = req.body.from || parsed.from?.text || '';
            subject = req.body.subject || parsed.subject || 'Untitled';
            htmlContent = parsed.html || '';
            textContent = parsed.text || '';
            console.log('📨 Parsed email - text length:', textContent.length, 'html length:', htmlContent.length);
        } else {
            toEmail = req.body.to || '';
            fromEmail = req.body.from || '';
            subject = req.body.subject || 'Untitled';
        }

        // Prefer HTML content (cleaned), fallback to cleaned text
        if (htmlContent) {
            content = cleanForwardedContent(htmlContent);
            console.log('📨 Using cleaned HTML content');
        } else if (textContent) {
            content = cleanTextContent(textContent);
            console.log('📨 Using cleaned text content');
        } else {
            content = '';
        }

        console.log('📬 To:', maskEmail(toEmail));
        console.log('📤 From:', maskEmail(fromEmail));
        console.log('📋 Subject:', subject);
        console.log('📝 Content length:', content.length);

        // Extract email code from recipient
        const match = toEmail.match(/brief-([a-z0-9]+)@/i);

        if (!match) {
            console.log('❌ Invalid recipient format:', toEmail);
            return res.status(400).json({ error: 'Invalid recipient format' });
        }

        const emailCode = 'brief-' + match[1].toLowerCase();
        console.log('🔑 Email code:', emailCode);

        const user = await dbHelpers.findUserByEmailCode(emailCode);

        if (!user) {
            console.log('❌ User not found for code:', emailCode);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('✅ User found:', maskEmail(user.email));

        const urls = extractUrls(content);

        const newsletter = await dbHelpers.createNewsletter(
            user.id,
            subject,
            fromEmail,
            content,
            urls[0] || null,
            { source: 'email' }
        );

    console.log('✅ Newsletter added via email for:', maskEmail(user.email), '- content length:', newsletter.content?.length || 0);
    // Knowledge Graph: extract entities in background
    setImmediate(() => {
        extractAndStoreGraph(newsletter.id, user.id, { language: user.language || 'en' })
            .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
    });
    res.json({ success: true });
}));

return router;
}
