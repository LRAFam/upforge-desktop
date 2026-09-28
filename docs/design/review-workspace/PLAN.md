# Review workspace implementation plan

## Starting point

Branch: `feature/review-workspace`, based on fetched `origin/main` at `f584b8f`.
This isolated worktree leaves the original desktop checkout and its uncommitted recording fixes untouched. Those fixes must be accounted for when integrating later; do not overwrite them.

The saved PNGs are generated visual references, not implemented functionality or factual match evidence. Gameplay, labels and timings are illustrative. In particular, Swap A/B belongs in a menu, not a primary tab. Do not copy generated event data into the product.

## Product contract

- Review is for playback, evidence, reflection and coaching. Footage and Clips remain distinct destinations; clip creation passes the selected source and position into the editing flow.
- Default to one large replay with collapsible/resizable rounds and Coach/Map/Stats panels. Save layout preferences and provide reset. Include keyboard-operable resizing and minimum dimensions.
- Comparison supports exactly two moments, from the same recording or different matches. Independent playback is the default until users link it. Each source retains its identity when swapping sides.
- Linked playback uses explicitly chosen source start points, not equal absolute timestamps. Support precision seeking, a bounded review loop and maximising either player without losing context. Do not promise frame accuracy without checking media/decoder capabilities.
- Reflection is optional. Notes may attach to A, B or both; saved comparisons restore sources, timestamps, anchors and notes. A saved next-match focus can be revisited without AI.
- Notes are private account data; retaining notes does not retain or upload recordings. Missing/expired footage is an explicit state with controlled relinking, never a silent substitution.
- AI is optional and distinguishes stored observations from newly inspected video. Context must be scoped to attached evidence. Proposed quotas/prices remain unvalidated until cost measurement.

## Existing code to preserve and reuse

- `src/views/VODReviewView.vue`: mounts one review provider, loading/error states, keyboard help and trim modal.
- `src/composables/useVodReview.ts`: timeline loading, route seek, media state, playback telemetry, spatial/tier state, persisted preferences, keyboard listeners, fullscreen and resize lifecycle. Do not instantiate this twice for comparison: its route, global keyboard listeners and persisted playback position belong to a single review session.
- `src/lib/open-vod-review.ts`: existing analysis-to-review entry contract, pending timeline, `timelineId`, `coachNotes`, `seekMs` and report-open tracking.
- `src/components/vod-review/`: command bar, body, round and non-round timeline sidebars, pending-demo states and shortcuts.
- `src/components/MatchSpatialMinimap.vue` and `src/lib/vod-games/`: spatial display and game-specific adapters.
- `src/components/analysis/AnalysisReviewDetails.vue`, duel moment components and `src/lib/duel-moments.ts`: deeper evidence and duel presentation.
- `src/views/RecordingsView.vue` and `src/views/ClipsView.vue`: existing footage and clips destinations. Extend their handoff contract instead of creating duplicate libraries.
- `src/lib/tier-features.ts`: current access checks. Preserve existing entitlements until a separately reviewed billing change.

## Current delivery checklist (controls pass)

- [x] Opt-in workspace, shared review source, resizable panels and return to original playback position.
- [x] Same-match comparison, selected event context and clickable timelines.
- [x] Independent/linked controls, session A/B starts, return to starts, play/pause both, speed and audio source/volume.
- [x] Expand either view and fullscreen; swap remains a secondary menu action.
- [x] Fine 0.1-second seeking and bounded relative loop controls implemented; real playback verification recorded below.
- [ ] Actual frame stepping (do not label time-based seeking as frame accurate).
- [x] Same-game cross-match source picker with unavailable-source errors and cancellation.
- [ ] Saved-source relinking and expired-source recovery across saved comparisons.
- [ ] Saved comparisons with canonical source identities and restored alignment.
- [ ] Private notebook with A/B/both timestamp attachment and All notes retrieval.
- [ ] Next-match focus, persistence, and return-review accountability flow.
- [ ] Evidence-scoped AI follow-ups and backend usage accounting.
- [ ] Paid-access contract and rollout; current preview does not introduce billing changes.

Session controls are not durable saved comparisons. Generated mockup affordances are not completion evidence. Keep these outstanding features in scope; do not replace them with library shortcuts or nonfunctional buttons.

## Delivery slices and gates

1. Baseline and inventory (this slice): save concepts, record existing automated checks and define regression checklist. No runtime changes.
2. Workspace shell: temporary opt-in switch, default off. Wrap existing review content; add bounded resize/collapse/reset preferences without rewriting playback. Keep a single provider and existing route contract. Verify keyboard, narrow windows and restoring positions before continuing.
3. Playback separation: extract instance-local media controls from the existing controller and use them in single review first. Keep source loading, permissions and session side effects separate. Prove parity before creating a second player.
4. Comparison: two source instances and one explicit coordinator for anchor-relative playback, buffering, speed, loop bounds and end-of-media. One keyboard target, one audio source by default. Test same-source/different-round as well as different matches. Do not fork the whole reviewer.
5. Notebook and focus: define API contracts and ownership tests before desktop persistence. Create separate API branch from main when this slice starts. Store canonical source IDs, source-time coordinates, review alignment, note text and versioned context. Distinguish media time from match-event time and preserve sync offsets. Never use temporary signed URLs as identity. A missing video must not remove notes. Define account logout, offline saves and retention behaviour before enabling cloud sync.
6. AI and usage: extend existing chat rather than adding another chat subsystem. Bound selected evidence, summarise history, measure cost, reserve usage atomically and settle on successful completion with idempotent refunds on failure. Purchased credits must work across supported conversations. Backend owns limits and access. Billing migration needs its own tests and review.
7. Release: test real recordings in the isolated build, opt in with a small cohort, monitor playback/source/seek errors and return-to-review usage. Preserve rollback until parity is demonstrated, then remove the temporary legacy path. No permanent duplicate architecture.

## Feature regression checklist

Unchecked items require execution, not assumptions from existing code.

- [ ] Analysis, recording and coaching-evidence entry points preserve the selected match and initial seek.
- [ ] Local and cloud recordings load; unavailable, deleted and expired sources show correct recovery actions.
- [ ] Play/pause, seeking, speed, mute, previous/next event, fullscreen, theater and position restoration work.
- [ ] Rounds, personal moments, full event feed, kill/death/plant/defuse markers and score view remain accessible.
- [ ] Heat/Sites/Peek/Dots, map sizing, replay sync, event-to-video offsets and map seeking remain accurate.
- [ ] Coach feedback, AI evidence, diagnosis, behaviours, patterns, category scores, strengths, timing and practice remain reachable.
- [ ] Duel moment seeking preserves the source and timing coordinate system.
- [ ] Valorant, CS2, Deadlock and League use their existing adapters; non-round and pending-demo states remain supported.
- [ ] Free/paid spatial gates remain correct; rich demo data is still required where currently enforced.
- [ ] Trimming remains available through the editing destination before removing its old review entry.
- [ ] Shortcuts do not intercept text entry or dispatch twice; listeners clean up on navigation.
- [ ] Window resizing, panel minimum sizes and keyboard controls cannot strand hidden content.
- [ ] Logout/account change clears sensitive active state and cannot reveal another user's notes or sources.
- [ ] Comparison handles one player buffering/ending, missing sources, unequal durations and invalid loop ranges safely.
- [ ] Saved note restoration seeks the exact attached sources; swaps do not exchange source identities.

## Verification policy

Run `npm run type-check` and `npm test` on the unchanged baseline, recording failures separately from new regressions. Add behavioural tests for each introduced state transition rather than snapshots of mockup markup. Desktop playback also needs manual Electron verification with real files; a passing unit suite is not evidence of decoder, audio or GPU correctness. Keep the current development app running until the isolated preview is deliberately selected.

No commits, push, version bump or release are part of this initial planning slice.

## Baseline results — 27 September 2026

- `npm run type-check`: exit 0.
- `npm test`: 182 test files passed, 882 tests passed, exit 0 (8.00 seconds).
- Initial sandboxed test execution could not bind local servers (`listen EPERM`); the authorised rerun above passed. These were environment restrictions, not application regressions.
- Checks used the original checkout's installed dependencies via a temporary symlink, removed afterwards. Install matching lockfile dependencies in this worktree before the implementation preview.
- No manual parity boxes above are marked complete: those must be exercised against the new workspace when it exists.

## First implementation slice

The review route now offers an opt-in workspace preview (classic remains the default). Both layouts render the same provider and body; changing modes does not remount the player. Left and right splitters support pointer capture and keyboard arrows/Home/End. Widths are bounded and persisted as versioned layout preferences. Existing round collapse, theater/focus mode and Coach/Map panel switching are reused. Reset restores widths, round visibility and notes. Narrow windows allow horizontal scrolling rather than crushing panels. Toolbar key events do not reach global playback shortcuts.

Editing is deliberately still reachable through its original entry until the separate editing handoff is implemented. Comparison, notebook, new billing and new AI flows are not enabled in this slice. The preview is a layout foundation, not the completed generated design.

Validation: type-check passed; production build passed; 183 test files / 884 tests passed. New sizing tests cover bounds, resize direction and a zero-width container. Manual Electron visual/playback parity remains pending; do not enable by default or release based solely on these checks. The original running development app has not been switched to this worktree.

### Isolated Electron verification

Opened the built worktree renderer with a separate temporary profile and the user's signed-in account. Tested real analysis 639 (Fade, Summit, 41:53 cloud recording). Confirmed playback advances, five-second seeking, both panel keyboard resize directions, focus/restore, reset to 20/32 percent, and persistence of a 21-percent rounds width after renderer reload. Map location R2 A Main seeks to 2:38 for the 2:42 event with the existing four-second death pre-roll (not a sync correction). This validates the seek mapping, not every spatial marker's semantic accuracy.

Found and fixed a pointer focus issue: pointerdown prevented default focus, allowing subsequent arrows to seek instead of resize. The divider now explicitly focuses itself; verified 20→21 percent without a seek. Type-check and build passed after the fix. This preview uses a temporary launcher, so its displayed version may be Electron's version rather than the package version.

Still pending: drag-distance visual verification, narrow-window ergonomics, full spatial replay sequence, local-file source lifecycle and other games, and the remaining regression checklist. Renderer reload for this analysis returns to its existing entry position; do not claim cross-reload media position persistence from the width test. No release readiness claim.


## Workspace navigation and header slice

Consolidated the duplicated controls into the existing command bar. Workspace mode now has Review, Footage library and Clips library navigation; these links open the existing libraries, not match-scoped editors or persistent workspace tabs. Reset and classic mode live in a compact Layout menu. Existing trim, map, notes, score, shortcuts and player actions remain available. Added pressed-state accessibility to panel controls. Responsive panel safeguards now use the review container width so the app sidebar is accounted for; minimum widths and horizontal scrolling are retained.

Validation: type-check and production build passed before Electron inspection. The refreshed preview visibly showed the navigation and styled command buttons; activating Focus video removed both panels. The native window became unavailable during further checks. Reset, restore, library navigation and narrower-window ergonomics still need manual verification on this revision. No timeline timing, new AI, comparison or notebook changes in this slice. No commit, push or release.

Final checks after accessibility changes: `npm run type-check` exit 0; `npm test -- src/lib/review-workspace.test.ts src/lib/playback-activity.test.ts` 2 files / 8 tests passed; `npm run build` exit 0; `git diff --check` exit 0.


## Navigation correction

Removed the duplicate Footage library and Clips library links following user review. Library navigation belongs in the existing sidebar. Removed the extra header row too: Layout and the classic-mode Try workspace action now sit beside the existing review controls. Future workspace navigation must operate on the current review (comparison, notes and coaching), not repeat library routes. Event timing remains deferred and unchanged.

Correction verification: type-check and production build passed; diff whitespace check passed. This correction has not yet been visually rechecked in Electron.

## Same-match comparison implementation

Workspace mode now exposes Compare moments for a loaded recording. The original review body stays mounted and paused while comparison is visible; its global shortcuts are suspended. Returning recalculates the video frame without reloading the timeline or moving the original player. Comparison owns two media elements and a small playback coordinator, not two review providers. Shared media-time bounds are exercised in the single player's skip path first.

Implemented: independent event selection/seeking/playback, explicit alignment from the two current positions, linked seeking bounded to the common playable range, shared speed, one audible side (or neither), expand/restore and swap in a secondary View menu. Buffering/end interrupts linked playback; either source error pauses both and directs the user back to existing source recovery. Both players start paused; comparison disposal cancels pending playback.

This first comparison slice uses two positions from the current resolved recording only. Cross-match source selection, bounded loops, finer stepping, persistent notes/focus and paid entitlements remain outstanding. No new AI requests, recording uploads or stored signed URLs. The broader extraction in slice 3 is incremental: only media bounds are shared so far; existing review-specific seek telemetry and cloud handling are preserved.

Verification: type-check and production build passed; full suite passed (184 files, 892 tests). Eight new tests cover independent controls, relative alignment and unequal-duration bounds, readiness, buffering/end, rejected/pending play, missing media and supported rates. Electron preview of analysis 639 displayed both real videos at independent positions (1:15 and 1:17). Back to review restored the original paused 1:13 position. Linked playback, audio exclusivity and buffering still require full manual media checks; automated coordinator tests are not decoder verification. No commit, push, version bump or release.

Comparison event labels now include round/time, kill/death participants, resolved weapon/ability, and recorded spike site/actor or objective details. Missing participants are explicit; no spatial location is inferred from nearby events. Type-check and production build passed; seeking and event timing are unchanged.

Comparison selection correction: event dropdown now shares reviewEventStart with the existing review seek path (death lead-in 4s, kill lead-in 2s, objectives unchanged). Displayed labels retain event timestamps. Choosing a new event unlinks old anchors so common-range clamping cannot send the selection elsewhere. Underlying event/video calibration remains deferred. Type-check, build, and 16 targeted tests passed; real-footage alignment is not yet reverified.

Comparison event context and calibration: selections now persist in each dropdown and an explicit Selected event label, with round/details/time. Each player has clickable colour-coded event markers and a playhead. User supplied a measured example: R4 Clove Sheriff kill labelled 6:15 actually occurs 6:11. Added explicit session-only comparison event adjustment, applied -4s in the isolated UI, and verified the marker/label changes to 6:11 and selection seeks 6:09 (2s lead-in). Underlying cloud timestamp reconstruction is not fixed: metadata API returned 401 without authentication; no credentials were extracted. Calibration resets when loading another timeline and does not alter stored metadata, main review/map timings or other matches. Actual-frame verification across later rounds remains pending. Type-check, build and 10 comparison tests passed before the source-reset guard; final type-check follows.

Final type-check/build and whitespace verification passed after the source-reset guard.

## Comparison transport and loop pass

Added explicit session A/B start points (updated on moment selection or Set start here), linking to those starts, Back to starts, Play/Pause both including independent mode, volume, per-player fullscreen and 0.1-second fine seeking. Do not call the latter frame stepping. Loop In/Out are offsets from each source start, validated against the shorter remaining recording; loops require linked playback. Loop restarts wait for both elements to finish seeking and have playable data. Manual seek/pause, new selection, alignment changes and disposal cancel pending loop resumes. Changing a start unlinks rather than silently moving the opposite source.

Electron check on analysis 639: restored -4s comparison timing, linked both starts around 1:13.9, enabled default 0–8s loop, observed both videos still playing together at 1:16.5 after more than a full loop duration, paused both, and returned both to 1:13.9. This verifies a real loop with this cloud source, not cross-match/buffering/fullscreen parity. Type-check, production build and 21 targeted tests passed. Checklist above explicitly retains the remaining approved features. No commits or release.

Final regression suite: 184 files / 899 tests passed.

Compact comparison layout: single-line title/context, Options disclosure for setup guidance and timing adjustment, shared playback/loop controls moved above videos into a sticky strip, duplicate selected-event prose visually hidden (selection remains visible in dropdown and announced), and viewport-bounded video height. Verified in Electron that shared and per-player controls are visible without scrolling at the current window size, Options opens, both sources load and -4s calibration was restored. Type-check/build/diff check passed. Narrow-window scroll ergonomics still need wider coverage.

## Cross-match source selection

Change footage on either side opens a native modal picker with device recordings and up to 50 recent reviewed Valorant/League matches (other games currently list device recordings). Same-game choices only; search map/agent/date. Uses existing authenticated timeline endpoints and playback resolution. Missing metadata/URLs or load failures keep the current source. Modal cancellation ignores late responses; native dialog contains keyboard focus. Selecting footage pauses both, unlinks and clears loops, resets only that side's event/start/media state, and preserves the other side. Source IDs are separate from temporary playback URLs. No new uploads or AI calls.

Extracted event construction and video URL conversion for reuse by original review and comparison; no second review provider. Each side builds labels/events from its own team/source data. Timing corrections are keyed by selected source within this comparison session; changing B does not carry A's -4s correction into unrelated footage. Current-review correction remains available on returning to the current source.

Verification: type-check/build, 19 focused tests and full suite (185 files / 903 tests) passed. Real Electron selection changed B from Summit/Fade to Split/Jett (32:36 video) while A stayed Summit/Fade at 1:13.9 of 41:53. Cross-match linked-loop and all unavailable/expired-source cases still need manual media coverage. Saved comparisons, notebook, next-match focus and AI remain pending. No commits or release.

Final picker polish includes recording time to distinguish same-day matches and rejects mismatched-game timelines. Final type-check/build/diff checks passed. Restored A’s measured -4s calibration in the preview; B retains its independent zero adjustment.

## Account notebook implementation

Added collapsible comparison notebook with title, next-match focus, A/B/both note attachment, saved-comparison list and All notes. Each saved note snapshots its own media positions, source IDs, start alignment and timing shifts. Restore resolves authenticated footage again; unavailable sources retain notes and current footage. Account changes invalidate pending responses and clear the notebook. Explicit saves, server confirmation, revision conflict protection and unsaved-draft navigation confirmation; no local note cache or offline write queue.

API implementation is isolated on feature/review-notebook in upforge-api-review-notebook, with account-owned storage, migration and contract documentation. API tests: 3 tests / 16 assertions. Desktop: 187 test files / 909 tests, type-check and production build passed. Notebook layout inspected in Electron. Live-account saving cannot yet be verified because the new API is not deployed; do not mark full notebook rollout complete. Retained pending: cross-device recording relinking, edit/delete notes, reminder/revisit flow for next-match focus, full media restoration end-to-end against deployed API, and Ask AI. No commits, deployments or desktop release.

Restarted the isolated Electron preview with the new IPC bridge. Both cloud players loaded (41:53); notebook hide/show works and the undeployed API correctly reports account notebook unavailable. No test notes were written to the live account.

## Note editing and focus follow-up

Added Edit note from This comparison/All notes. Writes preserve original source IDs, positions, attachment and created time, independent of current playback or source availability. Inline editor retains draft on failure/conflict and uses existing account generation guards. Added Revisit a focus queue with explicit self-assessment (Improved / Still practising / Not tried yet), optional reflection and return to original moments. Latest check-in is scoped to the exact saved focus; changing the focus clears its previous assessment. No inferred improvement, reminders or automatic check-ins. This is a user-initiated notebook follow-up, not a pre-match notification.

Verification: 8 focused desktop tests, type-check/build and whitespace checks pass. API notebook tests: 5 tests / 27 assertions including note coordinates retained, check-in round-trip, older-client retention, focus change invalidation, and malformed check-ins. Refreshed Electron preview and verified Revisit a focus disclosure and empty state. Live save/edit/check-in flow remains blocked on deploying the notebook API and migration; no live account test data written. Note deletion, historical check-in list, source relinking and broader redesign release gates remain pending. No commit/release/deploy.

## Saved footage recovery

Saved restore now resolves all requested sides before assigning either player, reports unavailable A/B individually, and offers fresh resolution through Retry saved footage. Choose replacement uses the existing same-game footage library. The selected recording is previewed at the saved positions; missing/out-of-range media disables saving replacement links. Explicit Save replacement links updates matching canonical source references across the owning comparison and its notes while retaining text, positions, starts, event shifts and attachments. Saves use the existing account and revision guards. Dismiss/picker cancellation never write notebook changes. Replacements must be the same full recording; no timestamp conversion is invented for trimmed/different footage. No arbitrary filesystem picker is introduced.

Checks: 13 focused desktop tests pass (atomic source resolution, individual-side loads, wrong-game/missing-media rejection, reference-only relinking, unchanged coordinates, and notebook/account contracts), type-check/build/diff checks pass. Full saved-account recovery UI still needs end-to-end verification after the notebook API is deployed; no production account writes or deployment. No commit or desktop release.

## Comparison resizing and moment context

Reused the existing pointer/keyboard divider for video split (35–65%) and notebook width (20–36%), with versioned local layout preferences containing sizes only. Options → Reset layout restores 50/24, both players, default ordering and visible notebook. Narrow layouts stack panels and hide inapplicable splitters. Added compact source date/map/agent context plus selected-event label; saved positions show a nearby event only when unambiguous within four seconds. Nearby event context does not assert a current round across gaps in sparse event data.

Verification: four layout/context tests, type-check/build/diff checks passed. Electron showed source context and both splitters; keyboard adjustment changed video share 50→51 and notebook 24→25, and Reset layout restored 50/24. No media navigation fired during these checks. Pointer-drag and narrow-window coverage remain pending. No commit/release. Notebook account features still require the separate API deployment/migration.

## Saved-note timeline markers

Notebook publishes only its loaded/saved account entries to comparison. Per-video marker lanes match canonical game/type/source IDs, respect A/B/both attachments and use saved media positions without reapplying event calibration. Notes beyond the current media duration are omitted from that timeline but remain in the notebook. Dense markers group with 28px spacing based on live video width; a group exposes every saved position. Single markers open the owning comparison/note in the notebook, highlight/focus it, and restore its saved attachment through the existing recovery path. Draft-discard and account-change protections remain active. Width/source/list changes close stale group menus; media observers are disconnected on disposal.

Verification: 13 focused notebook/marker/recovery tests, final type-check/build/diff check passed. Live marker rendering/restoration awaits notebook API deployment; no production test notes were created. Preview rebuilt. Remaining: true frame stepping, account save/restore end-to-end validation, broader responsive/pointer QA and AI coaching integration. No commit or release.


## Player controls and direct timestamp navigation

Grouped per-player seek controls, introduced a distinct play/pause button and compact accessible audio/fullscreen controls, and aligned elapsed/total time. Added Go to time with seconds, m:ss or h:mm:ss input and up to three decimal places. Invalid or out-of-duration input leaves playback unchanged and shows an inline error. A valid direct jump unlinks playback and disables looping so linked bounds cannot silently move the requested position; the other side remains unchanged and explicit start anchors are retained.

No frame index or usable frame timestamps are exposed by the current recording/player contract. The fine-seek buttons remain accurately labelled ±0.1s; true frame stepping remains pending dedicated media timing support.

Verification: type-check, 17 focused tests across timestamp parsing and comparison playback, production build and diff check passed. In Electron, entering 6:11.250 moved A to the corresponding time while B stayed at 0:00; invalid 99:99 showed the error without moving either player. Restored valid input before leaving the preview. Displayed playback time remains tenth-second precision. Account notebook still requires API deployment/migration before live save/restore verification. No commit, release or deployment.


## Moment filters and notebook deletion

Added independent round/event dropdown filters above each moment picker with matching count and explicit empty state. Filters do not seek, mutate timestamps or hide the current selection's context. A selection outside the filters remains labelled. Filters reset only for a replaced side. Full timeline markers remain available.

Added confirmation for note deletion and whole-comparison deletion, with explicit scope and irreversible wording. Unsaved drafts block deletion. Note removal uses the existing revisioned document write; comparison removal uses an authenticated revision-checked DELETE endpoint and account-isolated IPC. UI only removes entries after a verified server response. Footage is never deleted. Stale updates after deletion cannot recreate a comparison with a nonzero revision.

Verification: 14 desktop tests, type-check, build and diff check pass; API tests pass (7 tests / 41 assertions). Electron: round 4 narrows A from 66 to 3 moments, Kill narrows to 2; both playback positions remain 1:13.9 and B remains unfiltered. Account deletion UI end-to-end remains pending API deployment/migration and preview restart for the new main-process IPC handler. No live notebook entries deleted, no commit or release.


## Compact-window polish

Checked the real Electron comparison at laptop-sized and minimum-sized windows (approximately 1200×800 and 1100×720 logical pixels). Reduced video height in short windows to keep playback, event timeline, timestamp entry and start controls visible. Fullscreen retains its separate larger video sizing. Grouped Change footage/Expand beside each heading and allowed timestamp controls to wrap. When the notebook stacks below the videos, it now uses the comparison page scroll rather than an additional capped scrolling area.

Verification: type-check, production build and diff check passed. Electron screenshots confirmed both players' lower controls fit in the minimum-height view; scrolling reached the full notebook form. Restored the larger preview window afterward. No new behavioral tests for this CSS-only change. Pointer splitter drag was attempted but no changed value was observed, so pointer resizing remains unverified (prior keyboard resize checks passed). Account notebook end-to-end checks still await API deployment/migration. No commit or release.


## Local account persistence integration

Added opt-in review-notebook-http.test.ts: runs the real desktop IPC request handler with Axios against a loopback Laravel API, authenticated with two disposable Sanctum accounts. Destination is fixed to 127.0.0.1:18089; set NOTEBOOK_HTTP_TEST_TOKENS to a private JSON file containing the two local tokens. Requires an isolated database with users, personal_access_tokens and the notebook migration; never point test credentials at real accounts. Normal test runs skip this integration case without that explicit fixture.

Verified real HTTP create → list/reopen → remove note → delete comparison. Desktop validation accepts the API document; independent fractional positions, starts, shifts, speed and loop survive persistence. Account isolation, stale deletion conflict and stale write after deletion pass. Footage resolution in this test is stubbed; it does not establish actual video playback restoration or UI confirmation behavior.

Verification: 1 HTTP integration test, 14 desktop unit tests, 7 API tests / 41 assertions, type-check and diff check passed. The local server used a temporary SQLite database and was stopped after verification; no production data touched. Remaining release gate: live UI save/restore/delete with real playable sources after API deployment/migration, and restarting the app to load its new IPC bridge. No commit, deployment or desktop release.


## Ask AI coach implementation

Added a Review tools sidebar with Notebook / Ask AI coach. Questions capture selected A/B analysis IDs, media positions and explicit selected round indices; absent round stays absent. Includes question starters, persisted answers, usage display, retries with stable request IDs, failed-request feedback and existing Coach Credit checkout packs. Notebook/coach tab changes preserve the mounted draft. Account changes clear private state. Analysis changes preserve unsent question text but clear old request identity. Current supported scope is footage with an existing analysis ID on both sides; raw local self-review is not sent to AI.

API extends the existing CoachChatMessage store with a request ledger and queued AnswerWorkspaceCoach job. Per-account row locking atomically reserves questions/credits. Existing Plus limits (15 per analysis / 30 daily) and Pro limits (25 / 75) remain; purchased credits bypass either exhausted limit. Legacy chat now uses the same reservation service. Duplicate UUIDs return the existing request; mismatched content conflicts. Failed/timeout jobs refund once, remove the chargeable user message and preserve the original question in the ledger. Successful replies record provider model/input/output token usage. Both selected analyses must belong to the account.

Python adds a non-streaming workspace operation to the existing coach service/model. Evidence uses canonical selected-round telemetry plus existing report insights; no video uploads or new visual analysis. Bound to two moments, 32,000 evidence characters, four recent Q/A pairs and 800 output tokens. Incomplete output is a failure. Prompts explicitly distinguish report claims, telemetry and unavailable visual evidence. This does not implement full duel-observation retrieval, automatic older-history summarisation, or raw-footage analysis. These remain limitations to resolve during answer-quality review rather than silently implying coverage.

Verification: 21 desktop focused tests, type-check/build, 12 API tests / 73 assertions, 3 Python tests, Python compile and diff checks passed. Provider calls were mocked in tests; no paid AI calls or purchases. Real Electron shows the new panel and, after restarting IPC, explicit undeployed-endpoint state. Still required: local/live end-to-end answer quality, quota concurrency under production database, legacy streaming regression coverage, and deployment validation. Deploy Python endpoint + API migration and queue worker (job timeout 80 seconds; retry_after must exceed this) before enabling live answers. No commit, push, deployment or desktop release.

### Match overview layout pass
- Compact match header and Review match action before the report.
- Match recap and timing cards lead the overview; full report and duel observations expand on demand.
- Pending recording actions retained; pending selections remain visible at narrow widths.
- Existing review/seek handlers unchanged. No new timing corrections in this pass.
- Match-specific saved-comparison and focus shortcuts remain to be wired to account notebook data; no placeholder actions added.
- Verified with desktop type-check, production build and local Electron overview inspection.

### Self-review and quota follow-through (27 September)

Next implementation sequence, preserving current prices and legacy entitlements:
1. Bring the existing AppPlanService catalogue work into the integration branch deliberately; do not duplicate its plan rules in notebook or desktop code. That work is currently uncommitted in the original API checkout and is not in this worktree.
2. Expose one account usage response with separate cloud clips, archived footage, report allowance, purchased report credits, and Coach Credits. Include authoritative limit/used/remaining, period/reset where applicable, retention, and explicit unavailable/unlimited states. Storage occupancy does not reset monthly. Local files do not consume cloud occupancy. Read responses must not reserve usage.
3. Reserve upload capacity atomically per account before issuing upload access. Require a per-upload identity for idempotent retries; the current archive presign path reuses the latest uploading row for the account, which can conflate distinct uploads. Check concurrent requests, cancellation, abandoned uploads, completion replay, and deletion. Verify storage object size at completion; client-reported sizes must not define billed usage.
4. Keep existing count-based allowances while measuring bytes and delivery costs. Decide byte/duration caps and storage add-on pricing from observed costs before selling new capacity. Add no automatic overage charges.
5. Add a compact Usage view plus contextual checks before cloud upload or AI submission. On full cloud capacity offer Manage storage and the available upgrade; retain local footage. Refresh usage after upload, deletion, purchase, and analysis completion/failure. Surface expiry before footage becomes unavailable, retaining notebook notes and explicitly marking unavailable sources.
6. Connect match overview to saved comparisons and current focus through account-owned notebook data. Resume the exact saved sources/anchors. Add search by match/map and a deliberate focus check-in after a later match, without claiming improvement from usage alone.
7. Consider paid comparison/saved-workspace access, storage add-ons, report packs, and Coach Credit packs as separate offers. No new paywalls or price changes in this pass. Preserve existing paid users' price-specific allowances. Any downgrade policy must retain read access to notes and clearly explain footage retention before removing access.

Verification gates for quota implementation: last-slot concurrent uploads, idempotent retries, failed-job refund exactly once, allowance resets, purchased-credit balances, legacy subscriptions, upgrades/downgrades, missing usage, and account switching. Measure upgrade exposure -> checkout -> paid -> retained use, separately for tools/storage/coaching; signups alone do not validate an offer.

Completed immediate correction: missing desktop usage no longer implies unlimited access or zero consumption. Explicit API null remains unlimited. Settings now preserves authoritative missing counts instead of inventing one free report or an empty archive. Nine quota-display tests and type-check passed.

### Integrated usage and review continuation
- Added authenticated account usage API and validated desktop contract for reports, purchased reports, Coach Credits, clips and archived/reserved footage.
- Account Usage replaces older ambiguous monthly-only presentation. Footage and Clips show compact capacity notices and link directly to usage/plans. Refresh on library changes and window focus.
- Match overview lists account-owned comparisons referring to its analysis, with saved focus and note counts. Resume passes only the comparison ID and restores through the notebook's existing source-resolution flow. Added notebook search.
- Archive uploads use per-file retry keys. Completion is replay-safe and uses storage-observed size. Clip completion retries reuse the existing clip under an account lock.
- Imported existing API billing work into the review API branch so account allowances use AppPlanService; original checkout kept intact.
- Rebuilt/restarted local Electron and verified Footage -> Usage navigation and explicit unavailable state against the still-undeployed API.
- Remaining launch work: deploy/migrate API and real-account restore/usage checks, MySQL concurrency verification, production-equivalent cleanup/long-upload checks, and tagged desktop release. No prices changed, no new paywalls, no commit or deployment.
- Commercial follow-up: decide storage add-on size/price from measured storage and delivery cost; approve comparison entitlement and existing-user transition rules before enabling restrictions. No automatic overage charges.

### Library visual consistency pass
Shared compact page header across Matches, Footage and Clips. Map imagery stays available behind an expandable map filter. Footage folder action moved to the header, duplicate removed. Clip/footage filter targets and selected accessibility states improved; view toggles now have explicit accessible labels. Type-check/build passed, Electron Matches map expansion and Clips controls verified. No deployment or release changes.

### Home review-first layout
Recent matches moved ahead of the coaching brief and activity log. Recording controls remain visible in the right rail; empty action queues are suppressed while real pending actions retain the existing handlers. Web extras and activity are expandable. Narrow workspaces use one scrollable column. Existing game imagery, game-specific panels and training remain. Verified type-check/build and local Electron layout; corrected inherited full-height card styles during screenshot inspection. No deployment changes.

### Review toolbar and detail polish (27 September)
- Compact match identity, one desktop score display, and clearer Compare moments action.
- Consistent 36px toolbar controls, stable toggle labels, visible keyboard focus, and wrapping action row at narrower widths.
- Restored missing Coach notes / Map intel tab styling and added pressed states.
- Increased match-detail stat label contrast and size; matched action corners and All matches wording.
- Verification: desktop type-check passed; renderer build passed (3.77s); diff check passed. Electron review inspected at full size and 1100px window width. Playback and timing logic unchanged.

### Coaching disclosure and paid coaching guidance
- Review side panel keeps primary evidence visible and collapses additional improvement notes behind More to work on; all improvement entries remain accessible when expanded.
- Ask AI coach now distinguishes unavailable, plan-locked, included, credit-funded and exhausted states. Plan-locked users have a pricing link; no-credit submissions are disabled while drafts remain. Idempotent pending retries remain available. Window focus refreshes allowances after returning from checkout.
- Cloud libraries expose storage details, reserved uploads, retention and the authoritative next expiry date; exhausted users can reach capacity management/plans without deleting local files.
- Five focused contract/access tests, type-check, build and diff check passed. Live visual verification of this slice was blocked when the Electron window became unavailable to computer use.
- Comparison/saved-workspace paid entitlement and existing-user transition remain awaiting user clarification. No new comparison restriction, prices, deployment, commit or release introduced.

### Approved free/paid split and access foundation
User approved comparison and saved comparisons in Plus/Pro, with basic replay, personal timestamped notes and next-match focus free. Preserve existing accounts' tools access; downgrade must retain saved-work read access.

API ReviewAccessService is the single comparison entitlement source, exposed in account usage. Uses effective subscription tiers (including cancellation), preserves accounts created before a fixed rollout timestamp, and defaults to preview access. Notebook writes enforce the service when rollout is configured; reads and owned deletion remain available. Account Usage displays the authoritative access reason. Missing access data is explicitly unavailable, not inferred from tier.

Important: REVIEW_PAID_TOOLS_FROM remains unset. Do not enable until standalone free notes/focus, comparison entry guards and saved read-only browsing are completed and deployed together. Current personal notebook is comparison-bound; enabling restrictions now would break the approved free journey. This is the access foundation, not the completed rollout.

Verification: 15 API tests / 81 assertions, 4 desktop access/usage tests, desktop type-check/build and both diff checks passed. No commit/push/deployment or release.

### Standalone free personal review and comparison entry
- Added account-owned personal_reviews storage and authenticated GET/PUT personal-review API, independent of paid comparison access. Single source identity, focus and timestamped notes; revision conflicts, idempotent replay, bounded documents and account isolation covered.
- Single-match Notes panel now includes Your review (free), focus, note drafting with captured media timestamp/round, saved Watch links and owned note deletion. Drafts stay mounted across map/notes/theater changes; route changes warn before discarding. Save retries retain the original note identity/anchor; failures never report success.
- Comparison entry now checks the server-owned review_access decision. Locked accounts get a plans link plus read-only saved comparison notes; existing-account/plan/preview decisions open comparison. Missing access is explicitly unavailable (no inferred paid tier).
- API rollout timestamp stays unset. Both server deployment/migration and desktop restart/release are required together; the current production API lacks these endpoints, so live saving and comparison entry cannot yet be verified against it.
- Verified 14 API tests / 81 assertions; 12 desktop tests; type-check; build (3.26s); diff checks. Live Electron inspection could not retrieve its web content this turn, so no visual/end-to-end account-sync claim. No commits/push/deploy/release.
- Follow-up: real account cross-device save/restore QA after backend deployment, and carry the latest personal focus into the next-match entry flow. Current focus is stored with its reviewed footage.

### Carry focus into another review
Personal review now returns the latest saved non-empty focus from another review of the same game and account. The review panel offers an optional player-reported check-in (improved / practising / not tried), reflection and an explicit Keep this focus action. The saved check-in pins the original focus even if the originating review changes later; new check-ins reject changed or unowned origins. Older clients preserve saved check-ins. No improvement is inferred from playback or match stats; the UI says another review, not a verified chronological match predecessor.
Verified 3 API tests / 30 assertions (including cross-account, same-game isolation, replay and old-client preservation), 3 desktop contract tests, type-check, build and diff checks. Live account-sync / visual QA remains dependent on updated API and desktop runtime. No rollout activation or deployment.

### Local HTTP integration verification
Added opt-in personal-review-http.test.ts exercising the real desktop IPC handler over HTTP to a disposable Laravel SQLite instance on 127.0.0.1:18089. Verified initial review, timestamped note and focus save, same-game carryover to a second recording, check-in persistence after reopening, retry without revision duplication, and isolation after switching accounts. Passed (517ms) with sandbox localhost permission; initial restricted attempts could not reach localhost. Type-check and diff check passed. Temporary API stopped after test. Production and the user's account were untouched. This verifies bridge/API persistence, not Electron UI interaction or real-media playback.

### Free comparison trial (2026-09-28)

After the paid-tools cutoff, new free accounts can save one comparison using their own footage. Playback, linking, looping and notes are available in that comparison. The allowance is claimed only on a successful save, under the account write lock. Owners can reopen and edit the claimed comparison. Deletion does not reset the lifetime trial. Additional comparisons require Plus or Pro; Ask AI Coach keeps its separate entitlement.

Preview and grandfathered accounts retain unrestricted comparison access. Deploy the API migration `2026_09_28_120000_add_free_comparison_to_users` before releasing the desktop changes. Leave `REVIEW_PAID_TOOLS_FROM` unchanged until the planned rollout verification is complete.
