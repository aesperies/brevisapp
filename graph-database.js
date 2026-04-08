/**
 * graph-database.js
 *
 * Database migration for knowledge graph tables.
 * Called from setupDatabase() in database.js during startup.
 *
 * INTEGRATION INSTRUCTIONS:
 * In database.js, add after existing table creation:
 *   import { setupGraphTables } from './graph-database.js';
 *   // Inside setupDatabase(), after existing CREATE TABLE statements:
 *   await setupGraphTables(pool);
 */

/**
 * Create all knowledge graph tables and indexes.
 * Uses IF NOT EXISTS so it's safe to run on every startup.
 */
export async function setupGraphTables(pool) {
    try {
        // Enable fuzzystrmatch for Levenshtein distance (entity dedup)
        // This may fail on hosted PostgreSQL without superuser — that's OK,
        // fuzzy matching just won't be available (exact + alias matching still work)
        let fuzzyAvailable = false;
        try {
            await pool.query('CREATE EXTENSION IF NOT EXISTS fuzzystrmatch');
            await pool.query("SELECT levenshtein('test', 'test')");
            fuzzyAvailable = true;
            console.log('  ✅ fuzzystrmatch extension enabled');
        } catch (err) {
            console.log('  ⚠️  fuzzystrmatch extension not available (fuzzy entity matching disabled)');
        }

        // Inform graph-service about fuzzy matching availability
        try {
            const { setFuzzyMatchingAvailable } = await import('./graph-service.js');
            setFuzzyMatchingAvailable(fuzzyAvailable);
        } catch { /* graph-service not yet loaded, will default to false */ }

        // Graph nodes: entities extracted from newsletters
        await pool.query(`
            CREATE TABLE IF NOT EXISTS graph_nodes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(500) NOT NULL,
                node_type VARCHAR(50) NOT NULL,
                canonical_name VARCHAR(500),
                metadata JSONB DEFAULT '{}',
                community_id INTEGER,
                centrality FLOAT DEFAULT 0,
                mention_count INTEGER DEFAULT 1,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Unique constraint for race-safe ON CONFLICT upsert in entity resolution
            -- Use DO NOTHING to skip if constraint already exists
            CREATE UNIQUE INDEX IF NOT EXISTS graph_nodes_user_canonical_type
                ON graph_nodes (user_id, canonical_name, node_type);

            CREATE INDEX IF NOT EXISTS idx_graph_nodes_user ON graph_nodes(user_id);
            CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(user_id, node_type);
            CREATE INDEX IF NOT EXISTS idx_graph_nodes_community ON graph_nodes(user_id, community_id);
            CREATE INDEX IF NOT EXISTS idx_graph_nodes_canonical ON graph_nodes(user_id, canonical_name);
            CREATE INDEX IF NOT EXISTS idx_graph_nodes_mentions ON graph_nodes(user_id, mention_count DESC);
        `);

        // Graph edges: relationships between entities
        await pool.query(`
            CREATE TABLE IF NOT EXISTS graph_edges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                source_id INTEGER REFERENCES graph_nodes(id) ON DELETE CASCADE,
                target_id INTEGER REFERENCES graph_nodes(id) ON DELETE CASCADE,
                relationship VARCHAR(100) NOT NULL,
                weight FLOAT DEFAULT 1.0,
                evidence JSONB DEFAULT '[]',
                is_inferred BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_graph_edges_user ON graph_edges(user_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_rel ON graph_edges(user_id, relationship);
        `);

        // Newsletter ↔ Entity junction table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS newsletter_entities (
                newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE CASCADE,
                node_id INTEGER REFERENCES graph_nodes(id) ON DELETE CASCADE,
                excerpt TEXT,
                sentiment VARCHAR(20),
                relevance FLOAT DEFAULT 0.5,
                PRIMARY KEY (newsletter_id, node_id)
            );

            CREATE INDEX IF NOT EXISTS idx_ne_newsletter ON newsletter_entities(newsletter_id);
            CREATE INDEX IF NOT EXISTS idx_ne_node ON newsletter_entities(node_id);
        `);

        // User extraction profile preferences
        await pool.query(`
            CREATE TABLE IF NOT EXISTS graph_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                profile_name VARCHAR(100) NOT NULL,
                entity_types JSONB NOT NULL,
                relationship_types JSONB NOT NULL,
                extraction_prompt TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_graph_profiles_user ON graph_profiles(user_id);
        `);

        console.log('  ✅ Knowledge graph tables initialized');
    } catch (error) {
        console.error('  ❌ Knowledge graph table creation error:', error.message);
        throw error;
    }
}
