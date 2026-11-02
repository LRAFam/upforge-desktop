# Ask AI on the v3 match page (coverage gap #1)

## What shipped (local, not committed)
- **New tab "Ask AI"** in the match page side panel, beside Review / Map intel. Shown only when the timeline has a real `analysisId`.
- `src/components/v3/matchpage/ask/AskMatchPanelV3.vue`: the panel. `ask-match.ts`: logic and copy. `ask-match.test.ts`: 17 tests, IPC mocked.
- Wiring: `src/components/vod-review/VodReviewBody.vue` (about 15 lines). Local `askOpen` state; the composable is untouched. The panel mounts on first open and stays mounted, so a draft survives tab switches.

## Same pipe as the comparison coach (no new IPC or API)
- `window.api.workspaceCoach.history|ask|credits` → `GET/POST /api/analyses/{id}/chat/workspace` and `/payment/chat-credit-checkout`.
- The question carries **one** moment: this analysis, the current video time and the round being played at that time (`activeRoundNumber`, 0-based). The API accepts 1–2 moments. The job uses the round to filter round facts.
- Same allowance and copy: included questions = min(per-match 15/25, daily 30/75), then Coach Credits. Free plan → "Ask AI coach is included with Plus and Pro…" plus one primary "View coaching plans". Exhausted / credit / retry / "Could not answer. Your allowance was returned." messages come from the comparison coach. API errors (403/409/422/429) are shown as returned.
- Retry reuses the same request id and moment, so a network blip never charges twice.
- **No starter questions.** The API doesn't return any, and the comparison's hard-coded starters are about two moments.

## Verified
- `npx vitest run src/components/v3/matchpage/ask`: 17 passed. Full `npx vitest run`: the only failures are in `coach-format.test.ts` and `roster-flow.test.ts`. Those belong to the coach-rename agent's files and were already failing.
- `vue-tsc`: clean for these files. The only errors are the same two coach test files. `npx eslint`: clean on the changed files.
- Screenshots of the idle state (timelineId=639, admin account): `scratchpad/shots/agents/ask-tab-3.png` and `ask-tab-4.png`. **No question was submitted.** Opening the tab is a read-only history GET. Theater mode was turned off for the shot and turned back on.

## For the lead / other owners
- **Header (MatchPageHeaderV3, not mine):** its Replay / Coach notes / Map tabs don't know about Ask AI. While Ask AI is open, "Coach notes" stays underlined. In theater mode the side panel and its tab row are hidden, so Ask AI is only reachable after leaving theater mode. Suggestion: add an "Ask AI" header tab. That needs `askOpen` to move into `useVodReview` (e.g. `SidePanelTab = 'notes' | 'map' | 'ask'`).
- Answers come back as light markdown. The panel renders headings, lists and **bold** as plain text blocks (no `v-html`). The classic `VodWorkspaceCoach` still shows the raw `#`/`**`; `answerBlocks()` could be reused there.
- History is per analysis, so answers asked in a comparison also appear here. They are labelled with both moments ("Round 1 · 1:13 / Round 12 · 22:42").
- No `useStaleLoad` cache: remaining questions and credits must be live, never stale. The first load shows a skeleton.
- The classic per-analysis chat (`POST /analyses/{id}/chat`) is still unused by the desktop. Both endpoints share one allowance.

## Follow-up (2 Nov): theater mode, header tab state, Map intel image
- **Ask AI header tab.** Header tabs are now Replay / Coach notes / Map / Ask AI (Ask only with a real `analysisId`). They mirror the side panel; they were never a separate "main view". So while Ask is open, **Ask AI** is underlined, not Coach notes.
- **Theater mode.** Picking Coach notes, Map or Ask AI in the header now leaves theater mode and opens that panel. Before this, Coach notes and Map did nothing visible in theater mode either. In theater mode the header shows **Replay** as the active tab, because only the video is showing. `T` goes back to theater. I chose this over an overlay drawer: a second copy of the panel would lose the typed draft and add a new layout.
- **Shared state, composable untouched.** `ask/ask-state.ts` keeps `open`/`mounted` per review context (a WeakMap keyed by the injected `useVodReview()` object), plus `openAsk` and `selectTab`. Header and `VodReviewBody` both use it. The watcher runs in a detached effect scope because the header remounts while the timeline loads. If the lead later moves Ask into `SidePanelTab`, this file can be deleted.
- **Map intel `stylizedBackgroundImage`: skipped.** Rule 7 (one image, used big): the match page header is already a `UfHeroBand` with the same map's splash art. The Map intel panel also already shows the minimap image. A third picture of the same map would break the rule and add about 0.5 MB per load.
- Verify: `npm run type-check` clean · `npx eslint` clean on the 4 changed files · `npx vitest run src/components/v3/matchpage` 58/58 (new `ask-state.test.ts`, 7 tests) · full `npx vitest run` 366 files / 2201 tests pass. Live (timelineId=639): in theater mode the header reads Replay. Header "Ask AI" left theater mode and opened the panel, with both Ask tabs underlined. Header "Coach notes" moved the underline back to Review. Theater mode was turned back on afterwards. Screenshot: `scratchpad/shots/agents/theater-ask-2.png`. **No question was typed or submitted.**
