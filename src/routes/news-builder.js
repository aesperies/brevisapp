import express from 'express';
import mammoth from 'mammoth';

import { dbHelpers } from '../../database.js';
import { canUserPerformAction } from '../../ai-service.js';
import { asyncHandler } from '../utils/errors.js';
import { safeFetch } from '../utils/safe-fetch.js';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/uploads.js';
import { aiLimiter, importLimiter } from '../middleware/rate-limits.js';

export function createNewsBuilderRouter() {
const router = express.Router();

// Word/DOCX upload for News Builder templates
router.post('/api/news-builder/upload-word', importLimiter, authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const validMimes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
    ];
    if (!validMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Only Word files (.docx, .doc) are supported' });
    }
    if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large (max 10MB)' });
    }

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    const content = result.value || '';

    if (!content.trim()) {
        return res.status(400).json({ error: 'Could not extract content from Word file' });
    }

    const name = req.file.originalname.replace(/\.(docx?|doc)$/i, '');
    console.log('✅ Word file processed:', name);
    res.json({ name, content });
}));

// Generic file upload for News Builder (PDF, Word, TXT, MD, images)
router.post('/api/news-builder/upload-file', importLimiter, authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large (max 10MB)' });
    }

    const mime = req.file.mimetype;
    const name = req.file.originalname;
    let content = '';

    // PDF
    if (mime === 'application/pdf') {
        try {
            const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
            const data = await pdfParse(req.file.buffer);
            content = data.text || '';
        } catch (e) {
            console.error('PDF parse error:', e);
            return res.status(400).json({ error: 'Could not parse PDF' });
        }
    }
    // Word
    else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') {
        const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
        content = result.value || '';
    }
    // Plain text / Markdown
    else if (mime === 'text/plain' || mime === 'text/markdown' || name.endsWith('.md') || name.endsWith('.txt')) {
        content = req.file.buffer.toString('utf-8');
    }
    // Images - store a placeholder
    else if (mime.startsWith('image/')) {
        content = `[Image: ${name}]`;
    }
    else {
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    if (!content.trim()) {
        return res.status(400).json({ error: 'Could not extract content from file' });
    }

    console.log('✅ File processed:', name);
    res.json({ name, content });
}));

// ============= NEWS BUILDER ROUTES =============

router.post('/api/news-builder/generate', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const { template, reportIds } = req.body;
    if (!template || !reportIds?.length) {
        return res.status(400).json({ error: 'Template and reports required' });
    }

    const user = await dbHelpers.findUserById(req.user.id);
    if (!canUserPerformAction(user, 'generate_report')) {
        return res.status(403).json({ error: 'Upgrade to Premium to use News Builder' });
    }

    const { generateNewsletterFromTemplate } = await import('./ai-service.js');
    const content = await generateNewsletterFromTemplate(template, reportIds, user.language);
    console.log('✅ Newsletter generated from template');
    res.json({ content });
}));

router.post('/api/news-builder/generate-from-project', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const { template, reportContents, urls } = req.body;
        if (!template) {
            return res.status(400).json({ error: 'Template required' });
        }

        const user = await dbHelpers.findUserById(req.user.id);
        if (!canUserPerformAction(user, 'generate_report')) {
            return res.status(403).json({ error: 'Upgrade to Premium to use News Builder' });
        }

        // Fetch URL contents
        let urlContents = [];
        if (urls?.length) {
            for (const url of urls) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
                    let response;
                    try {
                        response = await safeFetch(url, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0)' },
                            redirect: 'manual',
                            signal: controller.signal
                        });
                    } catch (err) {
                        if (err?.code === 'URL_BLOCKED') {
                            console.error('URL blocked in news builder:', url, err.reason);
                            continue;
                        }
                        throw err;
                    } finally {
                        clearTimeout(timeoutId);
                    }
                    // Skip redirects to prevent SSRF bypass via redirect to internal IP
                    if (response.status >= 300 && response.status < 400) continue;
                    if (response.ok) {
                        const html = await response.text();
                        const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 5000);
                        urlContents.push({ url, content: textContent });
                    }
                } catch (e) {
                    console.error('Failed to fetch URL:', url, e.message);
                }
            }
        }

        const { generateNewsletterFromProject } = await import('./ai-service.js');
        const content = await generateNewsletterFromProject(
            template,
            reportContents || [],
            urlContents,
            user.language
        );
        console.log('✅ Newsletter generated from project');
        res.json({ content });
}));

return router;
}
