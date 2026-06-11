import crypto from 'crypto';
import express from 'express';
import { body, validationResult } from 'express-validator';

import { dbHelpers, invalidateUserAutoTagCache } from '../../database.js';
import { generateToken, verifyToken } from '../../auth.js';
import { maskEmail } from '../utils/logger.js';
import { asyncHandler } from '../utils/errors.js';
import { sendEmail, emailEnabled } from '../services/email.js';
import { authMiddleware } from '../middleware/auth.js';
import { authLimiter, registerLimiter } from '../middleware/rate-limits.js';

export function createAuthRouter() {
const router = express.Router();

// Verify access code (keeps the code server-side only)
router.post('/api/auth/verify-access-code', authLimiter, async (req, res) => {
    const { code } = req.body;
    if (process.env.ACCESS_CODE && code === process.env.ACCESS_CODE) {
        res.json({ valid: true });
    } else {
        res.status(401).json({ valid: false, error: 'Incorrect code' });
    }
});

router.post('/api/auth/register', registerLimiter, [
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

router.post('/api/auth/login', authLimiter, [
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
router.get('/api/auth/verify-email', asyncHandler(async (req, res) => {
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
router.post('/api/auth/resend-verification', authMiddleware, asyncHandler(async (req, res) => {
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
router.post('/api/auth/forgot-password', authLimiter, [
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
router.post('/api/auth/reset-password', authLimiter, [
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

router.get('/api/auth/me', authMiddleware, asyncHandler(async (req, res) => {
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
router.patch('/api/auth/profile', authMiddleware, [
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

router.post('/api/auth/logout', asyncHandler(async (req, res) => {
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

router.get('/api/auth/google', (req, res) => {
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

router.get('/api/auth/google/callback', asyncHandler(async (req, res) => {
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

return router;
}
