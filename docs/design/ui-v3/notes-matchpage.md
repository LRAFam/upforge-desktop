# Match page (VOD review) — v3 notes · agent-matchpage

## Built
- `src/views/v3/MatchPageV3.vue` — v3 shell. Renders the same working pieces as the classic view
  (CloudVodActions, VodReviewStates, VodReviewBody, VodComparisonAccess, VodReviewComparison,
  VodReviewShortcuts, TrimRangeModal) with the classic view's state passed in (v-model workspace /
  rounds width / details width; comparison access + ids via props/emits). Scoped `.ui-v3` restyle of the
  shared review classes (flat surfaces, square corners, hairlines, no glow, red underline for active).
- `src/components/v3/matchpage/MatchPageHeaderV3.vue` — replaces the old command bar in v3:
  compact `UfHeroBand` (map art, result word + wash, score D2, agent square, K/D/A, rounds W–L,
  "rounds you died first"), one row of `UfTabs` (Replay · Notes/Coach notes · Map) + every command-bar
  action, the coach's sentence, and `UfRoundsLine` (click a round = seek to it; active round selected).
- `src/components/v3/matchpage/match-page-v3.ts` (+ 9 tests) — result, first-death rounds, rounds line,
  earliest first death, coach line, side-panel tab mapping.
- `src/views/VODReviewView.vue` — switch only (`MatchPageV3 v-if="uiV3"`, classic markup in `v-else`).

## Data (all real, from the injected review context)
- Score: `matchScoreline` (analysis → finalScore → round record). Result falls back to `finalStats.won`.
- K/D/A: `timeline.finalStats`. Rounds: `roundGroups` (won per round) + `roundRecord`.
- "You died first": own death events with `isFirstBlood` (built by `buildReviewEvents` from `firstBloods`).
- Coach sentence: AI `coachingDetail.verdict`, else `top_issue`; otherwise a plain fact
  ("You died first in N of M rounds. Your team won K of them.") labelled "From the match data";
  otherwise nothing. The classic view's templated fallback notes are not promoted to the headline.
- Primary action "Watch first death" = `seekToEvent` on the earliest own first death that has a video
  position; hidden when there is no video or no such death.

## Every classic action, where it lives in v3
| Classic command bar | v3 |
|---|---|
| Back | "← Back" link (header bar) |
| Rounds / Timeline toggle (B) | "Rounds"/"Timeline" tool (pressed = shown) |
| Map toggle | "Map" tab (only when spatial intel exists) |
| Notes toggle (+ coach feedback dot) | "Notes"/"Coach notes" tab with a "new" count while unread |
| Active round chip R# | selected bar on the rounds line |
| Trim | "Trim" tool (local VOD only) |
| Theater / Focus video / Restore panels (T) | same tool, same labels |
| Keyboard shortcuts (?) | "?" tool (aria-label) |
| Compare moments | secondary "Compare moments" button (workspace + video, as before) |
| Layout menu: Reset layout / Use classic layout | "Layout" tool menu (workspace only) |
| Try workspace | "Try workspace" tool |
| Cloud VOD actions, states, body, comparison, shortcuts overlay, trim modal | unchanged components inside the v3 shell |

## Gaps / for the lead
- Not seen with a real recording: no local recordings and no preview/fixture route for /vod-review.
  Verified by type-check, helper tests and the empty/error state screenshot only.
- `VodReviewBody` internals (player transport, round log, notes, minimap) are the classic components with
  a scoped v3 restyle via `:deep()`; they still use their own font sizes/colours inside. A deeper pass
  needs ownership of `src/components/vod-review/**`.
- `VodReviewStates` (loading/error) is the shared classic component (red "Retry" + boxed icon).
- Per-round "why" (round story / enemy habits / round review) needs data the renderer doesn't have yet.


## Round 3 — internals + comparison (agent-vod)
- 24 shared files got v3 branches/scoped blocks; every old branch untouched (`git diff origin/main --numstat` shows 0 deletions in these files).
- **Rebuilt markup (in-file `v-if="uiV3"`):** VodReviewStates (loading/error: label, t1 sentence, Retry + Go back), VodReviewShortcuts and VodComparisonSourcePicker (→ `UfDialog`), round log + match timeline sidebars, VodReviewBody chrome, DuelMomentCards, TacticalIntelBrief, AnalysisReviewDetails, VodDemoPendingPanel (CS2/Deadlock), VodComparisonAccess.
- **v3-scoped restyle only (W):** comparison workspace layout, VodWorkspaceCoach chat, divider, notebook, personal review, MatchRecapPanel, TimingComparisonPanel, MatchSavedReviews, CloudVodActions, VodLeagueScoreboard, minimap chrome.
- Comparison "Play both" now uses `.uf-btn-primary` (was a hand-rolled skew); old button kept in `v-else`.
- Type scale pass: removed off-role 14/17px in v3 rules (→ 15/16 roles).
- Behaviour: no script logic changed (video sync, seek, trim, source selection, access gating, coach chat, notes, demo attach all reuse existing handlers).
- **Not seen with real data:** this account has 0 recordings, 0 analyses, no mounted production VOD. Only the error state was screenshotted. Mounting a production VOD via DevView downloads data, so it was not done; the lead or user can mount one in DevView › VOD library to check the full page.
- For the lead: `src/components/rosters/RostersCoachPanel.vue` shows 258 deleted lines vs origin/main (agent-team's file, not this area); check that the old coach UI is still intact.
