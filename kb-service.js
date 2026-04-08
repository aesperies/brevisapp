/**
 * kb-service.js
 *
 * Orchestration layer for Knowledge Base compilation and querying.
 * Manages the compilation pipeline: fetch source → AI compilation → store articles → update status.
 * Also handles KB queries with RAG (retrieval-augmented generation).
 *
 * Cost Control:
 * - Estimates tokens before compilation (newsletters * 200 + entities * 50 + overhead)
 * - Enforces MAX_NEWSLETTERS_PER_COMPILE = 200 limit
 * - Logs actual token usage after compilation
 *
 * In-memory task tracking for compilation progress polling (auto-cleanup after 10 minutes).
 */

import {
    createKB,
    getKB,
    getUserKBs,
    updateKBStatus,
    insertArticles,
    getArticles,
    clearArticles,
    getKBSourceData,
    logQA,
    getQAHistory,
    getTagName
} from './kb-database.js';
import { compileKnowledgeBase, queryKnowledgeBase } from './ai-service.js';

// ============= CONSTANTS =============

const MAX_NEWSLETTERS_PER_COMPILE = 200;
const COMPILATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour minimum between compilations
const TOKEN_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ============= IN-MEMORY COMPILATION TRACKING =============

const compilationTasks = new Map();

/**
 * Create a new compilation task for progress tracking.
 * Tasks auto-cleanup after 10 minutes.
 */
function createCompilationTask(taskId, userId, kbId) {
    const task = {
        taskId,
        userId,
        kbId,
        status: 'running',           // 'running', 'success', 'failed'
        progress: 0,                  // 0-100%
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null
    };
    compilationTasks.set(taskId, task);

    // Auto-cleanup after timeout
    setTimeout(() => compilationTasks.delete(taskId), TOKEN_CLEANUP_TIMEOUT_MS);

    return task;
}

/**
 * Update compilation task progress.
 */
function updateCompilationTask(taskId, updates) {
    const task = compilationTasks.get(taskId);
    if (!task) return null;

    Object.assign(task, updates);
    compilationTasks.set(taskId, task);
    return task;
}

/**
 * Get compilation task status (for frontend polling).
 * Returns null if task not found or expired.
 */
export function getCompilationStatus(taskId) {
    return compilationTasks.get(taskId) || null;
}

// ============= COMPILATION PIPELINE =============

/**
 * Main Knowledge Base compilation entry point.
 *
 * Steps:
 * 1. Get or create KB record
 * 2. Check cooldown (1 hour minimum between compiles)
 * 3. Set status to 'compiling'
 * 4. Fetch source data (newsletters + entities)
 * 5. Estimate token cost
 * 6. Clear existing articles if recompiling
 * 7. Call AI compilation
 * 8. Store articles in database
 * 9. Update KB status to 'ready' with metadata
 * 10. Return KB with articles
 *
 * Error handling: If anything fails after step 3, set status to 'failed' and rethrow.
 *
 * @param {number} userId - User ID
 * @param {number} tagId - Tag ID for the KB
 * @param {string} language - Language code ('en', 'es', etc.)
 * @returns {object} KB record with articles array
 * @throws {Error} If compilation fails
 */
export async function compileKB(userId, tagId, language = 'en') {
    const taskId = `compile-${userId}-${tagId}-${Date.now()}`;
    const task = createCompilationTask(taskId, userId, null);

    try {
        // Step 1: Get or create KB
        updateCompilationTask(taskId, { progress: 5 });
        let kb = await createKB(userId, tagId);
        updateCompilationTask(taskId, { kbId: kb.id });

        // Step 2: Check cooldown
        if (kb.compiled_at) {
            const lastCompile = new Date(kb.compiled_at);
            const now = new Date();
            const timeSinceCompile = now - lastCompile;

            if (timeSinceCompile < COMPILATION_COOLDOWN_MS) {
                const waitSeconds = Math.ceil((COMPILATION_COOLDOWN_MS - timeSinceCompile) / 1000);
                throw new Error(
                    `Knowledge Base compiled too recently. Please wait ${Math.ceil(waitSeconds / 60)} minutes before recompiling.`
                );
            }
        }

        // Step 3: Set status to compiling
        updateCompilationTask(taskId, { progress: 10 });
        await updateKBStatus(kb.id, 'compiling');

        // Step 4: Fetch source data
        updateCompilationTask(taskId, { progress: 20 });
        const sourceMaterial = await getKBSourceData(userId, tagId);

        if (!sourceMaterial || sourceMaterial.length === 0) {
            await updateKBStatus(kb.id, 'failed', {
                metadata: { error: 'No newsletters found for this tag' }
            });
            throw new Error('No newsletters found for this tag');
        }

        // Step 5: Check newsletter limit
        if (sourceMaterial.length > MAX_NEWSLETTERS_PER_COMPILE) {
            await updateKBStatus(kb.id, 'failed', {
                metadata: { error: `Too many newsletters (${sourceMaterial.length}). Maximum is ${MAX_NEWSLETTERS_PER_COMPILE}` }
            });
            throw new Error(
                `Too many newsletters (${sourceMaterial.length}). Maximum is ${MAX_NEWSLETTERS_PER_COMPILE}`
            );
        }

        // Step 6: Estimate token cost
        updateCompilationTask(taskId, { progress: 30 });
        const estimatedTokens = estimateCompilationCost(sourceMaterial);
        console.log(`📚 [KB] Estimated cost for KB ${kb.id}: ${estimatedTokens} tokens`);

        // Step 7: Clear existing articles if recompiling
        if (kb.article_count > 0) {
            updateCompilationTask(taskId, { progress: 40 });
            await clearArticles(kb.id);
        }

        // Step 8: Call AI compilation
        updateCompilationTask(taskId, { progress: 50 });
        console.log(`📚 [KB] Compiling KB ${kb.id} with ${sourceMaterial.length} newsletters in ${language}...`);

        // Reshape source data into the format compileKnowledgeBase expects
        const tagName = await getTagName(tagId);
        const allEntities = [];
        const seenEntityIds = new Set();
        for (const nl of sourceMaterial) {
            if (nl.entities) {
                for (const e of nl.entities) {
                    if (e.id && !seenEntityIds.has(e.id)) {
                        seenEntityIds.add(e.id);
                        allEntities.push(e);
                    }
                }
            }
        }
        const formattedSource = {
            tagName,
            newsletters: sourceMaterial,
            entities: allEntities
        };

        const { articles, tokensUsed } = await compileKnowledgeBase(formattedSource, language);

        if (!articles || articles.length === 0) {
            await updateKBStatus(kb.id, 'failed', {
                metadata: { error: 'AI compilation returned no articles' }
            });
            throw new Error('AI compilation returned no articles');
        }

        // Step 9: Store articles
        updateCompilationTask(taskId, { progress: 70 });
        const storedArticles = await insertArticles(kb.id, articles);
        console.log(`📚 [KB] Stored ${storedArticles.length} articles for KB ${kb.id}`);

        // Step 10: Update KB status to ready
        updateCompilationTask(taskId, { progress: 90 });
        kb = await updateKBStatus(kb.id, 'ready', {
            articleCount: storedArticles.length,
            sourceCount: sourceMaterial.length,
            compiledAt: new Date(),
            compilationTokens: tokensUsed || estimatedTokens
        });

        console.log(`✅ [KB] Compilation complete for KB ${kb.id}: ${storedArticles.length} articles, ${tokensUsed || estimatedTokens} tokens`);

        updateCompilationTask(taskId, {
            progress: 100,
            status: 'success',
            result: { kb, articles: storedArticles },
            completedAt: new Date().toISOString()
        });

        return {
            ...kb,
            articles: storedArticles,
            taskId
        };

    } catch (error) {
        console.error(`❌ [KB] Compilation failed for KB ${task.kbId}:`, error.message);

        // Set KB status to failed if we got that far
        if (task.kbId) {
            try {
                await updateKBStatus(task.kbId, 'failed', {
                    metadata: { error: error.message }
                });
            } catch (updateErr) {
                console.error(`❌ [KB] Error updating KB status to failed:`, updateErr.message);
            }
        }

        updateCompilationTask(taskId, {
            status: 'failed',
            error: error.message,
            completedAt: new Date().toISOString()
        });

        throw error;
    }
}

/**
 * Estimate token cost for compilation.
 * Rough estimates:
 * - Each newsletter: ~200 tokens (title + summary)
 * - Each entity: ~50 tokens
 * - Overhead: ~500 tokens
 *
 * @param {array} sourceMaterial - Result from getKBSourceData
 * @returns {number} Estimated tokens
 */
function estimateCompilationCost(sourceMaterial) {
    let cost = 500; // Base overhead

    for (const newsletter of sourceMaterial) {
        cost += 200; // Newsletter summary
        cost += (newsletter.entities?.length || 0) * 50; // Entities
    }

    return cost;
}

// ============= QUERYING =============

/**
 * Query a Knowledge Base using RAG (retrieval-augmented generation).
 *
 * Steps:
 * 1. Get KB and verify it belongs to user and is ready
 * 2. Get all articles for this KB
 * 3. Find the index article (type='index')
 * 4. Get recent Q&A history (last 5)
 * 5. Call AI query function
 * 6. Log the Q&A
 * 7. Return answer with citations and QA ID
 *
 * @param {number} userId - User ID
 * @param {number} kbId - KB ID
 * @param {string} question - User's question
 * @param {string} language - Language code
 * @returns {object} { answer, citations, qaId }
 * @throws {Error} If KB not found or not ready
 */
export async function queryKB(userId, kbId, question, language = 'en') {
    try {
        // Step 1: Get KB and verify ownership and status
        const kb = await getKB(userId, kbId);
        if (!kb) {
            throw new Error(`Knowledge Base ${kbId} not found`);
        }
        if (kb.status !== 'ready') {
            throw new Error(`Knowledge Base is not ready (status: ${kb.status}). Please compile it first.`);
        }

        // Step 2: Get all articles
        const articles = await getArticles(kbId);
        if (!articles || articles.length === 0) {
            throw new Error('Knowledge Base has no articles');
        }

        // Step 3: Find index article
        const indexArticle = articles.find(a => a.article_type === 'index');
        if (!indexArticle) {
            throw new Error('Knowledge Base index not found');
        }

        // Step 4: Get recent Q&A history
        const history = await getQAHistory(kbId, 5);

        // Step 5: Call AI query
        console.log(`📚 [KB] Querying KB ${kbId}: "${question}"`);
        const { answer, citations, tokensUsed } = await queryKnowledgeBase(
            question,
            {
                tagName: kb.tag_name || 'Unknown',
                indexArticle,
                articles,
                recentQA: history || []
            },
            language
        );

        // Step 6: Log the Q&A
        const qa = await logQA(kbId, question, answer, citations, tokensUsed);
        console.log(`✅ [KB] Query complete for KB ${kbId}: ${tokensUsed || 0} tokens`);

        // Step 7: Return result
        return {
            answer,
            citations: citations || [],
            qaId: qa.id
        };

    } catch (error) {
        console.error(`❌ [KB] Query failed for KB ${kbId}:`, error.message);
        throw error;
    }
}

// ============= READ OPERATIONS =============

/**
 * Get a KB with all its articles and metadata.
 * Simple join: knowledge_bases + kb_articles.
 *
 * @param {number} userId - User ID
 * @param {number} kbId - KB ID
 * @returns {object} KB with articles array
 */
export async function getKBWithArticles(userId, kbId) {
    const kb = await getKB(userId, kbId);
    if (!kb) return null;

    const articles = await getArticles(kbId);

    return {
        ...kb,
        articles
    };
}

/**
 * List all Knowledge Bases for a user with metadata.
 * Returns: id, status, article_count, source_count, compiled_at, tag_name, etc.
 *
 * @param {number} userId - User ID
 * @returns {array} Array of KBs
 */
export async function listUserKBs(userId) {
    return await getUserKBs(userId);
}

/**
 * Get KB query history.
 *
 * @param {number} userId - User ID
 * @param {number} kbId - KB ID
 * @param {number} limit - Max records
 * @returns {array} Q&A history
 */
export async function getKBQueryHistory(userId, kbId, limit = 20) {
    // Verify KB belongs to user
    const kb = await getKB(userId, kbId);
    if (!kb) {
        throw new Error(`Knowledge Base ${kbId} not found`);
    }

    return await getQAHistory(kbId, limit);
}

// ============= EXPORTS FOR ROUTES =============

export function getCompilationTaskMap() {
    return compilationTasks;
}
