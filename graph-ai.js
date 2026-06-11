/**
 * graph-ai.js
 *
 * LLM-powered entity and relationship extraction for the knowledge graph.
 * Wraps Claude API calls specifically for graph extraction (Pass 2).
 *
 * Security: Prompt injection protection via content escaping + double fencing.
 * Language: Respects user's platform language setting (en/es).
 * Validation: Caps entity/relationship counts to prevent abuse.
 *
 * Prompts: the system prompts and message templates live in
 * prompts/graph-extraction.v1.js and prompts/graph-query.v1.js (versioned
 * registry) — this file only does API mechanics, sanitization, and parsing.
 */

import fetch from 'node-fetch';
import { PROMPTS } from './prompts/index.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ============= SECURITY: Content sanitization =============

// Entity/relationship caps are part of the versioned prompt contract
// (interpolated into the template) — single source in the prompt module.
const { maxEntities: MAX_ENTITIES, maxRelationships: MAX_RELATIONSHIPS } = PROMPTS.graphExtraction;
const MAX_CONTENT_LENGTH = 15000;

/**
 * Escape content that will be placed inside XML-like tags in prompts.
 * Prevents prompt injection by neutralizing tag-like sequences.
 */
function sanitizeForPrompt(content) {
    if (!content) return '';
    return content
        .replace(/</g, '＜')       // Replace < with fullwidth <
        .replace(/>/g, '＞')       // Replace > with fullwidth >
        .replace(/\{\{/g, '{ {')   // Break template injection patterns
        .replace(/\}\}/g, '} }');
}

// ============= EXTRACTION =============

/**
 * Extract entities and relationships from a newsletter using Claude.
 *
 * @param {object} newsletter - { title, sender, content }
 * @param {object} profile - { entity_types, relationship_types, extraction_prompt }
 * @param {object} hints - Deterministic extraction results from Pass 1
 * @param {string} language - User's language preference ('en' or 'es')
 * @returns {object} { entities: [...], relationships: [...] }
 */
export async function extractKnowledgeGraph(newsletter, profile, hints, language = 'en') {
    const p = PROMPTS.graphExtraction;
    // A custom profile prompt may ADD guidance but can never REPLACE the safety
    // rules — buildSystem always puts the immutable preamble first.
    const systemPrompt = p.buildSystem(profile.extraction_prompt);

    // Sanitize and truncate user-derived fields (security: prevent prompt
    // injection) — input processing stays here; the template lives in
    // prompts/graph-extraction.v1.js.
    const userMessage = p.build({
        profile,
        hints,
        newsletter,
        sanitized: {
            title: sanitizeForPrompt(newsletter.title || 'Untitled'),
            sender: sanitizeForPrompt(newsletter.sender || 'Unknown'),
            content: sanitizeForPrompt((newsletter.content || '').slice(0, MAX_CONTENT_LENGTH)),
        },
    }, language);

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), p.timeoutMs);

        try {
            const response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: p.model,
                    max_tokens: p.maxTokens,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMessage }]
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.status === 429 || response.status === 529) {
                const retryAfter = parseInt(response.headers.get('retry-after')) || (2 ** attempt * 2);
                console.warn(`📊 [Graph AI] Rate limited (${response.status}), retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                continue;
            }

            if (!response.ok) {
                const error = await response.text();
                console.error('📊 [Graph AI] Claude API error:', error);
                throw new Error('Graph extraction failed — AI service temporarily unavailable');
            }

            const data = await response.json();
            const rawText = data.content[0].text;

            // Parse, validate, and cap results
            return parseExtractionResponse(rawText);

        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError' && attempt < maxRetries - 1) {
                console.warn(`📊 [Graph AI] Request timed out, retrying (attempt ${attempt + 1}/${maxRetries})`);
                continue;
            }
            if (attempt === maxRetries - 1) {
                console.error('📊 [Graph AI] All retries failed:', error.message);
                return { entities: [], relationships: [], error: error.message, retryable: true };
            }
        }
    }

    return { entities: [], relationships: [] };
}

/**
 * Natural language query against the user's knowledge graph.
 * Premium feature — translates questions into graph lookups.
 * Respects user's language setting.
 */
export async function queryGraphNaturalLanguage(userId, question, graphStats, language = 'en') {
    const p = PROMPTS.graphQuery;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), p.timeoutMs);

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: p.model,
                max_tokens: p.maxTokens,
                system: p.build({ graphStats }, language),
                messages: [{ role: 'user', content: sanitizeForPrompt(question) }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error('Graph query failed');

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

// ============= PARSING & VALIDATION =============

function parseExtractionResponse(rawText) {
    let text = rawText.trim();

    // Strip markdown code fences if present
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
        const parsed = JSON.parse(text);
        return capAndValidate(parsed);
    } catch (err) {
        console.error('📊 [Graph AI] Failed to parse extraction JSON:', err.message);
        console.error('📊 [Graph AI] Raw response (first 500 chars):', text.slice(0, 500));

        // Attempt to extract JSON from mixed content
        const jsonMatch = text.match(/\{[\s\S]*"entities"[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return capAndValidate(parsed);
            } catch {
                // Give up
            }
        }

        return { entities: [], relationships: [] };
    }
}

/**
 * Validate individual items and enforce caps.
 * Security: prevents LLM from returning excessively large responses.
 */
function capAndValidate(parsed) {
    const entities = Array.isArray(parsed.entities)
        ? parsed.entities.filter(validateEntity).slice(0, MAX_ENTITIES)
        : [];

    const relationships = Array.isArray(parsed.relationships)
        ? parsed.relationships.filter(validateRelationship).slice(0, MAX_RELATIONSHIPS)
        : [];

    if (parsed.entities?.length > MAX_ENTITIES) {
        console.warn(`📊 [Graph AI] Capped entities from ${parsed.entities.length} to ${MAX_ENTITIES}`);
    }
    if (parsed.relationships?.length > MAX_RELATIONSHIPS) {
        console.warn(`📊 [Graph AI] Capped relationships from ${parsed.relationships.length} to ${MAX_RELATIONSHIPS}`);
    }

    return { entities, relationships };
}

function validateEntity(entity) {
    if (!entity || typeof entity.name !== 'string' || !entity.name.trim()) return false;
    if (typeof entity.type !== 'string' || !entity.type.trim()) return false;
    // Cap entity name length to prevent abuse
    if (entity.name.length > 500) return false;
    // Cap excerpt length
    if (entity.excerpt && entity.excerpt.length > 1000) {
        entity.excerpt = entity.excerpt.slice(0, 1000);
    }
    return true;
}

function validateRelationship(rel) {
    if (!rel || typeof rel.source !== 'string' || !rel.source.trim()) return false;
    if (typeof rel.target !== 'string' || !rel.target.trim()) return false;
    if (typeof rel.relationship !== 'string' || !rel.relationship.trim()) return false;
    if (rel.relationship.length > 100) return false;
    // Cap excerpt length
    if (rel.excerpt && rel.excerpt.length > 1000) {
        rel.excerpt = rel.excerpt.slice(0, 1000);
    }
    return true;
}
