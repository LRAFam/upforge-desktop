# Roster flow (coach ↔ student) — UI v3

Goal: make rosters a connected journey in the desktop app, not just the Coaches page. (Coaches = coach rosters at /rosters. Squad is a different, paid team plan — see ui-v3.md "Squad vs Coaches".)
Sources compared: concept board 24 (Coaches (/rosters): send with context, recent notes, limits), web coach hub
(`/coaches/{id}#join-roster` invite, `/my-coaches`, `/coach-dashboard/*`), API routes (`/api/coach/*`,
`/api/coaches/{id}/hub`, `/api/analyses/{id}/request-roster-review`), desktop v3. Existing API endpoints only — no API change.

## Journeys: before → after

### Student
| Step | Before | After |
|---|---|---|
| Hear about rosters at setup | Missing | Onboarding last step: "I have a coach. Remind me to join their roster." → Home prompt "Working with a coach?" until they join |
| Find / join a coach | Web only. Empty Coaches page **opened the browser by itself** | Paste the invite link (`upforge.gg/coaches/123#join-roster`) in Coaches (/rosters) → coach card (rank, free/paid, reviews/month, welcome) → **Join roster** (free, confirm dialog) or **Continue on upforge.gg** (paid checkout). Browser no longer opens unasked in v3 |
| Send a match | Coaches page only | Also on the **match page** ("Send to coach", sheet = existing RosterSendSheet v3) and **post-game** ("Send to {coach} →" hands off to the match page with the sheet open). Shows "Sent to X · in review" instead of a second send; explains monthly/active limits |
| Know notes are back | Old sidebar badge only (pending count); nothing on Home; no notification | **Coaches badge** in the v3 sidebar (unopened replies + open coach requests); **Home: "Your coach replied"** (newest unopened, last 14 days, Open notes / Dismiss); **desktop notification** per new reply (not during recording, no burst on first run) |
| Read notes | Coaches "open notes" used `?id=<analysis id>` → match page looked for a *recording* with that id → "Recording timeline not found" (**bug, both UIs**) | Fixed: opens by `timelineId` via `openAnalysisVodReview` with coach notes on; Home and notification use the same path. Match page already shows the coach banner + timeline notes |
| Act on notes | Present (timeline notes on the match page) | Unchanged |

### Coach
| Step | Before | After |
|---|---|---|
| Set up roster | Desktop: enable/close, pricing, copy invite; publish/payouts/Pro on web | Unchanged (web for Stripe/payouts) |
| Accept student | No accept step exists: free joins are active immediately (API) | Unchanged (by design server-side) |
| Review queue | Present in CoachRosterV3; no badge in v3 sidebar | **Coaches badge** counts pending + in-progress requests |
| Open the student's match | Present (starts review, opens match page by `timelineId`) | Unchanged |
| Write notes / complete | Web review feed ("Annotate") | Unchanged — desktop has no annotate/submit IPC; next step below |

## Files
- New: `src/components/v3/roster-flow/` — `roster-flow.ts` (+test, 12), `useStudentHub.ts` (one cached, throttled hub), `useCoachReplyWatch.ts` (badge + notifications, mounted by SidebarV3), `JoinCoachV3.vue`, `CoachRepliesV3.vue`, `CoachInvitePromptV3.vue`, `SendToCoachV3.vue`.
- IPC (marked "Roster flow"): `coach:get-public-hub` (GET `/api/coaches/{id}/hub`), `coach:join-roster` (POST `/api/coach/roster/join`, free only) — `auth-manager.ts`, `ipc/auth-ipc.ts`, `preload/index.ts`, `env.d.ts`.
- Small blocks: `SidebarV3.vue` (badge, neutral colour), `HomeV3.vue` (two components), `MatchPageV3.vue` (send row), `PostGameV3.vue` + `PostGameView.vue` (send link), `RostersV3.vue` (join field, `?join=1`), `RostersView.vue` (no auto browser in v3; `@joined` refresh; open-notes fix), `OnboardingView.vue` + `onboarding-v3.css` (reminder tick box; step logic unchanged).

## Checks
type-check clean (one unrelated error appeared mid-run in `rank-strip.test.ts`, agent-rank's in-progress file) · eslint clean on all touched files · `npm test` 1694 passed, 9 skipped.
Screenshot (real account, read-only): Coaches (/rosters) shows your coach, the badge and "Join with invite link". Nothing was sent, joined or accepted.

## Left
- Coach note writing on desktop (annotate at the video time, submit/complete) needs IPC for `POST /api/coach/reviews/{id}/annotations`, `PATCH /api/coach/reviews/{id}`, `POST …/complete-roster` and a v3 notes composer on the match page.
- `upforge://` deep links don't exist; invite links must be pasted. A protocol handler would make "Open in app" from the web invite page work.
- Leave/switch membership stays on the web (`/my-coaches`).
- Squad shared focus (board 24 E) is not built.

## Coach notes (desktop)
Coaches can now review a student's match in the app without the web.
- **Open:** Coaches (/rosters) queue → row or "Write notes" (was "Annotate", which opened the web feed) → starts the review if pending → match page with `?coachReviewId=<id>` (the old page ignores the extra query).
- **Write:** a bar under the match header: "Note at 5:12 · Round 9" + text (≤500) + "Add note" (Ctrl/Cmd+Enter). Each note is pinned to the current video time and active round. The student's question shows under it.
- **Drafts:** autosave on this PC per signed-in user + review (`uf.coachNotes.v1:<user>:<review>`, max 60 notes, validated on load); cleared only after a successful submit.
- **Submit:** "Submit to student" opens a dialog (list with jump-to-time, remove unsent notes, optional closing note ≤1,000) → "Submit and complete". It posts unsent notes in time order, saving progress after each, then completes. A failure keeps what was sent marked, so a retry never duplicates a note. Blocked until the review has at least one note (the API requires it).
- **API (existing, no change):** `POST /api/coach/reviews/{id}/annotations` (body ≤500, round 1–50, video_offset_ms), `POST /api/coach/reviews/{id}/complete-roster` (closing_note ≤1000), `GET …/annotations` (existing IPC) for status, question and notes already on the server.
- **IPC (marked "Coach notes"):** `coach:add-annotation`, `coach:complete-roster-review` with strict input checks — `auth-manager.ts`, `ipc/auth-ipc.ts`, `preload/index.ts`, `env.d.ts`.
- **Files:** `src/components/v3/coach-notes/{coach-notes.ts, coach-notes.test.ts (9), CoachNotesV3.vue}`; blocks in `MatchPageV3.vue`, `useCoachRoster.ts`, `CoachRosterV3.vue`.
- **Not done:** editing or deleting a note after it's sent (no API endpoint); paid (non-roster) reviews still use the web's full form (observations/drills/perspective). Never exercised against the real account — covered by tests with fakes.

## Deep links (`upforge://`) — agent-deeplink
**What a link does:** opens Coaches (/rosters), fills in the invite, and looks the coach up (read-only GET). Joining still needs the "Join roster" confirm; paid rosters still go to the web checkout. Nothing is ever joined automatically.

**Accepted links (allow-list, `electron/main/deep-link.ts`):**
- `upforge://roster/join?coach=123` (also `?code=123`; roster invites are the coach's public id)
- `upforge://coaches/123` (mirrors the web invite path `upforge.gg/coaches/123#join-roster`)
- Refused: any other host/path, extra query keys, `%`-encoding, whitespace, `#`, backslashes, user/password/port, ids that aren't 1–9 digits without a leading zero, URLs over 256 chars. The raw URL is never navigated to, opened or passed to the shell.
- Squad invites (`upforge.gg/team?join=CODE`) are a different feature and are not handled.

**Flow:**
1. macOS: `app.on('open-url')` (registered at module load, before ready). Windows/Linux: the link in `process.argv` on cold start, or in `argv` of the `second-instance` event when the app is already running.
2. Main keeps at most one allowed action in `PendingDeepLink` (dropped after 30 min) and sends `deep-link:available` to the main window.
3. The renderer calls `deepLink.takePending()`. Main only answers the main window's own webContents, and only hands the action over when `authManager.isAuthenticated()`; otherwise it keeps holding it. App.vue also asks on mount and after every sign-in, so a link clicked while signed out lands after signing in.
4. `deepLinkRoute()` (`src/lib/deep-link-route.ts`): new design → `/rosters?join=1&invite=<id>` (RostersV3 opens the join field; `JoinCoachV3` gets `inviteCoachId`, fills the field and looks the coach up). Old design → the web invite page `/coaches/<id>#join-roster` via `openWebFeature`.

**Registration:** `package.json` `build.protocols` (`upforge` scheme) so the NSIS installer and the mac `Info.plist` register it. At runtime `app.setAsDefaultProtocolClient('upforge')` runs only in packaged builds, so a dev checkout never claims `upforge://` on the machine.

**Files:** `electron/main/deep-link.ts` (+test, 7 cases), `src/lib/deep-link-route.ts` (+test, 3 cases), marked blocks in `electron/main/index.ts` (module-level deep-link block above the instance lock; `second-instance` handler; `deep-link:take-pending` IPC), `electron/preload/index.ts` (`deepLink.takePending`, `deep-link:available` event), `src/env.d.ts`, `src/App.vue` (`consumeDeepLink`), `src/views/v3/RostersV3.vue`, `src/components/v3/roster-flow/JoinCoachV3.vue`, `package.json` (`build.protocols`).

**Verified:** parser, argv detection, hold-until-signed-in, expiry and routing by unit tests; type-check, eslint and the full suite (1,713 passed). **Not verified:** a real OS hand-off. Protocol registration needs a packaged, installed build (Windows NSIS / mac dmg); check after the next tagged release by running `start upforge://coaches/<id>` (Windows) or `open upforge://coaches/<id>` (mac) with the app closed and open, signed in and signed out.

**Web change (spec only — the frontend is the user's checkout):** on the coach invite card (`app/components/coaching/CoachHubJoinCard.vue`, shown at `/coaches/:id#join-roster`), add a secondary link under the join button: "Open in the UpForge app" → `upforge://coaches/${coachId}` (plain `<a href>`, no JS redirect), shown only when the visitor is signed in. Keep the existing web join as the primary action, since the link does nothing when the app isn't installed. Optionally add the same link to the coach's "Share invite" UI in `app/pages/coach-dashboard/roster.vue` as a second copyable line ("App link").
