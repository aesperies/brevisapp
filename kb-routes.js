/**
 * kb-routes.js
 *
 * Express router for all Knowledge Base API endpoints.
 * KB creation requires Standard plan minimum; querying requires Premium.
 *
 * INTEGRATION INSTRUCTIONS:
 * In server.js, add:
 *   import { createKBRouter } from './kb-routes.js';
 *   import rateLimit from 'express-rate-limit';
 *   // After authMiddleware is defined:
 *   app.use('/api/kb', authMiddleware, createKBRouter());
 */

import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
    compileKB,
    queryKB,
    getKBWithArticles,
    listUserKBs,
    getCompilationStatus,
    getKBQueryHistory
} from './kb-service.js';
import { createKB, deleteKB, getUserKBs } from './kb-database.js';

// ============= PLAN GATES =============
// Standard: KB creation, compilation, listing
// Premium: KB querying

function requirePlan(minPlan) {
    return (req, res, next) => {
        const userPlan = req.user?.plan || 'free';
        const planHierarchy = { free: 0, standard: 1, pro: 1, premium: 2 };
        const minLevel = planHierarchy[minPlan] || 0;
        const userLevel = planHierarchy[userPlan] || 0;

        // Check trial period
        if (userLevel < minLevel) {
            const trialEnd = req.user?.trial_end_date ? new Date(req.user.trial_end_date) : null;
            const inTrial = trialEnd && trialEnd > new Date();
            if (!inTrial) {
                return res.status(403).json({
                    error: `This feature requires a ${minPlan} plan or higher`,
                    code: 'PLAN_REQUIRED',
                    requiredPlan: minPlan,
                    currentPlan: userPlan
                });
            }
        }
        next();
    };
}

// ============= RATE LIMITERS =============

const kbReadLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 60,                    // 60 reads per minute
    message: { error: 'Too many KB requests', code: 'RATE_LIMITED' }
});

const kbCompileLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    max: 5,                     // 5 compilations per hour (expensive)
    message: { error: 'Too many compilation requests, please wait', code: 'RATE_LIMITED' }
});

const kbQueryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 30,                    // 30 queries per 15 minutes
    message: { error: 'Too many KB queries, please wait', code: 'RATE_LIMITED' }
});

// ============= IN-MEMORY COMPILATION TASKS =============

const compilationTasks = new Map();

function createCompilationTask(taskId, userId, kbId) {
    const task = {
        taskId,
        userId,
        kbId,
        status: 'running',
        progress: 0,
        articlesGenerated: 0,
        result: null,
        error: null,
        startedAt: new Date().toISOString()
    };
    compilationTasks.set(taskId, task);

    // Auto-cleanup after 10 minutes
    setTimeout(() => compilationTasks.delete(taskId), 10 * 60 * 1000);

    return task;
}

// ============= ROUTER =============

export function createKBRouter() {
    const router = Router();

    // All KB endpoints require at least Standard plan
    router.use(requirePlan('standard'));

    // --- Create KB ---
    router.post('/', kbReadLimiter, [
        body('tag_id').isInt().toInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid tag_id', code: 'VALIDATION_ERROR' });

        try {
            // Verify tag exists and belongs to user (basic validation)
            const kb = await createKB(req.user.id, req.body.tag_id);
            if (!kb) return res.status(404).json({ error: 'Tag not found or does not belong to you', code: 'NOT_FOUND' });
            res.status(201).json(kb);
        } catch (error) {
            console.error('📚 [KB API] Create KB error:', error.message);
            res.status(500).json({ error: 'Failed to create knowledge base', code: 'INTERNAL_ERROR' });
        }
    });

    // --- List User's KBs ---
    router.get('/', kbReadLimiter, async (req, res) => {
        try {
            const kbs = await listUserKBs(req.user.id);
            res.json(kbs);
        } catch (error) {
            console.error('📚 [KB API] List KBs error:', error.message);
            res.status(500).json({ error: 'Failed to load knowledge bases', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Get KB with Articles ---
    router.get('/:id', kbReadLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid KB ID', code: 'VALIDATION_ERROR' });

        try {
            const kb = await getKBWithArticles(req.user.id, parseInt(req.params.id));
            if (!kb) return res.status(404).json({ error: 'Knowledge base not found', code: 'NOT_FOUND' });
            res.json(kb);
        } catch (error) {
            console.error('📚 [KB API] Get KB error:', error.message);
            res.status(500).json({ error: 'Failed to load knowledge base', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Start Compilation (Async — returns taskId immediately) ---
    router.post('/:id/compile', kbCompileLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid KB ID', code: 'VALIDATION_ERROR' });

        try {
            const kbId = parseInt(req.params.id);
            const userId = req.user.id;
            const kb = await getKBWithArticles(userId, kbId);
            if (!kb) return res.status(404).json({ error: 'Knowledge base not found', code: 'NOT_FOUND' });

            const taskId = `compile-${userId}-${kbId}-${Date.now()}`;

            // Create task and return immediately
            const task = createCompilationTask(taskId, userId, kbId);
            res.json({ taskId, status: 'started', message: 'Compilation started' });

            // Run compilation in background
            setImmediate(async () => {
                try {
                    task.progress = 10;
                    const result = await compileKB(
                        userId,
                        kb.tag_id,
                        req.user.language || 'en'
                    );
                    task.status = 'completed';
                    task.progress = 100;
                    task.articlesGenerated = result.articlesGenerated || 0;
                    task.result = result;
                } catch (err) {
                    task.status = 'failed';
                    task.error = err.message;
                    console.error('📚 [KB API] Background compilation failed:', err.message);
                }
            });
        } catch (error) {
            console.error('📚 [KB API] Start compilation error:', error.message);
            res.status(500).json({ error: 'Failed to start compilation', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Check Compilation Task Status ---
    router.get('/:id/compile/status', kbReadLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid KB ID', code: 'VALIDATION_ERROR' });

        try {
            const taskId = req.query.taskId;
            if (!taskId) return res.status(400).json({ error: 'Missing taskId query parameter', code: 'VALIDATION_ERROR' });

            const task = compilationTasks.get(taskId);
            if (!task) return res.status(404).json({ error: 'Task not found or expired', code: 'NOT_FOUND' });
            if (task.userId !== req.user.id) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });

            const status = await getCompilationStatus(taskId) || task;
            res.json(status);
        } catch (error) {
            console.error('📚 [KB API] Get compilation status error:', error.message);
            res.status(500).json({ error: 'Failed to get compilation status', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Query KB (Premium) ---
    router.post('/:id/query', requirePlan('premium'), kbQueryLimiter, [
        param('id').isInt(),
        body('question').isString().isLength({ min: 3, max: 500 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid question', code: 'VALIDATION_ERROR' });

        try {
            const kbId = parseInt(req.params.id);
            const kb = await getKBWithArticles(req.user.id, kbId);
            if (!kb) return res.status(404).json({ error: 'Knowledge base not found', code: 'NOT_FOUND' });

            const result = await queryKB(
                req.user.id,
                kbId,
                req.body.question,
                req.user.language || 'en'
            );

            res.json({
                answer: result.answer,
                citations: result.citations || [],
                qaId: result.qaId
            });
        } catch (error) {
            console.error('📚 [KB API] Query KB error:', error.message);
            res.status(500).json({ error: 'Query failed', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Get Q&A History ---
    router.get('/:id/qa', kbReadLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid KB ID', code: 'VALIDATION_ERROR' });

        try {
            const kbId = parseInt(req.params.id);
            const kb = await getKBWithArticles(req.user.id, kbId);
            if (!kb) return res.status(404).json({ error: 'Knowledge base not found', code: 'NOT_FOUND' });

            const history = await getKBQueryHistory(
                req.user.id,
                kbId,
                {
                    limit: Math.min(parseInt(req.query.limit) || 50, 200),
                    offset: parseInt(req.query.offset) || 0
                }
            );

            res.json(history);
        } catch (error) {
            console.error('📚 [KB API] Get Q&A history error:', error.message);
            res.status(500).json({ error: 'Failed to load Q&A history', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Delete KB ---
    router.delete('/:id', kbReadLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid KB ID', code: 'VALIDATION_ERROR' });

        try {
            const kbId = parseInt(req.params.id);
            const kb = await getKBWithArticles(req.user.id, kbId);
            if (!kb) return res.status(404).json({ error: 'Knowledge base not found', code: 'NOT_FOUND' });

            await deleteKB(req.user.id, kbId);
            res.json({ success: true });
        } catch (error) {
            console.error('📚 [KB API] Delete KB error:', error.message);
            res.status(500).json({ error: 'Failed to delete knowledge base', code: 'INTERNAL_ERROR' });
        }
    });

    return router;
}
