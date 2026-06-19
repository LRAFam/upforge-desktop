# UpForge backlog

## Proprietary AI model — long-term north star

**Status:** Strategy documented (pre-funding)  
**Doc:** [AI-MODEL-STRATEGY.md](./AI-MODEL-STRATEGY.md)

Near-term desktop/API work should grow revenue **and** consented structured gameplay data (archive-only upload, retention tiers, training opt-in, analysis feedback). Cursor agents load `.cursor/rules/ai-model-strategy.mdc` automatically.

---

## Upload vs analysis — decouple quotas

**Status:** Shipped (v2.5.43+) — archive API + desktop UX  
**Doc:** [UPLOAD-VS-ANALYSIS.md](./UPLOAD-VS-ANALYSIS.md)

Users choose **cloud only**, **analyse only**, or **both** — separate storage and analysis quotas.

### Desktop
- [x] Clips: separate Upload and Analyse actions
- [x] VOD: archive-only upload; bulk pending uses archive path
- [x] Post-game pending: Save to cloud vs Analyse now
- [x] Dashboard pending row: separate Save and Analyse
- [x] Settings: show archive quota and analysis quota separately

### Backend
- [x] `POST /api/recordings/archive/presign|complete`
- [x] `POST /api/recordings/archive/{archiveId}/analyse`
- [x] `archive_stats` on profile + tier limits in `config/tiers.php`

---

## Internationalization (Spanish → French) — target: next month

**Status:** Planned (not started)  
**Trigger to ship:** English non-branded GSC clicks ≥30/month for 2 consecutive months, OR clear LATAM inbound demand.

### Principles

- **Fully isolated locales** — no mixed-language pages or shared blog lists.
- English stays at root (`upforge.gg/...`).
- Spanish at `upforge.gg/es/...`, French at `upforge.gg/fr/...` when added.
- Each locale has its own content, coaching prompts, sitemap slice, and analytics.

### Phase 1 — Spanish validation (week 1–2)

- [ ] Add `locale` column to `blogs` table (`en` default; API filter by locale).
- [ ] Nuxt: `@nuxtjs/i18n` with `strategy: 'prefix_except_default'`.
- [ ] Spanish landings only (no full app translation yet):
  - `/es/valorant/analyze`
  - `/es/valorant/como-subir-de-rango`
  - `/es/desktop`
  - `/es/valorant/submit`
- [ ] 5–10 native Spanish blog posts (not machine-translated).
- [ ] Coaching reports: Spanish prompt template + account language preference.
- [ ] `sitemap-es.xml` (separate from English sitemap).
- [ ] GSC: track `/es/` path performance separately.

### Phase 2 — Spanish expansion (week 3–4)

- [ ] Spanish dashboard copy (high-traffic screens only).
- [ ] 20+ Spanish blog posts if Phase 1 shows impressions → signups.
- [ ] Footer + hreflang on equivalent EN/ES pages.
- [ ] Discord `#español` or segmented channel.

### Phase 3 — French (after Spanish metrics reviewed)

- [ ] Same isolated pattern at `/fr/` — separate content queue, not shared with ES.

### Success metrics (90-day review)

- Spanish organic impressions in GSC.
- Spanish signups attributed to `/es/` paths.
- Spanish free → paid conversion vs English baseline.
- Do **not** proceed to full UI i18n until Spanish **paid** conversions exist.

### Explicitly out of scope for Phase 1

- Machine-translating existing English blogs.
- Brazilian Portuguese (separate locale later — likely bigger than ES for Valorant).
- Subdomains (`es.upforge.gg`) — use subfolders for domain authority.

---

## Desktop — local recording deduplication

**Status:** Fixed (pending release)  
**Issue:** Startup orphan scan re-imported raw OBS files when a `_upforge` compressed sibling already existed on disk / dashboard.

**Fix:** Sibling-aware known paths, prefer compressed file for import, dedupe `recordings.json` on load, update store path after compression.

---

## Daily improvement loop — progress platform (not “AI VOD reviewer”)

**Status:** Desktop v1 shipped (v2.5.61+) · API/web follow-ups below  
**Positioning:** Rank improvement + habit. AI is infrastructure, not the product.

### Shipped (desktop)

- [x] **Match recap** — `MatchRecapPanel` curates best plays, mistakes, clutches from session clips + spatial deaths + coaching output (`src/lib/match-highlights.ts`, post-game)
- [x] **Skill RPG bars** — six dimensions with EMA smoothing after each analysis (`src/lib/skill-profile.ts`, dashboard + post-game)
- [x] **Coach memory (structured)** — games analysed, issue trend copy, next focus (`CoachMemoryCard.vue`) — not conversational chat history
- [x] **API-forwarding** — desktop parses `match_highlights` from poll result when backend adds it; local curation is fallback
- [x] **Skill profile persistence** — `skillProfile` / `skillProfilePrevious` in desktop settings, updated on analysis complete

### Next — high leverage

- [x] **Backend `match_highlights`** — `MatchHighlightsService` in poll result + `GET /api/analysis/{id}`
- [x] **Stitched recap export** — `recap:export-stitched` IPC, ffmpeg concat top 5 moments
- [ ] **Weekly improvement plan** — one goal, one drill, one metric; derived from skill profile + playstyle API
- [ ] **Session reviews** — aggregate last 5–10 games (grade, trends, “fix this week”) — web dashboard first
- [ ] **Percentiles in product UI** — `GET /api/analysis/{id}/percentiles` already exists; surface on results + post-game card export
- [x] **Population benchmarks / timing comparison** — `TimingComparisonService` + `TimingComparisonPanel` (plant pace vs rank avg)

### Later

- [ ] **Pro / named player timing comparison** — extend cohort timing with pro VOD corpus
- [x] **Public improvement profiles** — `/u/[slug]`, opt-in via profile privacy settings
- [x] **Skill leaderboards** — `/leaderboard?tab=skills`, opt-in filter on API

### Repos

| Layer | Repo |
|-------|------|
| Recap UI, skill EMA, coach memory | `upforge-desktop` |
| `match_highlights` generation, percentiles, playstyle | `upforge-api` |
| Public profiles, SEO stat pages, share cards | `upforge-frontend` |

---

## Coach Hub — creator / coaching community (v1)

**Status:** Coach Hub v1 complete (web + API + desktop notifications) · Prod Stripe + pilot next  
**Doc:** [COACH-HUB-V1.md](./COACH-HUB-V1.md) · **E2E:** [COACH-HUB-E2E.md](./COACH-HUB-E2E.md)

Coaching creators connect with students via structured match review — not a Discord replacement. Builds on public profiles, VOD Review, skill profile, and planned coach review workflow in [AI-MODEL-STRATEGY.md](./AI-MODEL-STRATEGY.md).

### v1 pillars

- [x] **Roster API** — join/leave/list; coach aggregates; extends existing `coaches` table (`upforge-api`)
- [x] **Roster review API** — free `POST /analyses/{id}/request-roster-review`; timeline annotations (`upforge-api`)
- [x] **Coach profile page** — join roster on `/coaches/[id]` (`upforge-frontend`)
- [x] **Coach dashboard** — `/coach-dashboard/roster` + `/coach-dashboard/reviews` (`upforge-frontend`)
- [x] **Student ask coach** — analysis Next Steps + modal (`upforge-frontend`)
- [x] **VOD annotation UI** — coach review detail + notes in VOD Review (`upforge-frontend`)
- [x] **Coach roster settings** — opt-in toggle, welcome message, tier usage meters (`upforge-api` + `upforge-frontend`)
- [x] **Student My Coaches** — `/my-coaches` list, sharing prefs, leave roster (`upforge-frontend`)
- [x] **Roster tier limits** — Community 50 members / 30 reviews·mo; Pro unlimited (API enforced, billing TBD)
- [x] **Coach Pro Stripe billing** — checkout + webhooks + roster dashboard upgrade UI (`STRIPE_COACH_HUB_PRO_PRICE_ID`)
- [x] **Roster referral attribution** — roster join → coach affiliate; commission on student Premium/Pro subs (`CoachHubAttributionService`)
- [x] **Deep-dive upsell** — post-roster-review CTA → paid micro-coaching with same coach (`deep_dive_available` API + Next Steps UI)
- [x] **Coach affiliate auto-create** — active affiliate on roster enable for referral commissions
- [x] **Coach earnings summary** — paid deep dives + referral stats on roster dashboard

### Desktop (v1)

- [x] **Ask my coach** — post-game → create roster review request
- [x] **Coach annotations in VOD Review** — read markers on timeline when review exists
- [x] **Notification** — OS toast when coach completes review (or new review request for coaches); opens VOD Review or web dashboard
- [x] **Local API URL** — `VITE_API_URL` respected in auth-manager + CSP allows localhost

### Explicitly later

- Weekly community challenges, Discord bot, teaching-moment export, live co-watch, coach marketplace

### Repos

| Layer | Repo |
|-------|------|
| API, roster, reviews, annotations | `upforge-api` |
| Coach page, dashboard, VOD annotation UI | `upforge-frontend` |
| Ask coach, annotation display, notifications | `upforge-desktop` |

---

## SEO — statistics authority (programmatic pages)

**Status:** Phase 0 shipped (hub + ~40 URLs when data allows) · **Do not** scale to thousands before GSC validation  
**Complements:** Spanish locale backlog (isolated `/es/` pages, not translated duplicates)

### Does “thousands of stat pages” make sense?

**Yes as a strategy, no as a day-one sprint.**

Players search high-intent queries (“Diamond average headshot %”, “good ACS by rank”, “KAST benchmark”). Those pages compound in Google and match UpForge’s benchmark story (percentiles API, playstyle profile, spatial population data). Competitors in adjacent categories (trackers, stat sites) win largely on programmatic SEO.

**Risk:** Thin programmatic pages (same template, no unique data, duplicate titles) hurt more than they help. Google expects **useful, distinct** answers per URL.

### Phased approach (recommended)

**Phase 0 — Validate (2–4 weeks)**

- [x] Pick **10–15** queries with clear intent (headshot %, ACS, K/D, win rate × tiers)
- [x] Ship **one** Nuxt template: `/valorant/stats` hub + `/valorant/stats/[slug]` (metric, tier, rank)
- [x] Data source: aggregated `valorant_stats_snapshots` by rank (`GET /api/public/valorant/rank-benchmarks`)
- [x] Every page: metric definition, rank table, “how to improve”, CTA → `/valorant/analyze` or `/desktop`
- [ ] Measure: impressions, CTR, signup attribution — **before** scaling

**Phase 1 — Core grid (~30–80 URLs, not thousands)**

Metrics × ranks (only where data is defensible):

| Metric | Example slug |
|--------|----------------|
| Headshot % | `/valorant/stats/headshot-percentage` + `/by-rank/diamond` |
| ACS / combat score | `/valorant/stats/average-combat-score` |
| K/D | `/valorant/stats/kd-ratio` |
| KAST | `/valorant/stats/kast` |
| First deaths / first bloods | `/valorant/stats/first-deaths` |
| Category scores (from AI) | `/valorant/stats/trading-score` |

Optional: agent × map slices **only** if sample size ≥ N per cell.

**Phase 2 — Scale (~200–500 URLs)**

- Add agent, map, role modifiers where sample size allows
- [x] Spanish equivalents under `/es/valorant/estadisticas/...` (native copy, separate sitemap — see i18n backlog)
- Internal links: hub page → metric → rank → related metrics

**Phase 3 — “Thousands”**

Only after Phase 1–2 pages rank and convert. Expand to long-tail: “Jett Ascent average ACS”, patch-era comparisons, etc. Recompute aggregates on a schedule; show `last updated` date for trust.

### API / frontend work

- [x] `GET /api/public/valorant/rank-benchmarks` — tier/rank breakdowns, sample size, updated_at (no auth)
- [x] Nuxt dynamic route + `useSeoMeta` + JSON-LD FAQ + breadcrumbs
- [x] Add URLs to `server/routes/sitemap.xml.ts` (and `sitemap-es.xml` when ES ships)
- [ ] “Compare yours” widget — logged-in users see their stat vs page benchmark (bridges SEO → product)

### Success metrics (90-day)

- Organic impressions on `/valorant/stats/*` in GSC
- Click-through to analyze / desktop install
- **Not** raw page count

### Explicitly avoid

- Machine-generating thousands of pages before corpus size supports them
- Copying tracker sites without unique UpForge angle (AI coaching category scores, improvement CTA)
- Mixed-language URLs or hreflang mistakes (see i18n section)

---

## AI model prep — Phase 1 checkbox sync

Per [UPLOAD-VS-ANALYSIS.md](./UPLOAD-VS-ANALYSIS.md) and desktop v2.5.43+:

- [x] Decoupled upload vs analyse (desktop + archive API)
- [x] Analysis feedback UI (post-game thumbs up/down → API)
- [ ] Cloud archive retention tiers enforced end-to-end
- [ ] Training opt-in toggle + `training_consent_at` on API user
- [ ] Richer upload metadata on every cloud object

Full model roadmap: [AI-MODEL-STRATEGY.md](./AI-MODEL-STRATEGY.md).
