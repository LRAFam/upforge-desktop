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
