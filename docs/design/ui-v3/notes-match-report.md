# Match report (free, data-based, after every match)

## Audit (2026-10-30, main @ b4317c4 desktop / 9333617 API)
**What exists**
- **Valorant pipeline is live end to end.** Desktop `electron/main/match-report-sync.ts` uploads each recent Riot match (no video) → API `POST /api/match-report` (`MatchReportService::generate`) → AI `routers/match_report.py`: code-built `facts` (score, K/D/A, ACS, ADR, HS%, lobby rank, per-round rows, opening impact, deaths traded/untraded, buys, hit regions, buy matchups), 6 `metrics`, a `focus_suggestion`, and `notes` (headline / subline / next_action / positive, each a `NoteClaim` tied to a finding id, fact-checked; deterministic fallback when the AI check fails). Notes are capped per day by tier (`max_daily_data_notes`: free 1 · plus 5 · pro 10); history imports never get notes.
- **Every report is stored per match** in `match_metric_snapshots.report` (facts, metrics, notes, notes_source), with `account_puuid`.
- **What the app shows of it:** only the *latest* match's notes, cached locally (`focus-state.ts` → `latest`). Old dashboard focus card: headline + "Next game". v3 Home: coach sentence from `latest.report.notes`. v3 post-game pop-up: one coach line. Rounds line on Home from `latest.rounds`.
- **League:** free per-match focus metrics (`LolFocusMetrics`, `GET /api/lol/focus`) and the recent-matches summary; full stats coaching costs an analysis (`LolMatchCoaching`). **CS2 / Deadlock:** no free per-match report; stats come from a parsed demo / replay review.

**What was missing**
1. **No report screen at all** — neither the old app nor v3 ever showed a match's facts, the full notes, the focus check or next steps as one page. Only one sentence from the newest match.
2. **No way to read an older match's report** — the API stores every report but has no read endpoint (`POST /match-report` only; `GET /focus` returns metric history, not reports).
3. No link from post-game / Home / Matches / match page to a report.

## Product definition
**Match report** = the free, data-only coaching page for one match. No video, no credit. Contents: headline (result, score, the one thing that decided it = the checked headline note), facts (per game), focus check (hit/miss for this match), the coach notes, 1–3 next steps linked to drills, and a reserved slot for "Review a round" (hidden until round-review pricing is decided).
- **Valorant:** full report (facts + notes; notes subject to the daily cap — over the cap the facts still show and the page says notes return tomorrow).
- **League / CS2 / Deadlock:** "not supported yet" honest state for now, pointing to what exists (League stats coaching, CS2 demo stats, Deadlock replay review) on the match page.
**Where:** post-game pop-up "Open report" · Home coach block "Open report" · match page header link · Matches row action.

## Build (branch feat/match-report)
- API: `GET /api/match-reports` (recent, own, main account by default) and `GET /api/match-report/{matchId}` (own only) returning the stored report.
- Desktop: IPC `match-report:get` / `match-report:list`, `/report/:matchId` route with `MatchReportV3`, entry points above.

## League, CS2 and Deadlock (report-games)
Same screen, per-game facts; no AI, no quota, no new paid calls.
- **League** — API `GET /api/lol/match-report/{matchId}` (`LolMatchReport`): from the cached Match-V5 match + timeline: result, team kills (as the score), K/D/A, CS (+ per minute), CS at 10:00 vs the same-role enemy, gold vs lane at 15:00, deaths before 14:00 (with killer), kill participation, damage share, vision, control wards. Main and alt accounts; alt matches never count for the focus; focus check from the League focus.
- **Deadlock** — API `GET /api/deadlock/match-report/{matchId}` (`DeadlockMatchReport`): from deadlock-api match metadata (fields verified against Valve's `CMsgMatchMetaDataContents` protobuf): result, souls and lobby rank, souls at 10:00/20:00 vs the lobby and lane opponents (`assigned_lane`), soul orbs secured/denied (API `last_hits`/`denies`), hero damage rank, deaths before 10:00, time spent dead.
- **CS2** — desktop only, from the recording's parsed demo (`match_stats` v1, same shaping as the match page tabs). No demo yet → "This report needs the demo".
- **Key number + next steps** (`src/lib/match-report-games.ts`): rule-based from this match only, whole numbers, at most 3 steps, no outside benchmarks; label "The key number" (Valorant keeps "What decided it" for its fact-checked coach note).
- **Entry points:** Matches row "Report" and match page header "Match report" for all four games (`matchReportPath`). Post-game and Home stay Valorant-only (they don't have the other games' match ids at that moment).
- **AI notes for other games: not added.** No cheap fact-checked notes path exists for them yet (League stats coaching is a paid analysis); facts + rule-based steps instead.
- **Deploy:** API first (two new GET routes, no migrations), then desktop.

## AI coach notes for League, CS2 and Deadlock (2026-10-30)
The other games' reports now get the same kind of checked coach notes as Valorant.
- **AI** (`upforge-ai-service`, branch feat/match-report, `services/game_match_notes.py` + `POST /api/game-match-notes`): facts → named findings with the numbers each may use → Claude (same cheap notes model as Valorant, `CLAUDE_MODEL_MATCH_NOTES`, default `claude-haiku-5-5`) writes headline, subline, 1–3 evidence lines, one next-game action and one strength. Context: that game's knowledge base (per-game registry), rank, active focus, and the player's recurring habits for THIS game only (other-game habits are dropped before the prompt).
- **Guards** (golden cases `tests/fixtures/coaching_claims/game_match_notes.json`, written first): every number must be in the cited finding (plus 0, 1, the 3-game goal and the 10/14/15/20 minute marks); other-game vocabulary (the high-confidence lists in `game_vocabulary.py`) rejects the note; benchmark phrasing with numbers not in the facts rejects it; hype words reject it. One retry with the problems, then failing fields are repaired from deterministic notes.
- **Cost** (estimated from the fixtures with the repo's price table, not a live run): ~2,000 input tokens (rules + fact sheet + capped 6,000-char KB) and ~450 output → about **$0.0004 per match**, ~$0.0009 when a retry is needed. Logged per batch as `game_match_notes_cost`.
- **API** (branch feat/match-report): `POST /api/lol/match-report/{id}/notes`, `POST /api/deadlock/match-report/{id}/notes`, `POST /api/cs2/match-report/notes` (facts from the parsed demo, validated, ≤20 KB), `GET /api/cs2/match-report/{key}/notes`. Notes stored once per player and match in `game_match_notes` (migration `2026_10_31_100000`). One shared daily cap with Valorant (`max_daily_data_notes`: Free 1, Plus 5, Pro 10); past the cap the report gets free deterministic notes and nothing is stored, so the first open tomorrow can still get AI notes.
- **Desktop**: the report shows the facts first, then "Your coach is reading this match…" while notes load; AI notes become "What decided it", evidence lines, the first next step and "What went well". Capped: the existing "Today's free coach notes are used" line.

## Starting report (first join, per game) — 2026-10-30
Owner's model from the first 100 signups (6 long-term subscribers): when a player joins, read their last matches and show "how you play right now", then keep them going with a match report after every game.
- **What it is:** one AI read of the player's last 3–10 matches per game: 1–3 summary sentences, 2 strengths, 2 habits costing games (each "X of N matches"), the first focus (one of that game's focus metrics), and what happens next ("your next matches get coached automatically"). Generated once per player and game, stored; regenerated only when the last one used fewer than 3 matches and 5+ now exist (admins can force). **Not** counted against the daily notes cap.
- **Data per game (existing paths only):**
  - Valorant: the stored match reports (`match_metric_snapshots.report`, main account) the desktop already syncs from the Riot client history → metrics (opening deaths, trades, zero-damage rounds, head hits, ACS, ADR) + flags.
  - League: Riot Match-V5 recent matches (Solo/Duo, Flex, Normal Draft) via `LolMatchReport` (deaths, CS at 10:00, vision/min, kill participation, damage share; early deaths, CS/gold vs lane).
  - Deadlock: deadlock-api match history + metadata (max 8 matches = 8 cached calls) via `DeadlockMatchReport` (souls, orbs secured/denied, early deaths, time dead, damage rank; lane and lobby comparisons).
  - CS2: only demos parsed on this PC (desktop sends match_stats v1 for up to 10); fewer than 3 → "needs 3 matches" state.
- **Aggregation in code** (AI service `services/starting_report.py`): averages with match counts, best/worst, "X of N matches" patterns with wins/losses in those matches, agent/champion/hero/map pool, record, rank (League).
- **AI:** `POST /api/starting-report`, same cheap notes model; guards: every number must be in the cited aggregated finding, habits must say "X of N", per-game vocabulary, no unsourced benchmarks, no hype, focus must be a focus metric of that game; golden cases `tests/fixtures/coaching_claims/starting_report.json` (written first). One retry, then a deterministic fallback.
- **Cost:** ~2,100 input / ~900 output tokens → about **$0.0007 per report** (~$0.0013 with a retry), estimated with the repo's price table; logged as `starting_report_cost`.
- **Focus:** the report suggests a target (a small step past the player's own average: shares −40% or +15 points, counts −20% / +10%). "Start this focus" (Valorant, League — the games with a focus loop) starts it via the existing focus service, only when no focus is active. Deadlock/CS2 show the first focus as advice only.
- **API (branch feat/match-report):** `GET/POST /api/starting-report/{game}`, `POST .../dismiss`, `POST .../focus`; migration `2026_10_31_110000_create_starting_reports_table`; funnel event `starting_report_generated`.
- **Desktop:** `/starting-report/:game` screen; a "Your starting report" card at the end of onboarding (step 5, "Reading your last 10 matches…" while it's written) and on Home during the first week until hidden; "Your starting report →" on Progress. Generation is attempted at most once per game per app session.
