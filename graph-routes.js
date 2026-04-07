/**
 * graph-routes.js
 *
 * Express router for all knowledge graph API endpoints.
 * No free tier — all graph features require Standard or Premium.
 *
 * INTEGRATION INSTRUCTIONS:
 * In server.js, add:
 *   import { createGraphRouter } from './graph-routes.js';
 *   import rateLimit from 'express-rate-limit';
 *   // After authMiddleware is defined:
 *   app.use('/api/graph', authMiddleware, createGraphRouter());
 */

import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
    getGraphData,
    getEntityDetail,
    getGraphStats,
    getCommunities,
    updateCommunities,
    mergeNodes,
    deleteNode,
    updateNode,
    getNewsletterEntities
} from './graph-service.js';
import { extractAndStoreGraph, batchExtract } from './graph-extractor.js';
import { listProfiles, createProfile, applyPresetProfile, deleteProfile } from './graph-profiles.js';
import { queryGraphNaturalLanguage } from './graph-ai.js';

// ============= PLAN GATES =============
// Standard: full graph access, auto-extraction, preset profiles
// Premium: NL queries, custom profiles, graph reports

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

// ============= RATE LIMITERS (Security fix) =============

const graphReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 120,                   // 120 reads per 15 min
    message: { error: 'Too many graph requests', code: 'RATE_LIMITED' }
});

const graphWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,                    // 60 writes per 15 min
    message: { error: 'Too many graph modifications', code: 'RATE_LIMITED' }
});

const extractionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,                    // 30 extractions per 15 min (Claude API calls)
    message: { error: 'Too many extraction requests, please wait', code: 'RATE_LIMITED' }
});

// ============= IN-MEMORY EXTRACTION TASKS (DX fix: async extraction) =============

const extractionTasks = new Map();

function createExtractionTask(taskId, userId, newsletterId) {
    const task = {
        taskId,
        userId,
        newsletterId,
        status: 'running',
        progress: 0,
        result: null,
        error: null,
        startedAt: new Date().toISOString()
    };
    extractionTasks.set(taskId, task);

    // Auto-cleanup after 10 minutes
    setTimeout(() => extractionTasks.delete(taskId), 10 * 60 * 1000);

    return task;
}

// ============= ROUTER =============

export function createGraphRouter() {
    const router = Router();

    // All graph endpoints require at least Standard plan
    router.use(requirePlan('standard'));

    // --- Graph Stats ---
    router.get('/stats', graphReadLimiter, async (req, res) => {
        try {
            const stats = await getGraphStats(req.user.id);
            res.json(stats);
        } catch (error) {
            console.error('📊 [Graph API] Stats error:', error.message);
            res.status(500).json({ error: 'Failed to load graph stats', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Full Graph Data ---
    router.get('/data', graphReadLimiter, async (req, res) => {
        try {
            const filters = {
                nodeTypes: req.query.types ? req.query.types.split(',') : null,
                communityId: req.query.community !== undefined ? parseInt(req.query.community) : null,
                search: req.query.search || null,
                dateFrom: req.query.from || null,
                dateTo: req.query.to || null,
                relationships: req.query.relationships ? req.query.relationships.split(',') : null,
                minMentions: req.query.minMentions ? parseInt(req.query.minMentions) : null,
                includeInferred: req.query.includeInferred !== 'false',
                limit: Math.min(parseInt(req.query.limit) || 500, 1000)
            };

            const data = await getGraphData(req.user.id, filters);
            res.json(data);
        } catch (error) {
            console.error('📊 [Graph API] Data error:', error.message);
            res.status(500).json({ error: 'Failed to load graph data', code: 'INTERNAL_ERROR' });
        }
    });

    // --- List Nodes ---
    router.get('/nodes', graphReadLimiter, async (req, res) => {
        try {
            const filters = {
                nodeTypes: req.query.types ? req.query.types.split(',') : null,
                search: req.query.search || null,
                limit: Math.min(parseInt(req.query.limit) || 100, 500)
            };

            const data = await getGraphData(req.user.id, filters);
            res.json(data.nodes);
        } catch (error) {
            console.error('📊 [Graph API] Nodes error:', error.message);
            res.status(500).json({ error: 'Failed to load entities', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Entity Detail ---
    router.get('/nodes/:id', graphReadLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid node ID', code: 'VALIDATION_ERROR' });

        try {
            const detail = await getEntityDetail(req.user.id, parseInt(req.params.id));
            if (!detail) return res.status(404).json({ error: 'Entity not found', code: 'NOT_FOUND' });
            res.json(detail);
        } catch (error) {
            console.error('📊 [Graph API] Node detail error:', error.message);
            res.status(500).json({ error: 'Failed to load entity detail', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Update Node ---
    router.patch('/nodes/:id', graphWriteLimiter, [
        param('id').isInt(),
        body('name').optional().isString().isLength({ min: 1, max: 500 }),
        body('node_type').optional().isString().isLength({ min: 1, max: 50 }),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', code: 'VALIDATION_ERROR' });

        try {
            const updates = {};
            if (req.body.name) {
                updates.name = req.body.name;
                updates.canonical_name = req.body.name;
            }
            if (req.body.node_type) updates.node_type = req.body.node_type;
            if (req.body.metadata) updates.metadata = req.body.metadata;

            const node = await updateNode(req.user.id, parseInt(req.params.id), updates);
            if (!node) return res.status(404).json({ error: 'Entity not found', code: 'NOT_FOUND' });
            res.json(node);
        } catch (error) {
            console.error('📊 [Graph API] Update node error:', error.message);
            res.status(500).json({ error: 'Failed to update entity', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Delete Node ---
    router.delete('/nodes/:id', graphWriteLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid node ID', code: 'VALIDATION_ERROR' });

        try {
            await deleteNode(req.user.id, parseInt(req.params.id));
            res.json({ success: true });
        } catch (error) {
            console.error('📊 [Graph API] Delete node error:', error.message);
            res.status(500).json({ error: 'Failed to delete entity', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Merge Nodes ---
    router.post('/nodes/merge', graphWriteLimiter, [
        body('keepId').isInt(),
        body('removeId').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid node IDs', code: 'VALIDATION_ERROR' });

        try {
            const merged = await mergeNodes(req.user.id, req.body.keepId, req.body.removeId);
            res.json(merged);
        } catch (error) {
            console.error('📊 [Graph API] Merge nodes error:', error.message);
            res.status(500).json({ error: 'Failed to merge entities', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Communities ---
    router.get('/communities', graphReadLimiter, async (req, res) => {
        try {
            const communities = await getCommunities(req.user.id);
            res.json(communities);
        } catch (error) {
            console.error('📊 [Graph API] Communities error:', error.message);
            res.status(500).json({ error: 'Failed to load communities', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Trigger Extraction (Async — returns task ID immediately) ---
    router.post('/extract/:newsletterId', extractionLimiter, [
        param('newsletterId').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid newsletter ID', code: 'VALIDATION_ERROR' });

        const newsletterId = parseInt(req.params.newsletterId);
        const userId = req.user.id;
        const taskId = `extract-${userId}-${newsletterId}-${Date.now()}`;

        // Create task and return immediately
        const task = createExtractionTask(taskId, userId, newsletterId);
        res.json({ taskId, status: 'running', message: 'Extraction started' });

        // Run extraction in background
        setImmediate(async () => {
            try {
                task.progress = 10;
                const result = await extractAndStoreGraph(
                    newsletterId,
                    userId,
                    {
                        force: req.query.force === 'true',
                        language: req.user.language || 'en'
                    }
                );
                task.status = 'completed';
                task.progress = 100;
                task.result = result;
            } catch (err) {
                task.status = 'failed';
                task.error = err.message;
                console.error('📊 [Graph API] Background extraction failed:', err.message);
            }
        });
    });

    // --- Check Extraction Task Status ---
    router.get('/tasks/:taskId', graphReadLimiter, (req, res) => {
        const task = extractionTasks.get(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found or expired', code: 'NOT_FOUND' });
        if (task.userId !== req.user.id) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
        res.json(task);
    });

    // --- Batch Extraction / Backfill ---
    router.post('/extract-batch', extractionLimiter, async (req, res) => {
        try {
            const result = await batchExtract(req.user.id, {
                limit: Math.min(parseInt(req.body.limit) || 10, 50),
                offset: parseInt(req.body.offset) || 0,
                language: req.user.language || 'en'
            });
            res.json(result);
        } catch (error) {
            console.error('📊 [Graph API] Batch extract error:', error.message);
            res.status(500).json({ error: 'Batch extraction failed', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Refresh Communities ---
    router.post('/communities/refresh', graphWriteLimiter, async (req, res) => {
        try {
            const result = await updateCommunities(req.user.id);
            res.json(result);
        } catch (error) {
            console.error('📊 [Graph API] Community refresh error:', error.message);
            res.status(500).json({ error: 'Community detection failed', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Natural Language Query (Premium) ---
    router.post('/query', requirePlan('premium'), extractionLimiter, [
        body('question').isString().isLength({ min: 3, max: 500 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid question', code: 'VALIDATION_ERROR' });

        try {
            const stats = await getGraphStats(req.user.id);
            const answer = await queryGraphNaturalLanguage(
                req.user.id,
                req.body.question,
                stats,
                req.user.language || 'en'
            );
            res.json({ answer });
        } catch (error) {
            console.error('📊 [Graph API] NL query error:', error.message);
            res.status(500).json({ error: 'Query failed', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Profiles ---
    router.get('/profiles', graphReadLimiter, async (req, res) => {
        try {
            const profiles = await listProfiles(req.user.id);
            res.json(profiles);
        } catch (error) {
            console.error('📊 [Graph API] Profiles error:', error.message);
            res.status(500).json({ error: 'Failed to load profiles', code: 'INTERNAL_ERROR' });
        }
    });

    router.post('/profiles', requirePlan('premium'), graphWriteLimiter, [
        body('name').isString().isLength({ min: 1, max: 100 }),
        body('entityTypes').isArray({ min: 1 }),
        body('relationshipTypes').isArray({ min: 1 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid profile data', code: 'VALIDATION_ERROR' });

        try {
            const profile = await createProfile(req.user.id, {
                name: req.body.name,
                entityTypes: req.body.entityTypes,
                relationshipTypes: req.body.relationshipTypes,
                extractionPrompt: req.body.extractionPrompt || null
            });
            res.json(profile);
        } catch (error) {
            console.error('📊 [Graph API] Create profile error:', error.message);
            res.status(500).json({ error: 'Failed to create profile', code: 'INTERNAL_ERROR' });
        }
    });

    router.post('/profiles/preset', graphWriteLimiter, [
        body('preset').isString().isIn(['vc-legal', 'general', 'crypto-web3'])
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid preset name', code: 'VALIDATION_ERROR' });

        try {
            const profile = await applyPresetProfile(req.user.id, req.body.preset);
            res.json(profile);
        } catch (error) {
            console.error('📊 [Graph API] Apply preset error:', error.message);
            res.status(500).json({ error: 'Failed to apply preset', code: 'INTERNAL_ERROR' });
        }
    });

    router.delete('/profiles/:id', graphWriteLimiter, [
        param('id').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid profile ID', code: 'VALIDATION_ERROR' });

        try {
            await deleteProfile(req.user.id, parseInt(req.params.id));
            res.json({ success: true });
        } catch (error) {
            console.error('📊 [Graph API] Delete profile error:', error.message);
            res.status(500).json({ error: 'Failed to delete profile', code: 'INTERNAL_ERROR' });
        }
    });

    // --- Entities for a Specific Newsletter ---
    router.get('/newsletter/:newsletterId/entities', graphReadLimiter, [
        param('newsletterId').isInt()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid newsletter ID', code: 'VALIDATION_ERROR' });

        try {
            const entities = await getNewsletterEntities(req.user.id, parseInt(req.params.newsletterId));
            res.json(entities);
        } catch (error) {
            console.error('📊 [Graph API] Newsletter entities error:', error.message);
            res.status(500).json({ error: 'Failed to load newsletter entities', code: 'INTERNAL_ERROR' });
        }
    });

    return router;
}
