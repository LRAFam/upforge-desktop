# Audit fixes — Squad (/squad) and Coaches (/rosters), 2 Nov 2026

Squad and Coaches stay separate (rulebook "Squad vs Coaches"). The only shared code is the new
generic `src/lib/player-art.ts` (player card / agent portrait / rank line).

## Changed files
- `src/lib/player-art.ts` + `player-art.test.ts` (new): `playerCardSmallArt`, `playerAvatarArt` (card → agent portrait → null = letter), `playerRankLine` (rank + main agent + rank icon).
- `src/views/v3/SquadV3.vue`, `src/views/SquadView.vue`, `src/components/v3/squad/squad-format.ts` (+test), `src/components/squad/SquadMemberPanel.vue` (type only: `player_card_id`).
- `src/views/v3/RostersV3.vue`, `src/views/RostersView.vue`, `src/components/v3/coaches/CoachRosterV3.vue`, `RosterMatchRowV3.vue`, `coach-format.ts` (+test), `src/components/rosters/coach-roster.ts` (types only).

## What changed and why
1. **Squad data.**
   - **"No rank yet":** the cause was in the desktop app. Member rows read `team.members[].rank`, which `/api/teams/my-team` never sends. `/api/teams/stats` already had `current_rank`, `most_played_agent` and `player_card_id`. Rows now use those.
   - **Win rate:** `pctLabel` returned null for the API's string decimals (`"60.00"`), so the member detail showed "—". It now converts strings to numbers.
   - **LRAFam "—" in Member compare:** today's data shows 60%, so that row was correct when re-checked. The earlier "—" came from the API's main-account snapshot (`TeamController::stats`). It can't be reproduced now.
   - **Labels:** "Most active this week" was counting all-time analyses (`TeamController::leaderboard`, no date filter). That list repeated Member compare exactly, so I removed it. Compare now says "Analyses (all time) · win rate (last 20 matches)". The win rate comes from `ValorantPlayerSnapshotService::aggregateStoredMatches`, which uses the last 20 matches.
   - **"Matches this week" → "Analysed this week":** it counts analyses in the 7-day window of the activity sample. It shows "N+" when the whole sample falls in that window.
2. **Avatars:** Squad members now show the player card, then the agent portrait, then the letter. Rank icon + rank · main agent added (Tappss has no stats, so he keeps the letter and "No rank yet").
3. **Squad activity:** rows now show map thumbnail + agent portrait (same look as the match rows). The list shows 6 rows, with "View all N" to expand in place.
4. **Squad header:**
   - One H1 (the squad name) with a one-line subtitle. A "recording now" note appears only while someone is recording.
   - Removed the swap icon. It was a refresh button, and the view already polls every 30 s.
   - Removed the `uf-refreshing` line from the header (that was the "stray rule").
   - Roster wording removed from the squad subline.
5. **Invite:** the field is now hidden behind one "Invite a teammate" button. The field focuses when it opens; Esc and Cancel close it.
6. **Coaches:**
   - "Roster open" now uses the shared `.uf-switch` (bone when on) with `aria-labelledby`.
   - Refresh button removed. RostersView (v3 only) now refreshes quietly every 60 s while the window is visible, as well as on window focus.
   - Subtitle is now "Review the matches your students send you."
   - The empty-queue text says "Coaches", not "Rosters tab".
7. **Review limits:**
   - **8** = `roster_reviews_limit`: the whole roster's monthly cap on the free coach plan (`config/coach_hub.php` `limits.community.max_roster_reviews_per_month`; Coach Pro has none). Now shown as "0/8 · Reviews this month · All students · free coach plan cap".
   - **3** = what each student gets per month (`roster_included_reviews_per_month`). Now shown as "Free membership · 3 reviews per student a month".
8. **Roster member rows:** now show membership tier, without repeating the "open" count. Rank, main agent and art show when present. **The API doesn't send them yet** (see Left).
9. **Width:** removed `max-width: 1240px` from both screens, so they fill the window like Practice (40px side padding).
10. **Roster match rows (v3):** now show the UpForge score out of 1000 via `upforgeScore(rosterScoreOutOf100(overall_score))` with the tone colour. No letter grade. The legacy `RosterMatchRow.vue` (non-v3) is unchanged.

## Verified
- `npx vitest run src/lib/player-art.test.ts src/components/v3/squad src/components/v3/coaches src/components/rosters src/components/v3/roster-flow` → 30 passed. Also ran shell-v3, deep-link-route and marketplace tests: all pass.
- `npx eslint` on every changed file → clean.
- `npm run type-check`: no errors in my files. The errors left are in files other agents are editing: game-data, home-v3, practice-v3, MatchPageHeaderV3, VodReviewBody.
- Screenshots (read-only, nothing clicked): `scratchpad/shots/agents/squad-after-*.png`, `squad-after3-1.png`, `rosters-after-1.png`.

## Left (needs upforge-api, not edited)
- **Roster member rank / main agent / card:** `CoachRosterController::buildStudentAggregate` (app/Http/Controllers/API/CoachRosterController.php ~L405) sends only name and Riot ID. Fix: add `current_rank`, `most_played_agent` and `player_card_id` from the student's latest main-account `ValorantStatsSnapshot`, using the same lookup as `TeamController::stats`. The desktop already renders them once they exist (`RosterStudent` optional fields).
- **Squad activity score/result:** `TeamController::activity` (~L383) selects only id/map/agent/player/share_token/created_at. To show a result and UpForge score on activity rows, add `overall_score`, `won`/`rounds_won`/`rounds_lost` from `AnalysisLog`. The API also ignores `?limit=20` (always 30), so the weekly count can only be a floor.
- **Leaderboard:** `TeamController::leaderboard` has no date window. If a "this week" leaderboard is wanted, it needs a `created_at` filter.
