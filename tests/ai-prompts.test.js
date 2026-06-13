import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every request ai-service.js would send to Anthropic — no network,
// no spend. These snapshots are the contract for the prompt-versioning
// refactor: extracting templates into prompts/ must NOT change a single byte
// of any request body. If a snapshot changes, a prompt changed — that must be
// a deliberate, reviewed decision (bump the prompt version), never a side
// effect of refactoring.
const captured = [];
vi.mock('node-fetch', () => ({
    default: vi.fn(async (url, opts) => {
        captured.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
        return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            // Valid JSON satisfying every parser downstream of anthropicRequest
            // (KB compile expects {articles}, KB query expects {answer, citations};
            // the plain-text functions just pass the string through).
            json: async () => ({ content: [{ text: '{"articles": [], "answer": "mocked", "citations": []}' }] }),
            text: async () => '',
        };
    }),
}));

const {
    generateSummary,
    translateText,
    generateBatchBrief,
    generateBatchReport,
    generateNewsletterFromTemplate,
    generateNewsletterFromProject,
    compileKnowledgeBase,
    queryKnowledgeBase,
} = await import('../ai-service.js');

const NEWSLETTER = {
    id: 7,
    title: 'AI Funding Weekly',
    sender: 'editor@aifunding.example',
    content: 'Anthropic raised again. Startups everywhere. Markets reacted calmly.',
};
const NEWSLETTERS = [
    NEWSLETTER,
    {
        id: 8,
        title: 'Crypto Digest',
        sender: 'news@cryptodigest.example',
        content: 'Bitcoin did a thing. Regulators noticed. Builders kept building.',
    },
];

beforeEach(() => {
    captured.length = 0;
});

async function lastRequest() {
    const req = captured.at(-1);
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    return req.body;
}

describe('AI prompt request fixtures', () => {
    for (const language of ['es', 'en']) {
        it(`generateSummary (${language})`, async () => {
            await generateSummary(NEWSLETTER, language);
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`generateBatchBrief (${language}, no purpose)`, async () => {
            await generateBatchBrief(NEWSLETTERS, language);
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`generateBatchBrief (${language}, with purpose)`, async () => {
            await generateBatchBrief(NEWSLETTERS, language, 'prep for board meeting');
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`generateBatchReport (${language}, with purpose)`, async () => {
            await generateBatchReport(NEWSLETTERS, language, 'quarterly trends');
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`generateNewsletterFromTemplate (${language})`, async () => {
            await generateNewsletterFromTemplate('<h1>Weekly Recap</h1><p>Style sample.</p>', [3, 5], language);
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`generateNewsletterFromProject (${language}, with refs)`, async () => {
            await generateNewsletterFromProject(
                '<h1>Weekly Recap</h1>',
                [{ name: 'Q2 report', content: 'Numbers went up.' }],
                [{ url: 'https://example.com/post', content: 'Fetched body text.' }],
                language
            );
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`generateNewsletterFromProject (${language}, no refs)`, async () => {
            await generateNewsletterFromProject('<h1>Weekly Recap</h1>', [], [], language);
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`compileKnowledgeBase (${language})`, async () => {
            await compileKnowledgeBase(
                {
                    tagName: 'fintech',
                    newsletters: [
                        { title: 'AI Funding Weekly', sender: 'editor@aifunding.example', date_added: '2026-06-01', summary: 'Funding rounds galore.' },
                    ],
                    entities: [
                        { name: 'Anthropic', node_type: 'company', mention_count: 4, connections: ['OpenAI'] },
                    ],
                    existingArticles: [{ title: 'Prior art article' }],
                },
                language
            );
            expect(await lastRequest()).toMatchSnapshot();
        });

        it(`queryKnowledgeBase (${language})`, async () => {
            await queryKnowledgeBase(
                'What happened with fintech funding?',
                {
                    tagName: 'fintech',
                    articles: [{ title: 'Funding trends', summary: 'Rounds are bigger.' }],
                    recentQA: [{ question: 'Prior question?', answer: 'Prior answer.' }],
                    indexArticle: { content: 'Master index body.' },
                },
                language
            );
            expect(await lastRequest()).toMatchSnapshot();
        });
    }

    it('falls back to Spanish for an unknown language', async () => {
        await generateSummary(NEWSLETTER, 'fr');
        const body = await lastRequest();
        expect(body.messages[0].content).toContain('Crea un resumen');
    });

    for (const language of ['es', 'en']) {
        it(`translateText (${language})`, async () => {
            await translateText('- Point one\n- Point two', language);
            expect(await lastRequest()).toMatchSnapshot();
        });
    }
});
