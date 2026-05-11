/**
 * Draft tools — Editor's primary write path.
 *
 * In dry-run mode (Day 2) Editor calls `draft_create` and stops. The runtime
 * never invokes `newsletter_send`. On Day 3 we'll wire `newsletter_send` to
 * promote a draft to a real send via the existing SendGrid path.
 */
import { getPool } from '../runtime/db.js';
import { registerTool } from './registry.js';

registerTool({
    name: 'draft_create',
    description:
        'Persist a newsletter draft for review. Used by the Editor agent in dry-run mode. ' +
        'Returns { ok, draft_id }. NOTHING IS SENT.',
    inputSchema: {
        type: 'object',
        properties: {
            user_id:        { type: 'integer' },
            run_id:         { type: 'string', description: 'The agent run_id (UUID) producing this draft. Read from ctx.runId.' },
            language:       { type: 'string', enum: ['en', 'es'] },
            subject:        { type: 'string' },
            html_body:      { type: 'string' },
            text_body:      { type: 'string', description: 'Plain-text version (optional).' },
            source_count:   { type: 'integer', description: 'Number of source items consolidated.' },
            metric_claims:  {
                type: 'array',
                description: 'List of numeric claims in this draft, each with its source and verification status.',
                items: {
                    type: 'object',
                    properties: {
                        claim:    { type: 'string' },
                        source:   { type: 'string' },
                        verified: { type: 'boolean' },
                    },
                    required: ['claim', 'source', 'verified'],
                },
            },
        },
        required: ['user_id', 'language', 'subject', 'html_body'],
    },
    handler: async (args, ctx) => {
        const pool = getPool();
        // Prefer ctx.runId (the actual agent run that triggered this) over args.run_id.
        const runId = ctx?.runId ?? args.run_id;
        if (!runId) return { ok: false, error: 'no run_id available (ctx.runId missing and args.run_id not provided)' };
        try {
            const r = await pool.query(
                `INSERT INTO newsletter_drafts
                    (user_id, run_id, language, subject, html_body, text_body,
                     source_count, metric_claims, review_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'pending')
                 RETURNING id`,
                [
                    args.user_id,
                    runId,
                    args.language,
                    args.subject,
                    args.html_body,
                    args.text_body ?? null,
                    args.source_count ?? 0,
                    JSON.stringify(args.metric_claims ?? []),
                ]
            );
            return { ok: true, draft_id: r.rows[0].id };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },
});
