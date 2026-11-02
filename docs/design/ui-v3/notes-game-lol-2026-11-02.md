# League pass — 2 Nov 2026 (agent: League)

Audited every v3 screen with League selected (`gameshot.sh League …`, read-only), on the real account.
Account facts: no League Riot ID linked; League falls back to the Valorant Riot ID `LRAFam#1337`
(the API does the same in `User::lolPuuid()`). Riot returned 0 coachable games (Solo/Duo, Flex,
Normal Draft) in the last 20, rank null, 0 analyses, 0 League recordings. So every League screen
here is an empty state; populated layouts were checked in code, not on screen.

## Findings

| # | Screen | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | Home, Progress | Shows `LRAFam#1337` as the League ID with no hint it's the Valorant ID, while Settings says League isn't linked | High (players get stuck) | **Fixed**: "LRAFam#1337 · your Valorant Riot ID" + "Link League Riot ID →" (Settings deep link) |
| 2 | Home, Progress | "No ranked matches loaded yet" — wrong (Flex and Normal Draft count too) and no next step | High | **Fixed**: names the Riot ID, the coached queues, the last-20 window, and what to do (link a different ID / ARAM not coached) |
| 3 | Practice | League players saw the *Valorant* focus ("Opening deaths in the first 10s"), Valorant VOD drills (Empress, Operator) and a Valorant drill title as "Today's session" | High (Valorant-only copy) | **Fixed** (League-only): those hidden; one line says these are shooter aim drills and League drills come with Riot stats coaching on the match page |
| 4 | Progress header | "61 games checked" = Valorant focus history shown under League | Medium | **Fixed** for League (now "0 analysed matches in this range"). Same bug for CS2/Deadlock — see lead ask |
| 5 | Home, Progress | Raw API status (`processing`, `pending`) on Riot report rows; "Syncing" jargon | Medium | **Fixed**: Ready / Being written / Waiting for Riot match data / Failed (`lolAnalysisStatus`) |
| 6 | Home, Progress | No ranked emblem; no champion portraits on report rows | Medium | **Fixed**: communitydragon emblem when a rank exists; ddragon champion icons on rows |
| 7 | Progress | Recent games: only Won + champion + KDA, not clickable | Medium | **Fixed**: champion portrait, KDA, role, duration, CS/min, vision (when sent), queue name; row opens the free League match report (`/report/<id>?game=lol`) — previously reachable only from a recording |
| 8 | lib | `lolQueueLabel(440)` returned "Queue 440"; `mapLolToAnalysisItem` said "LoL" for non-Solo/Duo | Low | **Fixed**: Ranked Flex, Normal Draft, ARAM, Arena… else "Other mode" |
| 9 | Matches (League filter) | Note headline "…without Riot account verification." reads like an error | Low | **Fixed**: "League recordings play here even before your Riot ID is linked." |
| 10 | Settings › Account | League row didn't say the Valorant ID is being used | Medium | **Fixed** (League row only) |
| 11 | Home | Stats skeleton stayed up for every slow Riot refresh even with cached data | Low | **Fixed**: skeleton only on a first-ever load |
| 12 | useGameData | Read the Riot ID from `profile.get()`, which returns null for this account (usage-field check) → League looked unlinked on cold loads | Medium | **Fixed**: falls back to `auth.getUser()` |
| 13 | Match page / Reviews | League panel (`LolMatchCoaching`) — the old TODO | — | Already mounted (VodReviewBody + ReviewDetailV3). Scoreboard has champion portraits. Not seen on screen (no League recordings) |
| 14 | Clips | "No LoL clips on this PC yet" vs "League" elsewhere | Low | Not fixed: comes from shared `lib/games.ts` `shortLabel: 'LoL'` (lead) |
| 15 | Squad, Coaches | Valorant ranks/agents/maps on League | — | By design (cross-game); not League-specific |
| 16 | Onboarding | Step 2 shows only the primary game (Valorant); no League Riot ID step | Low | Not changed (onboarding owner); League link lives in Settings |
| 17 | Score | Stats score null for League by design | — | Unchanged; coach rating path untouched |

## Files changed (desktop)
- New `src/lib/lol-display.ts` + `lol-display.test.ts` (4 tests).
- `src/lib/lol.ts` (queue labels), `src/lib/lol-analyses.ts` (game mode label).
- League branches only: `components/v3/games/useGameData.ts`, `GameHomeSummary.vue`, `GameProgress.vue`.
- League-conditional one-liners: `views/v3/PracticeV3.vue`, `views/v3/ProgressV3.vue` (count line), `views/v3/MatchesV3.vue` (note), `components/settings/SettingsAccountLinks.vue` (League row text).

## Asks / gaps
- **Lead:** Progress count line uses Valorant focus history for CS2/Deadlock too: `progressCountLine(focusData && !demoGame ? … : null, …)` would fix all three (I scoped mine to League).
- **Lead:** `lib/games.ts` League `shortLabel` 'LoL' → 'League' for consistent copy.
- **API (bigger):** `fetchLolRecentMatches` swallows errors, so "Riot unreachable / not linked (422)" looks like "no games". Return an error kind from `/api/lol/matches/recent` → desktop could show "Couldn't reach Riot" honestly. Needs a contract change on an existing IPC.
- **Data still unused on desktop rows:** items, summoner spells, profile icon (Match-V5 has `item0-6`, `summoner1Id/2Id`, `profileIcon`); recent-match summary doesn't carry them. Small API addition to `summarizeMatch` if wanted.
- Populated League screens couldn't be checked on screen (this account has no League games).

## Checks
- `npm run type-check`: clean.
- `npx eslint` on all changed files: clean.
- `npx vitest run`: 370 files, 2224 passed, 9 skipped.
