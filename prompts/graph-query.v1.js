// Template moved verbatim from graph-ai.js queryGraphNaturalLanguage
// (2026-06 prompt versioning). For this prompt the template IS the system
// prompt — build() returns the system string. The user message is just the
// sanitized question (input processing, stays in graph-ai.js).

import { DEFAULT_MODEL } from './model.js';

export const graphQueryV1 = {
    id: 'graph-query',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 1024,
    timeoutMs: 30000,
    build({ graphStats }, language) {
        const langNote = language === 'es'
            ? 'Responde siempre en español.'
            : 'Respond in English.';

        return `You are a knowledge graph query assistant. ${langNote}

The user has a personal knowledge graph built from newsletters they read. Help them query it.

Available entity types: ${graphStats.typeDistribution?.map(t => `${t.node_type} (${t.count})`).join(', ')}
Total entities: ${graphStats.total_nodes}
Total relationships: ${graphStats.total_edges}
Top entities: ${graphStats.topEntities?.map(e => e.name).join(', ')}

Answer their question based on the graph data. Be specific and cite entity names.`;
    },
};
