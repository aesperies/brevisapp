import express from 'express';

import { dbHelpers } from '../../database.js';
import { PLANS } from '../../ai-service.js';
import { maskEmail } from '../utils/logger.js';
import { asyncHandler } from '../utils/errors.js';
import { authMiddleware } from '../middleware/auth.js';
import { stripe, STRIPE_PRICES } from '../clients.js';

export function createBillingRouter() {
const router = express.Router();

// ============= PLAN ROUTES =============

router.get('/api/plans', (req, res) => {
    res.json(PLANS);
});

// ============= STRIPE ROUTES =============


router.post('/api/stripe/checkout', authMiddleware, asyncHandler(async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to your environment variables.' });
    }

    const { plan, interval } = req.body; // plan: 'standard'|'premium' (or 'pro' for legacy), interval: 'month'|'year'
    const priceId = STRIPE_PRICES[`${plan}_${interval}`];

    if (!priceId) {
        const envVar = plan === 'premium'
            ? (interval === 'year' ? 'STRIPE_PRICE_PREMIUM_ANNUAL' : 'STRIPE_PRICE_PREMIUM_MONTHLY')
            : (interval === 'year' ? 'STRIPE_PRICE_PRO_ANNUAL' : 'STRIPE_PRICE_PRO_MONTHLY');
        console.error(`❌ [Stripe] Missing price ID for ${plan}/${interval}. Set ${envVar} in env vars.`);
        return res.status(500).json({ error: `Payment not configured for this plan. Please contact support.` });
    }

        const user = await dbHelpers.findUserById(req.user.id);

        // Create or reuse Stripe customer
        let customerId = user.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: { user_id: user.id.toString() }
            });
            customerId = customer.id;
            await dbHelpers.updateUser(user.id, { stripe_customer_id: customerId });
        }

        const baseUrl = process.env.FRONTEND_URL || 'https://brevisapp.com';

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${baseUrl}/app.html?checkout=success`,
            cancel_url: `${baseUrl}/app.html?checkout=cancel`,
            metadata: { user_id: user.id.toString(), plan },
            subscription_data: { trial_period_days: 14 }
        });

    console.log('✅ Checkout session created for:', maskEmail(user.email), plan, interval);
    res.json({ url: session.url });
}));

router.post('/api/stripe/portal', authMiddleware, asyncHandler(async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    const user = await dbHelpers.findUserById(req.user.id);
    if (!user.stripe_customer_id) {
        return res.status(400).json({ error: 'No subscription found' });
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://brevisapp.com';

    const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: baseUrl
    });

    console.log('✅ Portal session created for:', maskEmail(user.email));
    res.json({ url: session.url });
}));

// Stripe webhook - must use raw body, placed before express.json()
router.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
    if (!stripe) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        let event;
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret || !sig) {
            console.error('❌ Stripe webhook secret not configured or signature missing');
            return res.status(400).json({ error: 'Webhook signature verification not configured' });
        }

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('❌ Stripe webhook signature error:', err.message);
            return res.status(400).json({ error: 'Webhook signature verification failed' });
        }

        console.log('📦 Stripe event:', event.type);

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = parseInt(session.metadata?.user_id);
                const plan = session.metadata?.plan;

                if (userId && plan) {
                    await dbHelpers.updateUser(userId, {
                        plan,
                        stripe_subscription_id: session.subscription
                    });
                    console.log('✅ Plan upgraded via checkout:', userId, plan);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(subscription.customer);

                if (user && subscription.status === 'active') {
                    // Determine plan from price
                    const priceId = subscription.items?.data?.[0]?.price?.id;
                    let plan = 'free';
                    if (priceId === STRIPE_PRICES.pro_month || priceId === STRIPE_PRICES.pro_year ||
                        priceId === STRIPE_PRICES.standard_month || priceId === STRIPE_PRICES.standard_year) {
                        plan = 'standard'; // Use 'standard' as the new name (pro is now standard)
                    } else if (priceId === STRIPE_PRICES.premium_month || priceId === STRIPE_PRICES.premium_year) {
                        plan = 'premium';
                    }
                    await dbHelpers.updateUser(user.id, {
                        plan,
                        stripe_subscription_id: subscription.id
                    });
                    console.log('✅ Subscription updated:', maskEmail(user.email), plan);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(subscription.customer);

                if (user) {
                    await dbHelpers.updateUser(user.id, {
                        plan: 'free',
                        stripe_subscription_id: null
                    });
                    console.log('✅ Subscription cancelled, downgraded:', maskEmail(user.email));
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(invoice.customer);
                if (user) {
                    console.warn('⚠️ Payment failed for:', maskEmail(user.email), '| attempt:', invoice.attempt_count);
                    // Downgrade after 3 failed attempts
                    if (invoice.attempt_count >= 3) {
                        await dbHelpers.updateUser(user.id, { plan: 'free' });
                        console.log('❌ Downgraded to free after 3 failed payments:', maskEmail(user.email));
                    }
                }
                break;
            }

            case 'customer.subscription.paused': {
                const subscription = event.data.object;
                const user = await dbHelpers.findUserByStripeCustomerId(subscription.customer);
                if (user) {
                    await dbHelpers.updateUser(user.id, { plan: 'free' });
                    console.log('⏸️ Subscription paused, downgraded:', maskEmail(user.email));
                }
                break;
            }

            default: {
                // Stripe sends ~100+ event types; we only care about the subset above.
                // Log unhandled types so we notice when Stripe ships something new
                // we should react to (e.g., 'invoice.upcoming' for dunning UX).
                console.warn('[stripe-webhook] unhandled event type:', event.type);
                break;
            }
        }

    res.json({ received: true });
}));

return router;
}
