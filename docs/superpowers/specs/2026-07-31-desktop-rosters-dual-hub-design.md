# Desktop Rosters dual hub

**Status:** Approved  
**Date:** 2026-07-31

## Goal

One desktop **Rosters** tab for students and coaches. Role-aware: student hub when joined (or discovery when empty); coach hub when the account is an approved coach.

## Role model

| Account | Default mode | Switcher |
|---------|--------------|----------|
| Student only | Student | No |
| Coach only | Coach | No |
| Both | Last used (`localStorage`) | Coach / Student toggle |

Detect coach via `GET /api/coach/roster` succeeding. Detect student membership via `GET /api/coach/student-hub` (`coaches.length > 0`).

## Coach mode (full hub)

Native in-app:

1. **Status** — Closed / Draft / Live, with one-line reason when Draft (Stripe / Pro).
2. **Enable toggle** — `PATCH /api/coach/roster/settings` `roster_enabled`.
3. **Pricing** — free vs paid, price ($), included reviews/month, welcome message; save via same PATCH.
4. **Invite** — copy `https://upforge.gg/coaches/{id}`.
5. **Members** — list from roster payload (name, Riot, open reviews, last active).
6. **Review queue** — pending/in_progress from `GET /api/coach/review-requests` (or feed). Open match in desktop when analysis id exists; **complete / annotate** via authenticated web shell → `/coach-dashboard/reviews/feed?review={id}` (API requires ≥1 timeline annotation).

Web handoff (not rebuilt in Electron v1):

- Stripe Connect onboarding
- Coach Pro checkout / billing portal
- Full annotate studio parity

## Student mode

Rebuild lost student Rosters tab:

1. Empty → open web discovery `/coaches` once per session (or CTA).
2. Joined → coaches, pending/completed reviews, actionable matches, send sheet.
3. Honest limit copy: open-review block vs monthly limit (`can_request_code` / `review_limits`).

## Out of scope (v1)

- Availability / earnings pages in desktop
- Native Stripe Connect / Coach Pro checkout UI
- Full desktop annotate studio
- Version bump / release unless asked

## Copy / UX rules

- No em dashes.
- Prefer “Waiting on coach” over “Limit reached” when `student_active_limit`.
- Enabled ≠ Live; say Draft when not live.
- Match existing desktop chrome (`#111111`, dash-panel patterns).
