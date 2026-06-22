# Coach Hub — E2E testing guide

**Scope:** Full v1 loop — API, web UI, desktop notifications.

---

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| Sprint 1 | API roster + roster reviews + annotations | Shipped |
| Sprint 1 | Desktop: Ask my coach + VOD Review notes | Shipped |
| Sprint 2 | Web: join roster, coach dashboard, ask coach, annotation UI | Shipped |
| Sprint 3 | Coach Pro billing, referral attribution, deep-dive upsell | Shipped |
| Sprint 4 | Desktop OS notifications on review complete / new request | Shipped |

---

## 1. Automated API tests (recommended first)

```bash
cd upforge-api
php artisan migrate --no-interaction   # if Coach Hub migrations pending
php artisan test --filter=CoachHubRosterTest
php artisan test --filter=CoachHubBillingTest
```

Covers: hub page → join roster → request review → annotate → complete → student fetch → affiliate attribution → earnings.

---

## 2. Manual API E2E (local dev)

### Prerequisites

```bash
cd upforge-api
php artisan migrate:fresh --seeder=LocalTestSeeder   # LOCAL ONLY — wipes DB
php artisan serve
```

```bash
cd upforge-frontend
# .env: NUXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev
```

```bash
cd upforge-desktop
# .env: VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

Test accounts from `LocalTestSeeder`:
- **Coach:** `coach@test.com` / `password`
- **Coach 2:** `coach2@test.com` / `password`
- **Student:** `student@test.com` / `password`

### Full loop checklist

1. **Coach** — `/coach-dashboard/roster` → enable roster → upgrade Coach Pro (local dev skips Stripe)
2. **Student** — `/coaches/{id}` → join roster
3. **Student** — complete an analysis → Next Steps → **Ask my coach**
4. **Coach** — `/coach-dashboard/reviews/feed` → add quick notes → **Complete & next** (or classic `/reviews/:id`)
5. **Student (web)** — refresh analysis Next Steps → see coach notes + deep-dive CTA
6. **Student (desktop)** — within ~2 min, OS notification “Coach notes are ready” → click opens VOD Review
7. **Coach** — roster settings shows **Earnings** (affiliate link + paid review totals)

### Production pilot checklist (notifications)

- [ ] Coach web notification **review_requested** opens `/coach-dashboard/reviews/feed?review={id}`
- [ ] Student web notification **review_completed** opens VOD review (`/valorant/results/{id}/review` or game path)
- [ ] Desktop post-game **Ask my coach** shows errors + **Find a coach** when roster empty
- [ ] Student receives **CoachReviewCompleted** email (preference: `review_notifications`)
- [ ] Discord coach DM links to review feed (not generic dashboard)

---

## 3. Desktop notification testing

Desktop polls `GET /api/notifications` every 2 minutes while logged in.

To test faster:
1. Log into desktop as student with `VITE_API_URL` pointing at local API
2. Complete a roster review for that student via web (coach account)
3. Wait for poll (or restart desktop to trigger immediate poll on login)
4. Click notification → should open VOD Review for that analysis

Coaches receive **New roster review request** notifications; click opens `/coach-dashboard/reviews/feed` in the browser.

---

## 4. Production smoke test

Point curl at `https://api.upforge.gg` only **after** migrations are deployed there.

Requires `STRIPE_COACH_HUB_PRO_PRICE_ID` in production `.env` for real Coach Pro checkout.

```bash
API=https://api.upforge.gg
# ... same token flow as local ...
```

---

## Known gaps / later

- Email on review complete (in-app + desktop only today)
- Weekly challenges, Discord bot, live co-watch
