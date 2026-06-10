import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { setupDatabase, createInitialUser } from './database.js';
import { createGraphRouter } from './graph-routes.js';
import { createKBRouter } from './kb-routes.js';
import { createAuthRouter } from './src/routes/auth.js';
import { createNewslettersRouter } from './src/routes/newsletters.js';
import { createNewsBuilderRouter } from './src/routes/news-builder.js';
import { createImportRouter } from './src/routes/import.js';
import { createTagsRouter } from './src/routes/tags.js';
import { createBillingRouter } from './src/routes/billing.js';
import { createWebhooksRouter } from './src/routes/webhooks.js';
import { createMiscRouter } from './src/routes/misc.js';
import { createSubscriptionsRouter } from './src/routes/subscriptions.js';

import { log } from './src/utils/logger.js';
import { startRssCron } from './src/services/rss.js';
import { authMiddleware } from './src/middleware/auth.js';
import { stripe } from './src/clients.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
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

// Knowledge Graph routes
app.use('/api/graph', authMiddleware, createGraphRouter());

// Knowledge Base routes
app.use('/api/kb', authMiddleware, createKBRouter());

app.use(createAuthRouter());
app.use(createNewslettersRouter());
app.use(createNewsBuilderRouter());
app.use(createImportRouter());
app.use(createTagsRouter());
app.use(createBillingRouter());
app.use(createWebhooksRouter());
app.use(createMiscRouter());
app.use(createSubscriptionsRouter());

// RSS fetch cron — every 30 minutes (not under test: timers keep the process alive)
if (process.env.NODE_ENV !== 'test') {
    startRssCron();
}

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

export { app };

if (process.env.NODE_ENV !== 'test') app.listen(PORT, '0.0.0.0', () => {
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
