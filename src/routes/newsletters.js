import express from 'express';
import { body, validationResult } from 'express-validator';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

import { dbHelpers } from '../../database.js';
import { generateSummary, generateBatchBrief, generateBatchReport, canUserPerformAction } from '../../ai-service.js';
import { extractAndStoreGraph } from '../../graph-extractor.js';
import { maskEmail } from '../utils/logger.js';
import { asyncHandler } from '../utils/errors.js';
import { sendEmail, emailEnabled } from '../services/email.js';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/uploads.js';
import { openai } from '../clients.js';
import { aiLimiter, kindleLimiter, newsletterCrudLimiter } from '../middleware/rate-limits.js';

export function createNewslettersRouter() {
const router = express.Router();

// ============= NEWSLETTER ROUTES =============

router.get('/api/newsletters', authMiddleware, newsletterCrudLimiter, asyncHandler(async (req, res) => {
    const newsletters = await dbHelpers.getNewsletters(req.user.id);
    res.json(newsletters);
}));

router.get('/api/newsletters/:id', authMiddleware, newsletterCrudLimiter, asyncHandler(async (req, res) => {
    const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
    if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
    }
    res.json(newsletter);
}));

router.post('/api/newsletters', authMiddleware, [
    body('title').notEmpty().isLength({ max: 500 }).withMessage('Title is required (max 500 chars)'),
    body('source').optional().isLength({ max: 255 }).withMessage('Source max 255 chars'),
    body('content').notEmpty().isLength({ max: 500000 }).withMessage('Content is required (max 500k chars)'),
    body('url').optional({ checkFalsy: true }).isURL().withMessage('Must be a valid URL')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { title, source, content, url } = req.body;
    const newsletter = await dbHelpers.createNewsletter(
        req.user.id,
        title,
        source,
        content,
        url,
        { source: 'manual' }
    );
    console.log('✅ Newsletter created:', title);
    // Knowledge Graph: extract entities in background
    setImmediate(() => {
        extractAndStoreGraph(newsletter.id, req.user.id, { language: req.user.language || 'en' })
            .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
    });
    res.json(newsletter);
}));

router.post('/api/newsletters/upload-pdf', authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF files are supported' });
    }
    if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large (max 10MB)' });
    }
    const data = await pdfParse(req.file.buffer);
    const title = req.file.originalname.replace(/\.pdf$/i, '');
    const content = data.text || '';
    if (!content.trim()) {
        return res.status(400).json({ error: 'Could not extract text from PDF' });
    }
    const newsletter = await dbHelpers.createNewsletter(
        req.user.id, title, 'PDF Upload', content, '', { source: 'pdf' }
    );
    console.log('✅ PDF newsletter created:', title);
    // Knowledge Graph: extract entities in background
    setImmediate(() => {
        extractAndStoreGraph(newsletter.id, req.user.id, { language: req.user.language || 'en' })
            .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
    });
    res.json(newsletter);
}));

// Bookmarklet saves now go through the regular /api/newsletters endpoint
// via the /bookmarklet-save page (same origin, uses httpOnly cookies)

router.patch('/api/newsletters/:id', authMiddleware, newsletterCrudLimiter, [
    body('is_read').optional().isBoolean().toBoolean(),
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'is_read must be a boolean' });
    }

    const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
    if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
    }

    const updates = {};
    if (req.body.is_read !== undefined) {
        // Column is INTEGER (0/1) — pg rejects a JS boolean against it
        updates.is_read = req.body.is_read ? 1 : 0;
    }

    const updated = await dbHelpers.updateNewsletter(parseInt(req.params.id), updates);
    console.log('✅ Newsletter updated:', req.params.id, updates);
    res.json(updated);
}));

router.delete('/api/newsletters/:id', authMiddleware, newsletterCrudLimiter, asyncHandler(async (req, res) => {
    await dbHelpers.deleteNewsletter(parseInt(req.params.id), req.user.id);
    console.log('✅ Newsletter deleted:', req.params.id);
    res.json({ success: true });
}));

router.post('/api/newsletters/:id/summary', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const user = await dbHelpers.findUserById(req.user.id);

    if (!canUserPerformAction(user, 'generate_summary')) {
        return res.status(403).json({ error: 'Upgrade to Standard to generate summaries' });
    }

    const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
    if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
    }

    if (newsletter.summary && newsletter.summary_language === user.language) {
        return res.json({ summary: newsletter.summary });
    }

    const summary = await generateSummary(newsletter, user.language);
    await dbHelpers.updateNewsletter(newsletter.id, { summary, summary_language: user.language });

    console.log('✅ Summary generated for newsletter:', newsletter.id);
    res.json({ summary });
}));

// Send newsletter to Kindle
router.post('/api/newsletters/:id/kindle', authMiddleware, kindleLimiter, asyncHandler(async (req, res) => {
    if (!emailEnabled) {
        return res.status(503).json({ error: 'Email service not configured' });
    }

    const user = await dbHelpers.findUserById(req.user.id);
    if (!user.kindle_email) {
        return res.status(400).json({
            error: 'Kindle email not configured. Please add your Kindle email in your profile settings.'
        });
    }

    const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
    if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
    }

    // Strip HTML tags for Kindle (plain text works better)
    const plainContent = newsletter.content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

    // Send email to Kindle
    await sendEmail({
        to: user.kindle_email,
        subject: newsletter.title,
        text: `${newsletter.title}\n\nFrom: ${newsletter.sender}\n\n${plainContent}`
    });

    console.log(`✅ Newsletter ${newsletter.id} sent to Kindle: ${maskEmail(user.kindle_email)}`);
    res.json({ success: true });
}));

// Generate audio for newsletter
router.post('/api/newsletters/:id/audio', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
    if (!openai) {
        return res.status(503).json({ error: 'Audio service not configured' });
    }

    const user = await dbHelpers.findUserById(req.user.id);

    // Require Pro or Premium plan for audio generation
    if (!canUserPerformAction(user, 'generate_summary')) {
        return res.status(403).json({ error: 'Upgrade to Standard to generate audio' });
    }

    const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
    if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
    }

    // Strip HTML for better TTS
    const plainContent = newsletter.content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();

    // Limit content length for TTS (OpenAI has a 4096 char limit)
    const contentForTTS = plainContent.substring(0, 4000);
    const textToSpeak = `${newsletter.title}. ${contentForTTS}`;

    // Generate audio using OpenAI TTS
    const mp3Response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: user.language === 'es' ? 'nova' : 'alloy',
        input: textToSpeak,
        speed: 1.0
    });

    // Convert to buffer and send as base64 or save to temp file
    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    const base64Audio = buffer.toString('base64');
    const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

    console.log(`✅ Audio generated for newsletter ${newsletter.id}`);
    res.json({ audioUrl });
}));

router.post('/api/newsletters/brief', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const user = await dbHelpers.findUserById(req.user.id);

    if (!canUserPerformAction(user, 'generate_brief')) {
        return res.status(403).json({ error: 'Upgrade to Standard to generate briefs' });
    }

    const { newsletter_ids, purpose } = req.body;
    if (!newsletter_ids || newsletter_ids.length === 0) {
        return res.status(400).json({ error: 'No newsletters selected' });
    }

    const newsletters = await dbHelpers.getNewslettersByIds(newsletter_ids, req.user.id);

    if (newsletters.length === 0) {
        return res.status(404).json({ error: 'No newsletters found' });
    }

    const brief = await generateBatchBrief(newsletters, user.language, purpose || '');
    console.log('✅ Brief generated for', newsletters.length, 'newsletters, purpose:', purpose || 'none');
    res.json({ brief });
}));

router.post('/api/newsletters/report', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const user = await dbHelpers.findUserById(req.user.id);

    if (!canUserPerformAction(user, 'generate_report')) {
        return res.status(403).json({ error: 'Upgrade to Premium to generate reports' });
    }

    const { newsletter_ids, purpose } = req.body;
    if (!newsletter_ids || newsletter_ids.length === 0) {
        return res.status(400).json({ error: 'No newsletters selected' });
    }

    const newsletters = await dbHelpers.getNewslettersByIds(newsletter_ids, req.user.id);

    if (newsletters.length === 0) {
        return res.status(404).json({ error: 'No newsletters found' });
    }

    const report = await generateBatchReport(newsletters, user.language, purpose || '');
    console.log('✅ Report generated for', newsletters.length, 'newsletters, purpose:', purpose || 'none');
    res.json({ report });
}));

return router;
}
