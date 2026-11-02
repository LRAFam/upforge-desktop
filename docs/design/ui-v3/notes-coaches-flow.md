# Coaches flow — Option A built (2 Nov 2026)

Proposal: `coaches-flow-proposal.md` (Option A chosen). Squad untouched.

## What changed
- **Nav**: Coaches (`/rosters`, everyone) + Students (`/students`, only with a coach profile). No Coach/Student toggle. Two badges: Coaches = coach notes ready you haven't opened; Students = matches waiting for your notes (pending + in progress). Helpers: `coachBadgeCounts`, `showStudentsNav` (roster-flow.ts); state in `roster-flow/useCoachBadges.ts` (coach profile cached as `sidebar:coach-profile`; only a definite API answer changes it).
- **Coaches** (`views/v3/RostersV3.vue`): H1 = real state (notes ready › waiting › send your last match › Your coaches; no coach → "Get notes from a real coach" + one-line promise). Coach rows by name + plan + one allowance line ("1 match with astar now · 2 left this month"). Notes ready, Waiting for notes, Send a match (last 5; buttons "Send to {name}" / "Send to a coach"; when nobody can take one → one sentence, no disabled buttons). Sessions only if any (`MyBookingsV3 only-if-any`). Tabs: Your coaches · Find a coach (Bookings tab gone; `?view=bookings` lands on Your coaches). No stat row. Opening notes marks them seen (badge drops).
- **Find a coach**: each coach shows *Join {name}* (from `GET /api/coaches/{id}/hub`, `joinOffer`) and *Book a session*; Join hands the coach to the invite row (looks up, asks first; paid → web checkout). "Coach players yourself? Apply on upforge.gg" for non-coaches. Already-your-coach shows a line instead of Join.
- **Students** (`views/v3/StudentsV3.vue` + `CoachRosterV3`): H1 "Queue is clear" / "N matches need your notes", summary line, Needs your notes, Your students, Copy invite link, `.uf-switch` "Taking new students", "Plan and price" (collapsed). Screen d (no live plan and no students): 3-step setup. Non-coach visiting `/students` → `/rosters`. Classic UI: `/students` → `/rosters`.
- **Routes**: `/students` added; `/rosters?mode=coach|view=students` → `/students` (v3).
- **Copy**: match page "Send to {name}" / "Send to a coach", "waiting for {name}", blocked reasons by name; post-game "Send to a coach →" for 2+; Home "{name} replied" / "{name} left notes on your Lotus 8–13 match."; invite prompt "Paste invite link"; send sheet kicker "Send this match"; JoinCoachV3 "Join {name}", "Free plan", "$9.99 a month plan", "students". Toasts in v3: "Taking new students", "Plan and price saved", "You joined {name}".

## Verified
type-check clean · eslint clean on changed files · new tests in coach-format, roster-flow (badge split, nav rule, send label), marketplace (`joinOffer`) · full `npx vitest run` 365 files passed.
Shots (read-only): `scratchpad/shots/agents/coaches-v3b-1.png`, `coaches-find-1.png`, `students-v3-1.png`. Screen d / empty Coaches not reachable on this account (covered by helpers).

## For the lead (outside my files)
- `src/lib/game-modules.ts`: add `/students` to VALORANT_NAV and DEMO_GAME_NAV (or `V3_ALL_GAME_ROUTES`); otherwise switching game while on /students bounces to Home (App.vue watch). Nav item itself shows regardless.
- `src/App.vue` `isFullHeightView`: add `/students` (page scrolls fine without it, but matches /rosters).
- Onboarding tick "Remind me to join their roster" → "Remind me to join them".
- Old classic `AppSidebar` keeps its combined badge (untouched).

## API needs (not built)
1. API error strings still say "roster"/"community" (e.g. "Complete Stripe payout setup before enabling a paid community roster", `can_request_reason`s). v3 maps the known codes to plain words; free-text errors pass through.
2. `/api/coaches` list items lack `roster_is_live` + price, so Join shows only once a coach is opened.
3. Hub coach rows have no plan price ("Paid plan" instead of "$9.99 a month plan").
4. No "notes seen" on the server: seen state is per-PC (localStorage), so the Coaches badge can differ between devices.
