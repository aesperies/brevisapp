import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import Stripe from 'stripe';

import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import Parser from 'rss-parser';

import { setupDatabase, generateEmailCode, createInitialUser, dbHelpers } from './database.js';
import { generateToken, verifyToken, authMiddleware } from './auth.js';
import { generateSummary, generateBatchBrief, generateBatchReport, canUserPerformAction, PLANS } from './ai-service.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY.trim()) : null;

// Initialize nodemailer transporter for Kindle emails (optional)
let emailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    });
    console.log('✅ Email transporter configured for Kindle');
} else {
    console.log('⚠️  Email transporter not configured (Kindle feature disabled)');
}

// Initialize OpenAI for text-to-speech (optional)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
if (openai) {
    console.log('✅ OpenAI configured for audio generation');
} else {
    console.log('⚠️  OpenAI not configured (audio feature disabled)');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting BREVIS server...');
console.log('📁 Directory:', __dirname);
console.log('🔌 Port:', PORT);
console.log('🌐 Frontend URL:', process.env.FRONTEND_URL || 'http://localhost:3000');

// Initialize database
try {
    await setupDatabase();
    await createInitialUser();
    console.log('✅ Database initialized');
} catch (error) {
    console.error('❌ Database initialization failed:', error);
}

// Configure multer for SendGrid webhook
const upload = multer();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: [
        'https://brevisapp.com',
        'https://www.brevisapp.com',
        'https://brevisapp-production.up.railway.app',
        process.env.FRONTEND_URL || 'http://localhost:3000'
    ],
    credentials: true
}));
// Parse JSON for all routes except Stripe webhook (needs raw body)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe/webhook') {
        next();
    } else {
        express.json({ limit: '10mb' })(req, res, next);
    }
});
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

function cleanForwardedContent(html) {
    if (!html) return '';

    // Remove common forwarding headers and signatures
    let cleaned = html;

    // Remove Gmail forwarding header
    cleaned = cleaned.replace(/---------- Forwarded message ---------[\s\S]*?<br\s*\/?>\s*<br\s*\/?>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>---------- Forwarded message ---------<\/div>[\s\S]*?(?=<div|<table|<p|$)/gi, '');

    // Remove "From:", "Date:", "Subject:", "To:" lines at the beginning (forwarding metadata)
    cleaned = cleaned.replace(/<div[^>]*>From:[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>Date:[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>Subject:[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>To:[\s\S]*?<\/div>/gi, '');

    // Remove blockquote wrapping (often used for forwarded content)
    cleaned = cleaned.replace(/<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/gi, '$1');

    // Remove empty divs and excessive whitespace
    cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
    cleaned = cleaned.replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/gi, '<br><br>');

    return cleaned.trim();
}

function cleanTextContent(text) {
    if (!text) return '';

    let cleaned = text;

    // Remove forwarding headers
    cleaned = cleaned.replace(/---------- Forwarded message ---------[\s\S]*?\n\n/gi, '');
    cleaned = cleaned.replace(/^From:.*\n/gim, '');
    cleaned = cleaned.replace(/^Date:.*\n/gim, '');
    cleaned = cleaned.replace(/^Subject:.*\n/gim, '');
    cleaned = cleaned.replace(/^To:.*\n/gim, '');

    // Remove image placeholders like [image: description] or [cid:...]
    cleaned = cleaned.replace(/\[image:[^\]]*\]/gi, '');
    cleaned = cleaned.replace(/\[cid:[^\]]*\]/gi, '');

    // Remove excessive newlines
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    return cleaned.trim();
}

// ============= AUTH ROUTES =============

// Rate limiters for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: { error: 'Too many registration attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

app.post('/api/auth/register', registerLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ Validation errors:', errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, name } = req.body;
        console.log('📝 Registration attempt:', email);
        
        const existingUser = await dbHelpers.findUserByEmail(email);
        if (existingUser) {
            console.log('❌ User already exists:', email);
            return res.status(400).json({ error: 'User already exists' });
        }

        const user = await dbHelpers.createUser(email, password, name);
        const token = generateToken(user);
        
        res.cookie('token', token, { 
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });
        
        console.log('✅ User registered:', email);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                language: user.language,
                kindle_email: user.kindle_email,
                trial_end_date: user.trial_end_date
            }
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', authLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ Validation errors:', errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;
        console.log('🔐 Login attempt:', email);
        
        const user = await dbHelpers.findUserByEmail(email);
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await dbHelpers.verifyPassword(user.id, password);
        if (!isValid) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verificar si el periodo de prueba ha expirado
        const currentPlan = await dbHelpers.checkAndUpdateTrialStatus(user.id);
        if (currentPlan) {
            user.plan = currentPlan;
        }

        const token = generateToken(user);
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        console.log('✅ User logged in:', email);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                language: user.language,
                kindle_email: user.kindle_email,
                trial_end_date: user.trial_end_date
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Password reset - request
app.post('/api/auth/forgot-password', authLimiter, [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Invalid email' });
        }

        const { email } = req.body;
        const user = await dbHelpers.findUserByEmail(email);

        // Always return success to avoid leaking whether email exists
        if (!user) {
            return res.json({ success: true });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await dbHelpers.createPasswordReset(user.id, token, expiresAt);

        const resetUrl = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/reset-password?token=${token}`;

        if (emailTransporter) {
            await emailTransporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: 'BREVIS - Reset your password',
                html: `
                    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                        <h2 style="color: #2C3544; margin-bottom: 16px;">Reset your password</h2>
                        <p style="color: #4A5568; line-height: 1.6;">You requested a password reset for your BREVIS account. Click the button below to set a new password:</p>
                        <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #2C3544; color: #FFF; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
                        <p style="color: #7A8599; font-size: 13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
                    </div>
                `
            });
            console.log('✅ Password reset email sent to:', email);
        } else {
            console.log('⚠️ SMTP not configured. Reset token:', token);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Password reset - execute
app.post('/api/auth/reset-password', authLimiter, [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const { token, password } = req.body;

        const resetRecord = await dbHelpers.findValidPasswordReset(token);
        if (!resetRecord) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }

        await dbHelpers.updatePasswordHash(resetRecord.user_id, password);
        await dbHelpers.markPasswordResetUsed(token);

        console.log('✅ Password reset for user:', resetRecord.user_id);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        if (!user) {
            console.log('❌ Get user error: User not found for ID:', req.user.id);
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                language: user.language,
                kindle_email: user.kindle_email
            }
        });
    } catch (error) {
        console.error('❌ Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Update user profile
app.patch('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const { name, kindle_email, language, password } = req.body;
        const db = dbHelpers.getDb();

        // Handle password change separately (uses its own hashing)
        if (password !== undefined && password.length >= 8) {
            await dbHelpers.updatePasswordHash(req.user.id, password);
            console.log('✅ Password updated for user:', req.user.id);
        } else if (password !== undefined && password.length > 0) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }
        if (kindle_email !== undefined) {
            updates.push(`kindle_email = $${paramIndex++}`);
            values.push(kindle_email);
        }
        if (language !== undefined) {
            updates.push(`language = $${paramIndex++}`);
            values.push(language);
        }

        let user;
        if (updates.length > 0) {
            values.push(req.user.id);
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
            const result = await db.query(query, values);
            user = result.rows[0];
        } else {
            // Just fetch current user if only password was changed
            user = await dbHelpers.findUserById(req.user.id);
        }

        console.log('✅ User profile updated:', user.id);
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                language: user.language,
                kindle_email: user.kindle_email
            }
        });
    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    console.log('✅ User logged out');
    res.json({ success: true });
});

// ============= GOOGLE OAUTH =============

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/google/callback`;

app.get('/api/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
        return res.status(500).json({ error: 'Google OAuth not configured' });
    }
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account'
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.redirect('/?error=google_auth_failed');

        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) {
            console.error('❌ Google token exchange failed:', tokens);
            return res.redirect('/?error=google_auth_failed');
        }

        // Get user profile
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const profile = await profileRes.json();
        if (!profile.email) {
            return res.redirect('/?error=google_auth_failed');
        }

        console.log('🔐 Google login for:', profile.email);

        // Find or create user
        let user = await dbHelpers.findUserByEmail(profile.email);
        if (!user) {
            const randomPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
            user = await dbHelpers.createUser(profile.email, randomPass, profile.name || profile.email.split('@')[0]);
            console.log('✅ New user created via Google:', profile.email);
        }

        const token = generateToken(user);
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        console.log('✅ Google login successful:', profile.email);
        res.redirect('/');
    } catch (error) {
        console.error('❌ Google OAuth error:', error);
        res.redirect('/?error=google_auth_failed');
    }
});

// ============= NEWSLETTER ROUTES =============

app.get('/api/newsletters', authMiddleware, async (req, res) => {
    try {
        const newsletters = await dbHelpers.getNewsletters(req.user.id);
        res.json(newsletters);
    } catch (error) {
        console.error('❌ Get newsletters error:', error);
        res.status(500).json({ error: 'Failed to get newsletters' });
    }
});

app.get('/api/newsletters/:id', authMiddleware, async (req, res) => {
    try {
        const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        res.json(newsletter);
    } catch (error) {
        console.error('❌ Get newsletter error:', error);
        res.status(500).json({ error: 'Failed to get newsletter' });
    }
});

app.post('/api/newsletters', authMiddleware, async (req, res) => {
    try {
        const { title, source, content, url } = req.body;
        const newsletter = await dbHelpers.createNewsletter(
            req.user.id,
            title,
            source,
            content,
            url
        );
        console.log('✅ Newsletter created:', title);
        res.json(newsletter);
    } catch (error) {
        console.error('❌ Create newsletter error:', error);
        res.status(500).json({ error: 'Failed to create newsletter' });
    }
});

app.post('/api/newsletters/upload-pdf', authMiddleware, upload.single('file'), async (req, res) => {
    try {
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
            req.user.id, title, 'PDF Upload', content, ''
        );
        console.log('✅ PDF newsletter created:', title);
        res.json(newsletter);
    } catch (error) {
        console.error('❌ PDF upload error:', error);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// Word/DOCX upload for News Builder templates
app.post('/api/news-builder/upload-word', authMiddleware, upload.single('file'), async (req, res) => {
    try {
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
    } catch (error) {
        console.error('❌ Word upload error:', error);
        res.status(500).json({ error: 'Failed to process Word file' });
    }
});

// Generic file upload for News Builder (PDF, Word, TXT, MD, images)
app.post('/api/news-builder/upload-file', authMiddleware, upload.single('file'), async (req, res) => {
    try {
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
    } catch (error) {
        console.error('❌ File upload error:', error);
        res.status(500).json({ error: 'Failed to process file' });
    }
});

// === URL Import & Bookmarklet ===

function detectPlatform(url) {
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
    if (/linkedin\.com/i.test(url)) return 'linkedin';
    return 'unknown';
}

async function fetchGenericContent(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0)' }
        });
        const html = await response.text();

        // Extraer metadata con regex (sin cheerio para simplicidad)
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);

        const title = ogTitleMatch?.[1] || titleMatch?.[1] || new URL(url).hostname;
        const description = ogDescMatch?.[1] || descMatch?.[1] || '';
        const author = authorMatch?.[1] || new URL(url).hostname;

        // Extraer contenido del body (simplificado)
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        let content = bodyMatch?.[1] || '';
        content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
        content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        content = content.substring(0, 5000);

        return { title, author, content: `<p>${description}</p><p>${content}</p>` };
    } catch (error) {
        console.error('Error fetching generic URL:', error);
        return null;
    }
}

function extractTweetId(url) {
    const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/);
    return match ? match[1] : null;
}

async function fetchSingleTweet(tweetId) {
    // Primary: fxtwitter API
    try {
        const res = await fetch(`https://api.fxtwitter.com/x/status/${tweetId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.tweet) return data.tweet;
        }
    } catch (e) { /* fallback */ }

    // Fallback: syndication API
    try {
        const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`);
        if (res.ok) {
            const synData = await res.json();
            return {
                id: tweetId,
                text: synData.text,
                author: { name: synData.user?.name, screen_name: synData.user?.screen_name },
                replying_to_status: synData.in_reply_to_status_id_str || null
            };
        }
    } catch (e) { /* give up */ }

    return null;
}

async function fetchFullThread(tweetId) {
    const initial = await fetchSingleTweet(tweetId);
    if (!initial) return null;

    const authorHandle = initial.author?.screen_name;
    const tweets = [initial];
    const MAX_DEPTH = 50;

    // Crawl up: follow replying_to_status to find the thread root
    let current = initial;
    let depth = 0;
    while (current.replying_to_status && depth < MAX_DEPTH) {
        const parentId = typeof current.replying_to_status === 'object'
            ? current.replying_to_status.id
            : current.replying_to_status;
        if (!parentId) break;

        const parent = await fetchSingleTweet(parentId);
        if (!parent) break;
        // Stop if parent is from a different author (not part of the same thread)
        if (parent.author?.screen_name !== authorHandle) break;

        tweets.unshift(parent);
        current = parent;
        depth++;
    }

    return { tweet: initial, thread: tweets };
}

app.post('/api/import/url', authMiddleware, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const platform = detectPlatform(url);

        if (platform === 'linkedin') {
            return res.status(400).json({
                error: 'linkedin_not_supported',
                message: 'LinkedIn posts cannot be imported via URL. Use the bookmarklet to save LinkedIn posts.'
            });
        }

        if (platform === 'twitter') {
            const tweetId = extractTweetId(url);
            if (!tweetId) {
                return res.status(400).json({ error: 'Could not parse tweet URL. Use a link like https://x.com/user/status/123...' });
            }

            const threadData = await fetchFullThread(tweetId);
            if (!threadData?.tweet) {
                return res.status(502).json({ error: 'Could not fetch tweet. It may be deleted, private, or Twitter is blocking requests.' });
            }

            const tweet = threadData.tweet;
            const thread = threadData.thread;
            const authorName = tweet.author?.name || 'Unknown';
            const authorHandle = tweet.author?.screen_name || '';

            let content;
            if (thread.length > 1) {
                content = thread.map((t, i) =>
                    `<p><strong>${i + 1}/${thread.length}</strong> ${t.text}</p>`
                ).join('\n');
            } else {
                content = `<p>${tweet.text}</p>`;
            }

            const firstTweetText = (thread[0]?.text || tweet.text || '').substring(0, 80);
            const title = thread.length > 1
                ? `Thread by @${authorHandle} (${thread.length} tweets): ${firstTweetText}...`
                : `@${authorHandle}: ${firstTweetText}...`;

            const newsletter = await dbHelpers.createNewsletter(
                req.user.id,
                title,
                `@${authorHandle} (${authorName})`,
                content,
                url
            );

            console.log(`✅ Imported tweet (${thread.length} tweet${thread.length > 1 ? 's' : ''} in thread):`, title);
            res.json(newsletter);
        } else {
            // Scraping genérico para cualquier URL
            const genericContent = await fetchGenericContent(url);
            if (!genericContent) {
                return res.status(400).json({ error: 'Could not fetch content from this URL' });
            }

            const newsletter = await dbHelpers.createNewsletter(
                req.user.id,
                genericContent.title,
                genericContent.author,
                genericContent.content,
                url
            );

            console.log(`✅ Imported generic URL:`, genericContent.title);
            res.json(newsletter);
        }
    } catch (error) {
        console.error('❌ Import URL error:', error);
        res.status(500).json({ error: 'Failed to import content from URL' });
    }
});

app.options('/api/bookmarklet/save', cors());
app.post('/api/bookmarklet/save', cors(), async (req, res) => {
    try {
        const token = req.body.token
            || req.cookies.token
            || req.headers.authorization?.replace('Bearer ', '');

        if (!token) return res.status(401).json({ error: 'Authentication required' });

        const decoded = verifyToken(token);
        if (!decoded) return res.status(401).json({ error: 'Invalid token' });

        const { title, source, content, url } = req.body;
        if (!content && !url) {
            return res.status(400).json({ error: 'Content or URL is required' });
        }

        let finalSource = source;
        if (!finalSource && url) {
            try { finalSource = new URL(url).hostname; } catch (e) { finalSource = 'Web'; }
        }

        const newsletter = await dbHelpers.createNewsletter(
            decoded.id,
            title || 'Saved from web',
            finalSource || 'Web',
            content || '',
            url || null
        );

        console.log('✅ Bookmarklet save:', title);
        res.json({ success: true, id: newsletter.id });
    } catch (error) {
        console.error('❌ Bookmarklet save error:', error);
        res.status(500).json({ error: 'Failed to save' });
    }
});

app.patch('/api/newsletters/:id', authMiddleware, async (req, res) => {
    try {
        const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }

        const updates = {};
        if (req.body.is_read !== undefined) {
            updates.is_read = req.body.is_read;
        }

        const updated = await dbHelpers.updateNewsletter(parseInt(req.params.id), updates);
        console.log('✅ Newsletter updated:', req.params.id, updates);
        res.json(updated);
    } catch (error) {
        console.error('❌ Update newsletter error:', error);
        res.status(500).json({ error: 'Failed to update newsletter' });
    }
});

app.delete('/api/newsletters/:id', authMiddleware, async (req, res) => {
    try {
        await dbHelpers.deleteNewsletter(parseInt(req.params.id), req.user.id);
        console.log('✅ Newsletter deleted:', req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Delete newsletter error:', error);
        res.status(500).json({ error: 'Failed to delete newsletter' });
    }
});

app.post('/api/newsletters/:id/summary', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        if (!canUserPerformAction(user, 'generate_summary')) {
            return res.status(403).json({ error: 'Upgrade to Pro to generate summaries' });
        }

        const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }

        if (newsletter.summary) {
            return res.json({ summary: newsletter.summary });
        }

        const summary = await generateSummary(newsletter, user.language);
        await dbHelpers.updateNewsletter(newsletter.id, { summary });
        
        console.log('✅ Summary generated for newsletter:', newsletter.id);
        res.json({ summary });
    } catch (error) {
        console.error('❌ Generate summary error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

// Send newsletter to Kindle
app.post('/api/newsletters/:id/kindle', authMiddleware, async (req, res) => {
    try {
        if (!emailTransporter) {
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
        await emailTransporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: user.kindle_email,
            subject: newsletter.title,
            text: `${newsletter.title}\n\nFrom: ${newsletter.sender}\n\n${plainContent}`,
            attachments: []
        });

        console.log(`✅ Newsletter ${newsletter.id} sent to Kindle: ${user.kindle_email}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Send to Kindle error:', error);
        res.status(500).json({ error: 'Failed to send to Kindle' });
    }
});

// Generate audio for newsletter
app.post('/api/newsletters/:id/audio', authMiddleware, async (req, res) => {
    try {
        if (!openai) {
            return res.status(503).json({ error: 'Audio service not configured' });
        }

        const user = await dbHelpers.findUserById(req.user.id);

        // Require Pro or Premium plan for audio generation
        if (!canUserPerformAction(user, 'generate_summary')) {
            return res.status(403).json({ error: 'Upgrade to Pro to generate audio' });
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
    } catch (error) {
        console.error('❌ Generate audio error:', error);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

app.post('/api/newsletters/brief', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);

        if (!canUserPerformAction(user, 'generate_brief')) {
            return res.status(403).json({ error: 'Upgrade to Pro to generate briefs' });
        }

        const { newsletter_ids, purpose } = req.body;
        if (!newsletter_ids || newsletter_ids.length === 0) {
            return res.status(400).json({ error: 'No newsletters selected' });
        }

        const newsletters = [];
        for (const id of newsletter_ids) {
            const newsletter = await dbHelpers.getNewsletter(parseInt(id), req.user.id);
            if (newsletter) {
                newsletters.push(newsletter);
            }
        }

        if (newsletters.length === 0) {
            return res.status(404).json({ error: 'No newsletters found' });
        }

        const brief = await generateBatchBrief(newsletters, user.language, purpose || '');
        console.log('✅ Brief generated for', newsletters.length, 'newsletters, purpose:', purpose || 'none');
        res.json({ brief });
    } catch (error) {
        console.error('❌ Generate brief error:', error);
        res.status(500).json({ error: 'Failed to generate brief' });
    }
});

app.post('/api/newsletters/report', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);

        if (!canUserPerformAction(user, 'generate_report')) {
            return res.status(403).json({ error: 'Upgrade to Premium to generate reports' });
        }

        const { newsletter_ids, purpose } = req.body;
        if (!newsletter_ids || newsletter_ids.length === 0) {
            return res.status(400).json({ error: 'No newsletters selected' });
        }

        const newsletters = [];
        for (const id of newsletter_ids) {
            const newsletter = await dbHelpers.getNewsletter(parseInt(id), req.user.id);
            if (newsletter) {
                newsletters.push(newsletter);
            }
        }

        if (newsletters.length === 0) {
            return res.status(404).json({ error: 'No newsletters found' });
        }

        const report = await generateBatchReport(newsletters, user.language, purpose || '');
        console.log('✅ Report generated for', newsletters.length, 'newsletters, purpose:', purpose || 'none');
        res.json({ report });
    } catch (error) {
        console.error('❌ Generate report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ============= NEWS BUILDER ROUTES =============

app.post('/api/news-builder/generate', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
        console.error('❌ News builder error:', error);
        res.status(500).json({ error: 'Failed to generate newsletter' });
    }
});

app.post('/api/news-builder/generate-from-project', authMiddleware, async (req, res) => {
    try {
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
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0)' }
                    });
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
    } catch (error) {
        console.error('❌ News builder project error:', error);
        res.status(500).json({ error: 'Failed to generate newsletter' });
    }
});

// ============= TAG ROUTES =============

app.get('/api/tags', authMiddleware, async (req, res) => {
    try {
        const tags = await dbHelpers.getTags(req.user.id);
        res.json(tags);
    } catch (error) {
        console.error('❌ Get tags error:', error);
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

app.post('/api/tags', authMiddleware, async (req, res) => {
    try {
        const { name, color } = req.body;
        const tag = await dbHelpers.createTag(req.user.id, name, color);
        console.log('✅ Tag created:', name);
        res.json(tag);
    } catch (error) {
        console.error('❌ Create tag error:', error);
        res.status(500).json({ error: 'Failed to create tag' });
    }
});

app.delete('/api/tags/:id', authMiddleware, async (req, res) => {
    try {
        await dbHelpers.deleteTag(parseInt(req.params.id), req.user.id);
        console.log('✅ Tag deleted:', req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Delete tag error:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});

app.post('/api/newsletters/:id/tags/:tagId', authMiddleware, async (req, res) => {
    try {
        const newsletterId = parseInt(req.params.id);
        const tagId = parseInt(req.params.tagId);
        if (isNaN(newsletterId) || isNaN(tagId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        // Verify ownership of both newsletter and tag
        const newsletter = await dbHelpers.getNewsletter(newsletterId, req.user.id);
        const tags = await dbHelpers.getTags(req.user.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        if (!tags.some(t => t.id === tagId)) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        await dbHelpers.addTagToNewsletter(newsletterId, tagId);
        const updatedNewsletter = await dbHelpers.getNewsletterWithTags(newsletterId);
        res.json(updatedNewsletter);
    } catch (error) {
        console.error('❌ Add tag error:', error);
        res.status(500).json({ error: 'Failed to add tag' });
    }
});

app.delete('/api/newsletters/:id/tags/:tagId', authMiddleware, async (req, res) => {
    try {
        const newsletterId = parseInt(req.params.id);
        const tagId = parseInt(req.params.tagId);
        if (isNaN(newsletterId) || isNaN(tagId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        // Verify ownership of both newsletter and tag
        const newsletter = await dbHelpers.getNewsletter(newsletterId, req.user.id);
        const tags = await dbHelpers.getTags(req.user.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        if (!tags.some(t => t.id === tagId)) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        await dbHelpers.removeTagFromNewsletter(newsletterId, tagId);
        const updatedNewsletter = await dbHelpers.getNewsletterWithTags(newsletterId);
        res.json(updatedNewsletter);
    } catch (error) {
        console.error('❌ Remove tag error:', error);
        res.status(500).json({ error: 'Failed to remove tag' });
    }
});

// ============= PLAN ROUTES =============

app.get('/api/plans', (req, res) => {
    res.json(PLANS);
});

// ============= STRIPE ROUTES =============

const STRIPE_PRICES = {
    pro_month: process.env.STRIPE_PRICE_PRO_MONTHLY,
    pro_year: process.env.STRIPE_PRICE_PRO_ANNUAL,
    premium_month: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
    premium_year: process.env.STRIPE_PRICE_PREMIUM_ANNUAL
};

app.post('/api/stripe/checkout', authMiddleware, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        const { plan, interval } = req.body; // plan: 'pro'|'premium', interval: 'month'|'year'
        const priceId = STRIPE_PRICES[`${plan}_${interval}`];

        if (!priceId) {
            return res.status(400).json({ error: 'Invalid plan or interval' });
        }

        const user = await dbHelpers.findUserById(req.user.id);

        // Create or reuse Stripe customer
        let customerId = user.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: { user_id: user.id.toString() }
            });
            customerId = customer.id;
            await dbHelpers.updateUser(user.id, { stripe_customer_id: customerId });
        }

        const baseUrl = req.headers.origin || `https://brevisapp.com`;

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${baseUrl}?checkout=success`,
            cancel_url: `${baseUrl}?checkout=cancel`,
            metadata: { user_id: user.id.toString(), plan }
        });

        console.log('✅ Checkout session created for:', user.email, plan, interval);
        res.json({ url: session.url });
    } catch (error) {
        console.error('❌ Stripe checkout error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

app.post('/api/stripe/portal', authMiddleware, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        const user = await dbHelpers.findUserById(req.user.id);
        if (!user.stripe_customer_id) {
            return res.status(400).json({ error: 'No subscription found' });
        }

        const baseUrl = req.headers.origin || `https://brevisapp.com`;

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: baseUrl
        });

        console.log('✅ Portal session created for:', user.email);
        res.json({ url: session.url });
    } catch (error) {
        console.error('❌ Stripe portal error:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});

// Stripe webhook - must use raw body, placed before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        let event;
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (webhookSecret && sig) {
            try {
                event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            } catch (err) {
                console.error('❌ Stripe webhook signature error:', err.message);
                return res.status(400).json({ error: 'Webhook signature verification failed' });
            }
        } else {
            event = JSON.parse(req.body);
        }

        console.log('📦 Stripe event:', event.type);

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = parseInt(session.metadata?.user_id);
                const plan = session.metadata?.plan;

                if (userId && plan) {
                    await dbHelpers.updateUser(userId, {
                        plan,
                        stripe_subscription_id: session.subscription
                    });
                    console.log('✅ Plan upgraded via checkout:', userId, plan);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(subscription.customer);

                if (user && subscription.status === 'active') {
                    // Determine plan from price
                    const priceId = subscription.items?.data?.[0]?.price?.id;
                    let plan = 'free';
                    if (priceId === STRIPE_PRICES.pro_month || priceId === STRIPE_PRICES.pro_year) {
                        plan = 'pro';
                    } else if (priceId === STRIPE_PRICES.premium_month || priceId === STRIPE_PRICES.premium_year) {
                        plan = 'premium';
                    }
                    await dbHelpers.updateUser(user.id, {
                        plan,
                        stripe_subscription_id: subscription.id
                    });
                    console.log('✅ Subscription updated:', user.email, plan);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(subscription.customer);

                if (user) {
                    await dbHelpers.updateUser(user.id, {
                        plan: 'free',
                        stripe_subscription_id: null
                    });
                    console.log('✅ Subscription cancelled, downgraded:', user.email);
                }
                break;
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('❌ Stripe webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

app.get('/api/config/email-domain', (req, res) => {
    res.json({
        domain: process.env.EMAIL_DOMAIN || 'newsletters.brevisapp.com'
    });
});

// ============= EMAIL WEBHOOK =============

app.post('/api/webhook/email', upload.none(), async (req, res) => {
    try {
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
            subject = req.body.subject || 'Sin título';
            htmlContent = req.body.html || '';
            textContent = req.body.text || '';
            console.log('📨 Using parsed mode (text/html fields)');
        } else if (req.body.email) {
            // Raw mode: full MIME email in 'email' field - parse it
            console.log('📨 Using raw mode (email field), parsing with mailparser...');
            const parsed = await simpleParser(req.body.email);
            toEmail = req.body.to || parsed.to?.text || '';
            fromEmail = req.body.from || parsed.from?.text || '';
            subject = req.body.subject || parsed.subject || 'Sin título';
            htmlContent = parsed.html || '';
            textContent = parsed.text || '';
            console.log('📨 Parsed email - text length:', textContent.length, 'html length:', htmlContent.length);
        } else {
            toEmail = req.body.to || '';
            fromEmail = req.body.from || '';
            subject = req.body.subject || 'Sin título';
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

        console.log('📬 To:', toEmail);
        console.log('📤 From:', fromEmail);
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

        console.log('✅ User found:', user.email);

        const urls = extractUrls(content);

        const newsletter = await dbHelpers.createNewsletter(
            user.id,
            subject,
            fromEmail,
            content,
            urls[0] || null
        );

        console.log('✅ Newsletter added via email for:', user.email, '- content length:', newsletter.content?.length || 0);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Webhook error:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: 'Error processing email' });
    }
});

// Health check
// ============= WAITLIST =============

app.post('/api/waitlist', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }
        await dbHelpers.addToWaitlist(req.body.email);
        res.json({ success: true });
    } catch (error) {
        console.error('Waitlist error:', error);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'BREVIS is running' });
});

// ============= SUBSCRIPTION / RSS ROUTES =============

const rssParser = new Parser();

app.get('/api/subscriptions', authMiddleware, async (req, res) => {
    try {
        const db = dbHelpers.getDb();
        const result = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json(result.rows);
    } catch (e) {
        console.error('❌ Get subscriptions error:', e);
        res.status(500).json({ error: 'Failed to get subscriptions' });
    }
});

app.post('/api/subscriptions', authMiddleware, async (req, res) => {
    try {
        let { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Normalize URL: add /feed if it's a substack URL without it
        url = url.trim().replace(/\/+$/, '');
        if (url.includes('substack.com') && !url.endsWith('/feed')) {
            url = url + '/feed';
        }
        if (!url.startsWith('http')) url = 'https://' + url;

        // Validate it's a working RSS feed
        let feedName;
        try {
            const feed = await rssParser.parseURL(url);
            feedName = feed.title || url.replace(/https?:\/\//, '').split('/')[0];
        } catch (e) {
            return res.status(400).json({ error: 'Could not read RSS feed. Make sure the URL is correct.' });
        }

        const db = dbHelpers.getDb();
        // Check for duplicates
        const existing = await db.query('SELECT id FROM subscriptions WHERE user_id = $1 AND url = $2', [req.user.id, url]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Already subscribed' });

        const result = await db.query(
            'INSERT INTO subscriptions (user_id, url, name) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, url, feedName]
        );
        console.log('✅ Subscription added:', feedName, 'for user', req.user.id);
        res.json(result.rows[0]);
    } catch (e) {
        console.error('❌ Add subscription error:', e);
        res.status(500).json({ error: 'Failed to add subscription' });
    }
});

app.post('/api/subscriptions/import-opml', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const opmlContent = req.file.buffer.toString('utf-8');
        // Simple OPML parser: extract xmlUrl attributes
        const urlMatches = opmlContent.match(/xmlUrl="([^"]+)"/gi) || [];
        const urls = urlMatches.map(m => m.match(/xmlUrl="([^"]+)"/i)[1]);

        if (urls.length === 0) return res.status(400).json({ error: 'No feeds found in OPML file' });

        const db = dbHelpers.getDb();
        let added = 0;
        for (const url of urls) {
            try {
                const existing = await db.query('SELECT id FROM subscriptions WHERE user_id = $1 AND url = $2', [req.user.id, url]);
                if (existing.rows.length > 0) continue;

                let feedName = url.replace(/https?:\/\//, '').split('/')[0];
                try {
                    const feed = await rssParser.parseURL(url);
                    if (feed.title) feedName = feed.title;
                } catch (e) { /* use URL as name */ }

                await db.query('INSERT INTO subscriptions (user_id, url, name) VALUES ($1, $2, $3)', [req.user.id, url, feedName]);
                added++;
            } catch (e) { /* skip invalid feeds */ }
        }

        console.log('✅ OPML import: added', added, 'feeds for user', req.user.id);
        res.json({ added, total: urls.length });
    } catch (e) {
        console.error('❌ OPML import error:', e);
        res.status(500).json({ error: 'Failed to import OPML' });
    }
});

app.delete('/api/subscriptions/:id', authMiddleware, async (req, res) => {
    try {
        const db = dbHelpers.getDb();
        await db.query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Delete subscription error:', e);
        res.status(500).json({ error: 'Failed to delete subscription' });
    }
});

// RSS fetch cron - runs every 30 minutes
async function fetchAllRSSFeeds() {
    try {
        const db = dbHelpers.getDb();
        const subs = await db.query('SELECT s.*, u.id as uid FROM subscriptions s JOIN users u ON s.user_id = u.id');

        for (const sub of subs.rows) {
            try {
                const feed = await rssParser.parseURL(sub.url);
                const sender = feed.title || sub.name || 'RSS Feed';

                for (const item of (feed.items || []).slice(0, 10)) {
                    // Check if already exists (by title and user)
                    const existing = await db.query(
                        'SELECT id FROM newsletters WHERE user_id = $1 AND title = $2 AND sender = $3',
                        [sub.user_id, item.title || 'Untitled', sender]
                    );
                    if (existing.rows.length > 0) continue;

                    await db.query(
                        'INSERT INTO newsletters (user_id, title, sender, content, url, is_read) VALUES ($1, $2, $3, $4, $5, 0)',
                        [sub.user_id, item.title || 'Untitled', sender, item.content || item.contentSnippet || '', item.link || '']
                    );
                }

                await db.query('UPDATE subscriptions SET last_fetched = NOW() WHERE id = $1', [sub.id]);
            } catch (e) {
                console.error('⚠️  RSS fetch error for', sub.url, ':', e.message);
            }
        }
        console.log('✅ RSS feeds fetched at', new Date().toISOString());
    } catch (e) {
        console.error('❌ RSS cron error:', e);
    }
}

// Run RSS fetch every 30 minutes
setInterval(fetchAllRSSFeeds, 30 * 60 * 1000);
// Also run once on startup (after 10 seconds delay)
setTimeout(fetchAllRSSFeeds, 10000);

// Landing page at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA fallback - serve app.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// ============= SERVER START =============

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                    BREVIS Server                       ║
╠════════════════════════════════════════════════════════╣
║   Server: http://0.0.0.0:${PORT}                         ║
║   Database: PostgreSQL                                ║
║   Stripe: ${stripe ? '✅ Connected' : '❌ Not configured'}                              ║
║                                                        ║
║   Plans (unlimited newsletters):                       ║
║   • Free: No AI features                              ║
║   • Pro: Summaries + Briefs ($7.99/mo)                ║
║   • Premium: + Reports ($9.99/mo)                     ║
╚════════════════════════════════════════════════════════╝
    `);
}); 
