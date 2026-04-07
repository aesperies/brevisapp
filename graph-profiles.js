/**
 * graph-profiles.js
 *
 * Configurable entity extraction profiles.
 * Users select which types of entities and relationships to extract.
 * VC/Legal users see deals and funds. General users see people and orgs.
 * Premium users can create custom profiles.
 */

import { getDb } from './database.js';

// ============= DEFAULT PROFILES =============

export const DEFAULT_PROFILES = {
    'vc-legal': {
        name: 'VC / Legal',
        description: 'Optimized for venture capital, legal, and deal flow intelligence',
        entityTypes: [
            'person', 'company', 'fund', 'deal', 'technology',
            'regulation', 'token', 'location'
        ],
        relationshipTypes: [
            'invested_in', 'founded', 'acquired', 'competes_with',
            'regulates', 'partnered_with', 'advises', 'raised_from',
            'licensed_to', 'sued_by', 'hired', 'board_member_of',
            'spun_off_from', 'merged_with'
        ],
        extractionPrompt: `You are an expert entity extraction system for the venture capital and legal industry.

Extract entities and relationships from the newsletter content below. Focus on:

ENTITIES:
- person: Founders, GPs, LPs, lawyers, executives, regulators. Include role if mentioned.
- company: Startups, portfolio companies, acquirers, public companies. Include sector/stage if mentioned.
- fund: VC funds, PE funds, hedge funds, crypto funds, SPVs. Include fund size if mentioned.
- deal: Funding rounds, acquisitions, IPOs, token launches. Include amount, valuation, round type.
- technology: Platforms, protocols, programming languages, AI models, game engines (Unreal, Unity).
- regulation: Laws, regulations, court rulings, regulatory actions. Include jurisdiction.
- token: Cryptocurrency tokens, NFT collections, protocol tokens. Include chain if mentioned.
- location: Countries, states, cities relevant to deals or regulation.

RELATIONSHIPS (use exactly these labels):
- invested_in: Fund/person invested in a company/deal
- founded: Person founded a company
- acquired: Company acquired another company
- competes_with: Companies competing in same space
- regulates: Regulation/body governs a company/sector
- partnered_with: Companies in a partnership or alliance
- advises: Person advises a company
- raised_from: Company raised capital from a fund/investor
- licensed_to: Technology/IP licensed from one entity to another
- sued_by: Legal action between entities
- hired: Company hired a person
- board_member_of: Person sits on company board
- spun_off_from: Company spun off from another
- merged_with: Companies merged

IMPORTANT:
- Only extract entities actually mentioned in the text — do not hallucinate
- Use the deterministic hints provided to validate your extractions
- For deals, always try to extract the amount and round type
- Prefer specific entity names over generic descriptions
- Mark relationships as is_inferred: true if you're connecting dots not explicitly stated`
    },

    'general': {
        name: 'General Knowledge',
        description: 'Broad entity extraction for any topic — news, tech, business, culture',
        entityTypes: [
            'person', 'organization', 'topic', 'event',
            'location', 'technology', 'product'
        ],
        relationshipTypes: [
            'works_at', 'founded', 'located_in', 'related_to',
            'caused', 'produced', 'competes_with', 'partnered_with',
            'acquired', 'invested_in', 'announced', 'created'
        ],
        extractionPrompt: `You are an expert entity extraction system for general knowledge.

Extract entities and relationships from the newsletter content below. Focus on:

ENTITIES:
- person: Notable individuals mentioned — include role/title if given.
- organization: Companies, nonprofits, government bodies, institutions.
- topic: Key themes, trends, or subject areas discussed (e.g., "AI Safety", "Climate Tech").
- event: Conferences, launches, elections, incidents with specific dates or timeframes.
- location: Countries, cities, regions relevant to the content.
- technology: Specific tools, platforms, frameworks, protocols mentioned.
- product: Named products, services, or offerings.

RELATIONSHIPS (use exactly these labels):
- works_at: Person works at or leads an organization
- founded: Person founded an organization
- located_in: Entity is based in a location
- related_to: General thematic connection between entities
- caused: Event or action caused another event
- produced: Organization produced a product or technology
- competes_with: Organizations competing in same space
- partnered_with: Organizations in partnership
- acquired: Organization acquired another
- invested_in: Entity invested in another
- announced: Organization announced an event or product
- created: Person or org created a technology or product

IMPORTANT:
- Only extract entities actually mentioned in the text — do not hallucinate
- Use the deterministic hints to validate your extractions
- Focus on the most newsworthy and important entities
- Mark relationships as is_inferred: true if not explicitly stated`
    },

    'crypto-web3': {
        name: 'Crypto / Web3',
        description: 'Specialized for blockchain, DeFi, NFTs, and token ecosystems',
        entityTypes: [
            'person', 'protocol', 'token', 'company', 'dao',
            'chain', 'regulation', 'event'
        ],
        relationshipTypes: [
            'built_on', 'forked_from', 'invested_in', 'governs',
            'competes_with', 'integrated_with', 'regulates',
            'founded', 'exploited', 'partnered_with', 'listed_on'
        ],
        extractionPrompt: `You are an expert entity extraction system for the Web3 and cryptocurrency industry.

Extract entities and relationships from the newsletter content below. Focus on:

ENTITIES:
- person: Founders, core devs, influencers, regulators in crypto space. Include known handles/aliases.
- protocol: DeFi protocols, DEXes, lending platforms, bridges, L2s. Include TVL if mentioned.
- token: Specific tokens ($BTC, $ETH, $SOL, governance tokens, memecoins). Include chain and price if mentioned.
- company: Exchanges (CEX/DEX), infrastructure providers, Web3 studios, custodians.
- dao: DAOs and on-chain governance entities. Include treasury size if mentioned.
- chain: Layer 1s, Layer 2s, sidechains, appchains. Include TPS/fees if mentioned.
- regulation: Crypto-specific regulations, enforcement actions, policy proposals. Include jurisdiction.
- event: Hacks, exploits, airdrops, mainnet launches, governance votes, conferences.

RELATIONSHIPS (use exactly these labels):
- built_on: Protocol/app built on a chain
- forked_from: Protocol forked from another
- invested_in: Entity invested in a project/protocol
- governs: DAO/token governs a protocol
- competes_with: Protocols competing in same niche
- integrated_with: Protocol integrated with another
- regulates: Regulatory action on a crypto entity
- founded: Person founded a protocol/company
- exploited: Hack or exploit of a protocol
- partnered_with: Entities in partnership
- listed_on: Token listed on an exchange

IMPORTANT:
- Only extract entities actually mentioned in the text — do not hallucinate
- Always include token ticker symbols when mentioned (e.g., $UNI for Uniswap)
- Track chain associations (which chain a protocol/token is on)
- Mark relationships as is_inferred: true if not explicitly stated
- For exploits/hacks, always try to extract the amount lost`
    }
};

// ============= PROFILE MANAGEMENT =============

/**
 * Get the active extraction profile for a user.
 * Falls back to VC/Legal default if none configured.
 */
export async function getActiveProfile(userId) {
    const db = getDb();

    // Check for user's active custom profile
    const result = await db.query(
        `SELECT * FROM graph_profiles
         WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );

    if (result.rows.length) {
        const profile = result.rows[0];
        return {
            id: profile.id,
            name: profile.profile_name,
            entity_types: profile.entity_types,
            relationship_types: profile.relationship_types,
            extraction_prompt: profile.extraction_prompt
        };
    }

    // Default to VC/Legal for now
    const defaultProfile = DEFAULT_PROFILES['vc-legal'];
    return {
        id: null,
        name: defaultProfile.name,
        entity_types: defaultProfile.entityTypes,
        relationship_types: defaultProfile.relationshipTypes,
        extraction_prompt: defaultProfile.extractionPrompt
    };
}

/**
 * Create a new extraction profile for a user.
 */
export async function createProfile(userId, { name, entityTypes, relationshipTypes, extractionPrompt }) {
    const db = getDb();

    // Deactivate other profiles for this user
    await db.query(
        'UPDATE graph_profiles SET is_active = false WHERE user_id = $1',
        [userId]
    );

    const result = await db.query(
        `INSERT INTO graph_profiles (user_id, profile_name, entity_types, relationship_types, extraction_prompt, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [userId, name, JSON.stringify(entityTypes), JSON.stringify(relationshipTypes), extractionPrompt]
    );

    return result.rows[0];
}

/**
 * Apply a default profile preset for a user.
 */
export async function applyPresetProfile(userId, presetKey) {
    const preset = DEFAULT_PROFILES[presetKey];
    if (!preset) throw new Error(`Unknown profile preset: ${presetKey}`);

    return await createProfile(userId, {
        name: preset.name,
        entityTypes: preset.entityTypes,
        relationshipTypes: preset.relationshipTypes,
        extractionPrompt: preset.extractionPrompt
    });
}

/**
 * List all profiles for a user.
 */
export async function listProfiles(userId) {
    const db = getDb();

    const result = await db.query(
        'SELECT * FROM graph_profiles WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );

    // Also include available presets
    const presets = Object.entries(DEFAULT_PROFILES).map(([key, profile]) => ({
        id: `preset:${key}`,
        profile_name: profile.name,
        description: profile.description,
        entity_types: profile.entityTypes,
        relationship_types: profile.relationshipTypes,
        is_preset: true
    }));

    return {
        custom: result.rows,
        presets
    };
}

/**
 * Delete a custom profile.
 */
export async function deleteProfile(userId, profileId) {
    const db = getDb();
    await db.query(
        'DELETE FROM graph_profiles WHERE id = $1 AND user_id = $2',
        [profileId, userId]
    );
}
