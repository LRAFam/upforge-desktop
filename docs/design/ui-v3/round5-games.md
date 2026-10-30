# Round 5 — get every game toward 5/5

Source of truth: the Game Support Map (claude.ai artifact VLzLrxSB7VkgK6dV9nfcKH) and the research in
scratchpad/support/{valorant,cs2,deadlock,league}.md. Work the improvements in order (best value first).

## Where code goes (all uncommitted; user decides commits/deploys)
| Repo | Worktree | Branch |
|---|---|---|
| desktop | upforge-wt/rework | feat/ui-v3 |
| api | upforge-wt/api-fixes | fix/game-support-bugs |
| ai-service | upforge-wt/ai-fixes | fix/game-support-bugs |
Never edit /Users/adamdowning/Documents/GitHub/upforge/* (user's checkouts; ai main there is stale).

## Ownership (one agent per game; shared files → lead)
| Owner | Desktop | API | AI |
|---|---|---|---|
| agent-val | `electron/main/{match-data-payload,riot-local-api,valorant-*,round-replay*}.ts`, `src/components/v3/{home,postgame,practice}/**` (focus/round parts) | `MatchReportService`, `FocusService`, `ProcessVODAnalysis` (Valorant branches), `TrainingPlanService` | `routers/match_report.py`, `services/match_report_*`, `pipelines/valorant_desktop.py`, `services/moment_*`, `behaviours/valorant.yaml`, `intelligence/detectors/**`, `telemetry_fallback_coach.py` |
| agent-cs2 | `electron/main/cs2-*.ts`, `spatial/demo-*.ts`, `demo-clutch.ts`, `auth-manager.ts` (syncCs2Identity only) | `CS2*`, `Cs2*`, `ProcessCS2Demo`, `LeetifyCs2StatsService` | `routers/cs2.py`, `services/cs2_*`, `pipelines/cs2_desktop.py`, `services/faceit_*` |
| agent-deadlock | `electron/main/deadlock-*.ts`, `demo-timeline.ts` (Deadlock branch), `src/components/v3/games/**` (Deadlock parts) | `Deadlock*`, `ProcessDeadlock` | `routers/deadlock.py`, `services/deadlock_*`, `pipelines/deadlock_desktop.py` |
| agent-league | `electron/main/lol-*.ts`, `analyse-modules/lol.ts`, `vod-review/VodLeagueScoreboard.vue`, `src/components/v3/games/**` (League parts) | `Lol*`, `RiotLolService`, `ProcessLoLAnalysis` | `routers/lol.py`, `services/lol_*`, `pipelines/lol_*`, `knowledge/lol/**` |
Shared → lead (write the exact change you need in your notes): `config/tiers.php`, `config/games.php`, `preload/index.ts`, `src/env.d.ts`, `electron/main/index.ts`, `App.vue`, `v3.css`, base components, migrations touching shared tables (`users`). Per-game migrations in your own tables are fine (new timestamped files).
`src/components/v3/games/**` is shared by deadlock+league: split by file (`*Deadlock*` / `*League*` / `game-data.ts` sections) and re-read before every edit.

## Rules
- AGENTS.md applies. **False coaching claims: golden case under `tests/fixtures/coaching_claims/` first, `pytest -m claim_contract` fails, then fix.**
- Production is read-only (the dev app is signed into the user's real account). No deploys, no prod writes, no analyses requested.
- Use data we already fetch before adding sources. No new paid APIs.
- Tests: API `php artisan test --filter=<yours>` + full suite at the end (list unrelated pre-existing failures); AI `pytest` + `pytest -m claim_contract`; desktop `npm run type-check`, `npx eslint <files>`, `npm test`.
- Write `docs/design/ui-v3/notes-game-<game>.md` (rework worktree): what changed per improvement, tests, deploy order (API+AI+desktop), migrations, what's left, and a new honest 1–5 score per step with reason.

## Round 6 (same ownership and rules)
Decision (lead, user-delegated): **stats-only Valorant reports refund the credit** and still deliver the stats report, labelled "We couldn't review the video. Your credit was returned." Pricing/tier changes (Plus vs Free depth, legacy plans, demo retention caps) stay proposals in notes — do not change `config/tiers.php`/`config/games.php`.
Never switch the title-bar game in the running app (it saves the primary game to the user's real account).
Lead does: Deadlock "Review replay" wiring in electron/main/index.ts + MatchRowV3 hero labels.
