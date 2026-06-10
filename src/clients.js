// Third-party API clients, constructed once at startup.
// Moved verbatim from server.js during the 2026-06 architecture refactor.

import Stripe from 'stripe';
import OpenAI from 'openai';

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY.trim()) : null;

// Initialize OpenAI for text-to-speech (optional)
export const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
if (openai) {
    console.log('✅ OpenAI configured for audio generation');
} else {
    console.log('⚠️  OpenAI not configured (audio feature disabled)');
}

export const STRIPE_PRICES = {
    // Keep pro for backward compatibility
    pro_month: process.env.STRIPE_PRICE_PRO_MONTHLY,
    pro_year: process.env.STRIPE_PRICE_PRO_ANNUAL,
    // Standard uses same price IDs as pro (rebranded)
    standard_month: process.env.STRIPE_PRICE_PRO_MONTHLY,
    standard_year: process.env.STRIPE_PRICE_PRO_ANNUAL,
    premium_month: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
    premium_year: process.env.STRIPE_PRICE_PREMIUM_ANNUAL
};

// Log Stripe config status at startup
if (process.env.STRIPE_SECRET_KEY) {
    const missingPrices = Object.entries(STRIPE_PRICES)
        .filter(([, v]) => !v)
        .map(([k]) => k);
    if (missingPrices.length > 0) {
        console.warn('⚠️  [Stripe] Missing price IDs for:', missingPrices.join(', '));
        console.warn('   Set STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL, STRIPE_PRICE_PREMIUM_MONTHLY, STRIPE_PRICE_PREMIUM_ANNUAL in env vars.');
    } else {
        console.log('✅ [Stripe] All price IDs configured.');
    }
}
