import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';

import { setupDatabase, generateEmailCode, createInitialUser, dbHelpers } from './database.js';
import { generateToken, authMiddleware } from './auth.js';
import { generateSummary, generateBatchBrief, generateBatchReport, canUserPerformAction, PLANS } from './ai-service.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
await setupDatabase();
await createInitialUser();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(cookieParser());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200
});
app.use('/api/', limiter);

// Helper functions
function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

// ============= AUTH ROUTES =============

app.post('/api/auth/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').trim().isLength({ min: 2 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password, name } = req.body;
    
    try {
        const existingUser = await dbHelpers.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        const emailCode = generateEmailCode();
        
        const user = await dbHelpers.createUser(email, passwordHash, name, emailCode);
        const token = generateToken(user);
        
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });
        
        res.json({ 
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                plan: user.plan,
                newsletters_count: user.newsletters_count,
                newsletters_limit: user.newsletters_limit,
                language: user.language,
                email_code: user.email_code
            },
            token 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration error' });
    }
});

app.post('/api/auth/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    try {
        const user = await dbHelpers.findUserByEmail(email);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = generateToken(user);
        
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });
        
        res.json({ 
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                plan: user.plan,
                newsletters_count: user.newsletters_count,
                newsletters_limit: user.newsletters_limit,
                language: user.language,
                email_code: user.email_code
            },
            token 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    const user = await dbHelpers.findUserById(req.user.id);
    if (user) {
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            plan: user.plan,
            newsletters_count: user.newsletters_count,
            newsletters_limit: user.newsletters_limit,
            language: user.language,
            email_code: user.email_code
        });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Update user settings
app.put('/api/auth/settings', authMiddleware, async (req, res) => {
    const { language } = req.body;
    
    try {
        const updated = await dbHelpers.updateUser(req.user.id, { language });
        res.json({ success: true, language: updated.language });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: 'Error updating settings' });
    }
});

// Continue in next part...

// ============= NEWSLETTER ROUTES =============

app.get('/api/newsletters', authMiddleware, async (req, res) => {
    try {
        const newsletters = await dbHelpers.getUserNewsletters(req.user.id);
        
        // Get tags for each newsletter
        const newslettersWithTags = await Promise.all(
            newsletters.map(async (n) => ({
                ...n,
                tags: await dbHelpers.getNewsletterTags(n.id)
            }))
        );
        
        res.json(newslettersWithTags);
    } catch (error) {
        console.error('Error fetching newsletters:', error);
        res.status(500).json({ error: 'Error fetching newsletters' });
    }
});

app.post('/api/newsletters', authMiddleware, [
    body('title').trim().notEmpty(),
    body('sender').trim().notEmpty(),
    body('content').trim().notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { title, sender, content, url } = req.body;
    
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        // Check if user can add more newsletters
        if (!canUserPerformAction(user, 'add_newsletter')) {
            return res.status(403).json({ 
                error: 'Newsletter limit reached',
                plan: user.plan,
                limit: user.newsletters_limit
            });
        }
        
        const newsletter = await dbHelpers.createNewsletter(
            req.user.id,
            title,
            sender,
            content,
            url
        );
        
        res.json({
            ...newsletter,
            tags: []
        });
    } catch (error) {
        console.error('Error creating newsletter:', error);
        res.status(500).json({ error: 'Error creating newsletter' });
    }
});

app.put('/api/newsletters/:id/read', authMiddleware, async (req, res) => {
    try {
        const newsletter = await dbHelpers.findNewsletter(req.params.id, req.user.id);
        
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        
        const newReadStatus = newsletter.is_read ? 0 : 1;
        const updated = await dbHelpers.updateNewsletter(req.params.id, { is_read: newReadStatus });
        
        res.json({
            ...updated,
            tags: await dbHelpers.getNewsletterTags(updated.id)
        });
    } catch (error) {
        console.error('Error updating newsletter:', error);
        res.status(500).json({ error: 'Error updating newsletter' });
    }
});

app.delete('/api/newsletters/:id', authMiddleware, async (req, res) => {
    try {
        const deleted = await dbHelpers.deleteNewsletter(req.params.id, req.user.id);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting newsletter:', error);
        res.status(500).json({ error: 'Error deleting newsletter' });
    }
});

// ============= TAG ROUTES =============

app.get('/api/tags', authMiddleware, async (req, res) => {
    try {
        const tags = await dbHelpers.getUserTags(req.user.id);
        res.json(tags);
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: 'Error fetching tags' });
    }
});

app.post('/api/tags', authMiddleware, [
    body('name').trim().notEmpty(),
    body('color').isHexColor()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { name, color } = req.body;
    
    try {
        const tag = await dbHelpers.createTag(req.user.id, name, color);
        res.json(tag);
    } catch (error) {
        console.error('Error creating tag:', error);
        res.status(500).json({ error: 'Error creating tag' });
    }
});

app.delete('/api/tags/:id', authMiddleware, async (req, res) => {
    try {
        const deleted = await dbHelpers.deleteTag(req.params.id, req.user.id);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tag:', error);
        res.status(500).json({ error: 'Error deleting tag' });
    }
});

// Add tag to newsletter
app.post('/api/newsletters/:id/tags/:tagId', authMiddleware, async (req, res) => {
    try {
        const newsletter = await dbHelpers.findNewsletter(req.params.id, req.user.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        
        await dbHelpers.addTagToNewsletter(parseInt(req.params.id), parseInt(req.params.tagId));
        
        const tags = await dbHelpers.getNewsletterTags(parseInt(req.params.id));
        res.json({ success: true, tags });
    } catch (error) {
        console.error('Error adding tag:', error);
        res.status(500).json({ error: 'Error adding tag' });
    }
});

// Remove tag from newsletter
app.delete('/api/newsletters/:id/tags/:tagId', authMiddleware, async (req, res) => {
    try {
        await dbHelpers.removeTagFromNewsletter(parseInt(req.params.id), parseInt(req.params.tagId));
        
        const tags = await dbHelpers.getNewsletterTags(parseInt(req.params.id));
        res.json({ success: true, tags });
    } catch (error) {
        console.error('Error removing tag:', error);
        res.status(500).json({ error: 'Error removing tag' });
    }
});

// Get newsletters by tag
app.get('/api/tags/:id/newsletters', authMiddleware, async (req, res) => {
    try {
        const newsletters = await dbHelpers.getNewslettersByTag(req.user.id, req.params.id);
        
        const newslettersWithTags = await Promise.all(
            newsletters.map(async (n) => ({
                ...n,
                tags: await dbHelpers.getNewsletterTags(n.id)
            }))
        );
        
        res.json(newslettersWithTags);
    } catch (error) {
        console.error('Error fetching newsletters by tag:', error);
        res.status(500).json({ error: 'Error fetching newsletters' });
    }
});

// ============= AI ROUTES =============

// Single newsletter summary
app.post('/api/newsletters/:id/summary', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        // Check if user can summarize
        if (!canUserPerformAction(user, 'summarize')) {
            return res.status(403).json({ 
                error: 'Summaries not available in your plan',
                plan: user.plan
            });
        }
        
        const newsletter = await dbHelpers.findNewsletter(req.params.id, req.user.id);
        
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        
        // Return existing summary if available
        if (newsletter.summary) {
            return res.json({ summary: newsletter.summary });
        }
        
        // Generate new summary
        const summary = await generateSummary(newsletter, user.language || 'es');
        
        // Save summary
        await dbHelpers.updateNewsletter(req.params.id, { summary });
        
        res.json({ summary });
    } catch (error) {
        console.error('Error generating summary:', error);
        res.status(500).json({ error: error.message || 'Error generating summary' });
    }
});

// Batch brief (short summary of multiple newsletters)
app.post('/api/newsletters/batch/brief', authMiddleware, async (req, res) => {
    try {
        const { newsletterIds } = req.body;
        
        if (!Array.isArray(newsletterIds) || newsletterIds.length === 0) {
            return res.status(400).json({ error: 'Invalid newsletter IDs' });
        }
        
        const user = await dbHelpers.findUserById(req.user.id);
        
        // Check if user can create briefs
        if (!canUserPerformAction(user, 'summarize')) {
            return res.status(403).json({ 
                error: 'Briefs not available in your plan',
                plan: user.plan
            });
        }
        
        // Get newsletters
        const newsletters = await dbHelpers.findNewslettersByIds(newsletterIds, req.user.id);
        
        if (newsletters.length === 0) {
            return res.status(404).json({ error: 'No newsletters found' });
        }
        
        // Generate brief
        const brief = await generateBatchBrief(newsletters, user.language || 'es');
        
        res.json({ 
            brief,
            count: newsletters.length,
            titles: newsletters.map(n => n.title)
        });
    } catch (error) {
        console.error('Error generating brief:', error);
        res.status(500).json({ error: error.message || 'Error generating brief' });
    }
});

// Batch report (comprehensive analysis of multiple newsletters)
app.post('/api/newsletters/batch/report', authMiddleware, async (req, res) => {
    try {
        const { newsletterIds } = req.body;
        
        if (!Array.isArray(newsletterIds) || newsletterIds.length === 0) {
            return res.status(400).json({ error: 'Invalid newsletter IDs' });
        }
        
        const user = await dbHelpers.findUserById(req.user.id);
        
        // Check if user can create reports
        if (!canUserPerformAction(user, 'report')) {
            return res.status(403).json({ 
                error: 'Reports require Premium plan',
                plan: user.plan
            });
        }
        
        // Get newsletters
        const newsletters = await dbHelpers.findNewslettersByIds(newsletterIds, req.user.id);
        
        if (newsletters.length === 0) {
            return res.status(404).json({ error: 'No newsletters found' });
        }
        
        // Generate report
        const report = await generateBatchReport(newsletters, user.language || 'es');
        
        res.json({ 
            report,
            count: newsletters.length,
            titles: newsletters.map(n => n.title)
        });
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: error.message || 'Error generating report' });
    }
});

// ============= PLAN & SUBSCRIPTION ROUTES =============

// Get plan info
app.get('/api/plans', authMiddleware, async (req, res) => {
    res.json(PLANS);
});

// Get current plan details
app.get('/api/plans/current', authMiddleware, async (req, res) => {
    const user = await dbHelpers.findUserById(req.user.id);
    const plan = PLANS[user.plan];
    
    res.json({
        current: user.plan,
        details: plan,
        usage: {
            newsletters_count: user.newsletters_count,
            newsletters_limit: user.newsletters_limit,
            percentage: user.newsletters_limit > 0 
                ? Math.round((user.newsletters_count / user.newsletters_limit) * 100)
                : 0
        }
    });
});

// Get email domain configuration
app.get('/api/config/email-domain', (req, res) => {
    res.json({
        domain: process.env.EMAIL_DOMAIN || 'newsletters.yourbrief.com'
    });
});

// Upgrade plan (simplified - Stripe integration to be added)
app.post('/api/plans/upgrade', authMiddleware, [
    body('plan').isIn(['pro', 'premium'])
], async (req, res) => {
    const { plan } = req.body;
    
    try {
        const planDetails = PLANS[plan];
        
        // TODO: Integrate with Stripe here
        // For now, just upgrade directly (use this for testing)
        
        const updates = {
            plan: plan,
            newsletters_limit: planDetails.limit
        };
        
        await dbHelpers.updateUser(req.user.id, updates);
        
        res.json({ 
            success: true,
            plan: plan,
            message: 'Plan upgraded successfully'
        });
    } catch (error) {
        console.error('Error upgrading plan:', error);
        res.status(500).json({ error: 'Error upgrading plan' });
    }
});

// ============= EMAIL WEBHOOK =============

app.post('/api/webhook/email', async (req, res) => {
    try {
        const parsed = await simpleParser(req.body);
        
        // Extract email code from recipient (To: field)
        const toEmail = parsed.to?.text || '';
        const match = toEmail.match(/brief-([a-z0-9]+)@/i); // Case insensitive
        
        if (!match) {
            console.log('Invalid recipient format:', toEmail);
            return res.status(400).json({ error: 'Invalid recipient format' });
        }
        
        // Normalize to lowercase
        const emailCode = 'brief-' + match[1].toLowerCase();
        const user = await dbHelpers.findUserByEmailCode(emailCode);
        
        if (!user) {
            console.log('User not found for code:', emailCode);
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if user can add more newsletters
        if (!canUserPerformAction(user, 'add_newsletter')) {
            console.log(`User ${user.email} has reached newsletter limit`);
            return res.status(403).json({ error: 'Newsletter limit reached' });
        }
        
        // Extract URLs from content
        const urls = extractUrls(parsed.text || parsed.html || '');
        
        // Create newsletter
        await dbHelpers.createNewsletter(
            user.id,
            parsed.subject || 'Sin título',
            parsed.from?.text || 'Desconocido',
            parsed.text || parsed.html || '',
            urls[0] || null
        );
        
        console.log(`Newsletter added for user ${user.email} via email`);
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Error processing email' });
    }
});

// ============= SERVER START =============

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║           BREVIS Server                    ║
╠════════════════════════════════════════════════════════╣
║   Server: http://localhost:${PORT}                       ║
║   Database: JSON (db.json)                            ║
║   Features: ✅ Tags ✅ AI ✅ Plans ✅ Multi-lang       ║
║                                                        ║
║   Plans:                                               ║
║   • Free: 10 newsletters/month                        ║
║   • Pro: 31 newsletters + summaries ($9.99)           ║
║   • Premium: Unlimited + reports ($19.99)             ║
╚════════════════════════════════════════════════════════╝
    `);
});
