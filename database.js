import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export function generateEmailCode(email) {
    // Generate deterministic code from email so it never changes
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        const char = email.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to base36 and take 8 characters
    const code = Math.abs(hash).toString(36).substring(0, 8).padEnd(8, '0');
    return 'brief-' + code;
}

export async function setupDatabase() {
    try {
        // Create tables if they don't exist
        await pool.query(`
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                email_code VARCHAR(50) UNIQUE NOT NULL,
                plan VARCHAR(20) DEFAULT 'free',
                newsletters_count INTEGER DEFAULT 0,
                newsletters_limit INTEGER DEFAULT 10,
                stripe_customer_id VARCHAR(255),
                stripe_subscription_id VARCHAR(255),
                kindle_email VARCHAR(255),
                language VARCHAR(5) DEFAULT 'es',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 1
            );

            -- Newsletters table
            CREATE TABLE IF NOT EXISTS newsletters (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(500) NOT NULL,
                sender VARCHAR(255),
                content TEXT,
                summary TEXT,
                url VARCHAR(1000),
                is_read INTEGER DEFAULT 0,
                date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Tags table
            CREATE TABLE IF NOT EXISTS tags (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                color VARCHAR(20) DEFAULT '#000000'
            );

            -- Newsletter Tags junction table
            CREATE TABLE IF NOT EXISTS newsletter_tags (
                newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE CASCADE,
                tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (newsletter_id, tag_id)
            );

            -- Indexes for better performance
            CREATE INDEX IF NOT EXISTS idx_newsletters_user ON newsletters(user_id);
            CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
            CREATE INDEX IF NOT EXISTS idx_newsletter_tags_newsletter ON newsletter_tags(newsletter_id);
            CREATE INDEX IF NOT EXISTS idx_newsletter_tags_tag ON newsletter_tags(tag_id);
        `);

        // Add Stripe columns if they don't exist (migration for existing databases)
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS kindle_email VARCHAR(255);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP;
        `);

        // Waitlist table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS waitlist (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Password reset tokens
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Subscriptions table for RSS feeds
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                url VARCHAR(500) NOT NULL,
                name VARCHAR(255),
                last_fetched TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
        `);

        console.log('✅ Database initialized (PostgreSQL)');
        return pool;
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

export function getDb() {
    return pool;
}

export async function createInitialUser() {
    try {
        // Check if any users exist
        const result = await pool.query('SELECT COUNT(*) FROM users');
        const count = parseInt(result.rows[0].count);

        if (count === 0) {
            const email = 'admin@personalbrief.com';
            const password = 'changeme123';
            const passwordHash = await bcrypt.hash(password, 10);
            const emailCode = generateEmailCode(email);

            await pool.query(`
                INSERT INTO users (email, password_hash, name, email_code, plan, newsletters_count, newsletters_limit, language, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [email, passwordHash, 'Admin', emailCode, 'premium', 0, -1, 'es', 1]);

            console.log('\n🎉 Initial admin user created:');
            console.log('   Email:', email);
            console.log('   Password:', password);
            console.log('   Plan: Premium');
            console.log('   ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!\n');
        }
    } catch (error) {
        console.error('❌ Error creating initial user:', error);
        throw error;
    }
}

// Helper functions - same interface as before for compatibility with server.js
export const dbHelpers = {
    // Database pool access
    getDb: () => pool,

    // Users
    findUserByEmail: async (email) => {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    },

    findUserById: async (id) => {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    },

    findUserByEmailCode: async (emailCode) => {
        const result = await pool.query('SELECT * FROM users WHERE email_code = $1', [emailCode]);
        return result.rows[0] || null;
    },

    verifyPassword: async (userId, plainPassword) => {
        const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0 || !result.rows[0].password_hash) {
            console.log('❌ User not found or no password hash for userId:', userId);
            return false;
        }
        return await bcrypt.compare(plainPassword, result.rows[0].password_hash);
    },

    // Verificar y actualizar el plan si el periodo de prueba ha expirado
    checkAndUpdateTrialStatus: async (userId) => {
        const result = await pool.query(`
            SELECT id, plan, trial_end_date
            FROM users
            WHERE id = $1
        `, [userId]);

        if (result.rows.length === 0) return null;

        const user = result.rows[0];
        const now = new Date();

        // Si tiene un trial_end_date y ya expiró, y su plan es 'pro', bajarlo a 'free'
        if (user.trial_end_date && new Date(user.trial_end_date) < now && user.plan === 'pro') {
            console.log('⏰ Trial expirado para usuario:', userId);
            await pool.query(`
                UPDATE users
                SET plan = 'free', trial_end_date = NULL
                WHERE id = $1
            `, [userId]);
            return 'free';
        }

        return user.plan;
    },

    createUser: async (email, password, name) => {
        const passwordHash = await bcrypt.hash(password, 10);
        const emailCode = generateEmailCode(email);

        // Nuevo usuario obtiene 15 días de prueba gratis del plan Pro
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 15);

        const result = await pool.query(`
            INSERT INTO users (email, password_hash, name, email_code, plan, trial_end_date, newsletters_count, newsletters_limit, language, is_active)
            VALUES ($1, $2, $3, $4, 'pro', $5, 0, 10, 'es', 1)
            RETURNING *
        `, [email, passwordHash, name, emailCode, trialEndDate]);

        return result.rows[0];
    },

    updateUser: async (id, updates) => {
        // Whitelist allowed fields to prevent SQL injection
        const allowedFields = ['name', 'email', 'password_hash', 'kindle_email', 'language', 'plan', 'stripe_customer_id', 'stripe_subscription_id', 'newsletters_count', 'newsletters_limit'];
        const fields = Object.keys(updates).filter(f => allowedFields.includes(f));
        if (fields.length === 0) return null;

        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        const values = [id, ...fields.map(f => updates[f])];

        const result = await pool.query(
            `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
            values
        );
        return result.rows[0] || null;
    },

    upgradePlan: async (userId, plan) => {
        const result = await pool.query(`
            UPDATE users SET plan = $1 WHERE id = $2 RETURNING *
        `, [plan, userId]);
        return result.rows[0] || null;
    },

    findUserByStripeCustomerId: async (stripeCustomerId) => {
        const result = await pool.query('SELECT * FROM users WHERE stripe_customer_id = $1', [stripeCustomerId]);
        return result.rows[0] || null;
    },

    // Newsletters
    getNewsletters: async (userId) => {
        const result = await pool.query(`
            SELECT n.*,
                COALESCE(
                    json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                    FILTER (WHERE t.id IS NOT NULL),
                    '[]'::json
                ) AS tags
            FROM newsletters n
            LEFT JOIN newsletter_tags nt ON n.id = nt.newsletter_id
            LEFT JOIN tags t ON nt.tag_id = t.id
            WHERE n.user_id = $1
            GROUP BY n.id
            ORDER BY n.date_added DESC
        `, [userId]);
        return result.rows;
    },

    getNewsletter: async (id, userId) => {
        const result = await pool.query(`
            SELECT n.*,
                COALESCE(
                    json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                    FILTER (WHERE t.id IS NOT NULL),
                    '[]'::json
                ) AS tags
            FROM newsletters n
            LEFT JOIN newsletter_tags nt ON n.id = nt.newsletter_id
            LEFT JOIN tags t ON nt.tag_id = t.id
            WHERE n.id = $1 AND n.user_id = $2
            GROUP BY n.id
        `, [parseInt(id), userId]);
        return result.rows[0] || null;
    },

    createNewsletter: async (userId, title, sender, content, url) => {
        const result = await pool.query(`
            INSERT INTO newsletters (user_id, title, sender, content, url, is_read)
            VALUES ($1, $2, $3, $4, $5, 0)
            RETURNING *
        `, [userId, title, sender, content, url || null]);
        return result.rows[0];
    },

    updateNewsletter: async (id, updates) => {
        // Whitelist allowed fields to prevent SQL injection
        const allowedFields = ['title', 'sender', 'content', 'summary', 'is_read', 'url'];
        const fields = Object.keys(updates).filter(f => allowedFields.includes(f));
        if (fields.length === 0) return null;

        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        const values = [parseInt(id), ...fields.map(f => updates[f])];

        const result = await pool.query(
            `UPDATE newsletters SET ${setClause} WHERE id = $1 RETURNING *`,
            values
        );
        return result.rows[0] || null;
    },

    deleteNewsletter: async (id, userId) => {
        const result = await pool.query(`
            DELETE FROM newsletters WHERE id = $1 AND user_id = $2 RETURNING id
        `, [parseInt(id), userId]);
        return result.rowCount > 0;
    },

    // Tags
    getTags: async (userId) => {
        const result = await pool.query('SELECT * FROM tags WHERE user_id = $1', [userId]);
        return result.rows;
    },

    createTag: async (userId, name, color) => {
        const result = await pool.query(`
            INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING *
        `, [userId, name, color || '#000000']);
        return result.rows[0];
    },

    deleteTag: async (id, userId) => {
        // CASCADE will handle newsletter_tags deletion automatically
        const result = await pool.query(`
            DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id
        `, [parseInt(id), userId]);
        return result.rowCount > 0;
    },

    // Newsletter Tags
    addTagToNewsletter: async (newsletterId, tagId) => {
        try {
            await pool.query(`
                INSERT INTO newsletter_tags (newsletter_id, tag_id) VALUES ($1, $2)
                ON CONFLICT (newsletter_id, tag_id) DO NOTHING
            `, [newsletterId, tagId]);
        } catch (error) {
            // Ignore duplicate key errors
            if (error.code !== '23505') throw error;
        }
    },

    removeTagFromNewsletter: async (newsletterId, tagId) => {
        await pool.query(`
            DELETE FROM newsletter_tags WHERE newsletter_id = $1 AND tag_id = $2
        `, [newsletterId, tagId]);
    },

    getNewsletterTags: async (newsletterId) => {
        const result = await pool.query(`
            SELECT t.* FROM tags t
            INNER JOIN newsletter_tags nt ON t.id = nt.tag_id
            WHERE nt.newsletter_id = $1
        `, [newsletterId]);
        return result.rows;
    },

    getNewsletterWithTags: async (newsletterId) => {
        const newsletterResult = await pool.query(`
            SELECT * FROM newsletters WHERE id = $1
        `, [parseInt(newsletterId)]);

        if (newsletterResult.rows.length === 0) return null;

        const newsletter = newsletterResult.rows[0];
        const tags = await dbHelpers.getNewsletterTags(newsletterId);

        return { ...newsletter, tags };
    },

    getNewslettersByTag: async (userId, tagId) => {
        const result = await pool.query(`
            SELECT n.* FROM newsletters n
            INNER JOIN newsletter_tags nt ON n.id = nt.newsletter_id
            WHERE n.user_id = $1 AND nt.tag_id = $2
            ORDER BY n.date_added DESC
        `, [userId, parseInt(tagId)]);
        return result.rows;
    },

    // Password resets
    createPasswordReset: async (userId, token, expiresAt) => {
        await pool.query(`
            INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)
        `, [userId, token, expiresAt]);
    },

    findValidPasswordReset: async (token) => {
        const result = await pool.query(`
            SELECT * FROM password_resets
            WHERE token = $1 AND used = 0 AND expires_at > NOW()
        `, [token]);
        return result.rows[0] || null;
    },

    markPasswordResetUsed: async (token) => {
        await pool.query(`UPDATE password_resets SET used = 1 WHERE token = $1`, [token]);
    },

    updatePasswordHash: async (userId, newPassword) => {
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userId]);
    },

    // Waitlist
    addToWaitlist: async (email) => {
        const result = await pool.query(`
            INSERT INTO waitlist (email) VALUES ($1)
            ON CONFLICT (email) DO NOTHING
            RETURNING *
        `, [email.toLowerCase().trim()]);
        return result.rows[0] || null;
    }
};
