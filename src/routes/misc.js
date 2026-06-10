import express from 'express';
import { body, validationResult } from 'express-validator';

import { dbHelpers, getDb } from '../../database.js';
import { asyncHandler } from '../utils/errors.js';
import { emailEnabled } from '../services/email.js';
import { stripe } from '../clients.js';
import { waitlistLimiter } from '../middleware/rate-limits.js';

export function createMiscRouter() {
const router = express.Router();

// Health check
// ============= WAITLIST =============

router.post('/api/waitlist', waitlistLimiter, [
    body('email').isEmail().normalizeEmail()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    await dbHelpers.addToWaitlist(req.body.email);
    res.json({ success: true });
}));

router.get('/health', async (req, res) => {
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

return router;
}
