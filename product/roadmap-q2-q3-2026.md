# Brevis Product Roadmap: Q2-Q3 2026

**Last Updated:** April 8, 2026  
**Author:** Antonio Bitkraft  
**Target:** $10K MRR by September 30, 2026 (~500 paying users @ ~$20/mo blended)

---

## Key Milestones Timeline

| Date | Milestone | Users | MRR Est. |
|------|-----------|-------|----------|
| **Apr 30** | Pocket campaign live + 50 paying users | 64 | ~$800-1,000 |
| **May 31** | Audio digest MVP + organic growth starts | 180 | ~$2,500-3,200 |
| **Jun 30** | RSS feed + referral program live | 300 | ~$4,000-5,000 |
| **Jul 31** | Vertical landing pages + Slack integration | 400 | ~$6,000-7,000 |
| **Sep 30** | Legal brief AI model + team plans MVP | 500+ | $10,000+ |

---

## NOW — April 2026: Ship & Acquire

**Objective:** Launch first paid customer growth. Reduce onboarding friction. Deploy Pocket campaign.  
**Focus:** Go from 14 test users → 50 paying customers by end of April.

### P0: Deploy Pocket Campaign Assets
- **Status:** Ready to ship
- **Scope:**
  - Publish landing page (`/switch-from-pocket`)
  - Deploy email sequence (5-email drip for Pocket refugees)
  - Publish blog post: "Where to Go After Pocket Shut Down"
  - Set up conversion tracking (UTM, event analytics)
- **Effort:** S (1-2 days) — assets already drafted
- **Impact:** [High] — 30-40 qualified sign-ups expected
- **Dependencies:** None
- **Owner:** Antonio + automation via email service
- **Success Metric:** 30+ sign-ups, 20%+ conversion to trial

### P0: Payment Flow Hardening
- **Status:** In progress
- **Scope:**
  - Test Stripe checkout end-to-end (trial + upgrade path)
  - Fix any payment confirmation email delays (SendGrid)
  - Implement 3x trial success checks (new user → trial invited → upgrade prompt)
  - Add payment failure handling (retry logic, customer support card on file)
  - Ensure billing portal works (view invoice, manage card, cancel)
- **Effort:** M (3-5 days)
- **Impact:** [High] — reduces churn from payment friction
- **Dependencies:** None
- **Owner:** Antonio (backend + Stripe dashboard review)
- **Success Metric:** 0 failed checkouts per 100 attempts, <2% payment failures post-trial

### P0: Onboarding Optimization (Time-to-Value <60s)
- **Status:** In progress
- **Scope:**
  - Audit current onboarding flow (signup → add feeds → first digest)
  - Remove unnecessary steps; auto-suggest popular feeds
  - Add 1-click sample newsletters (legal, VC, tech news)
  - Mobile-optimize signup form
  - Add tooltips for key UI (digest reader, settings, how to add feeds)
- **Effort:** M (3-5 days)
- **Impact:** [High] — improves activation, reduces churn in first 3 days
- **Dependencies:** None
- **Owner:** Antonio (frontend) + feedback from test users
- **Success Metric:** <60s to first digest, 70%+ of signups complete onboarding

### P1: Basic Analytics & Dashboard
- **Status:** Backlog
- **Scope:**
  - Track signups, trial activations, paid conversions
  - Cohort analysis (weekly/monthly cohorts, retention curves)
  - Export to Google Sheets for weekly board review
  - Add in-app analytics dashboard (premium feature later)
- **Effort:** M (3-5 days)
- **Impact:** [Medium] — visibility into what's working
- **Dependencies:** None
- **Owner:** Automated via Segment/Mixpanel or custom SQL
- **Success Metric:** Weekly metrics dashboard live by April 15

### P1: Competitive Positioning Brief (Readless)
- **Status:** In progress
- **Scope:**
  - Publish blog: "Brevis vs Readless: What's Different?"
  - Update homepage messaging to highlight: vertical specialization, AI quality, team plans (coming)
  - Prepare sales one-pager (3 key differentiators)
- **Effort:** S (1-2 days)
- **Impact:** [Medium] — helps convert price-sensitive users
- **Dependencies:** None
- **Owner:** Antonio + marketing
- **Success Metric:** Blog post live, 2+ mentions in early customer interviews

---

## NEXT — May-June 2026: Retain & Grow

**Objective:** Reduce churn. Add features driving daily engagement. Start organic/referral growth.  
**Focus:** 50 → 300 paying customers by end of June.

### P0: Audio Digest MVP (Phase 1)
- **Status:** Scoped, not started
- **Scope:**
  - Integrate text-to-speech API (ElevenLabs or Google Cloud TTS)
  - Generate MP3 for each day's digest (run nightly)
  - Web player with play/pause/speed control
  - Email digest includes audio link
  - Mobile-responsive audio player
- **Effort:** L (1-2 weeks) — including TTS integration + testing
- **Impact:** [High] — opens commute use case, increases daily engagement
- **Dependencies:** TTS API key/budget (~$50-100/mo for initial users)
- **Owner:** Antonio (backend audio pipeline) + frontend polish
- **Success Metric:** 30%+ of users play ≥1 audio digest/week; +20% weekly retention

### P0: RSS Feed Support
- **Status:** Scoped
- **Scope:**
  - Add RSS feed input via URL
  - Validate feed, auto-detect article text extraction
  - Parse RSS 2.0 + Atom feeds
  - Show feed metadata (title, icon, last updated)
  - Remove duplicate articles across feeds
- **Effort:** M (3-5 days)
- **Impact:** [High] — closes feature gap with Readless; lets users add niche newsletters
- **Dependencies:** None (using existing feed parsing libraries)
- **Owner:** Antonio (backend)
- **Success Metric:** 50%+ of users add ≥1 RSS feed; source diversity improves

### P0: Referral Program (In-App)
- **Status:** Scoped
- **Scope:**
  - "Invite 3 friends" in-app button
  - Generate unique referral link per user
  - Incentive: Free month for referrer + referree (once paid)
  - Track referral conversions in analytics
  - Referral leaderboard (optional, for engagement)
- **Effort:** M (3-5 days)
- **Impact:** [High] — net acquisition @ lowest CAC
- **Dependencies:** None
- **Owner:** Antonio (backend + email trigger automation)
- **Success Metric:** 20%+ of users have shared link; 5-10% of sign-ups are referrals

### P1: SEO Content Engine
- **Status:** Scoped
- **Scope:**
  - Weekly blog posts on: newsletter management, AI summarization, market trends
  - Target keywords: "how to summarize newsletters," "AI newsletter tool," "newsletter software"
  - Auto-promote to Twitter/LinkedIn (bilingual EN+ES)
  - Build internal link strategy (blog → Pocket campaign landing page)
  - Set up Google Search Console tracking
- **Effort:** M (3-5 days for setup) + S (1-2 days/week ongoing)
- **Impact:** [High] — long-term organic traffic
- **Dependencies:** Content writing (Antonio or outsourced)
- **Owner:** Antonio or contractor
- **Success Metric:** 1K monthly organic visitors by June 30

### P1: Mobile-Responsive Digest Experience
- **Status:** Partially complete
- **Scope:**
  - Redesign digest reader for mobile (tap to expand article, readable text size)
  - Mobile-optimize settings (manage feeds, notification frequency)
  - Bottom navigation bar (more discoverable than drawer)
  - Test on iOS Safari + Android Chrome
- **Effort:** M (3-5 days)
- **Impact:** [Medium] — improves mobile engagement, enables on-the-go reading
- **Dependencies:** None
- **Owner:** Antonio (frontend)
- **Success Metric:** 40%+ digest opens on mobile; mobile session time ≥ desktop

---

## LATER — July-September 2026: Scale & Differentiate

**Objective:** Vertical specialization. Team features. Path to $10K MRR.  
**Focus:** 300 → 500+ paying customers by end of September.

### P0: Vertical-Specific AI Models (Legal)
- **Status:** Scoped
- **Scope:**
  - Train custom Claude prompt for legal brief extraction:
    - Extract: parties, deal terms, jurisdiction, key dates, risk factors
    - Format: 1-page legal brief (not generic summary)
    - Support: contracts, regulatory alerts, legal news
  - Create "Legal + VC + Consulting" mode selector in settings
  - Add domain detection (if feed is legal-heavy, auto-suggest legal mode)
  - Blog post: "AI Legal Brief Summarization" + case study
- **Effort:** L (1-2 weeks) — testing with real legal content
- **Impact:** [High] — differentiator vs competitors, enables "Brevis for Law Firms"
- **Dependencies:** Access to legal content samples for testing
- **Owner:** Antonio (with legal domain expertise) + fine-tuning
- **Success Metric:** 30+ legal-vertical users; NPS from lawyers 8+/10

### P0: Slack Integration (MVP)
- **Status:** Scoped
- **Scope:**
  - OAuth flow to connect Slack workspace
  - Send daily/weekly digest summary to Slack channel (`#brevis-digest`)
  - 2-3 line summary + link to full digest on brevisapp.com
  - Manage frequency per workspace (daily/weekly/off)
  - Show Slack in "integrations" settings panel
- **Effort:** M (3-5 days)
- **Impact:** [High] — makes Brevis team-friendly; syncs with knowledge-sharing workflows
- **Dependencies:** Slack app approval (submit to marketplace)
- **Owner:** Antonio (backend OAuth + API)
- **Success Metric:** 30+ Slack workspaces installed; 2x engagement for team users

### P1: Team/Organization Plans MVP
- **Status:** Scoped
- **Scope:**
  - "Team" plan tier: $99/mo for up to 5 seats
  - Shared digest library (all team members see same summaries)
  - Team dashboard (see which colleagues are reading what)
  - Admin panel (manage seats, view team analytics)
  - Stripe sync (handle seat additions/removals)
- **Effort:** L (1-2 weeks) — requires seat management backend + frontend
- **Impact:** [High] — enables larger deals, increases LTV
- **Dependencies:** Stripe Billing API, seat management schema
- **Owner:** Antonio
- **Success Metric:** 3-5 teams signed up; 2-3x revenue per team user

### P1: Audio Digest Phase 2
- **Status:** Dependent on Phase 1
- **Scope:**
  - Voice selection (2-3 natural voices)
  - Playback speed control (0.8x-1.5x)
  - Podcast RSS feed (subscribe in Apple Podcasts/Spotify)
  - Download option (offline listening)
  - Skip/rewind buttons
- **Effort:** M (3-5 days)
- **Impact:** [Medium] — increases commute/fitness use case
- **Dependencies:** Phase 1 complete; podcast hosting service
- **Owner:** Antonio (frontend) + podcast hosting provider
- **Success Metric:** 50%+ of audio users adjust speed; 5%+ subscribe to RSS feed

### P2: "Brevis for Law Firms" Landing Page
- **Status:** Scoped
- **Scope:**
  - Standalone landing page targeting: `/law-firms` or `lawfirms.brevisapp.com`
  - Hero: "AI-Powered Legal Brief Digests for Your Practice"
  - Features: contract alerts, regulatory changes, deal flow summaries
  - Social proof: 2-3 testimonials from early legal users
  - Case study: "How [Firm Name] Reduced Research Time by 50%"
  - CTA: "Request a Demo" (book with Antonio)
  - Law firm-specific pricing: custom quote for 10+ seat teams
- **Effort:** M (3-5 days)
- **Impact:** [Medium] — opens enterprise sales channel
- **Dependencies:** Legal vertical model complete; testimonials from users
- **Owner:** Antonio + designer
- **Success Metric:** 10+ demo requests; 1-2 pilot programs with law firms

### P2: API for Power Users
- **Status:** Scoped
- **Scope:**
  - REST API: fetch today's digest JSON, submit custom feeds, bulk import OPML
  - Rate limits: 100 req/day for free, unlimited for paid
  - Documentation: OpenAPI spec + curl examples
  - Use case: power users building custom integrations
- **Effort:** L (1-2 weeks)
- **Impact:** [Medium] — enables developer ecosystem; long-term moat
- **Dependencies:** Backend API scaffolding (Express.js ready), documentation
- **Owner:** Antonio
- **Success Metric:** 5+ custom integrations documented; 20+ API key sign-ups

### P2: Notion Integration
- **Status:** Backlog
- **Scope:**
  - OAuth to Notion
  - Save digest articles to Notion database
  - One-click "save to Notion" button in digest reader
  - Manage which workspace/database articles go to
- **Effort:** M (3-5 days)
- **Impact:** [Medium] — syncs with knowledge management workflows
- **Dependencies:** Notion API access; Brevis user permissions schema
- **Owner:** Antonio (lower priority than Slack)
- **Success Metric:** 15+ Notion workspace connections

---

## Parking Lot (Evaluated, Not Prioritized)

These are high-value ideas with lower immediate priority. Revisit in Q4 2026.

### Chrome Extension (Save for Later)
- **Rationale:** High build cost (manifest v3 complexity). Alternative: email-to-Brevis feature captures similar value.
- **Effort:** L (1-2 weeks)
- **Impact:** [Medium] — increases content capture
- **Revisit:** Q4 if desktop users exceed 60%

### Calendar Integration
- **Rationale:** Lower user demand. Slack/Notion cover team collaboration better.
- **Effort:** M (3-5 days)
- **Impact:** [Low] — niche use case
- **Revisit:** Q4 if team plan adoption exceeds 10 teams

### Custom AI Prompts
- **Rationale:** Increases complexity. Vertical models are cleaner/more scalable.
- **Effort:** M (3-5 days) + ongoing support
- **Impact:** [Low] — small user base
- **Revisit:** Q4 if power users request extensibility

### White-Label / Reseller Program
- **Rationale:** Premature. Wait until product-market fit is clear.
- **Effort:** XL (3+ weeks)
- **Impact:** [Low] — channel partner friction slows velocity
- **Revisit:** Q1 2027 if enterprise traction validates

---

## Success Metrics & Tracking

### Key Leading Indicators (Weekly Review)
- **Signups:** 10+ new signups/week by end of April
- **Trial Conversion:** 40%+ of new signups activate (add ≥1 feed)
- **Activation Day 3:** 70%+ of signups still active after 3 days
- **Trial-to-Paid:** 15%+ of trial users convert within 14 days
- **Churn:** <5% MRR churn (paid users) by June

### Key Lagging Indicators (Monthly Review)
- **Paying Users:** 50 (Apr) → 300 (Jun) → 500+ (Sep)
- **MRR:** $800 (Apr) → $4,000 (Jun) → $10,000 (Sep)
- **CAC (blended):** <$15 (via referral + organic)
- **LTV:** $100+ (assuming 12-month customer lifespan)
- **NPS:** 40+ (promoters - detractors)

### Cohort Retention (Track Monthly)
- **Month 1:** 100% (cohort starts)
- **Month 3:** 80%+ (target for all cohorts)
- **Month 6:** 70%+ (target for paid)

---

## Dependencies & Risks

### Critical Dependencies
1. **Claude API Stability** — Summarization quality is core value. Monitor API uptime/latency.
2. **Stripe & SendGrid Reliability** — Payment and email critical path. Fallbacks in place.
3. **Content Discovery** — Pocket campaign and blog traffic drive top-of-funnel. Prioritize by impact.

### Execution Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Audio digest integration over-runs timeline | Medium | High | Start in early May; MVP can launch without voice selection |
| Vertical AI model needs >2 weeks iteration | Medium | Medium | Partner with early legal users for feedback loop |
| Team plans requires more UX polish | Low | Medium | Ship MVP with basic admin UI; iterate based on feedback |
| Legal vertical generates low traction | Low | Medium | Pivot to VC/Consulting verticalization if needed |
| Pocket campaign underperforms (<20 conversions) | Low | High | Expand to Matter/Readwise audiences; increase email sequence investment |

---

## Decision Gates

### End of April
- **Gate:** 40+ paying customers OR 25%+ trial-to-paid conversion?
  - **If YES:** Proceed as planned.
  - **If NO:** Pause new features. Debug onboarding/messaging. Extend Pocket campaign.

### End of June
- **Gate:** 200+ paying customers, <5% MRR churn, positive referral rate?
  - **If YES:** Invest in vertical specialization + Slack integration.
  - **If NO:** Refocus on retention. Reduce feature scope for July-September.

### End of September
- **Gate:** 400+ paying customers, $6,000+ MRR, NPS 40+?
  - **If YES:** Plan Q4 expansion (law firm sales, API marketplace).
  - **If NO:** Pivot to vertical focus (pick legal OR VC, double down).

---

## Notes for Antonio

1. **Weekly Cadence:** Review roadmap every Monday. Update progress in this doc + metrics tracker.
2. **Prioritization:** Stick to priority order (P0 → P1 → P2). Don't context-switch.
3. **Feedback Loop:** Solicit feedback from 10 early test users every 2 weeks. Adjust roadmap accordingly.
4. **Billing & Analytics:** Use Google Sheets + Stripe API for simple weekly reports. (No complex BI needed yet.)
5. **Velocity:** You're building solo. Assume S = 2-3 days, M = 4-6 days (with breaks), L = 1.5-2.5 weeks of focused work.
6. **Communication:** Share updates with advisors monthly. Share roadmap with team (future hires) as needed.

---

## Appendix: Competitive Feature Matrix

| Feature | Brevis | Readless | Readwise Reader | Matter | Feedly |
|---------|--------|----------|-----------------|--------|--------|
| **AI Summarization** | ✓ (Claude) | ✓ (ChatGPT) | ✓ (Ghostreader) | ✗ | ✗ |
| **Audio Digest** | ✓ (MVP May) | ✗ | ✓ (Audio Reviews) | ✗ | ✗ |
| **RSS Feed Support** | ✓ (Jun) | ✓ | ✓ | ✓ | ✓ |
| **Vertical AI Models** | ✓ (Jul, legal) | ✗ | ✗ | ✗ | ✗ |
| **Team Plans** | ✓ (Jul, MVP) | ✗ | ✗ | ✗ | ✓ |
| **Slack Integration** | ✓ (Jul) | ✗ | ✗ | ✗ | ✓ |
| **Bilingual** | ✓ (EN+ES) | ✗ | ✗ | ✗ | ✗ |
| **Pricing** | $12/$29 | $4.90 | $8.99-$13.99 | Free+promo | Enterprise |

---

**Document Version:** 1.0  
**Next Review:** May 6, 2026
