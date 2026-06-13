import fetch from 'node-fetch';
import { PROMPTS } from './prompts/index.js';
import { SYSTEM_PROMPT_V1 as SYSTEM_PROMPT } from './prompts/system.v1.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Pre-flight input bound. Claude Sonnet 4 supports a 200K-token context, but
// uncapped user content is a real cost lever — a single malicious or accidental
// upload could burn through budget. Cap at ~80K tokens (~320K chars at the
// standard 4-chars-per-token heuristic) which comfortably covers any single
// newsletter and reasonable batch jobs while leaving margin under the model's
// limit and bounding worst-case spend.
const MAX_INPUT_CHARS = 320_000;
// Per-message char ceiling (used as a safety net inside batch builders so a
// single oversized item can be skipped/truncated rather than blowing the batch).
export const MAX_PER_MESSAGE_CHARS = 200_000;

function estimateInputChars(body) {
    let total = (body.system || '').length;
    for (const m of body.messages || []) {
        if (typeof m.content === 'string') {
            total += m.content.length;
        } else if (Array.isArray(m.content)) {
            for (const part of m.content) {
                if (typeof part === 'string') total += part.length;
                else if (part && typeof part.text === 'string') total += part.text.length;
            }
        }
    }
    return total;
}

export class InputTooLargeError extends Error {
    constructor(charCount) {
        super(`AI input too large (${charCount} chars > ${MAX_INPUT_CHARS} cap). Reduce content or split into smaller batches.`);
        this.name = 'InputTooLargeError';
        this.code = 'INPUT_TOO_LARGE';
        this.charCount = charCount;
        // Picked up by server.js global error handler:
        // 413 Payload Too Large + the message above is forwarded to the client.
        this.statusCode = 413;
        this.isOperational = true;
    }
}

async function anthropicRequest(body, timeoutMs = 30000) {
    // Pre-flight bound: refuse oversized inputs before paying the API tokens.
    // The route layer should surface this as 413 / 400; here we just throw.
    const inputChars = estimateInputChars(body);
    if (inputChars > MAX_INPUT_CHARS) {
        console.warn(`⚠️  AI request rejected: input ${inputChars} chars exceeds cap ${MAX_INPUT_CHARS}`);
        throw new InputTooLargeError(inputChars);
    }
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.status === 429 || response.status === 529) {
                const retryAfter = parseInt(response.headers.get('retry-after')) || (2 ** attempt * 2);
                console.warn(`⚠️ Anthropic rate limited (${response.status}), retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                continue;
            }

            if (!response.ok) {
                const error = await response.text();
                console.error('❌ Claude API error:', error);
                throw new Error('AI service is temporarily unavailable. Please try again in a few minutes.');
            }

            const data = await response.json();
            return data.content[0].text;
        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError' && attempt < maxRetries - 1) {
                console.warn(`⚠️ Anthropic request timed out, retrying (attempt ${attempt + 1}/${maxRetries})`);
                continue;
            }
            throw error;
        }
    }
    throw new Error('AI service is temporarily unavailable. Please try again in a few minutes.');
}

// Plan definitions — prices must match Stripe configuration and frontend display
export const PLANS = {
    free: {
        name: 'Free',
        canSummarize: false,
        canReport: false,
        priceMonthly: 0,
        priceAnnual: 0
    },
    // Keep 'pro' for backward compatibility with existing users
    pro: {
        name: 'Standard',
        canSummarize: true,
        canReport: false,
        priceMonthly: 12,
        priceAnnual: 119.99
    },
    // 'standard' is the new name for pro
    standard: {
        name: 'Standard',
        canSummarize: true,
        canReport: false,
        priceMonthly: 12,
        priceAnnual: 119.99
    },
    premium: {
        name: 'Premium',
        canSummarize: true,
        canReport: true,
        priceMonthly: 29,
        priceAnnual: 289.99
    }
};

export function canUserPerformAction(user, action) {
    const plan = PLANS[user.plan] || PLANS.free;

    switch(action) {
        case 'generate_summary':
            return plan.canSummarize;
        case 'generate_brief':
            return plan.canSummarize;
        case 'generate_report':
            return plan.canReport;
        default:
            return false;
    }
}

// The system prompt + every user-message template live in prompts/ as
// versioned modules; see prompts/index.js for the change rules.

export async function generateSummary(newsletter, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.newsletterSummary;
    try {
        return await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ newsletter }, language) }]
        }, p.timeoutMs);
    } catch (error) {
        console.error('Error generating summary:', error);
        throw error;
    }
}

// Translate an existing summary into another language (cheap) rather than
// re-summarizing the newsletter (expensive). Used when a user switches UI
// language and already has a summary.
export async function translateText(text, targetLanguage = 'en') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.translate;
    try {
        return await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ text }, targetLanguage) }]
        }, p.timeoutMs);
    } catch (error) {
        console.error('Error translating summary:', error);
        throw error;
    }
}

export async function generateBatchBrief(newsletters, language = 'es', purpose = '') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.batchBrief;
    try {
        return await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ newsletters, purpose }, language) }]
        }, p.timeoutMs);
    } catch (error) {
        console.error('Error generating brief:', error);
        throw error;
    }
}

export async function generateBatchReport(newsletters, language = 'es', purpose = '') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.batchReport;
    try {
        return await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ newsletters, purpose }, language) }]
        }, p.timeoutMs);
    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
}

export async function generateNewsletterFromTemplate(template, reportIds, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.newsletterFromTemplate;
    try {
        return await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ template, reportIds }, language) }]
        }, p.timeoutMs);
    } catch (error) {
        console.error('Error generating newsletter from template:', error);
        throw error;
    }
}

export async function generateNewsletterFromProject(template, reports, urls, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.newsletterFromProject;
    try {
        return await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ template, reports, urls }, language) }]
        }, p.timeoutMs);
    } catch (error) {
        console.error('Error generating newsletter from project:', error);
        throw error;
    }
}

/**
 * Generate a simple URL-safe slug from a title.
 * Converts to lowercase, replaces spaces with hyphens, removes special characters.
 */
export function generateSlug(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')  // Remove special characters
        .replace(/\s+/g, '-')       // Replace spaces with hyphens
        .replace(/-+/g, '-')        // Collapse multiple hyphens
        .replace(/^-+|-+$/g, '');   // Remove leading/trailing hyphens
}

/**
 * Compile a knowledge base from newsletter summaries and knowledge graph entities.
 * Generates thematic concept articles and a master index.
 *
 * @param {Object} sourceMaterial - Object with tagName, newsletters array, entities array, existingArticles array
 * @param {string} language - Language code ('en' or 'es', defaults to 'en')
 * @returns {Promise<Object>} - { articles: [...], tokensUsed: number }
 */
export async function compileKnowledgeBase(sourceMaterial, language = 'en') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.kbCompile;
    try {
        const response = await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build(sourceMaterial, language) }]
        }, p.timeoutMs);

        // Parse JSON response — strip markdown code fences if present
        let parsed;
        try {
            let jsonStr = response.trim();
            // Remove ```json ... ``` or ``` ... ``` wrappers
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            }
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            // Last resort: try to find JSON object in the response
            const match = response.match(/\{[\s\S]*"articles"[\s\S]*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch (e2) {
                    console.error('Failed to parse knowledge base compilation response as JSON:', response.substring(0, 500));
                    throw new Error('Invalid JSON response from knowledge base compilation');
                }
            } else {
                console.error('Failed to parse knowledge base compilation response as JSON:', response.substring(0, 500));
                throw new Error('Invalid JSON response from knowledge base compilation');
            }
        }

        // Validate structure
        if (!parsed.articles || !Array.isArray(parsed.articles)) {
            throw new Error('Response missing articles array');
        }

        // Ensure all articles have required fields
        const articles = parsed.articles.map(a => ({
            type: a.type || 'concept',
            title: a.title || 'Untitled',
            slug: a.slug || generateSlug(a.title || 'untitled'),
            content: a.content || '',
            summary: a.summary || '',
            crossLinks: a.crossLinks || [],
            sourceNewsletterIds: a.sourceNewsletterIds || []
        }));

        // Count tokens (rough estimate: ~4 chars per token)
        const tokensUsed = Math.ceil(response.length / 4);

        return {
            articles,
            tokensUsed
        };
    } catch (error) {
        console.error('Error compiling knowledge base:', error);
        throw error;
    }
}

/**
 * Query a knowledge base to answer a user question with citations.
 * Sends index + summaries first, then cites relevant articles by title.
 *
 * @param {string} question - User's question
 * @param {Object} kbContext - Object with tagName, articles array, recentQA array, indexArticle object
 * @param {string} language - Language code ('en' or 'es', defaults to 'en')
 * @returns {Promise<Object>} - { answer: string, citations: [...], tokensUsed: number }
 */
export async function queryKnowledgeBase(rawQuestion, kbContext, language = 'en') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const p = PROMPTS.kbQuery;
    try {
        const response = await anthropicRequest({
            model: p.model,
            max_tokens: p.maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: p.build({ question: rawQuestion, ...kbContext }, language) }]
        }, p.timeoutMs);

        // Parse JSON response — strip markdown code fences if present
        let parsed;
        try {
            let jsonStr = response.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            }
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            const match = response.match(/\{[\s\S]*"answer"[\s\S]*\}/);
            if (match) {
                try { parsed = JSON.parse(match[0]); } catch (e2) {
                    console.error('Failed to parse knowledge base query response as JSON');
                    throw new Error('Invalid JSON response from knowledge base query');
                }
            } else {
                console.error('Failed to parse knowledge base query response as JSON');
                throw new Error('Invalid JSON response from knowledge base query');
            }
        }

        // Validate structure
        if (!parsed.answer) {
            throw new Error('Response missing answer field');
        }

        // Ensure citations are properly formatted
        const citations = (parsed.citations || []).map(c => ({
            articleTitle: c.articleTitle || 'Unknown',
            excerpt: c.excerpt || ''
        }));

        // Count tokens (rough estimate: ~4 chars per token)
        const tokensUsed = Math.ceil(response.length / 4);

        return {
            answer: parsed.answer,
            citations,
            tokensUsed
        };
    } catch (error) {
        console.error('Error querying knowledge base:', error);
        throw error;
    }
}
