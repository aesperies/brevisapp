# BREVIS Audio Digest Feature

**Product Requirements Document (PRD)**

**Version:** 1.0  
**Date:** April 8, 2026  
**Status:** Ready for Implementation  
**Owner:** Antonio (solo developer)

---

## 1. Problem Statement

Professionals increasingly consume content during commutes, workouts, and between meetings—moments when reading text is inconvenient or impossible. Brevis currently delivers AI-summarized newsletter digests via email, but this text-only format locks users into screen-based consumption.

Competitors (Readwise Reader's "Audio Reviews," Meco's "audio roundups") have validated this use case. Our target users—lawyers, VCs, consultants—often travel and multitask, making audio a natural fit for high-value briefings.

**Core insight:** Audio lets us increase engagement and daily digest value without changing the core summarization engine.

---

## 2. Goals & Non-Goals

### Goals
- ✅ Enable users to listen to daily digests during commutes/workouts
- ✅ Increase engagement: measure listen rate as leading indicator of retention
- ✅ Match competitor feature parity on audio playback
- ✅ Maintain simplicity: reuse existing summaries, minimal new infrastructure
- ✅ Monetize: include audio in Premium tier only (first month), evaluate paywall after launch

### Non-Goals
- ❌ Full podcast production (music, jingles, intro/outro)
- ❌ Multi-voice narration or voice selection MVP
- ❌ Real-time streaming (pre-generated only)
- ❌ Offline download / RSS podcast feed (Phase 3)
- ❌ User-supplied voice content
- ❌ Transcription or searchable audio

---

## 3. User Stories

### Primary Users
1. **Commuting Professional**  
   > As a lawyer, I want to listen to my daily digest during my 30-minute commute so I stay briefed without reading on the train.

2. **Workout Enthusiast**  
   > As a VC, I want to consume briefings during my morning run so I don't waste training time scrolling.

3. **Quick Switcher**  
   > As a consultant, I want a play button in my email so I can switch from reading to listening in one click.

4. **Quality-Conscious User**  
   > As a professional, I want natural-sounding narration, not robotic TTS, because cheap audio damages credibility.

### Secondary Users
5. **Data-Driven Operator**  
   > As a user, I want to see my listen duration and frequency so I understand if audio is saving me time.

---

## 4. Proposed Solution & Technical Options

### Context
Brevis currently:
- Generates 4–6 bullet-point summaries via Claude API
- Sends daily digest email via SendGrid
- Uses Express backend + React frontend
- Has OpenAI API key configured (confirmed in server.js)

To add audio, we must:
1. **Generate audio** from the text summary
2. **Store audio** somewhere accessible
3. **Embed player** in email and/or web
4. **Track listen events** (optional, for metrics)

### Option Comparison

| **Option** | **Quality** | **Cost/User/Mo** | **Latency** | **Complexity** | **Recommendation** |
|---|---|---|---|---|---|
| **A: Browser TTS (Web Speech API)** | Poor (robotic) | $0 | <100ms | Very Low ⭐ | MVP fallback only |
| **B: OpenAI TTS API** | Excellent (natural) | ~$0.08–0.15 | 2–5s | Low ⭐⭐⭐ | **RECOMMENDED** |
| **C: Google Cloud TTS** | Good (natural) | ~$0.06–0.12 | 2–5s | Low ⭐⭐ | Better for scale |
| **D: ElevenLabs (API)** | Excellent (custom voices) | ~$0.12–0.30 | 2–5s | Low ⭐⭐ | Premium only |
| **E: Pre-generate at summary time (local MP3)** | Excellent | ~$0.08–0.15 | 2–5s | Low–Medium ⭐⭐⭐ | Strong alternative |

### Recommendation: **OpenAI TTS API (Option B)**

**Rationale for solo developer:**
- ✅ Already have OpenAI API key configured
- ✅ Trivial integration (1 API call per digest)
- ✅ Natural voice quality (far superior to Web Speech API)
- ✅ Low cost (~$0.10/digest at scale)
- ✅ No storage complexity (can store MP3 on Railway or S3)
- ✅ No multi-voice overhead for MVP
- ✅ Proven at Brevis scale (100s of digests/day = ~$3/day max)

**Cost breakdown (100 users, 70% listen rate):**
- 100 users × 1 digest/day = 100 digests/day
- Each digest: ~500 words (summary) = ~$0.06 (OpenAI TTS pricing)
- Daily cost: ~$6/day = ~$180/month
- Monthly revenue (Premium tier): 100 × $29 = $2,900
- **Profit margin: 94%**

**Fallback consideration:** If costs spike unexpectedly, switch to Google Cloud TTS (slightly cheaper at scale, but requires setup).

---

## 5. Recommended Architecture

### Data Flow

```
User receives daily digest email
         ↓
Digest contains:
  - Text summary (4–6 bullets)
  - "Listen to digest" button → brevisapp.com/listen/[digest-id]
         ↓
User clicks link
         ↓
Audio player page loads (React component)
  - Fetches digest summary from API
  - If audio_url is null → generates on first play (lazy)
  - If audio_url exists → plays from storage
  - Shows progress, speed control, transcript toggle
         ↓
OpenAI TTS API converts summary → MP3
         ↓
MP3 stored on Railway static files or S3
  (Retention: 30 days, delete old files)
         ↓
Listen event logged:
  - digest_id, user_id, started_at, duration, completed
         ↓
Metrics: listen_rate, avg_listen_duration, completion_rate
```

### System Components

1. **Backend (Express)**
   - New endpoint: `POST /api/digests/:id/audio`
     - Check user permissions (Premium tier only, MVP)
     - Call OpenAI TTS API
     - Upload MP3 to storage
     - Save audio_url to database
     - Return audio URL
   
   - Extend endpoint: `GET /api/digests/:id`
     - Return `audio_url` field
   
   - New endpoint: `POST /api/digests/:id/listen`
     - Log listen event (optional)

2. **Frontend (React)**
   - New page: `/listen/[digest-id]`
     - Simple audio player (HTML5 `<audio>` tag)
     - Controls: play, pause, speed (0.75x, 1x, 1.25x, 1.5x)
     - Progress bar
     - Optional: show text summary alongside
   
   - Email template change:
     - Add CTA button: "Listen to your digest" → link to listen page

3. **Database (LowDB)**
   - Extend `digests` table:
     - Add `audio_url` (nullable string)
     - Add `audio_generated_at` (timestamp)
   
   - New table: `listen_events` (optional, for metrics)
     - `id, digest_id, user_id, started_at, duration_seconds, completed`

4. **Storage**
   - **MVP:** Use Railway static file hosting or simple file storage on Railway /tmp
     - Pro: no external service, already included
     - Con: files lost on reboot (acceptable for MVP, daily digests recreated)
   
   - **Phase 2:** Upgrade to S3 or Railway volumes for persistence
     - More reliable, cheaper at scale
     - ~$0.02/GB/month storage cost

---

## 6. Technical Specification

### 6.1 OpenAI TTS Integration

**Endpoint:** POST https://api.openai.com/v1/audio/speech

**Request:**
```javascript
const audioBuffer = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        model: 'tts-1',              // Faster, lower cost
        input: summary_text,          // 4–6 bullet points
        voice: 'nova',                // Professional, natural voice
        response_format: 'mp3'
    })
}).then(r => r.arrayBuffer());
```

**Cost Estimate:**
- Input: 500 words (average digest) = $0.015
- Model: `tts-1` (cheaper, sufficient quality)
- Per digest: ~$0.015–0.02
- Per user/month (1 digest/day): ~$0.45–0.60
- At 100 users: ~$45–60/month

**Latency:** 2–5 seconds (acceptable for async generation)

### 6.2 Audio File Storage

**MVP Approach: Railway Dynamic Storage**
```javascript
// Save MP3 to /tmp or Railway volumes
const audioPath = `/storage/audio/${digest_id}.mp3`;
fs.writeFileSync(audioPath, audioBuffer);

// Serve via static middleware or presigned URL
const audio_url = `${process.env.FRONTEND_URL}/static/audio/${digest_id}.mp3`;
```

**Retention Policy:**
- Delete audio files older than 30 days (cron job)
- Rationale: users typically consume digest within 24–48 hours; 30 days = safety margin

**Phase 2: S3 Upgrade**
```javascript
import AWS from 'aws-sdk';
const s3 = new AWS.S3();

await s3.putObject({
    Bucket: process.env.AWS_BUCKET,
    Key: `audio/${digest_id}.mp3`,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
    Expires: 2592000 // 30 days
});
```

### 6.3 Database Schema Changes

**Extend `digests` table:**
```javascript
{
    id,
    user_id,
    title,
    sender,
    content,
    summary,                    // Text summary (existing)
    audio_url,                  // NEW: URL to MP3 (nullable)
    audio_generated_at,         // NEW: timestamp of audio generation
    // ... existing fields ...
}
```

**New table (optional): `listen_events`**
```javascript
{
    id,
    digest_id,
    user_id,
    started_at,               // When user hit play
    duration_seconds,         // How long they listened
    completed,                // true if they heard entire digest
    created_at
}
```

### 6.4 API Endpoints

**Generate Audio (lazy)**
```
POST /api/digests/:id/audio
Headers: Authorization: Bearer [jwt]
Response: { audio_url: "...", generated_at: "...", duration_seconds: 120 }
Status: 201 (created) or 200 (already exists)
Errors: 
  - 403 Forbidden (not Premium tier)
  - 404 Not found
  - 500 (TTS API failed, user sees fallback)
```

**Get Digest with Audio**
```
GET /api/digests/:id
Response: { id, title, summary, audio_url, audio_generated_at, ... }
```

**Log Listen Event (optional)**
```
POST /api/digests/:id/listen
Body: { duration_seconds: 120, completed: true }
Response: { recorded: true }
```

### 6.5 Frontend: Audio Player Component

**Location:** `public/pages/listen.html` (simple React component or vanilla JS)

**UI Elements:**
- Title: "Your Daily Digest"
- Date generated
- Play/pause button
- Progress bar (show current time / total duration)
- Speed controls: 0.75x, 1x, 1.25x, 1.5x (buttons)
- Volume slider (native HTML5)
- Optional: transcript toggle (shows text summary)
- "Back to dashboard" link

**HTML5 Audio Implementation:**
```jsx
<audio 
    ref={audioRef} 
    src={audioUrl} 
    onTimeUpdate={() => trackProgress()}
    onEnded={() => logCompletion()}
/>
<button onClick={() => audioRef.current.play()}>Play</button>
<button onClick={() => audioRef.current.pause()}>Pause</button>
<input type="range" 
    value={currentTime} 
    max={duration}
    onChange={(e) => audioRef.current.currentTime = e.target.value}
/>
```

### 6.6 Email Template Changes

**Add audio CTA to daily digest email:**
```html
<div style="margin-top: 20px; text-align: center;">
    <h3>📻 Listen Instead?</h3>
    <p>Prefer audio? Click below to hear your digest read aloud.</p>
    <a href="https://brevisapp.com/listen/{{digest_id}}" 
       style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
        Play Audio Digest
    </a>
</div>
```

### 6.7 Estimated Cost Per User Per Month

**Breakdown (Premium tier user, 30 days):**
- TTS API: 30 digests × $0.015 = $0.45
- Storage: ~10 MB/month = negligible
- Bandwidth: ~15 MB download = ~$0.02
- **Total marginal cost: ~$0.50/user/month**

**Gross profit per Premium user:**
- Revenue: $29/month
- Marginal cost (including TTS): $0.50
- **Profit: $28.50 (98% margin)**

---

## 7. Design & UX Specification

### Audio Player Page (`/listen/[digest-id]`)

**Visual Design (mobile-first):**
```
┌─────────────────────────────────────┐
│  Your Daily Digest                  │
│  Monday, April 8, 2026              │
├─────────────────────────────────────┤
│                                     │
│   [Album art / gradient bg]         │
│                                     │
│   [|||▮▮▮░░░░░░░░░░░░░]            │
│   01:45 / 04:20                     │
│                                     │
│      [◀◀]  [▶▶]  [▶▶▶]             │
│      Prev  Play  Next               │
│                                     │
│      0.75x  1x  1.25x  1.5x         │
│                                     │
├─────────────────────────────────────┤
│  Show transcript                    │
│  ⓧ                                  │
├─────────────────────────────────────┤
│  • Market recap: Tech stocks up 2%  │
│  • Patent ruling expected today     │
│  • New VC fund closes at $500M      │
│  [...]                              │
├─────────────────────────────────────┤
│  ← Back to Dashboard                │
└─────────────────────────────────────┘
```

**Desktop Design:**
- Left panel: audio player (sticky)
- Right panel: transcript/summary (scrollable)
- Same controls, larger layout

**Responsive Behavior:**
- Mobile: player full-width, transcript hidden by default
- Tablet: split 50/50 layout
- Desktop: player left (30%), transcript right (70%)

**Fallback UX (if audio generation fails):**
```
📻 Audio not available

Your audio digest couldn't be generated. 
Try again later, or read your summary below:

[Show text summary]
```

---

## 8. Success Metrics

### Primary Metrics (MVP)
1. **Audio Adoption Rate**
   - % of Premium users who listen to at least 1 digest/week
   - Target: 40% by end of month 1 (launch + marketing push)

2. **Listen Duration**
   - Average listen time vs. digest length
   - Target: >50% completion rate (users hear >50% of their digest)

3. **Engagement Lift**
   - Retention rate: audio users vs. non-audio users
   - Target: +15% retention lift for audio users

### Secondary Metrics
4. **Audio Quality Feedback**
   - NPS/feedback from audio feature
   - Monitor for "voice quality" complaints

5. **Cost Efficiency**
   - Actual TTS cost per digest (vs. estimate of $0.015)
   - Monitor for API cost spikes

### Data Collection
- Log `listen_events` table on first play (non-blocking)
- Track: `started_at, duration_seconds, completed`
- Query metrics weekly: `SELECT COUNT(*) FROM listen_events WHERE completed = true`

---

## 9. Implementation Timeline

### Phase 1: MVP (1.5–2 weeks)
**Goal:** Ship audio digest for Premium tier only, validate product-market fit.

- **Week 1:**
  - [ ] Backend: POST /api/digests/:id/audio endpoint
  - [ ] Backend: integrate OpenAI TTS API
  - [ ] Backend: extend digests table with audio_url field
  - [ ] Frontend: /listen/[digest-id] player page (vanilla JS + HTML5 audio)
  - [ ] Email: add "Listen" CTA button to digest email
  - [ ] Testing: manual test 5–10 digests, verify audio quality

- **Week 2:**
  - [ ] Deployment: push to Railway staging, test end-to-end
  - [ ] GA: enable for Premium tier, monitor for errors
  - [ ] Marketing: add "New: Audio Digest" to email signature + Twitter
  - [ ] Support: prepare FAQ (known issues, voice quality, etc.)

**Definition of Done:**
- Audio button in email, clickable and working
- Player page renders and plays audio without errors
- No API cost surprises (monitor first day)
- 0 downtime deployments

---

### Phase 2: Enhancement (2–4 weeks, post-launch)
**Goal:** Improve UX, expand audience, optimize costs.

- [ ] Voice selection UI (premium users pick between 3 voices: nova, onyx, alloy)
- [ ] Transcript toggle (show text summary alongside audio)
- [ ] Mobile optimization (test on iOS Safari, Android Chrome)
- [ ] Storage upgrade: move from Railway /tmp to S3 for persistence
- [ ] Metrics dashboard: show listen rates in user settings
- [ ] Cost optimization: evaluate Google Cloud TTS as fallback (cheaper at scale)
- [ ] Expand to Standard tier (lower priority, gather data first)

---

### Phase 3: Future (TBD)
**Goal:** Become audio-first, diversify use cases.

- [ ] Podcast feed (RSS): let users subscribe to daily digests as podcast
- [ ] Offline download: save audio locally for airplane mode
- [ ] Custom voice cloning (premium): upload sample, TTS uses your voice
- [ ] Audio notes: record voice memos alongside digests
- [ ] Spotify/Apple Podcasts integration
- [ ] Wake-word activation ("Hey Brevis, read my digest")

---

## 10. Risks & Mitigations

### Risk 1: TTS API Cost Spike [Medium]
**Scenario:** OpenAI TTS costs more than estimated, or usage exceeds forecast.

**Mitigation:**
- ✅ Set up spend alerts in OpenAI dashboard ($500/month cap)
- ✅ Monitor cost per user daily in logs
- ✅ Have Google Cloud TTS integration ready as fallback
- ✅ Implement rate limiting: max 3 audio generations per user per day
- ✅ Lazy generation only (don't pre-generate all digests)

---

### Risk 2: Audio Quality Issues [Medium]
**Scenario:** TTS voice sounds unnatural, robotic, or mispronounces terms.

**Mitigation:**
- ✅ Test extensively with real legal/VC terminology before launch
- ✅ Use OpenAI `tts-1` (fast) for MVP, validate quality first
- ✅ Collect user feedback: "How is audio quality?" in settings
- ✅ Plan for fallback voice models (alloy, onyx, shimmer) for Phase 2
- ✅ Add note in FAQ: "Audio generated by AI, quality varies"

---

### Risk 3: Storage Running Out [Low]
**Scenario:** Railway /tmp fills up or gets wiped, users can't play old digests.

**Mitigation:**
- ✅ Implement 30-day retention policy (delete old files)
- ✅ Plan S3 migration for Phase 2
- ✅ Log all audio_url generation in database (can regenerate if needed)
- ✅ Graceful fallback: if audio missing, show transcript

---

### Risk 4: Low User Adoption [Medium]
**Scenario:** Audio feature is built, but <20% of Premium users listen.

**Mitigation:**
- ✅ In-app onboarding: highlight "Audio" in digest email prominently
- ✅ Measure engagement from day 1 (listen_events table)
- ✅ Survey users at 1-week: "Why didn't you try audio?" (if <20% adoption)
- ✅ Iterate UX quickly: if player is confusing, simplify
- ✅ Consider tiering: audio-only tier for commuters (Phase 2)

---

### Risk 5: OpenAI API Downtime [Low]
**Scenario:** OpenAI TTS service is down, users can't generate audio.

**Mitigation:**
- ✅ Graceful fallback: show message "Audio temporarily unavailable"
- ✅ Implement retry logic (exponential backoff, 3 retries)
- ✅ Have Google Cloud TTS as fallback provider (configure in Phase 2)
- ✅ Log errors for monitoring (Sentry or simple logs)

---

### Risk 6: Regulatory / Copyright Issues [Low]
**Scenario:** TTS of copyrighted newsletter content raises copyright concerns.

**Mitigation:**
- ✅ Audio generation is derivative transformation (summarization + TTS)
- ✅ User is feeding their own newsletters (fair use)
- ✅ Note in ToS: "Audio summaries are for personal use only"
- ✅ No redistribution / republishing of audio allowed
- ✅ Monitor for DMCA complaints, respond quickly

---

## 11. Open Questions for Antonio

Before implementation, confirm these decisions:

### 1. **Tier Availability (MVP Launch)**
   **Question:** Should audio be Premium-only on launch, or available to all paid users?
   
   **Options:**
   - A) Premium only (higher margin, easier to support)
   - B) Standard + Premium (broader adoption, higher TTS cost)
   - C) All users (free tier included, maximum adoption risk)
   
   **Recommendation:** A (Premium-only, reduces TTS cost and support burden in MVP)

---

### 2. **Storage Backend**
   **Question:** For MVP, use Railway /tmp storage or invest in S3 now?
   
   **Options:**
   - A) Railway /tmp (simpler, files reset on deploy, acceptable for MVP)
   - B) S3 from day 1 (more reliable, adds ~$5/month cost, more setup)
   - C) Railway Volumes (persistent storage, no AWS setup needed)
   
   **Recommendation:** A (Railway /tmp for MVP, migrate to Volumes or S3 in Phase 2 if needed)

---

### 3. **Voice Selection**
   **Question:** Hardcode one voice (nova) for MVP, or let users choose?
   
   **Options:**
   - A) Single voice (nova) only, hardcoded (simplest, less support)
   - B) User voice preference setting (adds complexity, deferred to Phase 2)
   - C) Device/browser auto-detect voice (gimmicky, skip)
   
   **Recommendation:** A (nova only, single professional voice, revisit in Phase 2)

---

### 4. **Listen Event Tracking**
   **Question:** Track listen metrics from day 1, or skip analytics MVP?
   
   **Options:**
   - A) Log listen_events table (gives data, adds 1 extra API call/session)
   - B) No tracking MVP (ship faster, can't measure success)
   - C) Client-side tracking only (localStorage, less reliable)
   
   **Recommendation:** A (log listen events, essential for validating feature ROI)

---

### 5. **Marketing Strategy**
   **Question:** How should we announce audio to existing users?
   
   **Options:**
   - A) Email blast: "New for Premium: Listen to your digest"
   - B) In-app banner: highlight audio feature in digest email only
   - C) Blog post + Twitter only (organic discovery)
   - D) A/B test: 50% email, 50% in-app, measure conversion
   
   **Recommendation:** A + B (email blast + in-app, measure adoption, iterate messaging)

---

## 12. Glossary & Technical Terms

| Term | Definition |
|------|-----------|
| **TTS** | Text-to-speech; converts text to audio |
| **OpenAI TTS** | OpenAI's speech synthesis API (tts-1 or tts-1-hd) |
| **Digest** | Daily AI-summarized newsletter email sent to user |
| **Premium Tier** | $29/month plan with unlimited newsletters + audio |
| **Audio URL** | Persistent link to MP3 file (stored on Railway/S3) |
| **Listen Event** | Timestamped log entry: user started playing audio digest |
| **Completion Rate** | % of users who listened to >50% of their digest |

---

## 13. Appendix: Competitive Reference

### Readwise Reader (Audio Reviews)
- **Launch:** ~2024
- **How it works:** Reads highlights aloud, ~15 min/day podcast format
- **Quality:** High-quality voice (unclear if TTS or human)
- **Audience:** Power users ($14.99/month)

### Meco (Audio Roundups)
- **Launch:** ~2024
- **How it works:** Aggregates newsletters, reads summaries as podcast
- **Quality:** Natural TTS voice
- **Audience:** Free tier feature (monetization TBD)

### Apple Books/Audiobooks
- **Standard:** $14.95–$27.99 per audiobook
- **Insight:** Users will pay premium for quality narration

**Brevis Positioning:**
- Lower price (audio bundled in $29 Premium)
- Daily cadence (vs. books)
- AI-summarized (personalized, short-form)
- Commute-optimized (4–6 min audio, not 8-hour audiobook)

---

## 14. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-08 | Use OpenAI TTS API | Cost, simplicity, existing API key, quality |
| 2026-04-08 | Premium-only MVP | Reduces TTS cost, easier support, faster launch |
| 2026-04-08 | Single voice (nova) | Simplicity, professional tone, defer choice to Phase 2 |
| 2026-04-08 | Railway /tmp storage | MVP speed, acceptable for 30-day rotation |
| 2026-04-08 | Log listen_events | Essential for success metrics, minimal overhead |

---

## 15. Sign-Off

**Document prepared by:** Claude (agent)  
**For:** Antonio Bitkraft (Brevis founder)  
**Status:** Ready for technical review & implementation  
**Next step:** Confirm answers to Open Questions (Section 11), then begin Phase 1 implementation.

---

**Questions?**  
Review this doc async, then we'll clarify points one by one per your preference.  
Timeline: can start development immediately upon approval.

