# Bookable coaching (coach marketplace): audit and v3 build

Audit 2026-10-30, read-only across web (`upforge/upforge-frontend`, user's checkout), API (`upforge-wt/api-fixes`) and desktop (`origin/main` and the rework).

## Three separate things: don't merge them
| | **Bookable coaching (marketplace)** | **Coach rosters (Coach Hub)** | **Squad** |
|---|---|---|---|
| What it is | Player browses approved coaches and **books a live 1:1 session** at a time slot. There's also a one-off **paid VOD review** of a single analysed match. | Student joins a coach's free or paid roster and sends matches for review inside the membership. | Paid group plan for 4 or 6 players with shared credits. |
| Who pays whom | Player → coach, per session at the hourly rate, via Stripe PaymentIntent and Connect payout. Paid reviews are per review (`micro_coaching_rate_cents`) or a review bundle. Free sessions exist via coupon or coaching credit (`book-free`). | Student → coach, monthly, if paid. | Squad owner → UpForge. |
| API | `GET /api/coaches` (filters: game, roles, specialties, min_rating, max_rate, sort), `GET /api/coaches/{id}`, `GET /api/coaches/{id}/availability`, `GET /api/coaches/{id}/review-pricing`, `POST /api/coaches/{id}/payment-intent` / `book` / `book-free` / `validate-coupon`, `GET /api/coaching-sessions` (`as_student` / `as_coach`), `POST /api/coaching-sessions/{id}/cancel` / `reschedule` / `review` / `notes` / `action-items`, live room `.../live/create`; paid reviews `POST /api/analyses/{id}/request-review` (+ `request-review-with-bundle`, `coaching-reviews/{id}/confirm-payment`), `GET /api/coaching-reviews/my-reviews` | `/api/coach/roster*`, `/api/coach/my-coaches`, `/api/analyses/{id}/request-roster-review`, `/api/coaches/{id}/hub` | `/api/teams/*` |
| Web | `/coaches` (CoachesV2Marketplace), `/coaches/{id}` (+ `?book=1` opens CoachesV2BookingModal: date/time → duration → Stripe payment → confirmation), `/coaching` (dashboard + sessions), `/coaching/session/{id}` (live room, notes, action items, rating), paid review via `CoachReviewRequest` on Valorant results pages, `/become-coach`, `/coach-dashboard/availability` | `/my-coaches`, `/coach-dashboard/roster` | `/team` |
| Session statuses | `pending`, `confirmed`, `completed`, `cancelled`, `no_show` (`CoachingSession`) | review `pending` / `in_progress` / `completed` | — |

## Desktop today
- **Shipped (`origin/main`):** no marketplace at all. No call to `/api/coaches` (list or profile), `/api/coaching-sessions` or `request-review`. The Rosters page only covers rosters.
- **Rework before this change:** the same. The Coaches page has rosters only: your coaches, send a match, notes back, invite join, coach mode.

## Journey: player (before → after this change)
| Step | Before (desktop) | After (v3) |
|---|---|---|
| Browse coaches for my game | Missing (web only) | **Coaches › Find a coach**: real list from `GET /api/coaches?game=`, sort by rating, price or sessions, honest empty state per game |
| See a coach's profile | Missing | Inline profile: rank, games, roles, languages, bio and philosophy, rate, rating with whole-number review count, next open slot, latest reviews, paid VOD review price and turnaround when offered |
| Book a live session and pay | Missing | **Book a session** opens the existing web booking modal (`/coaches/{id}?book=1`) in the signed-in web shell, falling back to the browser. Payment stays on the web (Stripe); the app never takes payment |
| See my bookings | Missing | **Coaches › Bookings**: upcoming and past sessions (local date and time, length, coach, status), coach notes and action items when delivered, "Open session" (web live room) |
| Paid VOD reviews I bought | Missing | Same Bookings view: status and turnaround; completed ones open the match page in coach-notes mode (Valorant), otherwise the web result |
| Cancel, reschedule, rate | Web | Still web, via "Open session" |

## Journey: coach
Becoming a coach, availability, earnings and the session room all stay on the web (`/become-coach`, `/coach-dashboard/*`). The desktop's coach mode is about rosters. A coach's `as_coach` sessions are not shown in the desktop yet (see "Left").

## Build
- **IPC (read-only), marked "Coach marketplace (UI v3)":** `market:list-coaches`, `market:get-coach`, `market:review-pricing`, `market:my-sessions`, `market:my-reviews` → `auth-manager.ts`, `ipc/marketplace-ipc.ts`, preload, `env.d.ts`.
- **UI:**
  - `src/components/v3/booking/marketplace.ts` (pure shaping, tests), `FindCoachV3.vue`, `MyBookingsV3.vue`.
  - RostersV3 student mode gets a 3-tab switch: **Your coaches · Find a coach · Bookings**. Roster code is untouched apart from the tab switch.
- **Truth:** only fields the API returns. No invented ratings or availability; "No reviews yet" when there are none.

## Left
- **Book in-app:** the date and time picker, Stripe payment and coupons stay on the web by design (payments). A native slot picker over `GET /coaches/{id}/availability` would be next if wanted; payment would still hand off.
- **Paid VOD review request from the desktop match page:** request-review needs payment confirmation, so it's web for now. Bundles (`request-review-with-bundle`) could be in-app later, since no new payment is needed.
- **Coach side:** upcoming sessions (`as_coach`) in the desktop coach mode.
- **Web:** nothing needs changing for this.

## Built (2026-10-30)
- **IPC (read-only):** `electron/main/ipc/marketplace-ipc.ts` adds `market:list-coaches`, `market:get-coach`, `market:review-pricing`, `market:my-sessions` and `market:my-reviews`. The fetchers are in `auth-manager.ts` under "Coach marketplace (UI v3)", with marked blocks in `index.ts`, preload and `env.d.ts`. IDs are validated and the game is allow-listed.
- **Shaping:** `src/components/v3/booking/marketplace.ts`, with 13 tests.
  - A rating only shows when reviews exist, and counts are whole numbers ("1 review").
  - Sessions are split into upcoming and past by time and status.
  - Roster reviews are left out of paid reviews.
- **Views:**
  - `FindCoachV3.vue`: list sorted by rating, price or sessions, a role filter, and an inline profile with rate, rating, session count, next open slot, bio and focus, the paid VOD review offer, and recent reviews.
  - **Book a session** opens `/coaches/{id}?book=1` in the signed-in web shell.
  - `MyBookingsV3.vue`:
    - **Upcoming sessions:** "Open session" opens the web room.
    - **Paid VOD reviews:** completed ones have "Read notes", which opens the match page in coach-notes mode.
    - **Past sessions:** with coach notes and action items.
    - Empty, error and loading states.
  - **RostersV3** student mode has tabs **Your coaches · Find a coach · Bookings** (`?view=find|bookings` deep-links). "Find another" and the empty state now open Find a coach in-app; the web browse link stays.
- **Not seen with live data yet:** the running dev app was started before these main-process handlers existed. Restart the dev app to load the `market:*` handlers; until then Find a coach shows its "Couldn't load coaches" state.
