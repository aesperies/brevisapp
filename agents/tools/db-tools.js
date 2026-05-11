/**
 * Database tools for agents.
 *
 * Design choice: instead of giving the LLM arbitrary SQL (where it can hallucinate
 * wrong queries, leak data, or modify rows), we expose a `db_lookup` tool that
 * takes a *named template* + parameters. The agent picks a template by name; the
 * code knows the actual SQL.
 *
 * Adding a new template = code change. That's the point.
 */
import { getPool } from '../runtime/db.js';
import { registerTool } from './registry.js';

// ─── Named query templates ──────────────────────────────────────────────────
// Each template returns a Postgres `pg` result. Keep these read-only.
const TEMPLATES = {
    user_profile: {
        description: 'Get a user\'s id, email, name, language, plan.',
        sql: `SELECT id, email, name, language, plan
              FROM users
              WHERE id = $1::int AND is_active = 1`,
        params: ['user_id'],
    },
    digests_for_user: {
        description: 'List a user\'s active (non-paused) digests with their tag set.',
        sql: `SELECT d.id, d.name, d.cadence, d.time_of_day, d.day_of_week,
                     d.day_of_month, d.timezone, d.language, d.last_sent_at,
                     ARRAY_AGG(t.id ORDER BY t.id) FILTER (WHERE t.id IS NOT NULL) AS tag_ids,
                     ARRAY_AGG(t.name ORDER BY t.id) FILTER (WHERE t.name IS NOT NULL) AS tag_names
              FROM digests d
              LEFT JOIN digest_tags dt ON dt.digest_id = d.id
              LEFT JOIN tags t ON t.id = dt.tag_id
              WHERE d.user_id = $1::int AND d.paused = FALSE
              GROUP BY d.id`,
        params: ['user_id'],
    },
    newsletters_for_digest: {
        description: 'Pull newsletters in a date window for a user, optionally filtered by a tag-id list.',
        sql: `SELECT n.id, n.title, n.sender, n.summary, n.url, n.date_added,
                     COALESCE(
                         ARRAY_AGG(t.name ORDER BY t.id) FILTER (WHERE t.id IS NOT NULL),
                         '{}'::text[]
                     ) AS tag_names
              FROM newsletters n
              LEFT JOIN newsletter_tags nt ON nt.newsletter_id = n.id
              LEFT JOIN tags t ON t.id = nt.tag_id
              WHERE n.user_id = $1::int
                AND n.date_added >= $2::timestamptz
                AND n.date_added <  $3::timestamptz
                AND ( $4::int[] IS NULL
                      OR EXISTS (
                          SELECT 1 FROM newsletter_tags nt2
                          WHERE nt2.newsletter_id = n.id AND nt2.tag_id = ANY($4::int[])
                      ))
              GROUP BY n.id
              ORDER BY n.date_added DESC
              LIMIT 200`,
        params: ['user_id', 'from_iso', 'to_iso', 'tag_ids_or_null'],
    },
    count_users_total: {
        description: 'Return total number of active users. Used by verify_metric.',
        sql: `SELECT COUNT(*)::int AS n FROM users WHERE is_active = 1`,
        params: [],
    },
    count_newsletters_for_user: {
        description: 'Return count of newsletters for a user. Used by verify_metric.',
        sql: `SELECT COUNT(*)::int AS n FROM newsletters WHERE user_id = $1::int`,
        params: ['user_id'],
    },
};

// Per-template description block, generated once so the LLM can see the exact
// parameter keys each template expects. The earlier shorter form let the agent
// guess reasonable-but-wrong names (e.g. start_date vs from_iso) — silent
// param-mismatch returned 0 rows.
const TEMPLATE_DOC = Object.entries(TEMPLATES)
    .map(([name, t]) => {
        const sig = (t.params ?? []).length === 0 ? '()' : `(${t.params.join(', ')})`;
        return `  - ${name}${sig}: ${t.description}`;
    })
    .join('\n');

registerTool({
    name: 'db_lookup',
    description:
        'Run an allowlisted read-only DB lookup. Pick a template by name and pass its parameters as { name: value }. ' +
        'Use the EXACT parameter names listed below — wrong keys silently null-coalesce and return 0 rows.\n' +
        'Templates:\n' + TEMPLATE_DOC + '\n' +
        'Returns { ok, rows, rowCount } on success.',
    inputSchema: {
        type: 'object',
        properties: {
            template: {
                type: 'string',
                description: 'One of: ' + Object.keys(TEMPLATES).join(', '),
                enum: Object.keys(TEMPLATES),
            },
            params: {
                type: 'object',
                description: 'Parameter values keyed by name. See template definition for which params it expects.',
                additionalProperties: true,
            },
        },
        required: ['template'],
    },
    handler: async (args) => {
        const t = TEMPLATES[args.template];
        if (!t) return { ok: false, error: `unknown template: ${args.template}` };
        const ordered = (t.params ?? []).map(p => args.params?.[p] ?? null);
        const pool = getPool();
        try {
            const r = await pool.query(t.sql, ordered);
            return { ok: true, rows: r.rows, rowCount: r.rowCount };
        } catch (err) {
            return { ok: false, error: err.message, template: args.template };
        }
    },
});

// Internal export for tests/util usage outside the LLM tool path.
export { TEMPLATES };
