# Player identity — one avatar/banner/rank system (2 Nov 2026)

## Research: what identity art exists, and where its id comes from
| Game | Art | Source of the id | Signed-in user | Other people |
|---|---|---|---|---|
| Valorant | Player card small (avatar) / wide (banner) / large — `media.valorant-api.com/playercards/{id}/{small,wide,large}art.png` | snapshot `stats.player_card_id` (Henrik `card`) | `profile.latest_stats.player_card_id`, `account_level`, `current_rank`, `most_played_agent` | Squad (`TeamController` member stats) ✔ · Students (`CoachRosterController::buildStudentAggregate`, card always, rank/agent only with `share_skill_profile`) ✔ (uncommitted on API branch) · Trainer leaderboard ✔ (`player_card_id`, `current_rank`) · Coaches: **added** (below) |
| Valorant | Rank icon `competitivetiers/{uuid}/{tier}/smallicon.png` | rank text or numeric `competitiveTier` (match scoreboard) | yes | yes where rank is sent |
| Valorant | Player title (`/v1/playertitles/{id}`) | **not stored anywhere** (snapshot keeps card only) | — | gap |
| League | Profile icon (CommunityDragon `profile-icons/{id}.jpg`), ranked emblem (CDragon), summoner level | **profile icon / level not stored**; rank via LolRankService | rank only | gap |
| CS2 | Steam avatar; FACEIT level badge (bundled `assets/ranks/faceit`), Premier rating | Steam avatar **not stored** (only fetched for Deadlock player search, not persisted); FACEIT level ✔ | FACEIT/Premier | gap |
| Deadlock | Steam avatar; rank badge (bundled) | Steam avatar not stored | rank | gap |
| Coaches | `avatar_url` / `banner_url` upload | Coach model | — | all prod coaches have both null today; `main_agents` set |

CSP: Steam avatar host NOT added (no data to show). CommunityDragon already allowed.

## Built
- `src/lib/player-identity.ts` (+ `player-identity.test.ts`, 9 tests): `playerIdentity(person)` → `{ name, initial, avatar, avatars[], banner, rankIcon, rankLabel, title, level }`, null when unknown.
  Avatar chain: uploaded https photo → Valorant card → agent (or coach's first main agent) → League profile icon → letter. Card/agent only when the game is Valorant.
  Rank: Valorant accepts coach-typed short forms ("Immo 3", "Asc 1", "immortal 3") and numeric tiers; tier without division → label only (no guessed icon). League emblem (not for Unranked); CS2 FACEIT badge → "Premier 15,230" label → Valve skill group; Deadlock bundled badge.
  Also exports `valorantCardArt`, `valorantTierIcon`, `valorantRankIcon`, `normaliseValorantRank`, `leagueProfileIcon`. `player-art.ts` untouched (exports still work; no v3 caller left except legacy).
- `src/components/v3/identity/`: `PlayerAvatar.vue` (24/32/48/72, 2px radius, steps down the chain on image error — e.g. a CSP-blocked photo host — letter last; `badge` = rank icon corner), `PlayerBanner.vue` (wide art, left scrim, no box when there's no art), `RankIcon.vue`.

## Applied
- Title bar: 24px avatar + name (`TitleBarV3` new `avatar` prop; `App.vue` keeps `latest_stats`). Letter on non-Valorant games.
- Settings › Account: banner (wide card) behind the profile block, 72 avatar, "Platinum 2 · Level 591" with rank icon. Unused `.uf-profile-avatar*` CSS removed.
- Squad: members 48 + rank icon; member compare 24; activity rows 24 avatar next to the member name (map art + agent kept — they're the match's).
- Coaches: your coaches 48 (photo → card → main agent → letter) + rank icon via the shared normaliser; Find a coach list 48 + rank icons (now shows for "Immo 3"/"Asc 1"), profile panel = PlayerBanner (once per screen) + 72 avatar; Join row (invite lookup) same.
  Hairlines removed: under "Your coaches" label (first row) and under "Send a match" (blocked sentence).
  "10/10 student" = astar's free-text session note (`coach_notes`), not a rating → now "astar's note: 10/10 student".
- Students: rows 48 + rank icon.
- Practice › Leaderboards: 32 avatar with rank badge per row and on the "You" row.
- Onboarding "signed in as": 48 avatar with rank badge. Unused `.ob3-avatar*` CSS removed.
- Match page scoreboard (v3 branch of `VodReviewBody.vue`): rank icon from `competitiveTier` before the rank name. No player cards — the team snapshot has none.
- Home rank strip: uses `valorantRankIcon` (same normaliser). Post-game: no player list exists, nothing to change.

## API (feat/upforge-score-and-audit-data)
- `Coach::playerCardIdsForUsers()` (2 queries, newest snapshot that has a card).
- `player_card_id` added to `GET /api/coaches` rows, `GET /api/coaches/{id}`, `GET /api/coaches/{id}/hub` (+ `main_agents`), `/api/coach/my-coaches` + `/api/coach/student-hub` coaches (+ `main_agents`). Same precedent as the creator page (card = avatar fallback); card is cosmetic, no skill data.
- Test: `tests/Feature/CoachPlayerCardTest.php` (4).

## Seen live (prod, read-only)
Title bar card ✔, Settings banner/rank/level ✔, Squad members/compare/activity ✔, Find a coach agents + rank icons ✔, Leaderboard You-row badge ✔. Coach player cards and student cards need the API deploy (prod doesn't send them yet → letters/agents shown honestly). Leaderboard players have no snapshots → letters.
Shots: `scratchpad/shots/agents/id-{coaches,settings,squad-1,squad-2,find,lb,students-2}-1.png`.

## Gaps
- Player title: not stored. Needs `player_title_id` saved in the snapshot (Henrik v2 account) + valorant-api lookup.
- League profile icon + summoner level: not stored (LolAccountService could save `profileIconId`/`summonerLevel`).
- Steam avatar (CS2/Deadlock): not stored; when it is, add `https://avatars.steamstatic.com` (+ akamai) to `index.html` img-src and pass `avatarUrl`.
- Squad/Students rows don't send account level; fine (not shown).

## Verify
`npm run type-check` clean · `npx eslint` on all changed files clean · `npx vitest run` 367 files / 2210 tests pass · API `--filter=CoachPlayerCardTest` 4/4, full suite 1264 passed, 1 known failure (AdminGrowthTargetsTest).
Note: a mid-edit syntax error briefly blanked the dev renderer; recovered with `location.reload()` under the shot lock.
