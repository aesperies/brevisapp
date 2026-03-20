import pg from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Railway uses self-signed certs; set DATABASE_SSL_VERIFY=true if you have proper CA certs
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY === 'true' } : false
});

pool.on('error', (err) => {
    console.error('❌ [DB] Unexpected pool error:', err.message);
});

export function generateEmailCode() {
    // Generate cryptographically random code (16 chars, hex)
    const code = crypto.randomBytes(8).toString('hex');
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
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_newsletters_user ON newsletters(user_id);
            CREATE INDEX IF NOT EXISTS idx_newsletters_user_date ON newsletters(user_id, date_added DESC);
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
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 0;
        `);

        // Remove unused newsletter limit columns (newsletters are unlimited for all plans)
        await pool.query(`
            ALTER TABLE users DROP COLUMN IF EXISTS newsletters_count;
            ALTER TABLE users DROP COLUMN IF EXISTS newsletters_limit;
        `);

        await pool.query(`
            ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS summary_language VARCHAR(5);
        `);

        // Email verification tokens
        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_verifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
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
            const email = process.env.ADMIN_EMAIL;
            const password = process.env.ADMIN_PASSWORD;

            if (!email || !password) {
                console.log('\n⚠️  No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to create an initial admin user.\n');
                return;
            }

            if (password.length < 8) {
                console.error('❌ ADMIN_PASSWORD must be at least 8 characters.');
                return;
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const emailCode = generateEmailCode();

            await pool.query(`
                INSERT INTO users (email, password_hash, name, email_code, plan, language, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [email, passwordHash, 'Admin', emailCode, 'premium', 'es', 1]);

            console.log('\n✅ Initial admin user created with provided credentials.\n');
        }
    } catch (error) {
        console.error('❌ Error creating initial user:', error);
        throw error;
    }
}

// Safe user columns (excludes password_hash)
const USER_COLUMNS = 'id, email, name, email_code, plan, stripe_customer_id, stripe_subscription_id, kindle_email, language, created_at, is_active, trial_end_date, email_verified';

// Helper functions - same interface as before for compatibility with server.js
export const dbHelpers = {
    // Database pool access
    getDb: () => pool,

    // Users
    findUserByEmail: async (email) => {
        const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
        return result.rows[0] || null;
    },

    findUserByEmailWithPassword: async (email) => {
        const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    },

    findUserById: async (id) => {
        const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
        return result.rows[0] || null;
    },

    findUserByEmailCode: async (emailCode) => {
        const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE email_code = $1`, [emailCode]);
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
        if (user.trial_end_date && new Date(user.trial_end_date) < now && (user.plan === 'pro' || user.plan === 'standard')) {
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

    createUser: async (email, password, name, plan = 'pro') => {
        const passwordHash = await bcrypt.hash(password, 10);
        const emailCode = generateEmailCode();

        // Premium users (via access code) get no trial expiration
        // Pro users get 15-day free trial
        const trialEndDate = plan === 'premium' ? null : new Date();
        if (trialEndDate) trialEndDate.setDate(trialEndDate.getDate() + 15);

        const result = await pool.query(`
            INSERT INTO users (email, password_hash, name, email_code, plan, trial_end_date, language, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, 'es', 1)
            RETURNING ${USER_COLUMNS}
        `, [email, passwordHash, name, emailCode, plan, trialEndDate]);

        return result.rows[0];
    },

    updateUser: async (id, updates) => {
        // Whitelist allowed fields to prevent SQL injection
        const allowedFields = ['name', 'email', 'password_hash', 'kindle_email', 'language', 'plan', 'stripe_customer_id', 'stripe_subscription_id', 'email_verified'];
        const fields = Object.keys(updates).filter(f => allowedFields.includes(f));
        if (fields.length === 0) return null;

        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        const values = [id, ...fields.map(f => updates[f])];

        const result = await pool.query(
            `UPDATE users SET ${setClause} WHERE id = $1 RETURNING ${USER_COLUMNS}`,
            values
        );
        return result.rows[0] || null;
    },

    upgradePlan: async (userId, plan) => {
        const result = await pool.query(`
            UPDATE users SET plan = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}
        `, [plan, userId]);
        return result.rows[0] || null;
    },

    findUserByStripeCustomerId: async (stripeCustomerId) => {
        const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE stripe_customer_id = $1`, [stripeCustomerId]);
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

    getNewslettersByIds: async (ids, userId) => {
        if (!ids || ids.length === 0) return [];
        const intIds = ids.map(id => parseInt(id));
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
            WHERE n.id = ANY($1) AND n.user_id = $2
            GROUP BY n.id
        `, [intIds, userId]);
        return result.rows;
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
        const allowedFields = ['title', 'sender', 'content', 'summary', 'summary_language', 'is_read', 'url'];
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

    getNewsletterWithTags: async (newsletterId, userId) => {
        const newsletterResult = await pool.query(`
            SELECT * FROM newsletters WHERE id = $1 AND user_id = $2
        `, [parseInt(newsletterId), userId]);

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
        // Atomic: find AND mark as used in one query to prevent race conditions
        const result = await pool.query(`
            UPDATE password_resets SET used = 1
            WHERE token = $1 AND used = 0 AND expires_at > NOW()
            RETURNING *
        `, [token]);
        return result.rows[0] || null;
    },

    markPasswordResetUsed: async (token) => {
        // Kept for backwards compatibility, but findValidPasswordReset now marks as used atomically
        await pool.query(`UPDATE password_resets SET used = 1 WHERE token = $1`, [token]);
    },

    createEmailVerification: async (userId, token, expiresAt) => {
        // Delete previous tokens for this user
        await pool.query(`DELETE FROM email_verifications WHERE user_id = $1`, [userId]);
        await pool.query(`
            INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)
        `, [userId, token, expiresAt]);
    },

    verifyEmail: async (token) => {
        // Atomic: find valid token and mark user as verified
        const result = await pool.query(`
            UPDATE users SET email_verified = 1
            FROM email_verifications ev
            WHERE users.id = ev.user_id AND ev.token = $1 AND ev.expires_at > NOW()
            RETURNING users.id, users.email
        `, [token]);
        if (result.rows[0]) {
            await pool.query(`DELETE FROM email_verifications WHERE token = $1`, [token]);
        }
        return result.rows[0] || null;
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
