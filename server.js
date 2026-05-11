import 'dotenv/config';
import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { promisify } from 'util';
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
import sgMail from '@sendgrid/mail';
import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import Parser from 'rss-parser';

import { setupDatabase, generateEmailCode, createInitialUser, dbHelpers, getDb, invalidateUserAutoTagCache } from './database.js';
import { recordAutoTagRemoval } from './lib/auto-tagger.js';
import { generateToken, verifyToken, makeAuthMiddleware } from './auth.js';

// DB-backed authMiddleware: validates JWT signature AND token_version (revoked on password change)
const authMiddleware = makeAuthMiddleware(async (userId) => {
    const db = getDb();
    const result = await db.query('SELECT token_version, plan, language, trial_end_date FROM users WHERE id = $1', [userId]);
    return result.rows[0] ?? { token_version: 0 };
});
import { generateSummary, generateBatchBrief, generateBatchReport, canUserPerformAction, PLANS } from './ai-service.js';
import { createGraphRouter } from './graph-routes.js';
import { extractAndStoreGraph } from './graph-extractor.js';
import { createKBRouter } from './kb-routes.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY.trim()) : null;

// ============= ERROR HANDLING UTILITIES =============

class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
    }
}

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ============= STRUCTURED LOGGING =============

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const log = {
    _emit(level, msg, meta = {}) {
        if (LEVELS[level] > LEVELS[LOG_LEVEL]) return;
        const entry = { level, msg, ts: new Date().toISOString(), ...meta };
        // Redact sensitive fields
        if (entry.email) entry.email = maskEmail(entry.email);
        if (entry.token) entry.token = '[REDACTED]';
        if (entry.password) entry.password = '[REDACTED]';
        if (level === 'error') console.error(JSON.stringify(entry));
        else console.log(JSON.stringify(entry));
    },
    error: (msg, meta) => log._emit('error', msg, meta),
    warn:  (msg, meta) => log._emit('warn', msg, meta),
    info:  (msg, meta) => log._emit('info', msg, meta),
    debug: (msg, meta) => log._emit('debug', msg, meta),
};

// ============= REQUEST ID MIDDLEWARE =============

// Email sending: prefer SendGrid API (works on Railway), fallback to SMTP
let emailEnabled = false;
const EMAIL_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'info@brevisapp.com';

// SMTP transporter created once at startup and reused for all emails
let smtpTransporter = null;

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    emailEnabled = true;
    console.log('✅ Email configured via SendGrid API (verification, password reset, Kindle)');
} else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    });
    emailEnabled = true;
    console.log('✅ Email configured via SMTP (verification, password reset, Kindle)');
} else {
    console.log('⚠️  Email not configured — set SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASSWORD');
    console.log('   Email verification, password reset, and Kindle features will be disabled');
}

// Unified email sender: uses SendGrid API or SMTP
async function sendEmail({ to, subject, html, text }) {
    if (!emailEnabled) throw new Error('Email service not configured');

    if (process.env.SENDGRID_API_KEY) {
        await sgMail.send({
            to,
            from: EMAIL_FROM,
            subject,
            html: html || undefined,
            text: text || undefined
        });
    } else {
        await smtpTransporter.sendMail({ from: EMAIL_FROM, to, subject, html, text });
    }
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
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Mask emails in logs for privacy (an***@gmail.com)
const maskEmail = (email) => {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    return local.slice(0, 2) + '***@' + domain;
};

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
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max

// HTTPS redirect — Railway terminates SSL at the load balancer and sets
// x-forwarded-proto. This catches any direct HTTP requests that slip through.
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
        return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'"],
            frameSrc: ["'self'", "blob:"],
        }
    },
    // HSTS: tell browsers to only use HTTPS for 1 year, include subdomains
    strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
}));
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

// Request ID for tracing
app.use((req, res, next) => {
    req.id = crypto.randomUUID().slice(0, 8);
    res.setHeader('X-Request-Id', req.id);
    next();
});

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

// Rate limiter for AI/expensive operations (summaries, briefs, reports, audio, news builder)
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 AI requests per 15 min per IP
    message: { error: 'Too many AI requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for URL imports and file uploads
const importLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many import requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for subscription management (add/delete/import)
const subscriptionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 subscription changes per 15 min per IP
    message: { error: 'Too many subscription requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for email webhook (prevent flooding)
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 emails per minute
    message: { error: 'Too many webhook requests' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for newsletter↔tag mutations (POST /:id/tags/:tagId, DELETE /:id/tags/:tagId).
// The DELETE path now writes to sender_tag_blocklist when the user removes an auto-tag, so
// rapid add/remove cycles can train the blocklist. Bound is generous for normal usage
// (a power user editing tags on dozens of newsletters in a session) but stops automation.
const tagMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many tag changes, please slow down' },
    standardHeaders: true,
    legacyHeaders: false
});

// Per-user limiter for Kindle send (the endpoint dispatches mail to a user-controlled
// kindle_email address; throttle to prevent abuse / mailcost runaway).
const kindleLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 sends/hour
    message: { error: 'Too many Kindle sends, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `kindle:${req.user.id}` : req.ip)
});

// Light limiter for newsletter CRUD reads (GET list, GET item) and DELETE.
// Intent is to stop scrapers, not to bother power users.
const newsletterCrudLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 600, // ~40/min — well above any human pattern
    message: { error: 'Too many newsletter requests, please slow down' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `nlcrud:${req.user.id}` : req.ip)
});

// Waitlist limiter — keyed by IP since the user is unauthenticated.
// 5 signups/hour per IP is plenty for a real human and stops fill-the-table spam.
const waitlistLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Too many waitlist signups from this network, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Knowledge Graph routes
app.use('/api/graph', authMiddleware, createGraphRouter());

// Knowledge Base routes
app.use('/api/kb', authMiddleware, createKBRouter());

// Verify access code (keeps the code server-side only)
app.post('/api/auth/verify-access-code', authLimiter, async (req, res) => {
    const { code } = req.body;
    if (process.env.ACCESS_CODE && code === process.env.ACCESS_CODE) {
        res.json({ valid: true });
    } else {
        res.status(401).json({ valid: false, error: 'Incorrect code' });
    }
});

app.post('/api/auth/register', registerLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').notEmpty()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, accessCode } = req.body;
    console.log('📝 Registration attempt:', maskEmail(email));

    const existingUser = await dbHelpers.findUserByEmail(email);
    if (existingUser) {
        console.log('❌ User already exists:', maskEmail(email));
        return res.status(400).json({ error: 'User already exists' });
    }

    const plan = (process.env.ACCESS_CODE && accessCode === process.env.ACCESS_CODE) ? 'premium' : 'pro';
    const user = await dbHelpers.createUser(email, password, name, plan);
    const token = generateToken(user);

    res.cookie('token', token, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    });

    console.log('✅ User registered:', maskEmail(email));

    // Send verification email
    if (emailEnabled) {
        try {
            const verifyToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            await dbHelpers.createEmailVerification(user.id, verifyToken, expiresAt);
            const verifyUrl = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/api/auth/verify-email?token=${verifyToken}`;
            await sendEmail({
                to: email,
                subject: 'BREVIS - Verify your email',
                html: `
                    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                        <h2 style="color: #2C3544; margin-bottom: 16px;">Welcome to BREVIS!</h2>
                        <p style="color: #4A5568; line-height: 1.6;">Please verify your email address to get the most out of your account:</p>
                        <a href="${verifyUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #2C3544; color: #FFF; text-decoration: none; border-radius: 8px; font-weight: 600;">Verify Email</a>
                        <p style="color: #7A8599; font-size: 13px;">This link expires in 24 hours.</p>
                    </div>
                `
            });
            console.log('✅ Verification email sent to:', maskEmail(email));
        } catch (emailErr) {
            console.error('⚠️ Failed to send verification email:', emailErr.message);
            console.error('   SMTP response:', emailErr.response);
            console.error('   SMTP code:', emailErr.responseCode);
        }
    }

    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            email_code: user.email_code,
            plan: user.plan,
            language: user.language,
            kindle_email: user.kindle_email,
            trial_end_date: user.trial_end_date,
            email_verified: false,
            auto_tag_enabled: user.auto_tag_enabled !== false
        }
    });
}));

app.post('/api/auth/login', authLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log('🔐 Login attempt:', maskEmail(email));

    const user = await dbHelpers.findUserByEmail(email);
    if (!user) {
        console.log('❌ User not found:', maskEmail(email));
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await dbHelpers.verifyPassword(user.id, password);
    if (!isValid) {
        console.log('❌ Invalid password for:', maskEmail(email));
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

    console.log('✅ User logged in:', maskEmail(email));

    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            email_code: user.email_code,
            plan: user.plan,
            language: user.language,
            kindle_email: user.kindle_email,
            trial_end_date: user.trial_end_date,
            email_verified: !!user.email_verified,
            auto_tag_enabled: user.auto_tag_enabled !== false
        }
    });
}));

// Email verification - user clicks link from email
app.get('/api/auth/verify-email', asyncHandler(async (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/?error=invalid_token');
    const user = await dbHelpers.verifyEmail(token);
    if (user) {
        console.log('✅ Email verified:', maskEmail(user.email));
        res.redirect('/app.html?verified=true');
    } else {
        res.redirect('/app.html?error=invalid_token');
    }
}));

// Resend verification email
app.post('/api/auth/resend-verification', authMiddleware, asyncHandler(async (req, res) => {
    const user = await dbHelpers.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified) return res.json({ success: true, message: 'Already verified' });
    if (!emailEnabled) return res.status(503).json({ error: 'Email service not configured' });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await dbHelpers.createEmailVerification(user.id, verifyToken, expiresAt);
    const verifyUrl = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/api/auth/verify-email?token=${verifyToken}`;
    await sendEmail({
        to: user.email,
        subject: 'BREVIS - Verify your email',
        html: `
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #2C3544; margin-bottom: 16px;">Verify your email</h2>
                <p style="color: #4A5568; line-height: 1.6;">Click the button below to verify your email address:</p>
                <a href="${verifyUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #2C3544; color: #FFF; text-decoration: none; border-radius: 8px; font-weight: 600;">Verify Email</a>
                <p style="color: #7A8599; font-size: 13px;">This link expires in 24 hours.</p>
            </div>
        `
    });
    console.log('✅ Verification email resent to:', maskEmail(user.email));
    res.json({ success: true });
}));

// Password reset - request
app.post('/api/auth/forgot-password', authLimiter, [
    body('email').isEmail().normalizeEmail()
], asyncHandler(async (req, res) => {
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

    if (emailEnabled) {
        await sendEmail({
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
        console.log('✅ Password reset email sent to:', maskEmail(email));
    } else {
        console.log('⚠️ SMTP not configured. Password reset email could not be sent for user:', maskEmail(email));
    }

    res.json({ success: true });
}));

// Password reset - execute
app.post('/api/auth/reset-password', authLimiter, [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { token, password } = req.body;

    // findValidPasswordReset atomically marks the token as used (prevents race conditions)
    const resetRecord = await dbHelpers.findValidPasswordReset(token);
    if (!resetRecord) {
        return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    await dbHelpers.updatePasswordHash(resetRecord.user_id, password);

    console.log('✅ Password reset for user:', resetRecord.user_id);
    res.json({ success: true });
}));

app.get('/api/auth/me', authMiddleware, asyncHandler(async (req, res) => {
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
            kindle_email: user.kindle_email,
            trial_end_date: user.trial_end_date,
            email_verified: !!user.email_verified,
            auto_tag_enabled: user.auto_tag_enabled !== false
        }
    });
}));

// Update user profile
app.patch('/api/auth/profile', authMiddleware, [
    body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be 1–255 characters'),
    body('kindle_email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Kindle email must be a valid email address'),
    body('language').optional().isIn(['es', 'en']).withMessage('Language must be es or en'),
    body('password').optional({ checkFalsy: true }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('auto_tag_enabled').optional().isBoolean().withMessage('auto_tag_enabled must be boolean')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, kindle_email, language, password, auto_tag_enabled } = req.body;
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
    if (auto_tag_enabled !== undefined) {
        updates.push(`auto_tag_enabled = $${paramIndex++}`);
        values.push(!!auto_tag_enabled);
        // Invalidate the in-memory cache so the next ingest immediately sees the new value
        // instead of waiting for the 5-minute TTL.
        invalidateUserAutoTagCache(req.user.id);
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
            kindle_email: user.kindle_email,
            auto_tag_enabled: user.auto_tag_enabled !== false
        }
    });
}));

app.post('/api/auth/logout', asyncHandler(async (req, res) => {
    // Extract user ID from JWT (if present) and bump token_version
    // to invalidate ALL existing tokens for this user (including other devices).
    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = verifyToken(token);
            if (decoded && decoded.id) {
                const db = dbHelpers.getDb();
                await db.query(
                    'UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1',
                    [decoded.id]
                );
                console.log('✅ Token version bumped for user:', decoded.id);
            }
        } catch (e) {
            // Token may be expired/invalid — still clear the cookie
            console.warn('⚠️ Could not bump token_version on logout:', e.message);
        }
    }
    res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
    console.log('✅ User logged out');
    res.json({ success: true });
}));

// ============= GOOGLE OAUTH =============

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/google/callback`;

app.get('/api/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
        return res.status(500).json({ error: 'Google OAuth not configured' });
    }
    const state = crypto.randomBytes(32).toString('hex');
    res.cookie('oauth_state', state, {
        httpOnly: true,
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    });
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
        state
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', asyncHandler(async (req, res) => {
    try {
        const { code, state } = req.query;
        const savedState = req.cookies.oauth_state;
        res.clearCookie('oauth_state');

        if (!code || !state || !savedState || state !== savedState) {
            return res.redirect('/?error=google_auth_failed');
        }

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

        console.log('🔐 Google login for:', maskEmail(profile.email));

        // Find or create user
        let user = await dbHelpers.findUserByEmail(profile.email);
        if (!user) {
            const randomPass = crypto.randomBytes(32).toString('hex');
            const accessCode = req.cookies.brevis_access_code || '';
            const plan = (process.env.ACCESS_CODE && accessCode === process.env.ACCESS_CODE) ? 'premium' : 'pro';
            user = await dbHelpers.createUser(profile.email, randomPass, profile.name || profile.email.split('@')[0], plan);
            res.clearCookie('brevis_access_code');
            console.log('✅ New user created via Google:', maskEmail(profile.email), '| plan:', plan);
        }
        // Google-authenticated emails are inherently verified
        if (!user.email_verified) {
            await dbHelpers.updateUser(user.id, { email_verified: 1 });
        }

        const token = generateToken(user);
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        console.log('✅ Google login successful:', maskEmail(profile.email));
        res.redirect('/');
    } catch (error) {
        console.error('❌ Google OAuth error:', error);
        res.redirect('/?error=google_auth_failed');
    }
}));

// ============= NEWSLETTER ROUTES =============

app.get('/api/newsletters', authMiddleware, newsletterCrudLimiter, asyncHandler(async (req, res) => {
    const newsletters = await dbHelpers.getNewsletters(req.user.id);
    res.json(newsletters);
}));

app.get('/api/newsletters/:id', authMiddleware, newsletterCrudLimiter, asyncHandler(async (req, res) => {
    const newsletter = await dbHelpers.getNewsletter(parseInt(req.params.id), req.user.id);
    if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
    }
    res.json(newsletter);
}));

app.post('/api/newsletters', authMiddleware, [
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

app.post('/api/newsletters/upload-pdf', authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
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

// Word/DOCX upload for News Builder templates
app.post('/api/news-builder/upload-word', importLimiter, authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
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
app.post('/api/news-builder/upload-file', importLimiter, authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
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

// === URL Import & Bookmarklet ===

const dnsLookup = promisify(dns.lookup);

function isPrivateIP(ip) {
    if (typeof ip !== 'string') return true;
    const family = net.isIP(ip);
    if (family === 4) {
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 127 ||
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 169 && parts[1] === 254) || // link-local incl. AWS/GCP metadata 169.254.169.254
            (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // CGNAT
            parts[0] === 0
        );
    }
    if (family === 6) {
        const lower = ip.toLowerCase();
        // ::1, unspecified, link-local fe80::/10, unique-local fc00::/7,
        // and IPv4-mapped (::ffff:0:0/96) — also treat any '::ffff:'-mapped private v4 as private.
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('::ffff:')) {
            const v4 = lower.slice(7);
            return isPrivateIP(v4);
        }
        return false;
    }
    return true; // unknown family → treat as private
}

/**
 * Validate a URL is safe to fetch from the server.
 * Returns the resolved IP so the caller can pin DNS to it during fetch
 * (closing the DNS-rebinding window between validation and use).
 */
async function validateUrlForFetch(urlString) {
    let parsed;
    try {
        parsed = new URL(urlString);
    } catch {
        return { safe: false, reason: 'Invalid URL' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { safe: false, reason: 'Only HTTP/HTTPS URLs are allowed' };
    }

    const hostname = parsed.hostname;
    if (hostname === 'localhost') {
        return { safe: false, reason: 'Local addresses are not allowed' };
    }
    // Direct-IP hostnames bypass DNS — validate them immediately.
    if (net.isIP(hostname)) {
        if (isPrivateIP(hostname)) {
            return { safe: false, reason: 'URL targets a private IP address' };
        }
        return { safe: true, ip: hostname, family: net.isIP(hostname), parsed };
    }

    try {
        // Resolve all addresses, validate every one (defense against round-robin DNS
        // returning a mix of public and private IPs), then pin to the first.
        const addresses = await dnsLookup(hostname, { all: true });
        if (!addresses.length) {
            return { safe: false, reason: 'Hostname did not resolve' };
        }
        for (const { address } of addresses) {
            if (isPrivateIP(address)) {
                return { safe: false, reason: 'URL resolves to a private IP address' };
            }
        }
        const pinned = addresses[0];
        return { safe: true, ip: pinned.address, family: pinned.family, parsed };
    } catch {
        return { safe: false, reason: 'Could not resolve hostname' };
    }
}

/**
 * Fetch a URL with DNS pinned to the IP that was validated.
 * Closes the DNS-rebinding window: between `validateUrlForFetch` resolving
 * and the actual TCP connect, an attacker-controlled DNS server cannot
 * flip the answer to an internal IP. The pin uses a custom `lookup` on
 * the http(s).Agent so SNI / Host header behavior is unchanged.
 *
 * Throws an Error with code 'URL_BLOCKED' when validation fails.
 */
async function safeFetch(urlString, options = {}) {
    const validation = await validateUrlForFetch(urlString);
    if (!validation.safe) {
        const err = new Error(`URL blocked: ${validation.reason}`);
        err.code = 'URL_BLOCKED';
        err.reason = validation.reason;
        throw err;
    }
    const { ip, family, parsed } = validation;
    const AgentCtor = parsed.protocol === 'https:' ? https.Agent : http.Agent;
    const agent = new AgentCtor({
        keepAlive: false,
        // Pin DNS to the validated IP for this connection. `lookup` is the only
        // resolution that runs after this point.
        lookup: (_hostname, _opts, cb) => cb(null, ip, family || 4),
    });
    return fetch(urlString, { ...options, agent });
}

function detectPlatform(url) {
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
    if (/linkedin\.com/i.test(url)) return 'linkedin';
    return 'unknown';
}

async function fetchGenericContent(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        let response;
        try {
            // safeFetch validates the URL and pins DNS to the validated IP
            // so the connect cannot be redirected to an internal address by
            // an attacker-controlled DNS server between validation and fetch.
            response = await safeFetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0)' },
                redirect: 'manual',
                signal: controller.signal
            });
        } catch (err) {
            if (err?.code === 'URL_BLOCKED') {
                console.error('URL blocked:', url, err.reason);
                return null;
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
        // Reject redirects to prevent SSRF bypass via redirect to internal IP
        if (response.status >= 300 && response.status < 400) return null;
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

async function fetchFullThread(tweetId) {
    // Primary: fxtwitter — single API call, returns thread data if available
    try {
        const res = await fetch(`https://api.fxtwitter.com/x/status/${tweetId}`, {
            headers: { 'User-Agent': 'BREVIS/1.0' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.tweet) {
                const tweet = data.tweet;
                // fxtwitter may include continuation tweets in thread.tweets
                const continuationTweets = tweet.thread?.tweets || [];
                const allTweets = continuationTweets.length > 0
                    ? [tweet, ...continuationTweets]
                    : [tweet];
                return { tweet, thread: allTweets };
            }
        }
    } catch (e) { /* fallback */ }

    // Fallback: syndication API
    try {
        const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`);
        if (res.ok) {
            const synData = await res.json();
            const tweet = {
                id: tweetId,
                text: synData.text || '',
                author: { name: synData.user?.name, screen_name: synData.user?.screen_name },
            };
            return { tweet, thread: [tweet] };
        }
    } catch (e) { /* give up */ }

    return null;
}

app.post('/api/import/url', importLimiter, authMiddleware, asyncHandler(async (req, res) => {
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
                url,
                { source: 'twitter' }
            );

            console.log(`✅ Imported tweet (${thread.length} tweet${thread.length > 1 ? 's' : ''} in thread):`, title);
            // Knowledge Graph: extract entities in background
            setImmediate(() => {
                extractAndStoreGraph(newsletter.id, req.user.id, { language: req.user.language || 'en' })
                    .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
            });
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
                url,
                { source: 'url' }
            );

            console.log(`✅ Imported generic URL:`, genericContent.title);
            // Knowledge Graph: extract entities in background
            setImmediate(() => {
                extractAndStoreGraph(newsletter.id, req.user.id, { language: req.user.language || 'en' })
                    .catch(err => console.error('📊 [Graph] Extraction failed:', err.message));
            });
            res.json(newsletter);
        }
}));

// Bookmarklet saves now go through the regular /api/newsletters endpoint
// via the /bookmarklet-save page (same origin, uses httpOnly cookies)

app.patch('/api/newsletters/:id', authMiddleware, newsletterCrudLimiter, [
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
        updates.is_read = req.body.is_read;
    }

    const updated = await dbHelpers.updateNewsletter(parseInt(req.params.id), updates);
    console.log('✅ Newsletter updated:', req.params.id, updates);
    res.json(updated);
}));

app.delete('/api/newsletters/:id', authMiddleware, newsletterCrudLimiter, asyncHandler(async (req, res) => {
    await dbHelpers.deleteNewsletter(parseInt(req.params.id), req.user.id);
    console.log('✅ Newsletter deleted:', req.params.id);
    res.json({ success: true });
}));

app.post('/api/newsletters/:id/summary', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
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
app.post('/api/newsletters/:id/kindle', authMiddleware, kindleLimiter, asyncHandler(async (req, res) => {
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
app.post('/api/newsletters/:id/audio', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

app.post('/api/newsletters/brief', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

app.post('/api/newsletters/report', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

// ============= NEWS BUILDER ROUTES =============

app.post('/api/news-builder/generate', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

app.post('/api/news-builder/generate-from-project', aiLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

// ============= TAG ROUTES =============

app.get('/api/tags', authMiddleware, asyncHandler(async (req, res) => {
    const tags = await dbHelpers.getTags(req.user.id);
    res.json(tags);
}));

app.post('/api/tags', authMiddleware, [
    body('name').notEmpty().isLength({ max: 100 }).withMessage('Tag name is required (max 100 chars)'),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color must be a hex value like #FF0000')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, color } = req.body;
    const tag = await dbHelpers.createTag(req.user.id, name, color);
    console.log('✅ Tag created:', name);
    res.json(tag);
}));

app.delete('/api/tags/:id', authMiddleware, asyncHandler(async (req, res) => {
    await dbHelpers.deleteTag(parseInt(req.params.id), req.user.id);
    console.log('✅ Tag deleted:', req.params.id);
    res.json({ success: true });
}));

app.post('/api/newsletters/:id/tags/:tagId', tagMutationLimiter, authMiddleware, asyncHandler(async (req, res) => {
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
    const updatedNewsletter = await dbHelpers.getNewsletterWithTags(newsletterId, req.user.id);
    res.json(updatedNewsletter);
}));

app.delete('/api/newsletters/:id/tags/:tagId', tagMutationLimiter, authMiddleware, asyncHandler(async (req, res) => {
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
    const removed = await dbHelpers.removeTagFromNewsletter(newsletterId, tagId);
    // Learn from corrections: if the user removed a tag the auto-tagger had applied,
    // bump the blocklist counter so we stop suggesting that tag for this sender.
    if (removed && removed.auto_tagged && newsletter.sender_key) {
        try {
            await recordAutoTagRemoval(getDb(), req.user.id, newsletter.sender_key, tagId);
        } catch (err) {
            console.error('⚠️  [auto-tag] Failed to record removal:', err.message);
        }
    }
    const updatedNewsletter = await dbHelpers.getNewsletterWithTags(newsletterId, req.user.id);
    res.json(updatedNewsletter);
}));

// ============= PLAN ROUTES =============

app.get('/api/plans', (req, res) => {
    res.json(PLANS);
});

// ============= STRIPE ROUTES =============

const STRIPE_PRICES = {
    // Keep pro for backward compatibility
    pro_month: process.env.STRIPE_PRICE_PRO_MONTHLY,
    pro_year: process.env.STRIPE_PRICE_PRO_ANNUAL,
    // Standard uses same price IDs as pro (rebranded)
    standard_month: process.env.STRIPE_PRICE_PRO_MONTHLY,
    standard_year: process.env.STRIPE_PRICE_PRO_ANNUAL,
    premium_month: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
    premium_year: process.env.STRIPE_PRICE_PREMIUM_ANNUAL
};

// Log Stripe config status at startup
if (process.env.STRIPE_SECRET_KEY) {
    const missingPrices = Object.entries(STRIPE_PRICES)
        .filter(([, v]) => !v)
        .map(([k]) => k);
    if (missingPrices.length > 0) {
        console.warn('⚠️  [Stripe] Missing price IDs for:', missingPrices.join(', '));
        console.warn('   Set STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL, STRIPE_PRICE_PREMIUM_MONTHLY, STRIPE_PRICE_PREMIUM_ANNUAL in env vars.');
    } else {
        console.log('✅ [Stripe] All price IDs configured.');
    }
}

app.post('/api/stripe/checkout', authMiddleware, asyncHandler(async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to your environment variables.' });
    }

    const { plan, interval } = req.body; // plan: 'standard'|'premium' (or 'pro' for legacy), interval: 'month'|'year'
    const priceId = STRIPE_PRICES[`${plan}_${interval}`];

    if (!priceId) {
        const envVar = plan === 'premium'
            ? (interval === 'year' ? 'STRIPE_PRICE_PREMIUM_ANNUAL' : 'STRIPE_PRICE_PREMIUM_MONTHLY')
            : (interval === 'year' ? 'STRIPE_PRICE_PRO_ANNUAL' : 'STRIPE_PRICE_PRO_MONTHLY');
        console.error(`❌ [Stripe] Missing price ID for ${plan}/${interval}. Set ${envVar} in env vars.`);
        return res.status(500).json({ error: `Payment not configured for this plan. Please contact support.` });
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

        const baseUrl = process.env.FRONTEND_URL || 'https://brevisapp.com';

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${baseUrl}/app.html?checkout=success`,
            cancel_url: `${baseUrl}/app.html?checkout=cancel`,
            metadata: { user_id: user.id.toString(), plan },
            subscription_data: { trial_period_days: 14 }
        });

    console.log('✅ Checkout session created for:', maskEmail(user.email), plan, interval);
    res.json({ url: session.url });
}));

app.post('/api/stripe/portal', authMiddleware, asyncHandler(async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    const user = await dbHelpers.findUserById(req.user.id);
    if (!user.stripe_customer_id) {
        return res.status(400).json({ error: 'No subscription found' });
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://brevisapp.com';

    const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: baseUrl
    });

    console.log('✅ Portal session created for:', maskEmail(user.email));
    res.json({ url: session.url });
}));

// Stripe webhook - must use raw body, placed before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
    if (!stripe) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        let event;
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret || !sig) {
            console.error('❌ Stripe webhook secret not configured or signature missing');
            return res.status(400).json({ error: 'Webhook signature verification not configured' });
        }

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('❌ Stripe webhook signature error:', err.message);
            return res.status(400).json({ error: 'Webhook signature verification failed' });
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
                    if (priceId === STRIPE_PRICES.pro_month || priceId === STRIPE_PRICES.pro_year ||
                        priceId === STRIPE_PRICES.standard_month || priceId === STRIPE_PRICES.standard_year) {
                        plan = 'standard'; // Use 'standard' as the new name (pro is now standard)
                    } else if (priceId === STRIPE_PRICES.premium_month || priceId === STRIPE_PRICES.premium_year) {
                        plan = 'premium';
                    }
                    await dbHelpers.updateUser(user.id, {
                        plan,
                        stripe_subscription_id: subscription.id
                    });
                    console.log('✅ Subscription updated:', maskEmail(user.email), plan);
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
                    console.log('✅ Subscription cancelled, downgraded:', maskEmail(user.email));
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(invoice.customer);
                if (user) {
                    console.warn('⚠️ Payment failed for:', maskEmail(user.email), '| attempt:', invoice.attempt_count);
                    // Downgrade after 3 failed attempts
                    if (invoice.attempt_count >= 3) {
                        await dbHelpers.updateUser(user.id, { plan: 'free' });
                        console.log('❌ Downgraded to free after 3 failed payments:', maskEmail(user.email));
                    }
                }
                break;
            }

            case 'customer.subscription.paused': {
                const subscription = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(subscription.customer);
                if (user) {
                    await dbHelpers.updateUser(user.id, { plan: 'free' });
                    console.log('⏸️ Subscription paused, downgraded:', maskEmail(user.email));
                }
                break;
            }

            default: {
                // Stripe sends ~100+ event types; we only care about the subset above.
                // Log unhandled types so we notice when Stripe ships something new
                // we should react to (e.g., 'invoice.upcoming' for dunning UX).
                console.warn('[stripe-webhook] unhandled event type:', event.type);
                break;
            }
        }

    res.json({ received: true });
}));

app.get('/api/config/email-domain', (req, res) => {
    res.json({
        domain: process.env.EMAIL_DOMAIN || 'mail.brevisapp.com'
    });
});

// ============= EMAIL WEBHOOK =============

app.post('/api/webhook/email', webhookLimiter, upload.none(), asyncHandler(async (req, res) => {
    // Verify webhook secret via x-webhook-secret header ONLY (URL/query params leak into server logs)
        const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('❌ Email webhook: EMAIL_WEBHOOK_SECRET not configured — rejecting request');
            return res.status(503).json({ error: 'Webhook not configured' });
        }
        const providedSecret = req.headers['x-webhook-secret'];
        if (providedSecret !== webhookSecret) {
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

// Health check
// ============= WAITLIST =============

app.post('/api/waitlist', waitlistLimiter, [
    body('email').isEmail().normalizeEmail()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    await dbHelpers.addToWaitlist(req.body.email);
    res.json({ success: true });
}));

app.get('/health', async (req, res) => {
    const health = { status: 'ok', uptime: Math.floor(process.uptime()) };
    try {
        await getDb().query('SELECT 1');
        health.db = 'connected';
    } catch {
        health.db = 'disconnected';
        health.status = 'degraded';
    }
    health.stripe = stripe ? 'configured' : 'not configured';
    health.email = emailEnabled ? 'configured' : 'not configured';
    res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ============= SUBSCRIPTION / RSS ROUTES =============

const rssParser = new Parser();

/**
 * SSRF-safe wrapper around rssParser.parseURL.
 * `rssParser.parseURL` does its own DNS lookup, which would re-open the
 * rebinding window we close in safeFetch. Fetch the body via safeFetch
 * (DNS pinned to validated IP) and feed it to parseString instead.
 */
async function safeParseRssUrl(url, { timeoutMs = 20000 } = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await safeFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0; +https://brevisapp.com)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
            },
            redirect: 'manual',
            signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
            throw new Error(`RSS feed redirected (status ${response.status}); refusing to follow`);
        }
        if (!response.ok) {
            throw new Error(`RSS feed returned status ${response.status}`);
        }
        const body = await response.text();
        return await rssParser.parseString(body);
    } finally {
        clearTimeout(timeoutId);
    }
}

app.get('/api/subscriptions', authMiddleware, asyncHandler(async (req, res) => {
    const db = dbHelpers.getDb();
    const result = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
}));

app.post('/api/subscriptions', subscriptionLimiter, authMiddleware, asyncHandler(async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Normalize URL: add /feed if it's a substack URL without it
    url = url.trim().replace(/\/+$/, '');
    if (url.includes('substack.com') && !url.endsWith('/feed')) {
        url = url + '/feed';
    }
    if (!url.startsWith('http')) url = 'https://' + url;

    // Validate it's a working RSS feed (safeParseRssUrl performs SSRF validation
    // and DNS pinning internally — no separate validateUrlForFetch needed).
    let feedName;
    try {
        const feed = await safeParseRssUrl(url);
        feedName = feed.title || url.replace(/https?:\/\//, '').split('/')[0];
    } catch (e) {
        if (e?.code === 'URL_BLOCKED') {
            return res.status(400).json({ error: `Invalid feed URL: ${e.reason}` });
        }
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
}));

app.post('/api/subscriptions/import-opml', subscriptionLimiter, authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
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
                // safeParseRssUrl performs SSRF validation + DNS pinning;
                // URL_BLOCKED errors fall through to the catch and skip the feed.
                const feed = await safeParseRssUrl(url);
                if (feed.title) feedName = feed.title;
            } catch (e) {
                if (e?.code === 'URL_BLOCKED') {
                    console.warn('⚠️  OPML import: blocked URL:', url, e.reason);
                    continue;
                }
                /* use URL as name on benign parse failures */
            }

            await db.query('INSERT INTO subscriptions (user_id, url, name) VALUES ($1, $2, $3)', [req.user.id, url, feedName]);
            added++;
        } catch (e) { /* skip invalid feeds */ }
    }

    console.log('✅ OPML import: added', added, 'feeds for user', req.user.id);
    res.json({ added, total: urls.length });
}));

app.delete('/api/subscriptions/:id', subscriptionLimiter, authMiddleware, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const db = dbHelpers.getDb();
    await db.query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
}));

// RSS fetch cron - runs every 30 minutes
let rssCronRunning = false;
async function fetchAllRSSFeeds() {
    if (rssCronRunning) {
        console.log('⏭️  RSS cron skipped — previous run still in progress');
        return;
    }
    rssCronRunning = true;
    try {
        const db = dbHelpers.getDb();
        const subs = await db.query('SELECT s.*, u.id as uid FROM subscriptions s JOIN users u ON s.user_id = u.id');

        for (const sub of subs.rows) {
            try {
                // safeParseRssUrl re-validates the URL on every cron run (preventing
                // DNS rebinding via subscriptions that were valid at signup but later
                // pointed to internal IPs) and pins DNS to the validated IP.
                const feed = await safeParseRssUrl(sub.url, { timeoutMs: 20000 });
                const sender = feed.title || sub.name || 'RSS Feed';

                for (const item of (feed.items || []).slice(0, 10)) {
                    // Deduplicate by URL (item.link) — title-based dedup was fragile and caused missed updates
                    const itemUrl = item.link || '';
                    if (itemUrl) {
                        const existing = await db.query(
                            'SELECT id FROM newsletters WHERE user_id = $1 AND url = $2',
                            [sub.user_id, itemUrl]
                        );
                        if (existing.rows.length > 0) continue;
                    } else {
                        // Fallback: title+sender dedup for items with no URL
                        const existing = await db.query(
                            'SELECT id FROM newsletters WHERE user_id = $1 AND title = $2 AND sender = $3',
                            [sub.user_id, item.title || 'Untitled', sender]
                        );
                        if (existing.rows.length > 0) continue;
                    }

                    // Route through the helper so sender_key is derived and auto-tagging
                    // runs on RSS items just like every other ingest path.
                    await dbHelpers.createNewsletter(
                        sub.user_id,
                        item.title || 'Untitled',
                        sender,
                        item.content || item.contentSnippet || '',
                        item.link || '',
                        { source: 'rss', feedUrl: sub.url }
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
    } finally {
        rssCronRunning = false;
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

// API 404 handler — return JSON, not HTML
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// SPA fallback - serve app.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// ============= EXPRESS ERROR MIDDLEWARE =============

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const statusCode = err.statusCode || 500;
    const isOperational = err.isOperational || false;

    log.error(`${req.method} ${req.path}`, {
        reqId: req.id,
        status: statusCode,
        message: err.message,
        ...(statusCode >= 500 && !isOperational ? { stack: err.stack } : {})
    });

    const clientMessage = isOperational
        ? err.message
        : 'An unexpected error occurred. Please try again.';

    res.status(statusCode).json({
        error: clientMessage,
        ...(err.code && err.code !== 'INTERNAL_ERROR' ? { code: err.code } : {})
    });
});

// ============= GLOBAL ERROR HANDLERS =============

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
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
║   • Free: No AI features (hidden from web)            ║
║   • Standard: Summaries + Briefs ($12/mo, 15d trial) ║
║   • Premium: + Reports ($29/mo, 15d trial)            ║
╚════════════════════════════════════════════════════════╝
    `);
}); 
