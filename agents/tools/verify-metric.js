/**
 * verify_metric — the fabrication guard.
 *
 * Background: Brevis has been burned by content that ships fake numbers
 * (see Antonio's "never fabricate metrics" rule). Any numeric claim Editor or
 * Growth wants to publish has to come from somewhere checkable.
 *
 * This tool verifies a claimed number against an authoritative source:
 *   - source_kind='db_lookup': re-run a named DB template; check the claimed
 *     value appears in the result.
 *   - source_kind='literal':   the source text was passed in directly; we
 *     check the number is present in that text via a strict regex.
 *
 * Returns:
 *   { ok: true,  verified: true|false, observed, claimed, delta, note }
 *
 * The CALLER (Editor/Growth) is responsible for skipping the publish if
 * `verified` is false. We return ok=true even on a verification miss so the
 * agent can decide what to do (rephrase, drop the claim, escalate).
 *
 * Design note: this tool is NOT an oracle of truth — it just checks consistency.
 * If the source itself is wrong, the verification will pass on a wrong number.
 * The point is to catch hallucinated numbers, where the source has no support
 * for the claim at all.
 */
import { getPool } from '../runtime/db.js';
import { TEMPLATES } from './db-tools.js';
import { registerTool } from './registry.js';

const NUMERIC_REGEX = /-?\d+(?:\.\d+)?/g;

function extractNumbers(text) {
    if (typeof text !== 'string') return [];
    const matches = text.match(NUMERIC_REGEX) ?? [];
    return matches.map(Number).filter(n => !Number.isNaN(n));
}

registerTool({
    name: 'verify_metric',
    description:
        'Check a numeric claim against an authoritative source before publishing it. ' +
        'Editor and Growth MUST call this before sending any newsletter or post that includes a number. ' +
        'Returns { ok, verified, observed, claimed, delta, note }. ' +
        'If verified=false, REPHRASE the claim or drop it; do not publish.',
    inputSchema: {
        type: 'object',
        properties: {
            claim_text: {
                type: 'string',
                description: 'The full sentence or phrase that contains the numeric claim. For audit logs.',
            },
            claimed_value: {
                type: 'number',
                description: 'The exact numeric value being claimed (e.g. 128, 47.5).',
            },
            source_kind: {
                type: 'string',
                enum: ['db_lookup', 'literal'],
                description:
                    "'db_lookup' = re-run a named DB template and check the value appears. " +
                    "'literal' = check the value appears in a provided text snippet.",
            },
            source_ref: {
                type: 'object',
                description:
                    "For source_kind='db_lookup': { template, params, expected_field }. " +
                    "For source_kind='literal': { text }.",
                additionalProperties: true,
            },
            tolerance_pct: {
                type: 'number',
                description: 'Optional. % difference allowed between claimed and observed (default 0 = exact match).',
                default: 0,
            },
        },
        required: ['claim_text', 'claimed_value', 'source_kind', 'source_ref'],
    },
    handler: async (args) => {
        const claimed = Number(args.claimed_value);
        if (Number.isNaN(claimed)) {
            return { ok: false, error: 'claimed_value is not a number' };
        }
        const tol = Number(args.tolerance_pct ?? 0);

        let observedCandidates = [];
        let sourceNote = '';

        if (args.source_kind === 'db_lookup') {
            const ref = args.source_ref ?? {};
            const t = TEMPLATES[ref.template];
            if (!t) {
                return {
                    ok: true, verified: false,
                    observed: null, claimed, delta: null,
                    note: `Unknown db template: ${ref.template}`,
                };
            }
            const ordered = (t.params ?? []).map(p => ref.params?.[p] ?? null);
            try {
                const pool = getPool();
                const r = await pool.query(t.sql, ordered);
                if (r.rowCount === 0) {
                    return {
                        ok: true, verified: false,
                        observed: null, claimed, delta: null,
                        note: 'DB template returned 0 rows.',
                    };
                }
                // If expected_field is given, pull just that. Else inspect every numeric column of the first row.
                const row = r.rows[0];
                if (ref.expected_field) {
                    const v = Number(row[ref.expected_field]);
                    if (!Number.isNaN(v)) observedCandidates.push(v);
                } else {
                    for (const v of Object.values(row)) {
                        const n = Number(v);
                        if (!Number.isNaN(n)) observedCandidates.push(n);
                    }
                }
                sourceNote = `db_lookup(${ref.template})`;
            } catch (err) {
                return { ok: false, error: `db_lookup error: ${err.message}` };
            }
        } else if (args.source_kind === 'literal') {
            const text = args.source_ref?.text ?? '';
            observedCandidates = extractNumbers(text);
            sourceNote = `literal text (${text.length} chars)`;
        } else {
            return { ok: false, error: `unknown source_kind: ${args.source_kind}` };
        }

        // Match: exact, or within tolerance%, against any observed candidate.
        const matched = observedCandidates.find(obs => {
            if (obs === claimed) return true;
            if (tol > 0 && claimed !== 0) {
                const pctDiff = Math.abs(obs - claimed) / Math.abs(claimed) * 100;
                return pctDiff <= tol;
            }
            return false;
        });

        if (matched != null) {
            return {
                ok: true, verified: true,
                observed: matched, claimed,
                delta: matched - claimed,
                note: `Match in ${sourceNote}.`,
            };
        }
        return {
            ok: true, verified: false,
            observed: observedCandidates.length > 0 ? observedCandidates[0] : null,
            claimed, delta: null,
            note: `Claimed ${claimed} not found in ${sourceNote}. Candidates: [${observedCandidates.slice(0, 5).join(', ')}].`,
        };
    },
});

export { extractNumbers };
