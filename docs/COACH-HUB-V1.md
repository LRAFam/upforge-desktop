# Coach Hub — v1 spec

**Status:** Coach Hub v1 complete · Prod Stripe + creator pilot next  
**Positioning:** Coaching creators connect with their community through structured gameplay improvement — not another Discord clone.

> **Note:** Builds on the existing `coaches` marketplace, `coaching_reviews`, and `CreatorPageController` — Coach Hub adds **roster membership** and **free async timeline reviews** for community students, distinct from paid micro-coaching.

**North star:** *Your coach sees your games the way you do — round by round — and your whole community improves together.*

Aligns with [AI-MODEL-STRATEGY.md](./AI-MODEL-STRATEGY.md) Phase 2 (coach review workflow) and progress-platform positioning in [BACKLOG.md](./BACKLOG.md).

---

## Problem

Coaching creators today:
- Review VODs in Discord DMs or Google Drive links with no match context
- Can't see patterns across their roster (everyone "over-peeks" on B site)
- Have no native way to monetize structured review inside their community loop
- Lose students when improvement happens off-platform

UpForge already has match-linked timelines, AI coaching, skill profiles, clip sharing, and public profiles. v1 wires a **coach ↔ student relationship** on top.

---

## v1 scope (three pillars)

| Pillar | User value | Build surface |
|--------|----------|---------------|
| **Coach profile** | Discoverable page, referral, roster join | `upforge-frontend` |
| **Roster** | Coach sees aggregate trends; student controls visibility | API + frontend + desktop roster card |
| **Review request** | Student asks for help on a match/round; coach annotates | API + VOD Review + notifications |

**Explicitly out of v1:** live co-watch, Discord bot, weekly challenges, voice notes, marketplace.

---

## Revenue model

| Stream | Who pays | Who earns | Notes |
|--------|----------|-----------|-------|
| **Coach Pro** ($29/mo) | Coach → UpForge | UpForge (SaaS) | Unlimited roster size + reviews. Coaches do **not** receive a cut of this fee. |
| **Referral commission** | Student → UpForge (Premium/Pro) | Coach (affiliate) | On roster join, student is attributed to coach's affiliate account (~25% recurring). |
| **Paid deep dive** | Student → Coach | Coach (micro-coaching) | After free roster review completes, student can book paid VOD review with same coach via existing `/request-review` flow. |

Coach Pro and student subscriptions are **separate products**. Roster membership is free; monetization for coaches is referral commission + paid micro-coaching upsells.

---

## User flows

### Coach onboarding

1. Coach enables **Coach mode** on profile settings (web).
2. Sets: display name, focus areas (max 3 tags), bio, optional Discord/social link.
3. Gets: public URL `/coach/[slug]` (or `/u/[slug]` with coach tab), referral code, roster invite link.

### Student joins roster

1. Student opens coach link → **Join roster**.
2. Consent screen — student chooses what coach can see:
   - **Always:** display name, rank, games analysed count, aggregate skill profile (6 bars)
   - **Opt-in per match:** full analysis summary, VOD access for review
   - **Never shared by default:** raw VOD file path, other matches not submitted for review
3. Coach sees student on roster dashboard.

### Review request (core loop)

1. Student opens analysed match (desktop post-game or web) → **Ask my coach**.
2. Optional: pick round(s), free-text question ("Why did I lose this duel?").
3. Coach gets inbox item (web first; desktop notification later).
4. Coach opens VOD Review pre-loaded to match + student question.
5. Coach adds **round annotations** (text, max 500 chars per marker; timestamp + round number).
6. Student notified → opens match → sees coach notes on timeline.

---

## Data model (API)

### `coach_profiles`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | FK users | One coach profile per user |
| `slug` | string unique | URL segment |
| `bio` | text nullable | |
| `focus_areas` | json string[] | max 3, e.g. `["trading", "mid-round"]` |
| `referral_code` | string unique | Attribution |
| `is_public` | bool | Default true |
| `created_at` | timestamp | |

### `coach_roster_members`

Links students to existing `coaches` records (marketplace table — not a separate profile).

| Column | Type | Notes |
|--------|------|-------|
| `coach_id` | FK coaches | |
| `student_user_id` | FK users | |
| `status` | enum | `pending`, `active`, `removed` |
| `share_skill_profile` | bool | Default true |
| `share_analyses_summary` | bool | Default false until student opts in |
| `joined_at` | timestamp | |
| `referred_by_code` | string nullable | |

Unique: `(coach_id, student_user_id)`.

### `coach_review_requests` → reuse `coaching_reviews`

Roster reviews use `coaching_reviews` with `source = 'roster'`, `price_cents = 0`, plus:

| Column | Type | Notes |
|--------|------|-------|
| `student_question` | text nullable | Max 1000 chars |
| `round_numbers` | json int[] nullable | |

### `coaching_review_annotations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint | |
| `review_request_id` | FK | |
| `round_number` | int nullable | |
| `video_offset_ms` | int nullable | Synced to timeline |
| `body` | text | Max 500 chars |
| `created_at` | timestamp | |

---

## API endpoints (v1)

### Shipped (Sprint 1 — `upforge-api`)

```
GET    /api/coaches/{id}/hub                    # public coach hub page data
GET    /api/coach/roster                        # coach: list students + aggregates
GET    /api/coach/my-coaches                    # student: coaches on their roster
POST   /api/coach/roster/join                   # student: join roster
PATCH  /api/coach/roster/{coachId}              # student: update sharing prefs
DELETE /api/coach/roster/{coachId}              # student leave / coach remove student
POST   /api/analyses/{id}/request-roster-review # student: free roster review request
GET    /api/analyses/{id}/coach-review          # student: review for analysis (+ annotations)
POST   /api/coach/reviews/{id}/annotations      # coach: add timeline marker
GET    /api/coach/reviews/{id}/annotations      # coach or student: list markers
POST   /api/coach/reviews/{id}/complete-roster  # coach: complete roster review
```

Existing paid micro-coaching routes unchanged (`/api/analyses/{id}/request-review`, etc.).

### Planned (Sprint 2 — web)

```
GET    /api/coach/profile/{slug}              # public coach page (may reuse /coaches/{id}/hub)
POST   /api/coach/profile                     # enable / update coach profile (auth)
```

### Roster aggregate payload (coach view)

Per student, never expose other students' VODs unless submitted:

```json
{
  "student": { "id": 1, "name": "...", "rank": "Diamond 2" },
  "games_analysed": 42,
  "skill_profile": { "aim": 72, "trading": 58, "...": 0 },
  "top_coaching_tags_30d": ["over_peeking", "late_rotate"],
  "open_review_count": 1,
  "last_active_at": "2026-06-15T..."
}
```

---

## Frontend (upforge-frontend)

### `/coach/[slug]` (public)

- Hero: name, rank badge if linked, focus areas, bio
- CTA: **Join roster** (logged in) / **Sign up & join** (logged out, preserves referral)
- Featured clips (optional v1.1): pull from coach's public shares
- Does not list roster members publicly

### Coach dashboard `/dashboard/coach`

- Roster table: name, rank, skill sparkline, open reviews, last active
- Review inbox: open / in progress / completed tabs
- Settings: profile, referral link copy, focus areas

### Student: match detail

- **Ask my coach** button if on ≥1 active roster and match is analysed
- Coach picker if multiple coaches
- Status chip when review pending / completed

### VOD Review (web; desktop parity later)

- Coach mode: annotation toolbar on timeline scrubber
- Student mode: read-only coach markers with expand for note text
- Reuse existing round/event timeline from analysis `match_data`

---

## Desktop (upforge-desktop)

### v1 (minimal)

- [x] Post-game / history: **Ask my coach** → IPC → API create roster review
- [x] VOD Review: render coach annotations when review exists
- [ ] Notification when coach completes review

### v1.1

- [ ] Coach inbox in desktop (if user is coach)
- [ ] Add annotations from desktop VOD Review

### IPC sketch

```
coach:getRoster()           → { coaches: [...] }
coach:createReview({ analysisId, roundNumbers?, question? })
coach:getReviewAnnotations({ analysisId })
```

---

## Privacy & consent

1. **Roster join is explicit** — no auto-enrollment from referral alone; student must confirm sharing tiers.
2. **VOD access** — coach can only open VOD Review for analyses the student submitted via review request (or future explicit share). Roster membership alone does not grant VOD access.
3. **Aggregate vs individual** — skill profile aggregates OK at roster level; match-level data requires opt-in or review request.
4. **Leave anytime** — student can leave roster; coach loses access to future data immediately.
5. **Training consent** — coach annotations are human signal; store separately from `training_consent_at`. Coach notes on student VODs are **not** trainable unless both parties opt in (future toggle).

---

## Monetization (Sprint 3 — hooks shipped, billing later)

Roster reviews stay **free for students** (community loop). Revenue comes from the **coach side** and **upsells**, not paywalling join.

### Coach control (shipped)

- **`roster_enabled`** — opt-in per coach; default **off**. Separate from `accepting_students` (paid 1-on-1).
- **Coach dashboard** — toggle roster, welcome message, usage meters (`/coach-dashboard/roster`).
- **Student** — `/my-coaches` to view rosters, sharing prefs, leave.

### Tier limits (shipped)

| Tier | Roster members | Roster reviews / month | Price |
|------|----------------|------------------------|-------|
| **Community** (default) | 50 | 30 | Free |
| **Coach Pro** | Unlimited | Unlimited | $29/mo |

When limits hit: student sees “book paid review”; coach sees upgrade CTA.

### Stripe billing (shipped)

**Env (API):**
- `STRIPE_COACH_HUB_PRO_PRICE_ID` — Stripe Price for Coach Pro subscription
- `COACH_HUB_BILLING_ENABLED=false` — disable checkout locally (manual `coach_hub_tier=pro` for dev)

**Endpoints:**
- `POST /api/coach/roster/checkout` — Stripe Checkout → success URL `/coach-dashboard/roster?coach_hub=success`
- `POST /api/coach/roster/billing-portal` — manage/cancel subscription

Webhooks reuse existing `PaymentController` handler; metadata `product=coach_hub_pro` routes to `CoachHubBillingService`.

1. **Coach Pro subscription** — unlimited roster + reviews + aggregate analytics (primary MRR for creators).
2. **Paid micro-coaching upsell** — roster review complete → “Want a deep dive?” → existing `$5.99+` paid review flow.
3. **Referral attribution** — `referred_by_code` on roster join → student subscription commission (existing affiliate stack).
4. **Platform fee on paid sessions** — unchanged; roster drives funnel to 1-on-1 booking.

Keep **upload ≠ analyse** — roster review does not burn student analysis quota.

### Not required to ship billing yet

- Stripe SKU for Coach Pro
- Referral payout automation on roster joins
- Student-paid “priority roster review” SKU (optional future)

---

## Success metrics (90-day pilot)

| Metric | Target |
|--------|--------|
| Coaches with public profile + ≥1 student | 10 |
| Review requests completed | 50 |
| Student retention (roster vs non-roster) | Measure; no hard target v1 |
| Coach NPS (5 coaches interviewed) | Qualitative |

Do not scale Discord bot / challenges until async review loop shows repeat usage.

---

## Implementation order

### Sprint 1 — API foundation
- Migrations + models
- Coach profile CRUD + public GET
- Roster join / leave / list

### Sprint 2 — Web coach experience
- `/coach/[slug]` page
- Coach dashboard roster view
- Referral param on signup

### Sprint 3 — Review loop
- Review request CRUD
- Annotations API
- Web VOD Review annotation UI
- Email / push notification on complete

### Sprint 4 — Desktop hooks
- Ask my coach from post-game
- Display annotations in VOD Review
- Desktop notification

---

## Repo ownership

| Work | Repo |
|------|------|
| Migrations, API, notifications | `upforge-api` |
| Coach pages, dashboard, VOD annotations UI | `upforge-frontend` |
| Ask coach, annotation display, notifications | `upforge-desktop` |

---

## Related docs

- [AI-MODEL-STRATEGY.md](./AI-MODEL-STRATEGY.md) — coach review = gold labels
- [BACKLOG.md](./BACKLOG.md) — Coach Hub checklist
- [UPLOAD-VS-ANALYSIS.md](./UPLOAD-VS-ANALYSIS.md) — quota separation
