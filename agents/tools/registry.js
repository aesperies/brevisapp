/**
 * Tool registry for the agents runtime.
 *
 * Each tool is a definition object:
 *   {
 *     name:        'db.query',
 *     description: 'Run an allowlisted read-only query against the Brevis DB.',
 *     inputSchema: { type: 'object', properties: {...}, required: [...] },
 *     handler:     async (args, ctx) => ({ ok, ...result })
 *   }
 *
 * `inputSchema` is JSON Schema; passed verbatim to Anthropic's `input_schema`.
 *
 * Day-1 stub tools (echo, db_now) live here so the smoke-test path keeps
 * working. Real tools (db_lookup, sources_fetch, llm_summarize, verify_metric,
 * newsletter_send, email_send, metrics_read, social_post_*) are defined in
 * sibling files and registered via `import`-side-effect.
 *
 * Tool naming rule: must match `^[a-zA-Z0-9_-]{1,128}$`. Anthropic's tool API
 * rejects anything else (including dots), and we anchor to the most restrictive
 * provider so a name added today still works against any future model.
 */
import { getPool } from '../runtime/db.js';

const TOOLS = {};

// Provider-compatible name regex. Anthropic's `tools[].custom.name` constraint;
// OpenAI's function names share the same charset. Enforced at registration so
// a bad name never reaches the wire.
const TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Register a tool.
 * @param {{name: string, description: string, inputSchema: object, handler: Function}} def
 */
export function registerTool(def) {
    if (!def?.name)         throw new Error('[tools] registerTool: name required');
    if (!TOOL_NAME_REGEX.test(def.name))
                            throw new Error(`[tools] registerTool(${def.name}): name must match ${TOOL_NAME_REGEX} (no dots, no spaces — Anthropic API constraint)`);
    if (!def?.description)  throw new Error(`[tools] registerTool(${def.name}): description required`);
    if (!def?.inputSchema)  throw new Error(`[tools] registerTool(${def.name}): inputSchema required`);
    if (typeof def?.handler !== 'function')
                            throw new Error(`[tools] registerTool(${def.name}): handler must be a function`);
    if (TOOLS[def.name])    throw new Error(`[tools] duplicate tool registration: ${def.name}`);
    TOOLS[def.name] = def;
}

/**
 * Look up a registered tool's definition (without calling it).
 */
export function getTool(name) {
    return TOOLS[name];
}

/**
 * Return the LLM-shaped definitions for a list of tool names.
 * Used by the runtime to build the `tools` array for the LLM call.
 * @returns {Array<{name, description, input_schema}>}
 */
export function toolDefsForLlm(names) {
    return names
        .map(n => TOOLS[n])
        .filter(Boolean)
        .map(def => ({
            name: def.name,
            description: def.description,
            input_schema: def.inputSchema,
        }));
}

/**
 * Call a tool by name.
 */
export async function dispatchTool(name, args, ctx) {
    const def = TOOLS[name];
    if (!def) throw new Error(`[tools] no tool registered with name: ${name}`);
    return def.handler(args ?? {}, ctx);
}

export function listTools() {
    return Object.keys(TOOLS).sort();
}

// ─── Day-1 stub tools ───────────────────────────────────────────────────────

registerTool({
    name: 'echo',
    description: 'Echoes back its arguments unchanged. Smoke-test only.',
    inputSchema: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Anything to echo.' },
        },
    },
    handler: async (args) => ({ ok: true, echoed: args }),
});

registerTool({
    name: 'db_now',
    description: "Return the database server's current timestamp. Smoke-test only.",
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const pool = getPool();
        const r = await pool.query('SELECT NOW() AS now');
        return { ok: true, now: r.rows[0].now };
    },
});
