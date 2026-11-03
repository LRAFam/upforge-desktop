# Game data capture (diagnostics)

Purpose: record the **raw** live data UpForge receives during one real CS2 or Deadlock match, so the
CS2/Deadlock rebuild is based on evidence, not guesses. Answers the open questions in
`upforge-wt/data-research/docs/research/cs2-deadlock-data-sources-2026-11-03.md` §5.

Off by default. Hidden in **Settings › Advanced › Game data diagnostics**, or set
`UPFORGE_CAPTURE_GAME_DATA=1` before launching the app. It captures the **next** CS2 or Deadlock match,
then turns itself off. Files stay in `%APPDATA%\upforge-desktop\diagnostics` and are never uploaded.
They contain the owner's Steam ID (and in-match player names).

## Owner steps (Windows)

**CS2 (Premier, ideally a second capture in Wingman)**
1. Settings › Advanced › turn on "Save raw game data for the next match (diagnostics)".
2. Fully quit and restart CS2 (the all-components GSI cfg only loads on start).
3. Play one match to the end; stay on the scoreboard ~1 min, then go back to the main menu.
4. Close CS2 and leave UpForge open ~15 min (the app's demo lookup only works with CS2 closed).
5. Open diagnostics folder → send every file named `*-<number>.*` from that match.
6. Restart CS2 once more so it goes back to the normal cfg.

**Deadlock**
1. Steam › Deadlock › Properties › Launch options: add `-condebug` (needed for console.log).
2. Turn the switch on, start Deadlock, play one match.
3. Leave UpForge open ~45 min after the match (3 deadlock-api checks at +5/+20/+45 min).
4. Send the files; remove `-condebug` afterwards if you like.

## Files

| File | What |
|------|------|
| `gsi-<start>.jsonl` | Every CS2 GSI POST body: `{ receivedAt, body }` (first lines `preMatch: true` = last 20 bodies before going live) |
| `deadlock-signals-<start>.jsonl` | Deadlock signals the watcher reads: Steam httpcache salts, `.dem.partial` size, match start/end |
| `deadlock-console-<start>.log` | console.log bytes written during the match (needs `-condebug`) |
| `deadlock-match-<start>.json` | Match metadata the app fetches via UpForge API `/api/deadlock/match/{id}` (proxied, not raw deadlock-api) |
| `deadlock-api-metadata-<start>.json` | Raw `api.deadlock-api.com/v1/matches/{id}/metadata` (capture-only, ≤3 calls) |
| `after-<game>-<start>.jsonl` | After-match observations (Valve demo lookup, demo parse time, local demos, CDN/API checks) |
| `summary-<game>-<start>.json` | Components seen, counts, first/last timestamps, non-empty counts, and `answers` keyed by §5 question number |
| `capture-state.json` | Switch state + last summary |

## How each §5 question is answered (`summary.answers`)

| Q | Source |
|---|--------|
| 1 | own `player.position` while `player.steamid == provider.steamid` and health > 0; distinct positions / changes |
| 2 | `bomb` block counted by own `player.team` (T/CT), with/without `position` |
| 3 | `map.round_wins` reason strings |
| 4 | `phase_countdowns` presence + phases |
| 5 | `allplayers` / `grenades` non-empty while alive vs dead-or-spectating |
| 6 | bodies where `player.steamid != provider.steamid`; delay from own death to switch; provider id stable |
| 7 | gaps between POSTs (median/p95/max), gaps > 2 s while round live, posts per round. Throttle 0.2 (buffer 0.1) during capture; compare with a normal capture for 0.5 |
| 8 | per kill: `match_stats.kills`, `state.round_kills`, `state.round_killhs` deltas + active weapon |
| 9 | kill wall-clock times (`receivedAt`, `provider.timestamp`) — compare with demo ticks offline |
| 10 | times of the **app's own** Valve GC lookups (normal retry schedule) — share code not observable |
| 11 | demo size + worker parse time from the app's own parse |
| 12 | `.dem` files modified since match start, checked 2 min after the end (ten players needs offline parse) |
| 13 | console.log written? line tags + keyword counts (kill/death/souls/item/start/end) with samples |
| 14 | not observable (the app doesn't read rich presence) |
| 15 | replay salt time, deadlock-api metadata attempts, Valve CDN HEAD — measured from last `.dem.partial` growth |
| 16, 17 | not observable in one session; data saved for offline checks |

## Design notes / limits

- CS2 cfg: while armed, `gamestate_integration_upforge.cfg` requests all 17 components, throttle 0.2 (buffer 0.1),
  buffer 0, heartbeat 5. Restored to the normal (byte-identical) cfg when capture ends or is switched off.
  CS2 must restart to load either.
- CS2 capture starts on the first live/warmup body, ends when the map block disappears (back to menu),
  60 s after `gameover`, or after 5 min of GSI silence. The in-match Esc menu (`player.activity=menu`) does not end it.
- Size guard: 200 MB per capture (stopReason `size-limit`).
- **No extra Valve GC calls**: the GC lookup (boiler) refuses while CS2 is running and would collide
  with the app's own demo download, so Q10 is timed from the app's own attempts only.
- deadlock-api: max 3 unauthenticated calls per capture (limit is 3/hour); Valve CDN: max 3 HEADs.
- Not fixed here (known from research): the Deadlock GSI cfg path is wrong, and the console-log reader is
  never called. Capture only.

Code: `electron/main/game-data-capture.ts`, `game-data-capture-answers.ts`, `ipc/game-data-capture-ipc.ts`,
`src/components/settings/GameDataCaptureSection.vue`. Tests: `game-data-capture.test.ts`, `steam-gsi-cfg-capture.test.ts`.
