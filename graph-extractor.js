/**
 * graph-extractor.js
 *
 * Two-pass entity extraction pipeline for Brevis Knowledge Graph.
 * Inspired by safishamsi/graphify's AST + LLM dual-pass architecture.
 *
 * Pass 1: Deterministic — regex/pattern extraction (no LLM cost)
 * Pass 2: LLM Semantic — Claude extracts entities & relationships
 */

import { getDb } from './database.js';
import { extractKnowledgeGraph } from './graph-ai.js';
import { resolveEntity, createEdge, linkNewsletterEntity } from './graph-service.js';
import { getActiveProfile, DEFAULT_PROFILES } from './graph-profiles.js';

// ============= PASS 1: DETERMINISTIC EXTRACTION =============

/**
 * Fast regex-based extraction of structured data from newsletter content.
 * Runs before LLM to provide "hints" that improve extraction accuracy
 * and reduce hallucination.
 */
export function deterministicExtract(content, title, sender) {
    const textContent = stripHtml(content);

    return {
        // Email addresses
        emails: uniqueMatches(textContent, /[\w.+-]+@[\w.-]+\.\w{2,}/g),

        // URLs with domain extraction
        urls: uniqueMatches(content, /https?:\/\/[^\s<>"')\]]+/g),

        // Monetary amounts ($5M, $100 million, €2.5B, etc.)
        amounts: uniqueMatches(textContent, /[$€£]\s?\d[\d,.]*\s?(?:million|billion|trillion|M|B|K|mn|bn|k)?/gi),

        // Percentage figures
        percentages: uniqueMatches(textContent, /\d+(?:\.\d+)?%/g),

        // Dates in various formats
        dates: uniqueMatches(textContent, /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/gi),

        // Company name patterns (word(s) + corporate suffix)
        companyPatterns: uniqueMatches(textContent, /[A-Z][\w&.''-]+(?:\s+[A-Z][\w&.''-]+)*(?:\s+(?:Inc|LLC|Corp|Ltd|GmbH|SA|AG|LP|PLC|Ventures|Capital|Partners|Labs|Studios|Games|Protocol|Foundation|Network|DAO|Fund|Holdings|Group|Technologies))\.?/g),

        // Crypto tokens/tickers ($BTC, $ETH, $SOL)
        tokens: uniqueMatches(textContent, /\$[A-Z]{2,10}\b/g),

        // Round types (Series A, Seed, Pre-seed, etc.)
        fundingRounds: uniqueMatches(textContent, /(?:Pre-)?(?:Seed|Series\s+[A-Z]|Series\s+\d|IPO|SPAC|ICO|IDO|IEO|Token\s+(?:Sale|Generation))\b/gi),

        // Regulatory bodies / jurisdiction keywords
        regulatoryHints: uniqueMatches(textContent, /\b(?:SEC|CFTC|FTC|DOJ|FinCEN|OCC|FINRA|MiCA|GDPR|CCPA|FDA|FCC|EU\s+Commission|Congress|Parliament)\b/g),

        // Sender metadata
        senderDomain: sender?.match(/@([\w.-]+)/)?.[1] || null,
        senderName: extractSenderName(sender),

        // Title entities (often the most important names)
        titleEntities: extractTitleEntities(title)
    };
}

// ============= PASS 2: LLM EXTRACTION ORCHESTRATION =============

/**
 * Full extraction pipeline: deterministic → LLM → resolve → store.
 * Called after every newsletter is created.
 *
 * @param {number} newsletterId - The newsletter to extract from
 * @param {number} userId - The user who owns it
 * @param {object} options - { force: false, async: true }
 */
export async function extractAndStoreGraph(newsletterId, userId, options = {}) {
    const db = getDb();
    const { force = false, language = 'en' } = options;

    try {
        // Check if already extracted (skip unless forced)
        if (!force) {
            const existing = await db.query(
                'SELECT COUNT(*) FROM newsletter_entities WHERE newsletter_id = $1',
                [newsletterId]
            );
            if (parseInt(existing.rows[0].count) > 0) {
                console.log(`📊 [Graph] Newsletter ${newsletterId} already extracted, skipping`);
                return { skipped: true };
            }
        }

        // Fetch newsletter content
        const nlResult = await db.query(
            'SELECT id, title, sender, content FROM newsletters WHERE id = $1 AND user_id = $2',
            [newsletterId, userId]
        );
        if (!nlResult.rows.length) {
            throw new Error(`Newsletter ${newsletterId} not found for user ${userId}`);
        }
        const newsletter = nlResult.rows[0];

        // Skip very short content (not worth extracting)
        const textLength = stripHtml(newsletter.content || '').length;
        if (textLength < 100) {
            console.log(`📊 [Graph] Newsletter ${newsletterId} too short (${textLength} chars), skipping`);
            return { skipped: true, reason: 'too_short' };
        }

        // Get user's active extraction profile
        const profile = await getActiveProfile(userId);

        // PASS 1: Deterministic extraction
        const hints = deterministicExtract(
            newsletter.content,
            newsletter.title,
            newsletter.sender
        );
        console.log(`📊 [Graph] Pass 1 complete for newsletter ${newsletterId}: ${hints.companyPatterns.length} companies, ${hints.amounts.length} amounts, ${hints.tokens.length} tokens`);

        // PASS 2: LLM semantic extraction (language-aware)
        const extraction = await extractKnowledgeGraph(newsletter, profile, hints, language);
        console.log(`📊 [Graph] Pass 2 complete for newsletter ${newsletterId}: ${extraction.entities?.length || 0} entities, ${extraction.relationships?.length || 0} relationships`);

        // RESOLVE & STORE: Entity deduplication + graph updates
        const resolvedNodes = [];
        for (const entity of (extraction.entities || [])) {
            try {
                const node = await resolveEntity(userId, entity);
                resolvedNodes.push({ node, entity });

                // Link newsletter ↔ entity
                await linkNewsletterEntity(newsletterId, node.id, {
                    excerpt: entity.excerpt || null,
                    sentiment: entity.sentiment || 'neutral',
                    relevance: entity.relevance || 0.5
                });
            } catch (err) {
                console.error(`📊 [Graph] Error resolving entity "${entity.name}":`, err.message);
            }
        }

        // Build name→nodeId lookup for edge creation
        const nameToNodeId = {};
        for (const { node, entity } of resolvedNodes) {
            nameToNodeId[entity.name.toLowerCase()] = node.id;
            // Also map aliases
            if (entity.aliases) {
                for (const alias of entity.aliases) {
                    nameToNodeId[alias.toLowerCase()] = node.id;
                }
            }
        }

        // Create edges (relationships)
        let edgeCount = 0;
        for (const rel of (extraction.relationships || [])) {
            try {
                const sourceId = nameToNodeId[rel.source?.toLowerCase()];
                const targetId = nameToNodeId[rel.target?.toLowerCase()];

                if (sourceId && targetId && sourceId !== targetId) {
                    await createEdge(userId, {
                        sourceId,
                        targetId,
                        relationship: rel.relationship,
                        isInferred: rel.is_inferred || false,
                        evidence: { newsletter_id: newsletterId, excerpt: rel.excerpt || '' }
                    });
                    edgeCount++;
                }
            } catch (err) {
                console.error(`📊 [Graph] Error creating edge "${rel.source}" → "${rel.target}":`, err.message);
            }
        }

        console.log(`📊 [Graph] Stored ${resolvedNodes.length} nodes, ${edgeCount} edges for newsletter ${newsletterId}`);

        return {
            success: true,
            nodes: resolvedNodes.length,
            edges: edgeCount,
            hints
        };

    } catch (error) {
        console.error(`📊 [Graph] Extraction failed for newsletter ${newsletterId}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Batch extraction for backfilling existing newsletters.
 * Processes in chunks to avoid overwhelming the API.
 */
export async function batchExtract(userId, options = {}) {
    const db = getDb();
    const { limit = 50, offset = 0 } = options;

    const newsletters = await db.query(
        `SELECT n.id FROM newsletters n
         LEFT JOIN newsletter_entities ne ON ne.newsletter_id = n.id
         WHERE n.user_id = $1 AND ne.newsletter_id IS NULL
         ORDER BY n.date_added DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );

    const results = [];
    for (const nl of newsletters.rows) {
        const result = await extractAndStoreGraph(nl.id, userId);
        results.push(result);

        // Small delay between LLM calls to respect rate limits
        if (!result.skipped) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    return {
        processed: results.length,
        extracted: results.filter(r => r.success).length,
        skipped: results.filter(r => r.skipped).length,
        errors: results.filter(r => r.error).length
    };
}

// ============= HELPER FUNCTIONS =============

function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function uniqueMatches(text, regex) {
    const matches = text.match(regex) || [];
    return [...new Set(matches)];
}

function extractSenderName(sender) {
    if (!sender) return null;
    // "John Doe <john@example.com>" → "John Doe"
    const nameMatch = sender.match(/^([^<]+)</);
    if (nameMatch) return nameMatch[1].trim();
    // Just an email → extract name part
    const emailMatch = sender.match(/^([\w.-]+)@/);
    return emailMatch ? emailMatch[1].replace(/[._-]/g, ' ') : null;
}

function extractTitleEntities(title) {
    if (!title) return [];
    // Extract capitalized multi-word phrases from title
    const entities = title.match(/[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*/g) || [];
    // Filter out common stop words that happen to be capitalized
    const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where', 'How', 'Why', 'Who', 'New', 'Top', 'Best', 'Your', 'Our', 'All', 'Big', 'First', 'Last', 'Next']);
    return entities.filter(e => !stopWords.has(e) && e.length > 2);
}
