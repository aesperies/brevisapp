/**
 * graph-service.js
 *
 * Core knowledge graph operations: entity resolution, edge management,
 * community detection, and centrality scoring.
 *
 * All data stored in PostgreSQL with JSONB — no Neo4j or external graph DB.
 * Inspired by Graphify's NetworkX + Leiden approach, adapted for SQL.
 *
 * Fixes applied from LLM Council review:
 * - Race-safe entity resolution via ON CONFLICT (Eng #5)
 * - Transaction safety for merge/delete operations (Eng #3)
 * - getNewsletterEntities abstracted from routes (DX fix)
 * - Community detection with node limit (Eng scaling fix)
 */

import { getDb } from './database.js';

// Track whether fuzzystrmatch extension is available
let hasFuzzyMatching = false;

export function setFuzzyMatchingAvailable(available) {
    hasFuzzyMatching = available;
}

// ============= ENTITY RESOLUTION (Race-safe) =============

/**
 * Resolve an extracted entity to an existing graph node or create a new one.
 * Uses ON CONFLICT for race-safe upsert — no duplicate nodes even under concurrency.
 *
 * @param {number} userId
 * @param {object} entity - { name, type, aliases?, metadata?, sentiment?, relevance? }
 * @returns {object} The resolved or created graph_nodes row
 */
export async function resolveEntity(userId, entity) {
    const db = getDb();
    const canonicalName = normalizeEntityName(entity.name);

    // 1. Exact match on canonical_name
    let result = await db.query(
        `SELECT * FROM graph_nodes
         WHERE user_id = $1 AND LOWER(canonical_name) = LOWER($2) AND node_type = $3`,
        [userId, canonicalName, entity.type]
    );

    if (result.rows.length) {
        return await mergeIntoExisting(result.rows[0], entity);
    }

    // 2. Alias match — check if this name is a known alias of another entity
    result = await db.query(
        `SELECT * FROM graph_nodes
         WHERE user_id = $1 AND node_type = $2
           AND (metadata->'aliases') @> $3::jsonb`,
        [userId, entity.type, JSON.stringify([canonicalName.toLowerCase()])]
    );

    if (result.rows.length) {
        return await mergeIntoExisting(result.rows[0], entity);
    }

    // 3. Fuzzy match — short Levenshtein distance for similar names
    //    Only if fuzzystrmatch extension is available and name is long enough
    if (canonicalName.length > 4 && hasFuzzyMatching) {
        try {
            result = await db.query(
                `SELECT * FROM graph_nodes
                 WHERE user_id = $1 AND node_type = $2
                   AND LOWER(canonical_name) != LOWER($3)
                   AND levenshtein(LOWER(canonical_name), LOWER($3)) <= 2
                 ORDER BY mention_count DESC
                 LIMIT 1`,
                [userId, entity.type, canonicalName]
            );

            if (result.rows.length) {
                return await mergeIntoExisting(result.rows[0], entity);
            }
        } catch (err) {
            // Fuzzy matching failed — silently continue to create
            console.warn('📊 [Graph] Fuzzy matching query failed, skipping:', err.message);
        }
    }

    // 4. No match — race-safe insert with ON CONFLICT
    return await createNodeSafe(userId, entity);
}

/**
 * Race-safe node creation using ON CONFLICT.
 * If another process creates the same node between our SELECT and INSERT,
 * we update instead of failing with a duplicate.
 */
async function createNodeSafe(userId, entity) {
    const db = getDb();
    const canonicalName = normalizeEntityName(entity.name);
    const aliases = (entity.aliases || []).map(a => a.toLowerCase());

    const metadata = {
        ...(entity.metadata || {}),
        aliases
    };

    // Try insert; on conflict (same user + canonical_name + type), merge instead
    const result = await db.query(
        `INSERT INTO graph_nodes (user_id, name, node_type, canonical_name, metadata, mention_count, first_seen, last_seen)
         VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ON CONSTRAINT graph_nodes_user_canonical_type
         DO UPDATE SET
            mention_count = graph_nodes.mention_count + 1,
            last_seen = CURRENT_TIMESTAMP,
            metadata = graph_nodes.metadata || $5::jsonb
         RETURNING *`,
        [userId, entity.name, entity.type, canonicalName, JSON.stringify(metadata)]
    );

    return result.rows[0];
}

/**
 * Merge new mention data into an existing node.
 * Increments mention_count, updates last_seen, merges aliases.
 */
async function mergeIntoExisting(existingNode, entity) {
    const db = getDb();

    // Merge aliases
    const existingAliases = existingNode.metadata?.aliases || [];
    const newAliases = (entity.aliases || []).map(a => a.toLowerCase());
    const entityNameLower = entity.name.toLowerCase();

    const mergedAliases = [...new Set([...existingAliases, ...newAliases, entityNameLower])];

    // Merge metadata (new data doesn't overwrite existing, only fills gaps)
    const mergedMetadata = {
        ...existingNode.metadata,
        ...(entity.metadata || {}),
        aliases: mergedAliases
    };

    const result = await db.query(
        `UPDATE graph_nodes
         SET mention_count = mention_count + 1,
             last_seen = CURRENT_TIMESTAMP,
             metadata = $1
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(mergedMetadata), existingNode.id]
    );

    return result.rows[0];
}

// ============= EDGE MANAGEMENT =============

/**
 * Create or strengthen a relationship edge between two nodes.
 * If the edge already exists, increment weight and add evidence.
 */
export async function createEdge(userId, { sourceId, targetId, relationship, isInferred, evidence }) {
    const db = getDb();

    // Check for existing edge
    const existing = await db.query(
        `SELECT * FROM graph_edges
         WHERE user_id = $1 AND source_id = $2 AND target_id = $3 AND relationship = $4`,
        [userId, sourceId, targetId, relationship]
    );

    if (existing.rows.length) {
        // Strengthen existing edge
        const existingEvidence = existing.rows[0].evidence || [];
        const updatedEvidence = [...existingEvidence, evidence].slice(-20); // Keep last 20 evidence items

        const result = await db.query(
            `UPDATE graph_edges
             SET weight = weight + 1,
                 last_seen = CURRENT_TIMESTAMP,
                 evidence = $1
             WHERE id = $2
             RETURNING *`,
            [JSON.stringify(updatedEvidence), existing.rows[0].id]
        );
        return result.rows[0];
    }

    // Create new edge
    const result = await db.query(
        `INSERT INTO graph_edges (user_id, source_id, target_id, relationship, weight, evidence, is_inferred, last_seen)
         VALUES ($1, $2, $3, $4, 1, $5, $6, CURRENT_TIMESTAMP)
         RETURNING *`,
        [userId, sourceId, targetId, relationship, JSON.stringify([evidence]), isInferred]
    );

    return result.rows[0];
}

// ============= NEWSLETTER ↔ ENTITY LINKING =============

/**
 * Link a newsletter to an extracted entity with context.
 */
export async function linkNewsletterEntity(newsletterId, nodeId, { excerpt, sentiment, relevance }) {
    const db = getDb();

    await db.query(
        `INSERT INTO newsletter_entities (newsletter_id, node_id, excerpt, sentiment, relevance)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (newsletter_id, node_id) DO UPDATE
         SET excerpt = COALESCE(EXCLUDED.excerpt, newsletter_entities.excerpt),
             sentiment = COALESCE(EXCLUDED.sentiment, newsletter_entities.sentiment),
             relevance = GREATEST(EXCLUDED.relevance, newsletter_entities.relevance)`,
        [newsletterId, nodeId, excerpt, sentiment, relevance]
    );
}

/**
 * Get entities for a specific newsletter (abstracted from routes — DX fix).
 */
export async function getNewsletterEntities(userId, newsletterId) {
    const db = getDb();

    const result = await db.query(
        `SELECT gn.*, ne.excerpt, ne.sentiment, ne.relevance
         FROM newsletter_entities ne
         JOIN graph_nodes gn ON gn.id = ne.node_id
         WHERE ne.newsletter_id = $1 AND gn.user_id = $2
         ORDER BY ne.relevance DESC`,
        [newsletterId, userId]
    );

    return result.rows;
}

// ============= GRAPH QUERIES =============

/**
 * Get full graph data for vis.js visualization.
 * Returns nodes and edges in vis.js-compatible format.
 */
export async function getGraphData(userId, filters = {}) {
    const db = getDb();
    const {
        nodeTypes, communityId, search, dateFrom, dateTo,
        relationships, minMentions, includeInferred = true,
        limit = 500
    } = filters;

    // Build node query with optional filters
    let nodeQuery = `SELECT * FROM graph_nodes WHERE user_id = $1`;
    const nodeParams = [userId];
    let paramIdx = 2;

    if (nodeTypes && nodeTypes.length) {
        nodeQuery += ` AND node_type = ANY($${paramIdx})`;
        nodeParams.push(nodeTypes);
        paramIdx++;
    }
    if (communityId !== undefined && communityId !== null) {
        nodeQuery += ` AND community_id = $${paramIdx}`;
        nodeParams.push(communityId);
        paramIdx++;
    }
    if (search) {
        nodeQuery += ` AND (LOWER(name) LIKE $${paramIdx} OR LOWER(canonical_name) LIKE $${paramIdx})`;
        nodeParams.push(`%${search.toLowerCase()}%`);
        paramIdx++;
    }
    if (dateFrom) {
        nodeQuery += ` AND last_seen >= $${paramIdx}`;
        nodeParams.push(dateFrom);
        paramIdx++;
    }
    if (dateTo) {
        nodeQuery += ` AND first_seen <= $${paramIdx}`;
        nodeParams.push(dateTo);
        paramIdx++;
    }
    if (minMentions) {
        nodeQuery += ` AND mention_count >= $${paramIdx}`;
        nodeParams.push(minMentions);
        paramIdx++;
    }

    nodeQuery += ` ORDER BY mention_count DESC LIMIT $${paramIdx}`;
    nodeParams.push(limit);

    const nodesResult = await db.query(nodeQuery, nodeParams);
    const nodeIds = nodesResult.rows.map(n => n.id);

    // Get edges between visible nodes (with optional relationship/inferred filter)
    let edges = [];
    if (nodeIds.length > 0) {
        let edgeQuery = `SELECT * FROM graph_edges
             WHERE user_id = $1 AND source_id = ANY($2) AND target_id = ANY($2)`;
        const edgeParams = [userId, nodeIds];
        let edgeParamIdx = 3;

        if (relationships && relationships.length) {
            edgeQuery += ` AND relationship = ANY($${edgeParamIdx})`;
            edgeParams.push(relationships);
            edgeParamIdx++;
        }
        if (!includeInferred) {
            edgeQuery += ` AND is_inferred = false`;
        }

        edgeQuery += ` ORDER BY weight DESC`;

        const edgesResult = await db.query(edgeQuery, edgeParams);
        edges = edgesResult.rows;
    }

    // Transform to vis.js format
    return {
        nodes: nodesResult.rows.map(formatNodeForVis),
        edges: edges.map(formatEdgeForVis)
    };
}

/**
 * Get a single entity with all its connections and newsletters.
 */
export async function getEntityDetail(userId, nodeId) {
    const db = getDb();

    // Get the node
    const nodeResult = await db.query(
        'SELECT * FROM graph_nodes WHERE id = $1 AND user_id = $2',
        [nodeId, userId]
    );
    if (!nodeResult.rows.length) return null;

    const node = nodeResult.rows[0];

    // Get connected nodes (1 hop)
    const connectionsResult = await db.query(
        `SELECT DISTINCT
            gn.*,
            ge.relationship,
            ge.weight,
            CASE WHEN ge.source_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction
         FROM graph_edges ge
         JOIN graph_nodes gn ON (
            CASE WHEN ge.source_id = $1 THEN ge.target_id ELSE ge.source_id END = gn.id
         )
         WHERE ge.user_id = $2 AND (ge.source_id = $1 OR ge.target_id = $1)
         ORDER BY ge.weight DESC`,
        [nodeId, userId]
    );

    // Get newsletters mentioning this entity
    const newslettersResult = await db.query(
        `SELECT n.id, n.title, n.sender, n.date_added, ne.excerpt, ne.sentiment, ne.relevance
         FROM newsletter_entities ne
         JOIN newsletters n ON n.id = ne.newsletter_id
         WHERE ne.node_id = $1 AND n.user_id = $2
         ORDER BY n.date_added DESC
         LIMIT 50`,
        [nodeId, userId]
    );

    return {
        ...node,
        connections: connectionsResult.rows,
        newsletters: newslettersResult.rows
    };
}

/**
 * Get graph statistics for a user.
 */
export async function getGraphStats(userId) {
    const db = getDb();

    const stats = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM graph_nodes WHERE user_id = $1) as total_nodes,
            (SELECT COUNT(*) FROM graph_edges WHERE user_id = $1) as total_edges,
            (SELECT COUNT(DISTINCT community_id) FROM graph_nodes WHERE user_id = $1 AND community_id IS NOT NULL) as total_communities,
            (SELECT COUNT(DISTINCT newsletter_id) FROM newsletter_entities ne JOIN newsletters n ON n.id = ne.newsletter_id WHERE n.user_id = $1) as newsletters_with_entities`,
        [userId]
    );

    // Top entities by mention count
    const topEntities = await db.query(
        `SELECT name, node_type, mention_count, centrality
         FROM graph_nodes WHERE user_id = $1
         ORDER BY mention_count DESC LIMIT 10`,
        [userId]
    );

    // Entity type distribution
    const typeDistribution = await db.query(
        `SELECT node_type, COUNT(*) as count
         FROM graph_nodes WHERE user_id = $1
         GROUP BY node_type ORDER BY count DESC`,
        [userId]
    );

    // Top relationships
    const topRelationships = await db.query(
        `SELECT relationship, COUNT(*) as count
         FROM graph_edges WHERE user_id = $1
         GROUP BY relationship ORDER BY count DESC LIMIT 10`,
        [userId]
    );

    return {
        ...stats.rows[0],
        topEntities: topEntities.rows,
        typeDistribution: typeDistribution.rows,
        topRelationships: topRelationships.rows
    };
}

/**
 * Get detected communities with member summaries.
 */
export async function getCommunities(userId) {
    const db = getDb();

    const communities = await db.query(
        `SELECT
            community_id,
            COUNT(*) as member_count,
            array_agg(name ORDER BY mention_count DESC) as top_members,
            array_agg(DISTINCT node_type) as entity_types
         FROM graph_nodes
         WHERE user_id = $1 AND community_id IS NOT NULL
         GROUP BY community_id
         ORDER BY member_count DESC`,
        [userId]
    );

    // Trim top_members to top 5
    return communities.rows.map(c => ({
        ...c,
        top_members: (c.top_members || []).slice(0, 5)
    }));
}

// ============= COMMUNITY DETECTION (with node limit) =============

const MAX_COMMUNITY_NODES = 10000;

/**
 * Community detection using connected components + degree centrality.
 * Capped at MAX_COMMUNITY_NODES to prevent timeout on large graphs.
 */
export async function updateCommunities(userId) {
    const db = getDb();

    // 1. Get nodes (capped)
    const nodes = await db.query(
        'SELECT id FROM graph_nodes WHERE user_id = $1 ORDER BY mention_count DESC LIMIT $2',
        [userId, MAX_COMMUNITY_NODES]
    );
    const edges = await db.query(
        'SELECT source_id, target_id, weight FROM graph_edges WHERE user_id = $1',
        [userId]
    );

    if (nodes.rows.length === 0) return { communities: 0, nodes: 0 };

    if (nodes.rows.length === MAX_COMMUNITY_NODES) {
        console.warn(`📊 [Graph] Community detection capped at ${MAX_COMMUNITY_NODES} nodes for user ${userId}`);
    }

    const nodeIdSet = new Set(nodes.rows.map(n => n.id));

    // 2. Build adjacency list (only for nodes in our set)
    const adjacency = {};
    for (const node of nodes.rows) {
        adjacency[node.id] = [];
    }
    for (const edge of edges.rows) {
        if (nodeIdSet.has(edge.source_id) && nodeIdSet.has(edge.target_id)) {
            adjacency[edge.source_id].push({ to: edge.target_id, weight: edge.weight });
            adjacency[edge.target_id].push({ to: edge.source_id, weight: edge.weight });
        }
    }

    // 3. Connected components via BFS
    const visited = new Set();
    const communities = [];

    for (const node of nodes.rows) {
        if (visited.has(node.id)) continue;

        const community = [];
        const queue = [node.id];

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            community.push(current);

            for (const neighbor of (adjacency[current] || [])) {
                if (!visited.has(neighbor.to)) {
                    queue.push(neighbor.to);
                }
            }
        }

        communities.push(community);
    }

    // 4. Assign community IDs (sorted by size, largest first) — batch update
    communities.sort((a, b) => b.length - a.length);

    for (let i = 0; i < communities.length; i++) {
        if (communities[i].length > 0) {
            await db.query(
                `UPDATE graph_nodes SET community_id = $1
                 WHERE id = ANY($2) AND user_id = $3`,
                [i, communities[i], userId]
            );
        }
    }

    // 5. Update centrality (degree centrality = edges / max_edges)
    const maxDegree = Math.max(...Object.values(adjacency).map(a => a.length), 1);

    // Batch update centrality in chunks of 100
    const centralityUpdates = Object.entries(adjacency).map(([nodeId, neighbors]) => ({
        id: parseInt(nodeId),
        centrality: neighbors.length / maxDegree
    }));

    for (let i = 0; i < centralityUpdates.length; i += 100) {
        const chunk = centralityUpdates.slice(i, i + 100);
        const cases = chunk.map((u, idx) => `WHEN id = $${idx * 2 + 2} THEN $${idx * 2 + 3}::float`).join(' ');
        const ids = chunk.map(u => u.id);
        const params = [userId];
        chunk.forEach(u => { params.push(u.id); params.push(u.centrality); });

        if (ids.length > 0) {
            await db.query(
                `UPDATE graph_nodes SET centrality = CASE ${cases} ELSE centrality END
                 WHERE user_id = $1 AND id = ANY($${params.length + 1})`,
                [...params, ids]
            );
        }
    }

    console.log(`📊 [Graph] Updated communities for user ${userId}: ${communities.length} communities, ${nodes.rows.length} nodes`);
    return { communities: communities.length, nodes: nodes.rows.length };
}

// ============= NODE MANAGEMENT (Transaction-safe) =============

/**
 * Merge two nodes into one (user-initiated dedup).
 * Wrapped in a transaction to prevent corruption on crash.
 */
export async function mergeNodes(userId, keepNodeId, removeNodeId) {
    const db = getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Get both nodes
        const keepResult = await client.query(
            'SELECT * FROM graph_nodes WHERE id = $1 AND user_id = $2',
            [keepNodeId, userId]
        );
        const removeResult = await client.query(
            'SELECT * FROM graph_nodes WHERE id = $1 AND user_id = $2',
            [removeNodeId, userId]
        );

        if (!keepResult.rows.length || !removeResult.rows.length) {
            await client.query('ROLLBACK');
            throw new Error('One or both nodes not found');
        }

        const keepData = keepResult.rows[0];
        const removeData = removeResult.rows[0];

        // Merge metadata and aliases
        const mergedAliases = [
            ...(keepData.metadata?.aliases || []),
            ...(removeData.metadata?.aliases || []),
            removeData.canonical_name.toLowerCase(),
            removeData.name.toLowerCase()
        ];
        const mergedMetadata = {
            ...removeData.metadata,
            ...keepData.metadata,
            aliases: [...new Set(mergedAliases)]
        };

        // Update kept node
        await client.query(
            `UPDATE graph_nodes SET
                mention_count = mention_count + $1,
                metadata = $2,
                first_seen = LEAST(first_seen, $3),
                last_seen = GREATEST(last_seen, $4)
             WHERE id = $5`,
            [removeData.mention_count, JSON.stringify(mergedMetadata), removeData.first_seen, removeData.last_seen, keepNodeId]
        );

        // Reassign edges from removed node to kept node
        await client.query(
            'UPDATE graph_edges SET source_id = $1 WHERE source_id = $2 AND user_id = $3',
            [keepNodeId, removeNodeId, userId]
        );
        await client.query(
            'UPDATE graph_edges SET target_id = $1 WHERE target_id = $2 AND user_id = $3',
            [keepNodeId, removeNodeId, userId]
        );

        // Reassign newsletter links (avoid conflicts)
        await client.query(
            `UPDATE newsletter_entities SET node_id = $1
             WHERE node_id = $2
             AND newsletter_id NOT IN (SELECT newsletter_id FROM newsletter_entities WHERE node_id = $1)`,
            [keepNodeId, removeNodeId]
        );

        // Delete removed node (cascades remaining newsletter_entities)
        await client.query(
            'DELETE FROM graph_nodes WHERE id = $1 AND user_id = $2',
            [removeNodeId, userId]
        );

        // Remove self-referencing edges
        await client.query(
            'DELETE FROM graph_edges WHERE source_id = target_id AND user_id = $1',
            [userId]
        );

        await client.query('COMMIT');
        return keepData;

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Delete a node and all its connections (transaction-safe).
 */
export async function deleteNode(userId, nodeId) {
    const db = getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM graph_edges WHERE (source_id = $1 OR target_id = $1) AND user_id = $2', [nodeId, userId]);
        await client.query('DELETE FROM newsletter_entities WHERE node_id = $1', [nodeId]);
        await client.query('DELETE FROM graph_nodes WHERE id = $1 AND user_id = $2', [nodeId, userId]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Update a node (rename, reclassify, edit metadata).
 */
export async function updateNode(userId, nodeId, updates) {
    const db = getDb();
    const allowed = ['name', 'node_type', 'canonical_name', 'metadata'];
    const fields = Object.keys(updates).filter(f => allowed.includes(f));

    if (fields.length === 0) return null;

    const setClause = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const values = fields.map(f => f === 'metadata' ? JSON.stringify(updates[f]) : updates[f]);

    const result = await db.query(
        `UPDATE graph_nodes SET ${setClause} WHERE id = $1 AND user_id = $2 RETURNING *`,
        [nodeId, userId, ...values]
    );

    return result.rows[0];
}

// ============= VIS.JS FORMATTING =============

const NODE_COLORS = {
    person: { background: '#00b894', border: '#00a381' },
    company: { background: '#74b9ff', border: '#5fa8f0' },
    fund: { background: '#a29bfe', border: '#8c84e8' },
    deal: { background: '#fdcb6e', border: '#e8b84d' },
    technology: { background: '#e17055', border: '#c85e46' },
    regulation: { background: '#d63031', border: '#b52728' },
    topic: { background: '#636e72', border: '#535c60' },
    event: { background: '#fd79a8', border: '#e8689a' },
    location: { background: '#55efc4', border: '#45d6b0' },
    token: { background: '#ffeaa7', border: '#e8d490' },
    protocol: { background: '#6c5ce7', border: '#5a4bd6' },
    dao: { background: '#e84393', border: '#d63384' },
    chain: { background: '#00cec9', border: '#00b5b0' },
    organization: { background: '#74b9ff', border: '#5fa8f0' },
    product: { background: '#fab1a0', border: '#e8a090' },
    default: { background: '#dfe6e9', border: '#b2bec3' }
};

const NODE_SHAPES = {
    person: 'dot',
    company: 'diamond',
    fund: 'triangle',
    deal: 'star',
    technology: 'square',
    regulation: 'triangleDown',
    topic: 'hexagon',
    default: 'dot'
};

function formatNodeForVis(node) {
    const colors = NODE_COLORS[node.node_type] || NODE_COLORS.default;
    const shape = NODE_SHAPES[node.node_type] || NODE_SHAPES.default;

    // Scale node size by mention count (min 15, max 50)
    const size = Math.min(50, Math.max(15, 10 + (node.mention_count * 3)));

    return {
        id: node.id,
        label: node.name,
        title: `${node.name}\nType: ${node.node_type}\nMentions: ${node.mention_count}${node.community_id !== null ? `\nCluster: ${node.community_id}` : ''}`,
        group: node.node_type,
        size,
        shape,
        color: colors,
        font: { color: '#e8e8e8', size: 12 },
        raw: {
            id: node.id,
            name: node.name,
            type: node.node_type,
            mentionCount: node.mention_count,
            centrality: node.centrality,
            communityId: node.community_id,
            firstSeen: node.first_seen,
            lastSeen: node.last_seen,
            metadata: node.metadata
        }
    };
}

function formatEdgeForVis(edge) {
    return {
        from: edge.source_id,
        to: edge.target_id,
        label: edge.relationship?.replace(/_/g, ' '),
        title: `${edge.relationship} (strength: ${edge.weight})`,
        value: edge.weight,
        arrows: 'to',
        color: {
            color: edge.is_inferred ? '#636e72' : '#a29bfe',
            opacity: Math.min(1, 0.3 + (edge.weight * 0.1))
        },
        dashes: edge.is_inferred,
        font: { color: '#888', size: 10, strokeWidth: 0 },
        raw: {
            id: edge.id,
            relationship: edge.relationship,
            weight: edge.weight,
            isInferred: edge.is_inferred,
            evidence: edge.evidence
        }
    };
}

// ============= UTILITY =============

function normalizeEntityName(name) {
    if (!name) return '';
    return name
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/["\u201C\u201D]/g, '"')
        .replace(/['\u2018\u2019]/g, "'");
}
