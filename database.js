import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database schema
const defaultData = {
    users: [],
    newsletters: [],
    tags: [],
    newsletterTags: [],
    subscriptions: []
};

let db;

export async function setupDatabase() {
    const file = join(__dirname, 'db.json');
    const adapter = new JSONFile(file);
    db = new Low(adapter, defaultData);
    
    await db.read();
    db.data ||= defaultData;
    await db.write();
    
    console.log('✅ Database initialized');
    return db;
}

export function getDb() {
    return db;
}

export function generateEmailCode() {
    return 'brief-' + Math.random().toString(36).substring(2, 10);
}

export async function createInitialUser() {
    await db.read();
    
    if (db.data.users.length === 0) {
        const email = 'admin@personalbrief.com';
        const password = 'changeme123';
        const passwordHash = await bcrypt.hash(password, 10);
        const emailCode = generateEmailCode();
        
        db.data.users.push({
            id: 1,
            email,
            password_hash: passwordHash,
            name: 'Admin',
            email_code: emailCode,
            plan: 'premium',
            newsletters_count: 0,
            newsletters_limit: -1,
            language: 'es',
            created_at: new Date().toISOString(),
            is_active: 1
        });
        
        await db.write();
        
        console.log('\n🎉 Initial admin user created:');
        console.log('   Email:', email);
        console.log('   Password:', password);
        console.log('   Plan: Premium');
        console.log('   ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!\n');
    }
}

// Helper functions
export const dbHelpers = {
    // Users
    findUserByEmail: async (email) => {
        await db.read();
        return db.data.users.find(u => u.email === email);
    },
    
    findUserById: async (id) => {
        await db.read();
        return db.data.users.find(u => u.id === id);
    },
    
    findUserByEmailCode: async (emailCode) => {
        await db.read();
        return db.data.users.find(u => u.email_code === emailCode);
    },
    
    verifyPassword: async (plainPassword, hashedPassword) => {
        return await bcrypt.compare(plainPassword, hashedPassword);
    },
    
    createUser: async (email, password, name) => {
        await db.read();
        const id = db.data.users.length > 0 
            ? Math.max(...db.data.users.map(u => u.id)) + 1 
            : 1;
        
        const passwordHash = await bcrypt.hash(password, 10);
        const emailCode = generateEmailCode();
        
        const user = {
            id,
            email,
            password_hash: passwordHash,
            name,
            email_code: emailCode,
            plan: 'free',
            newsletters_count: 0,
            newsletters_limit: 10,
            language: 'es',
            created_at: new Date().toISOString(),
            is_active: 1
        };
        
        db.data.users.push(user);
        await db.write();
        
        return user;
    },
    
    updateUser: async (id, updates) => {
        await db.read();
        const index = db.data.users.findIndex(u => u.id === id);
        if (index !== -1) {
            db.data.users[index] = { ...db.data.users[index], ...updates };
            await db.write();
            return db.data.users[index];
        }
        return null;
    },
    
    // Newsletters
    getUserNewsletters: async (userId) => {
        await db.read();
        return db.data.newsletters
            .filter(n => n.user_id === userId)
            .sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
    },
    
    createNewsletter: async (userId, title, sender, content, url) => {
        await db.read();
        const id = db.data.newsletters.length > 0 
            ? Math.max(...db.data.newsletters.map(n => n.id)) + 1 
            : 1;
        
        const newsletter = {
            id,
            user_id: userId,
            title,
            sender,
            content,
            summary: null,
            url: url || null,
            is_read: 0,
            date_added: new Date().toISOString()
        };
        
        db.data.newsletters.push(newsletter);
        await db.write();
        
        // Increment user newsletter count
        const userIndex = db.data.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            db.data.users[userIndex].newsletters_count += 1;
            await db.write();
        }
        
        return newsletter;
    },
    
    findNewsletter: async (id, userId) => {
        await db.read();
        return db.data.newsletters.find(n => n.id === parseInt(id) && n.user_id === userId);
    },
    
    findNewslettersByIds: async (ids, userId) => {
        await db.read();
        return db.data.newsletters.filter(n => 
            ids.includes(n.id) && n.user_id === userId
        );
    },
    
    updateNewsletter: async (id, updates) => {
        await db.read();
        const index = db.data.newsletters.findIndex(n => n.id === parseInt(id));
        if (index !== -1) {
            db.data.newsletters[index] = { ...db.data.newsletters[index], ...updates };
            await db.write();
            return db.data.newsletters[index];
        }
        return null;
    },
    
    deleteNewsletter: async (id, userId) => {
        await db.read();
        const initialLength = db.data.newsletters.length;
        db.data.newsletters = db.data.newsletters.filter(
            n => !(n.id === parseInt(id) && n.user_id === userId)
        );
        const deleted = initialLength !== db.data.newsletters.length;
        if (deleted) {
            await db.write();
            // Decrement user newsletter count
            const userIndex = db.data.users.findIndex(u => u.id === userId);
            if (userIndex !== -1 && db.data.users[userIndex].newsletters_count > 0) {
                db.data.users[userIndex].newsletters_count -= 1;
                await db.write();
            }
        }
        return deleted;
    },
    
    // Tags
    getUserTags: async (userId) => {
        await db.read();
        return db.data.tags.filter(t => t.user_id === userId);
    },
    
    createTag: async (userId, name, color) => {
        await db.read();
        const id = db.data.tags.length > 0 
            ? Math.max(...db.data.tags.map(t => t.id)) + 1 
            : 1;
        
        const tag = {
            id,
            user_id: userId,
            name,
            color: color || '#000000'
        };
        
        db.data.tags.push(tag);
        await db.write();
        
        return tag;
    },
    
    deleteTag: async (id, userId) => {
        await db.read();
        const initialLength = db.data.tags.length;
        db.data.tags = db.data.tags.filter(
            t => !(t.id === parseInt(id) && t.user_id === userId)
        );
        // Also remove all newsletter-tag associations
        db.data.newsletterTags = db.data.newsletterTags.filter(
            nt => nt.tag_id !== parseInt(id)
        );
        const deleted = initialLength !== db.data.tags.length;
        if (deleted) {
            await db.write();
        }
        return deleted;
    },
    
    // Newsletter Tags
    addTagToNewsletter: async (newsletterId, tagId) => {
        await db.read();
        const exists = db.data.newsletterTags.find(
            nt => nt.newsletter_id === newsletterId && nt.tag_id === tagId
        );
        
        if (!exists) {
            db.data.newsletterTags.push({
                newsletter_id: newsletterId,
                tag_id: tagId
            });
            await db.write();
        }
    },
    
    removeTagFromNewsletter: async (newsletterId, tagId) => {
        await db.read();
        db.data.newsletterTags = db.data.newsletterTags.filter(
            nt => !(nt.newsletter_id === newsletterId && nt.tag_id === tagId)
        );
        await db.write();
    },
    
    getNewsletterTags: async (newsletterId) => {
        await db.read();
        const tagIds = db.data.newsletterTags
            .filter(nt => nt.newsletter_id === newsletterId)
            .map(nt => nt.tag_id);
        
        return db.data.tags.filter(t => tagIds.includes(t.id));
    },
    
    getNewslettersByTag: async (userId, tagId) => {
        await db.read();
        const newsletterIds = db.data.newsletterTags
            .filter(nt => nt.tag_id === parseInt(tagId))
            .map(nt => nt.newsletter_id);
        
        return db.data.newsletters
            .filter(n => n.user_id === userId && newsletterIds.includes(n.id))
            .sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
    }
};
