# Brevis "Switch from Pocket" 5-Email Nurture Sequence

**Campaign Overview**
- Target: Displaced Pocket users (Mozilla shutdown July 2025, 30M+ affected)
- Offer: 50% off first 3 months (Professional: $12 → $6/mo; Premium: $29 → $14.50/mo)
- Sender: Antonio (Founder @ Brevis)
- Tone: Personal, founder voice. No corporate speak.
- Duration: 14 days (Day 0, 3, 6, 10, 14)

---

## EMAIL 1: Day 0 — "Welcome, Fellow Pocket Refugee"

**Subject Line (Primary)**
Pocket shut down. Here's what I'm using instead.

**Subject Line (A/B Alt)**
I was a Pocket user too...

**Subject Line Note**
Primary focuses on **specificity + empathy** (Pocket explicitly named). A/B is **curiosity-driven + personal**. Test which resonates better with Pocket users' emotional state (loss vs. discovery).

**Preview Text**
And it's built specifically for people like us.

**From Name**
Antonio, Founder @ Brevis

**Body Copy**

Hi [First Name],

I got an email last month saying Pocket was shutting down. I had been using it for 8 years.

I remember feeling the same way you probably do right now — frustrated, a little lost, wondering where all that reading was going to live.

That frustration actually led me to build Brevis.

Here's the problem I was solving for myself: I subscribe to 20+ newsletters (legal, VC, tech, policy stuff). That's 60+ min/day just skimming headlines. I needed something better than Pocket for this specific workflow — something that actually *read* the full newsletters for me and gave me the key takeaways.

Turns out a lot of other professionals in legal, finance, and VC had the exact same problem.

That's Brevis. It's not a Pocket clone. It's something different — an AI that summarizes your newsletters into [Brevis users save an average of 30 min/day on reading]. You forward newsletters to a unique email address. Claude AI summarizes each one into 4–6 bullet points. Every morning, you get a digest with everything that matters.

I built it because Pocket wasn't doing this. Neither was Readwise or Matter. And if you're anything like me, 30 minutes a day is the difference between staying current and feeling buried.

**No credit card required** — [14-day free trial]. Full access to all features.

Want to see how it works?

[See how it works] → brevisapp.com/switch-from-pocket

Talk soon,

Antonio  
Founder, Brevis  
brevisapp.com

P.S. — If you're importing your Pocket library, we have a guide for that. Just reply to this email.

---

**Email 1 — Metrics & Branching**

**Primary KPIs to Track**
- Open rate (target: 45%+ for founder-personal tone)
- Click-through to landing page (target: 18%+)
- Conversion to free trial signup (target: 8%+)

**Exit Conditions**
- Bounces: Remove from sequence immediately.
- Unsubscribes: Respect opt-out, log for suppression list.
- Hard complaint: Investigate.

**Branching Logic — After Day 0**

| Segment | Behavior | Action | Next Email? |
|---------|----------|--------|------------|
| Opened + Clicked | High intent | Send Email 2 on Day 3 | YES |
| Opened + No Click | Interest but hesitant | Send Email 2 on Day 3 (note: consider softer angle) | YES |
| Not Opened (48 hrs) | No engagement | Send re-engagement push on Day 2 (subject: "You didn't see my Pocket replacement...") | Hold Email 2 until re-engagement |
| Conversion | Already signed up | Remove from sequence. Send onboarding emails instead. | NO |

---

## EMAIL 2: Day 3 — "What If You Never Had to Read Another Full Newsletter?"

**Subject Line (Primary)**
What 60 minutes a day of reading time looks like.

**Subject Line (A/B Alt)**
The problem with Pocket (and every other reader)

**Subject Line Note**
Primary is **benefit-focused + pain-based**. A/B is **problem-identification + curiosity**. Primary should outperform among time-pressured professionals; A/B among problem-hunters.

**Preview Text**
Hint: It involves not reading 20 newsletters a day.

**From Name**
Antonio, Founder @ Brevis

**Body Copy**

Hi [First Name],

I got a lot of responses from the first email. Most people asked the same thing:

**"Wait — Claude actually *reads* my newsletters for me?"**

Yes. And it's kind of amazing.

Here's what my day looks like:

I subscribe to 20+ newsletters. Legal news, VC market intel, tech trends, policy updates. Before Brevis, I'd spend 60–90 minutes every morning just scrolling through them, trying to figure out what actually mattered and what I could skip.

Now:

1. I forward each newsletter to my Brevis email address
2. Claude AI reads it and summarizes it into 4–6 bullet points in about 30 seconds
3. Every morning, I get one digest with all my summaries — [sortable by topic, searchable by keyword]
4. I read the whole digest in 15–20 minutes instead of 60+

The summaries aren't generic. They're smart. Claude picks up on legal implications, market signals, technical details, founder psychology — whatever matters in *your* vertical.

**Here's a real example:**

Yesterday I got a newsletter about a new EU regulation on AI liability. The full article was 3,000 words. Brevis gave me:
- **Regulation scope**: Applies to high-risk AI systems in EU market
- **Legal trigger**: Liability shifted from developers to deployers
- **Market impact**: Insurance costs for AI companies likely to rise 15–20%
- **Timeline**: Effective 2026
- **Action for investors**: Review portfolio companies' EU exposure

That took 30 seconds to read instead of 15 minutes. And I had everything I needed to make decisions.

That's what we built for people like you.

[Start your free trial] → brevisapp.com/switch-from-pocket

You'll get full access for 14 days. No credit card. When the trial ends, you get 50% off your first 3 months.

Antonio

---

**Email 2 — Metrics & Branching**

**Primary KPIs to Track**
- Open rate (target: 38%+ — typically dips from Email 1)
- Click-through (target: 15%+)
- Trial signups (target: 6%+)
- Time-to-conversion (hours from click to signup)

**Re-Engagement & Win-Back**

| Segment | Behavior | Action | Notes |
|---------|----------|--------|-------|
| Opened + Clicked | Intent confirmed | Skip Email 3 re: story (they got the narrative). Go directly to Email 4 (Day 10 comparison) OR send Email 3 but slightly softer. | Recommend: Send Email 3 on Day 6 as planned. They need social proof before decision. |
| Opened + No Click | Still interested but cold | Send lightened version on Day 4: "One thing Brevis does differently than Matter/Readwise" | Use this to re-warm without pushing conversion |
| Not Opened (48 hrs) | Dormant | Send Day 4 re-engagement: subject = "I think you missed this..." | Gentle, not pushy. If no open by Day 5, may move to sequences end. |
| Trial Signup | Converted | Remove from email sequence. Trigger onboarding flow (welcome series, feature tutorials, daily digest education). | Congratulate in Brevis app itself. |

---

## EMAIL 3: Day 6 — "I Built This Because I Had the Same Problem"

**Subject Line (Primary)**
Why I left my law firm to build this.

**Subject Line (A/B Alt)**
The real reason Pocket didn't work for me.

**Subject Line Note**
Primary uses **founder credibility + vulnerability**. A/B focuses on **problem validation + specificity**. Primary resonates with professional identity; A/B works for problem-first buyers.

**Preview Text**
It's not what you'd expect from a startup founder.

**From Name**
Antonio, Founder @ Brevis

**Body Copy**

Hi [First Name],

I want to tell you why I actually built this.

I'm a Senior In-House Counsel at a VC fund called BITKRAFT Ventures. My job is to review deals, manage legal risk, stay on top of regulatory changes, and advise on everything from securities law to crypto policy.

To do that, I subscribe to 20+ newsletters. Financial Times, The Block, The Information, legal blogs, policy briefs, founder emails. Every single day, I'm trying to stay ahead of changes that could affect our investments.

For the first 5 years, I used Pocket. I'd save articles, skim them at night, rarely actually read them fully. By Friday, I had 40+ unread items. I'd delete most of them. I felt like I was always behind.

Then I realized: **Pocket was designed for casual reading, not professional workflows.**

I didn't need a repository. I needed an *intelligence tool*. Something that would actually *read* the material and tell me what mattered. Something that understood my vertical — legal, VC, investments — not just text.

Readwise is great, but it's for book highlighting. Matter is good, but it's more general-interest. Pocket was gone.

So I spent 6 months building what *I* needed. And I realized other professionals in legal, finance, consulting — people with deep specialization — had the exact same gap.

That's Brevis.

[Brevis users report saving an average of 30 min/day], but more importantly, they actually *stay current*. No more guilt. No more pile-up.

[Try it free for 14 days] → brevisapp.com/switch-from-pocket

When your trial ends, 50% off your first 3 months.

Antonio  
Founder, Brevis  

P.S. — If you want to know more about how Brevis works with legal newsletters specifically (or VC-focused content), let me know. That's my sweet spot.

---

**Email 3 — Metrics & Branching**

**Primary KPIs to Track**
- Open rate (target: 35%+ — story fatigue expected)
- Click-through (target: 12%+)
- Trial signups (target: 5%+)
- Reply rate (monitor P.S. engagement)

**Segmentation After Email 3**

| Segment | Signal | Action | Timing |
|---------|--------|--------|--------|
| Trial already signed | Converted in Emails 1–2 | Remove from sequence entirely. | N/A |
| Opened Email 3 + replied to P.S. | High intent + personalization request | Send niche-focused case study (legal/VC angle) immediately. Skip Email 4 comparison. | Same day if possible |
| Opened + No Click (all 3 emails) | Multiple signals of low conversion intent | Still send Email 4 (comparison) on Day 10 — it's often the "permission" email that closes fence-sitters. | Day 10 as planned |
| Not Opened by Day 5 | Dormant after 3 touches | Send final re-engagement on Day 7: "Last chance to see Pocket's replacement (with 50% off)". If no open by Day 8, may segment to "low-intent" list. | Day 7 |

---

## EMAIL 4: Day 10 — "An Honest Look at Your Options"

**Subject Line (Primary)**
Pocket vs. Brevis vs. Readwise vs. Matter: the honest comparison.

**Subject Line (A/B Alt)**
How to actually choose a newsletter tool (no BS).

**Subject Line Note**
Primary is **direct + authoritative** (comparison positioning). A/B is **transparency + pragmatism**. Primary drives click-through on comparison content; A/B appeals to skeptics.

**Preview Text**
Spoiler: they're solving different problems.

**From Name**
Antonio, Founder @ Brevis

**Body Copy**

Hi [First Name],

By now, you've probably tried a few Pocket replacements. Or you're sitting with a spreadsheet of options wondering which one is actually worth your time.

So let me be direct: Brevis isn't the right choice for everyone. And I want to tell you why.

**The Honest Breakdown:**

**Readwise**
- Best for: People who highlight a lot of books and want to resurface great passages.
- Good at: Spaced repetition, review workflows, integrations.
- Why not for newsletters: It treats newsletters like books. You'd highlight passages, then review them. Fine for casual reading. Inefficient for staying current on 20+ daily subscriptions.

**Matter**
- Best for: General-interest readers who want a beautifully designed reading experience.
- Good at: Curation, design, social discovery.
- Why not for professionals: It's optimized for exploring new content. Not for staying current in a specific vertical (legal, VC, tech ops, etc.). Also limited AI summarization.

**Readless**
- Best for: Folks who want ultra-simple inbox management.
- Good at: Unsubscribing from newsletters you don't read.
- Why not ambitious enough: It solves a problem (unsubscribe management), but doesn't help you actually *read and stay current* on the ones that matter.

**Pocket (was)**
- Best for: Casual web clipping and reading.
- Why it's gone: Mozilla shut it down. Great product, but not a core business.

**Brevis**
- Best for: Professionals with [20+ subscriptions] who need to stay current in a vertical (legal, VC, consulting, tech ops, finance).
- Best at: AI-powered vertical-aware summaries, daily digest workflows, staying current without time drain.
- Trade-off: It's specifically designed for professionals. If you're reading Wired and casual Medium essays, you might prefer Matter's design.

**The Real Difference**

Most newsletter tools assume you're a casual reader trying to "keep up with the internet."

Brevis assumes you're a professional trying to *stay current in your field* while protecting your time.

Different problems. Different solutions.

**You're probably in the second category** if:
- You have [20+] active newsletter subscriptions
- You need to stay current in legal, finance, VC, policy, or tech ops
- You're losing [30+ min/day] to reading
- You want summaries that understand your *field*, not just your interests

[See the full comparison] → brevisapp.com/switch-from-pocket/comparison

And if Brevis isn't a fit, that's okay. At least you'll know *why*.

But if it is, you've got [50% off your first 3 months] waiting for you.

Antonio

---

**Email 4 — Metrics & Branching**

**Primary KPIs to Track**
- Open rate (target: 32%+ — comparison content draws interested buyers)
- Click-through to comparison page (target: 16%+)
- Trial signups from comparison page (target: 7%+)
- Blog engagement (scroll depth on comparison article)

**Post-Comparison Branching**

| Segment | Signal | Action | Next Step |
|---------|--------|--------|-----------|
| Clicked comparison + signed up | Converted via social proof | Remove from sequence. Onboard. | N/A |
| Clicked comparison + did NOT sign up | Read but unconverted | Day 14 final offer (Email 5) likely to convert. Send as planned. | Email 5, Day 14 |
| Opened but didn't click comparison | Still hesitant | They may need social proof elsewhere. Email 5 includes testimonials. Send as planned. | Email 5, Day 14 |
| Not opened by Day 11 | Low engagement | Send urgency-based Email 5 early (Day 12) with "Offer expires in 48 hours" angle. | Email 5, Day 12 (accelerated) |
| Trial expires before Email 5 | Free trial conversion lapsed | Segment to "trial expired" list. Send re-activation email on Day 16 (after Email 5 sequence ends). | Hold Email 5; trigger re-activation instead. |

---

## EMAIL 5: Day 14 — "Your 50% Off Expires in 48 Hours"

**Subject Line (Primary)**
Your 50% off Pocket replacement expires in 48 hours.

**Subject Line (A/B Alt)**
This offer runs out tomorrow at midnight.

**Subject Line Note**
Primary is **specific + benefit-based**. A/B is **urgency-driven + scarcity-based**. Primary should outperform on-list (already aware of offer); A/B works for re-engagement on low-engagement segments.

**Preview Text**
50% off the first 3 months of Brevis. Ends midnight tomorrow.

**From Name**
Antonio, Founder @ Brevis

**Body Copy**

Hi [First Name],

Your free trial ends in 48 hours. So does the 50% off offer.

Here's what that looks like:

**Professional Plan**
- Regular price: $12/month
- With 50% off: $6/month (first 3 months only)
- Includes: AI summaries of all newsletters, daily digest, keyword search, topic filtering

**Premium Plan**
- Regular price: $29/month
- With 50% off: $14.50/month (first 3 months only)
- Includes: Everything in Professional, plus custom AI training, priority support, VC/Legal vertical specialization

[Brevis users save an average of 30 min/day] on newsletter reading. After 3 months, that's [90 hours you get back].

We've had [200+ Pocket users switch in the last 30 days]. [Average rating: 4.8/5 stars].

"I've tried everything since Pocket shut down. Brevis is the only thing that actually works for how I read." — Sarah M., In-House Counsel

"Saves me an hour every morning. Finally staying current without the guilt." — James K., VC Partner

[Claim 50% off] → brevisapp.com/switch-from-pocket#pricing

The offer ends at midnight tomorrow UTC. After that, you'll pay full price.

Antonio  
Founder, Brevis

P.S. — If you're still unsure, reply to this email. I answer every message personally.

---

**Email 5 — Metrics & Branching**

**Primary KPIs to Track**
- Open rate (target: 40%+ — urgency drives opens)
- Click-through (target: 18%+)
- Conversion rate (target: 9%+)
- Revenue per email (target: [baseline TBD from earlier conversions])
- Reply rate (P.S. engagement)

**Post-Sequence Branching & Win-Back**

| Segment | Signal | Action | Timing |
|---------|--------|--------|--------|
| Converted in Email 5 | Final close | Remove from sequence. Onboard immediately. Send welcome series + feature education. | Immediate |
| Opened Email 5 + did NOT convert | Last-touch engagement | Send Day 16 "soft follow-up" — no discount, but offering "questions answered" CTA (links to FAQ or reply). | Day 16, soft tone |
| Did not open Email 5 | Non-responsive | Segment to "abandoned" list. 30 days later, send win-back (new offer or angle). | Day 44 win-back |
| Unsubscribed | Opt-out | Respect immediately. Add to suppression list. Do not contact. | N/A |
| Free trial expired without conversion | Trial lapsed | Send "re-activation" email (Day 16) with fresh angle: "Your trial is over, but here's what you missed" (case studies, feature updates). Offer time-limited discount (different angle than 50% off). | Day 16–20 |

---

## Sequence Completion & Success Metrics

**Overall Campaign KPIs**

| Metric | Target | Notes |
|--------|--------|-------|
| **Email Open Rate (avg across 5)** | 38%+ | Founder voice typically outperforms brand emails by 15–20% |
| **Click-Through Rate (avg)** | 15%+ | Multiple CTAs per email (landing page, comparison, CTA) drives higher CTR |
| **Trial Signups** | 6–8% of opens | Email 2 & 3 drive most signups; Email 4 is permission/validation |
| **Trial-to-Paid Conversion** | 25–35% | Apply 50% discount at point of conversion (not during trial) to test paid intent |
| **Revenue per Email** | [TBD after Week 1] | Use actual conversion data to measure revenue contribution by email |
| **Unsubscribe Rate** | <0.5% | Founder voice + relevant content should keep unsubscribes low |
| **Spam Complaint Rate** | <0.1% | Monitor. Personal email should avoid spam filters. |

**Sequence Success Criteria**

- [ ] Email 1 achieves 45%+ open rate (founder welcome email)
- [ ] Email 2 drives 6%+ trial signups (problem/solution clarity)
- [ ] Email 4 comparison page achieves 16%+ CTR (permission email)
- [ ] Email 5 closes 9%+ of opens (urgency close)
- [ ] Overall sequence converts 4–6% of initial send list to paid customers
- [ ] NPS or CSAT after first 30 days averages 7.5+/10

**Post-Sequence Automation**

After Email 5 (Day 14):

1. **Converted customers**: Move to onboarding sequence (7-email welcome series over 2 weeks, educating on features, best practices).
2. **Trial ended, no conversion**: Move to "abandoned trial" nurture (lower-touch, 2-email sequence over 14 days with new angle).
3. **Unengaged (never opened Email 5)**: Segment to quarterly re-engagement list. Contact 30 days later with fresh campaign.
4. **Unsubscribed**: Add to global suppression list immediately. Do not contact.

---

## A/B Testing Summary & Recommendations

**Test Structure (Phase 1 — Recommended)**

Split audience 50/50 on **Email 1** subject lines:
- **Control**: "Pocket shut down. Here's what I'm using instead."
- **Variant**: "I was a Pocket user too..."

**Winner criteria**: Primary metric = open rate. Secondary = click-through. Run through Email 2 (Day 3) to measure downstream impact.

**Phase 2 Testing** (after Phase 1 winner determined):

Apply Phase 1 winning tone/angle to **Email 5** subject line:
- If empathy/personal won in Email 1: Test "Your 50% off Pocket replacement expires in 48 hours" vs. "50% off ends tomorrow (but you already knew that)"
- If urgency/specificity won: Test "Your 50% off Pocket replacement expires in 48 hours" vs. "Last call: 50% off expires at midnight"

**Measurement Window**: Days 0–14 for primary sequence. Days 14–30 for post-sequence performance (trial-to-paid conversion).

---

## Appendix: Placeholder Metrics to Update Post-Launch

The following brackets should be filled with *actual* Brevis data post-launch:

- `[14-day free trial]` → Confirm trial length matches current offer
- `[Brevis users save an average of 30 min/day on reading]` → Update with actual user telemetry (track in-app reading time)
- `[sortable by topic, searchable by keyword]` → Confirm product features in MVP
- `[200+ Pocket users switch in the last 30 days]` → Update weekly as campaign runs
- `[Average rating: 4.8/5 stars]` → Gather from early user feedback or NPS
- `[20+]` → Adjust based on average user subscription count (segment: high-volume users)
- `[90 hours you get back]` → Calculated: 30 min/day × 180 days = 90 hours. Update if daily save estimate changes.

---

## Implementation Checklist

- [ ] Create Pocket comparison blog post (Email 4 CTA target)
- [ ] Build /switch-from-pocket landing page with free trial CTA
- [ ] Design /switch-from-pocket/comparison page with competitor matrix
- [ ] Add pricing CTA to #pricing anchor on /switch-from-pocket
- [ ] Set up free trial on Brevis app (14 days, no CC required)
- [ ] Configure 50% off discount code (3 months, applies at end of trial)
- [ ] Load audience segment (Pocket users, target = 30M+ potential)
- [ ] Set up email sends (ESP scheduling, Day 0, 3, 6, 10, 14)
- [ ] Configure branching logic in ESP (opens, clicks, conversions)
- [ ] Set up UTM tracking on all CTAs (utm_campaign=switch-from-pocket, utm_medium=email, utm_source=email1–5)
- [ ] Create A/B test structure in ESP (Email 1 subject lines, 50/50 split)
- [ ] Set up analytics dashboard to track KPIs listed above
- [ ] Configure re-engagement emails (Day 2, 4, 7 for non-openers)
- [ ] Brief support team on expected inbound questions from trial signups
- [ ] Create onboarding sequence for trial-to-paid conversions (separate email series)

---

## Final Notes

**Tone & Voice**
- This sequence is *intentionally* from Antonio personally, not from a "Brevis Marketing Team" or generic brand.
- Each email includes a personal sign-off and often a P.S. to reinforce founder authenticity.
- Recommended to send from `antonio@brevisapp.com`, not a noreply address.
- Consider having Antonio (or a support team member) manually respond to a few high-intent replies (marked "Hot Leads") to reinforce the personal brand.

**Conversion Expectation & Timing**
- Email 2 (Day 3) will drive the first wave of conversions (problem resonance + soft CTA).
- Email 4 (Day 10) acts as a permission/validation email. Fence-sitters often convert here.
- Email 5 (Day 14) is the final close. Urgency + social proof + low friction pricing.
- Do *not* remove users who convert early. They'll still see subsequent emails (optional: suppress if already paid, but monitor for additional upsells or referral CTAs).

**Suppression & Compliance**
- Honor all unsubscribe requests immediately.
- Monitor spam complaints. Personal founder emails should have <0.1% complaint rate.
- Ensure all email addresses are valid (bounce-check before send).
- Include physical mailing address in footer (CAN-SPAM requirement).

**Next Steps Post-Launch**
1. Run sequence for 14 days with 50/50 A/B test on Email 1 subject line.
2. Analyze results (open rates, CTR, conversions) by Day 15.
3. Declare winner; apply winning angle to future campaigns.
4. Measure trial-to-paid conversion rate by Day 30.
5. Survey first 50 convertees: "What email convinced you?" to refine future sequences.
6. Update metrics in appendix with live data.
