/**
 * kb-database.js
 *
 * Database tables and CRUD operations for Knowledge Base feature.
 * Called from setupDatabase() in database.js during startup.
 *
 * INTEGRATION INSTRUCTIONS:
 * In database.js, add after setupGraphTables() call:
 *   import { setupKBTables } from './kb-database.js';
 *   // Inside setupDatabase(), after setupGraphTables():
 *   await setupKBTables(pool);
 */

// Store pool reference from setupKBTables to avoid circular import with database.js
let _pool = null;
function getPool() {
    if (!_pool) throw new Error('KB tables not initialized — call setupKBTables first');
    return _pool;
}

export async function setupKBTables(pool) {
    _pool = pool;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'draft',
                article_count INTEGER DEFAULT 0,
                source_count INTEGER DEFAULT 0,
                compiled_at TIMESTAMP,
                compilation_tokens INTEGER DEFAULT 0,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, tag_id)
            );

            CREATE INDEX IF NOT EXISTS idx_kb_user ON knowledge_bases(user_id);
            CREATE INDEX IF NOT EXISTS idx_kb_tag ON knowledge_bases(tag_id);
            CREATE INDEX IF NOT EXISTS idx_kb_status ON knowledge_bases(user_id, status);
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS kb_articles (
                id SERIAL PRIMARY KEY,
                kb_id INTEGER REFERENCES knowledge_bases(id) ON DELETE CASCADE,
                article_type VARCHAR(30) NOT NULL,
                title VARCHAR(500) NOT NULL,
                slug VARCHAR(500),
                content TEXT NOT NULL,
                summary TEXT,
                cross_links JSONB DEFAULT '[]',
                source_newsletter_ids JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_kb_articles_kb ON kb_articles(kb_id);
            CREATE INDEX IF NOT EXISTS idx_kb_articles_type ON kb_articles(kb_id, article_type);
            CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(kb_id, slug);
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS kb_qa_history (
                id SERIAL PRIMARY KEY,
                kb_id INTEGER REFERENCES knowledge_bases(id) ON DELETE CASCADE,
                question TEXT NOT NULL,
                answer TEXT,
                citations JSONB DEFAULT '[]',
                tokens_used INTEGER DEFAULT 0,
                filed_back BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_kb_qa_kb ON kb_qa_history(kb_id);
            CREATE INDEX IF NOT EXISTS idx_kb_qa_filed ON kb_qa_history(kb_id, filed_back);
        `);

        console.log('  ✅ Knowledge Base tables initialized');
    } catch (error) {
        console.error('  ❌ Knowledge Base table creation error:', error.message);
        throw error;
    }
}

export async function createKB(userId, tagId) {
    const db = getPool();
    const result = await db.query(`
        INSERT INTO knowledge_bases (user_id, tag_id, status)
        VALUES ($1, $2, 'draft')
        ON CONFLICT (user_id, tag_id) DO UPDATE
        SET status = 'draft', updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [userId, tagId]);
    return result.rows[0];
}

export async function getKB(userId, kbId) {
    const db = getPool();
    const result = await db.query(`
        SELECT kb.*, t.name AS tag_name, t.color AS tag_color
        FROM knowledge_bases kb
        LEFT JOIN tags t ON kb.tag_id = t.id
        WHERE kb.id = $1 AND kb.user_id = $2
    `, [kbId, userId]);
    return result.rows[0] || null;
}

export async function getUserKBs(userId) {
    const db = getPool();
    const result = await db.query(`
        SELECT kb.*, t.name AS tag_name, t.color AS tag_color
        FROM knowledge_bases kb
        LEFT JOIN tags t ON kb.tag_id = t.id
        WHERE kb.user_id = $1
        ORDER BY kb.updated_at DESC
    `, [userId]);
    return result.rows;
}

export async function updateKBStatus(kbId, status, extras = {}) {
    const db = getPool();
    const {
        articleCount = null,
        sourceCount = null,
        compiledAt = null,
        compilationTokens = null,
        metadata = null
    } = extras;

    const updateFields = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [kbId, status];
    let paramIndex = 3;

    if (articleCount !== null) {
        updateFields.push(`article_count = $${paramIndex}`);
        params.push(articleCount);
        paramIndex++;
    }
    if (sourceCount !== null) {
        updateFields.push(`source_count = $${paramIndex}`);
        params.push(sourceCount);
        paramIndex++;
    }
    if (compiledAt !== null) {
        updateFields.push(`compiled_at = $${paramIndex}`);
        params.push(compiledAt);
        paramIndex++;
    }
    if (compilationTokens !== null) {
        updateFields.push(`compilation_tokens = $${paramIndex}`);
        params.push(compilationTokens);
        paramIndex++;
    }
    if (metadata !== null) {
        updateFields.push(`metadata = $${paramIndex}`);
        params.push(metadata);
        paramIndex++;
    }

    const result = await db.query(`
        UPDATE knowledge_bases
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
    `, params);
    return result.rows[0];
}

export async function deleteKB(userId, kbId) {
    const db = getPool();
    const result = await db.query(`
        DELETE FROM knowledge_bases
        WHERE id = $1 AND user_id = $2
        RETURNING id
    `, [kbId, userId]);
    return result.rowCount > 0;
}

export async function insertArticles(kbId, articles) {
    const db = getPool();
    if (!articles || articles.length === 0) return [];

    const values = articles.map((article, idx) => {
        const baseIdx = idx * 7;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7})`;
    }).join(', ');

    const flatParams = articles.flatMap(article => [
        kbId,
        article.article_type,
        article.title,
        article.slug || null,
        article.content,
        article.summary || null,
        JSON.stringify(article.cross_links || [])
    ]);

    const result = await db.query(`
        INSERT INTO kb_articles (kb_id, article_type, title, slug, content, summary, cross_links)
        VALUES ${values}
        RETURNING *
    `, flatParams);

    await db.query(`
        UPDATE knowledge_bases
        SET article_count = (SELECT COUNT(*) FROM kb_articles WHERE kb_id = $1)
        WHERE id = $1
    `, [kbId]);

    return result.rows;
}

export async function getArticles(kbId, type = null) {
    const db = getPool();
    if (type) {
        const result = await db.query(`
            SELECT * FROM kb_articles
            WHERE kb_id = $1 AND article_type = $2
            ORDER BY created_at DESC
        `, [kbId, type]);
        return result.rows;
    } else {
        const result = await db.query(`
            SELECT * FROM kb_articles
            WHERE kb_id = $1
            ORDER BY article_type, created_at DESC
        `, [kbId]);
        return result.rows;
    }
}

export async function getArticle(kbId, articleId) {
    const db = getPool();
    const result = await db.query(`
        SELECT * FROM kb_articles
        WHERE id = $1 AND kb_id = $2
    `, [articleId, kbId]);
    return result.rows[0] || null;
}

export async function clearArticles(kbId) {
    const db = getPool();
    await db.query('DELETE FROM kb_articles WHERE kb_id = $1', [kbId]);
    await db.query(`
        UPDATE knowledge_bases
        SET article_count = 0
        WHERE id = $1
    `, [kbId]);
}

export async function logQA(kbId, question, answer, citations, tokensUsed) {
    const db = getPool();
    const result = await db.query(`
        INSERT INTO kb_qa_history (kb_id, question, answer, citations, tokens_used)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `, [kbId, question, answer, JSON.stringify(citations || []), tokensUsed]);
    return result.rows[0];
}

export async function getQAHistory(kbId, limit = 20) {
    const db = getPool();
    const result = await db.query(`
        SELECT * FROM kb_qa_history
        WHERE kb_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `, [kbId, limit]);
    return result.rows;
}

export async function markQAFiledBack(qaId) {
    const db = getPool();
    const result = await db.query(`
        UPDATE kb_qa_history
        SET filed_back = true
        WHERE id = $1
        RETURNING *
    `, [qaId]);
    return result.rows[0];
}

export async function getKBSourceData(userId, tagId) {
    const db = getPool();
    const result = await db.query(`
        SELECT
            n.id,
            n.title,
            n.summary,
            n.summary_language,
            n.date_added,
            json_agg(DISTINCT jsonb_build_object(
                'id', gn.id,
                'name', gn.name,
                'node_type', gn.node_type,
                'mention_count', gn.mention_count
            )) FILTER (WHERE gn.id IS NOT NULL) AS entities
        FROM newsletters n
        LEFT JOIN newsletter_tags nt ON n.id = nt.newsletter_id
        LEFT JOIN newsletter_entities ne ON n.id = ne.newsletter_id
        LEFT JOIN graph_nodes gn ON ne.node_id = gn.id
        WHERE n.user_id = $1 AND nt.tag_id = $2
        GROUP BY n.id, n.title, n.summary, n.summary_language, n.date_added
        ORDER BY n.date_added DESC
    `, [userId, tagId]);
    return result.rows;
}

