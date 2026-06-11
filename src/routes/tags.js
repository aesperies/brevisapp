import express from 'express';
import { body, validationResult } from 'express-validator';

import { dbHelpers, getDb } from '../../database.js';
import { recordAutoTagRemoval } from '../../lib/auto-tagger.js';
import { asyncHandler } from '../utils/errors.js';
import { authMiddleware } from '../middleware/auth.js';
import { tagMutationLimiter } from '../middleware/rate-limits.js';

export function createTagsRouter() {
const router = express.Router();

// ============= TAG ROUTES =============

router.get('/api/tags', authMiddleware, asyncHandler(async (req, res) => {
    const tags = await dbHelpers.getTags(req.user.id);
    res.json(tags);
}));

router.post('/api/tags', authMiddleware, [
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

router.delete('/api/tags/:id', authMiddleware, asyncHandler(async (req, res) => {
    await dbHelpers.deleteTag(parseInt(req.params.id), req.user.id);
    console.log('✅ Tag deleted:', req.params.id);
    res.json({ success: true });
}));

router.post('/api/newsletters/:id/tags/:tagId', tagMutationLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

router.delete('/api/newsletters/:id/tags/:tagId', tagMutationLimiter, authMiddleware, asyncHandler(async (req, res) => {
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

return router;
}
