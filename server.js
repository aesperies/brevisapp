import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { body, validationResult } from 'express-validator';
import { simpleParser } from 'mailparser';

import { setupDatabase, generateEmailCode, createInitialUser, dbHelpers } from './database.js';
import { generateToken, authMiddleware } from './auth.js';
import { generateSummary, generateBatchBrief, generateBatchReport, canUserPerformAction, PLANS } from './ai-service.js';

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

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

// ============= AUTH ROUTES =============

app.post('/api/auth/register', [
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
        const token = generateToken(user.id);
        
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });
        
        console.log('✅ User registered:', email);
        
        res.json({ 
            user: { 
                id: user.id, 
                email: user.email, 
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                newsletters_count: user.newsletters_count,
                newsletters_limit: user.newsletters_limit,
                language: user.language
            } 
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔐 Login attempt:', email);
        
        const user = await dbHelpers.findUserByEmail(email);
        
        if (!user || !await dbHelpers.verifyPassword(password, user.password_hash)) {
            console.log('❌ Invalid credentials:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user.id);
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });
        
        console.log('✅ User logged in:', email);
        
        res.json({ 
            user: { 
                id: user.id, 
                email: user.email, 
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                newsletters_count: user.newsletters_count,
                newsletters_limit: user.newsletters_limit,
                language: user.language
            } 
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        res.json({ 
            user: { 
                id: user.id, 
                email: user.email, 
                name: user.name,
                email_code: user.email_code,
                plan: user.plan,
                newsletters_count: user.newsletters_count,
                newsletters_limit: user.newsletters_limit,
                language: user.language
            } 
        });
    } catch (error) {
        console.error('❌ Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

app.put('/api/auth/settings', authMiddleware, async (req, res) => {
    try {
        const { language } = req.body;
        await dbHelpers.updateUserLanguage(req.user.id, language);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ============= NEWSLETTER ROUTES =============

app.get('/api/newsletters', authMiddleware, async (req, res) => {
    try {
        const newsletters = await dbHelpers.getNewslettersWithTags(req.user.id);
        res.json(newsletters);
    } catch (error) {
        console.error('❌ Get newsletters error:', error);
        res.status(500).json({ error: 'Failed to get newsletters' });
    }
});

app.post('/api/newsletters', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        if (!canUserPerformAction(user, 'add_newsletter')) {
            return res.status(403).json({ error: 'Newsletter limit reached', plan: user.plan });
        }

        const { title, sender, content, url } = req.body;
        const newsletter = await dbHelpers.createNewsletter(req.user.id, title, sender, content, url);
        console.log('✅ Newsletter created:', title);
        res.json(newsletter);
    } catch (error) {
        console.error('❌ Create newsletter error:', error);
        res.status(500).json({ error: 'Failed to create newsletter' });
    }
});

app.put('/api/newsletters/:id/read', authMiddleware, async (req, res) => {
    try {
        const newsletter = await dbHelpers.toggleNewsletterRead(parseInt(req.params.id), req.user.id);
        res.json(newsletter);
    } catch (error) {
        console.error('❌ Toggle read error:', error);
        res.status(500).json({ error: 'Failed to toggle read status' });
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

// ============= AI ROUTES =============

app.post('/api/newsletters/:id/summary', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        if (!canUserPerformAction(user, 'generate_summary')) {
            return res.status(403).json({ error: 'Upgrade required', plan: user.plan });
        }

        const newsletter = await dbHelpers.findNewsletterById(parseInt(req.params.id));
        const summary = await generateSummary(newsletter.content, user.language);
        
        await dbHelpers.updateNewsletterSummary(newsletter.id, summary);
        console.log('✅ Summary generated for:', newsletter.title);
        res.json({ summary });
    } catch (error) {
        console.error('❌ Generate summary error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

app.post('/api/newsletters/batch/brief', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        if (!canUserPerformAction(user, 'generate_brief')) {
            return res.status(403).json({ error: 'Upgrade required', plan: user.plan });
        }

        const { newsletterIds } = req.body;
        const newsletters = await Promise.all(newsletterIds.map(id => dbHelpers.findNewsletterById(id)));
        
        const brief = await generateBatchBrief(newsletters, user.language);
        console.log('✅ Brief generated for', newsletters.length, 'newsletters');
        res.json({ brief, count: newsletters.length, titles: newsletters.map(n => n.title) });
    } catch (error) {
        console.error('❌ Generate brief error:', error);
        res.status(500).json({ error: 'Failed to generate brief' });
    }
});

app.post('/api/newsletters/batch/report', authMiddleware, async (req, res) => {
    try {
        const user = await dbHelpers.findUserById(req.user.id);
        
        if (!canUserPerformAction(user, 'generate_report')) {
            return res.status(403).json({ error: 'Upgrade required', plan: user.plan });
        }

        const { newsletterIds } = req.body;
        const newsletters = await Promise.all(newsletterIds.map(id => dbHelpers.findNewsletterById(id)));
        
        const report = await generateBatchReport(newsletters, user.language);
        console.log('✅ Report generated for', newsletters.length, 'newsletters');
        res.json({ report, count: newsletters.length, titles: newsletters.map(n => n.title) });
    } catch (error) {
        console.error('❌ Generate report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ============= TAG ROUTES =============

app.get('/api/tags', authMiddleware, async (req, res) => {
    try {
        const tags = await dbHelpers.getUserTags(req.user.id);
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
        await dbHelpers.addTagToNewsletter(parseInt(req.params.id), parseInt(req.params.tagId));
        const newsletter = await dbHelpers.getNewsletterWithTags(parseInt(req.params.id));
        res.json(newsletter);
    } catch (error) {
        console.error('❌ Add tag error:', error);
        res.status(500).json({ error: 'Failed to add tag' });
    }
});

app.delete('/api/newsletters/:id/tags/:tagId', authMiddleware, async (req, res) => {
    try {
        await dbHelpers.removeTagFromNewsletter(parseInt(req.params.id), parseInt(req.params.tagId));
        const newsletter = await dbHelpers.getNewsletterWithTags(parseInt(req.params.id));
        res.json(newsletter);
    } catch (error) {
        console.error('❌ Remove tag error:', error);
        res.status(500).json({ error: 'Failed to remove tag' });
    }
});

// ============= PLAN ROUTES =============

app.get('/api/plans', (req, res) => {
    res.json(PLANS);
});

app.get('/api/plans/current', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
        console.error('❌ Get current plan error:', error);
        res.status(500).json({ error: 'Failed to get plan' });
    }
});

app.post('/api/plans/upgrade', authMiddleware, async (req, res) => {
    try {
        const { plan } = req.body;
        await dbHelpers.upgradePlan(req.user.id, plan);
        console.log('✅ Plan upgraded to:', plan);
        res.json({ success: true, plan });
    } catch (error) {
        console.error('❌ Upgrade plan error:', error);
        res.status(500).json({ error: 'Failed to upgrade plan' });
    }
});

app.get('/api/config/email-domain', (req, res) => {
    res.json({
        domain: process.env.EMAIL_DOMAIN || 'newsletters.brevisapp.com'
    });
});

// ============= EMAIL WEBHOOK =============

app.post('/api/webhook/email', async (req, res) => {
    try {
        const parsed = await simpleParser(req.body);
        
        const toEmail = parsed.to?.text || '';
        const match = toEmail.match(/brief-([a-z0-9]+)@/i);
        
        if (!match) {
            console.log('❌ Invalid recipient format:', toEmail);
            return res.status(400).json({ error: 'Invalid recipient format' });
        }
        
        const emailCode = 'brief-' + match[1].toLowerCase();
        const user = await dbHelpers.findUserByEmailCode(emailCode);
        
        if (!user) {
            console.log('❌ User not found for code:', emailCode);
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (!canUserPerformAction(user, 'add_newsletter')) {
            console.log('❌ User reached limit:', user.email);
            return res.status(403).json({ error: 'Newsletter limit reached' });
        }
        
        const urls = extractUrls(parsed.text || parsed.html || '');
        
        await dbHelpers.createNewsletter(
            user.id,
            parsed.subject || 'Sin título',
            parsed.from?.text || 'Desconocido',
            parsed.text || parsed.html || '',
            urls[0] || null
        );
        
        console.log('✅ Newsletter added via email for:', user.email);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Error processing email' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'BREVIS is running' });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============= SERVER START =============

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                    BREVIS Server                       ║
╠════════════════════════════════════════════════════════╣
║   Server: http://0.0.0.0:${PORT}                         ║
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
