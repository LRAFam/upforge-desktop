# Recent-match coaching PoC

This PoC exports the last ten Valorant matches from Riot history through
**Developer → Tools → PoC: Save Recent Matches**, without requiring a recording.
The exporter uses the same data-quality policy as Valorant coaching uploads.

## Pull and inspect on a Mac

From your existing `upforge-desktop` checkout, with your own work saved:

```sh
git switch main
git pull --ff-only origin main
node scripts/verify-bind-poc.mjs
```

Use Node.js 22, matching CI. The offline check uses Node built-ins and needs no
dependency installation, Electron, Riot login, network access, OBS or video.
It checks the bundled file's content hash and internal consistency, then prints
the verified match totals and coaching review points. It does not contact Riot
or constitute a new independent source audit.

To run the development app:

```sh
npm ci
npm run dev
```

Restart an already-running app after pulling so the main process and preload
contain exporter version 3. The current Riot authentication implementation reads
a Windows Riot Client lockfile; **fresh history fetching is Windows-only in this
implementation**. On macOS, use the bundled JSON and offline check for analysis
and further development. The app does not automatically import this example into
the Developer table.

## Included example

- [verified-bind.json](verified-bind.json): the complete, unchanged schema-3
  export for `2242fe8e-0d68-4da5-9ab7-4cf0082a2b18`.
- [bind-source-audit.json](bind-source-audit.json): source-audit provenance,
  the Bind results and a content hash that ignores JSON whitespace/line endings.
- [bind-coaching-example.md](bind-coaching-example.md): a sample report based
  only on these verified facts, with suggestions distinguished from findings.

The export was generated on 23 October 2026 at 01:02:49 BST and audited against
fresh Riot match responses at 01:05:28 BST. The full audit covered ten matches,
55,194 assertions and 1,188 replay frames with no mismatches. Bind accounts for
185 of those frames and 1,216 player-position entries. The audit file explicitly
separates the ten-match totals from the included Bind result.

This is real match data included at the account owner's request. It retains
`LRAFam#1337`, player PUUIDs, match IDs and timestamps for attribution. The file
contains no Riot authentication tokens, lockfile credentials, video or local
Windows paths. The other players' account names were not provided by Riot.

## Data contract for coaching

- Export schema is **3**; `roundReplay.schemaVersion` is **2**.
- Join players by PUUID. The local name/tag come from the authenticated account
  when absent from the match record; `dataQuality` records that provenance.
  Agent labels are not other players' account names.
- `finalStats`, `playerKills` and `playerDeaths` describe the local player.
  `killEvents`, objectives and `firstBloods` describe the entire match. Check
  `eventScopes` rather than treating every event as the user's action.
- `game_start_time_ms` is an epoch timestamp. `EventTime` uses seconds since
  match gameplay start; replay `t` uses milliseconds since that start and `rt`
  uses milliseconds since round start. Export round numbers are zero-based.
- `hasRecording` is false. Recording timestamps are null and video seek offsets
  are omitted. Position `v` is view direction; frame-level VOD `v` is absent.
- Replay positions are event snapshots. `alive` describes the state immediately
  after that event: weapon killer/objective actor true, kill victim false,
  otherwise null. `aliveSource` explains the evidence. Ability kills may occur
  after death, and prior deaths do not establish current state after respawns or
  resurrection. There is no continuous movement or visibility reconstruction.
- Null means unknown or inapplicable, never zero. Skirmish damage/HS values stay
  null when absent. Deathmatch total score is separate from competitive ACS.
  Headshot percentage is a share of recorded hits, not shot accuracy.
- Ability casts are reported match totals. They do not establish cast timing,
  remaining charges or utility effectiveness. Missing round-end/objective times
  are not estimated.
- Trade/untraded flags and death callouts (`event.spatial`, `spatialSummary`)
  are kept: they come from Riot kill timing and positions (a teammate kills
  your killer, or an enemy within 25 m of your death, within 3 s). Check
  `dataQuality.capabilities` (e.g. `tradeAndIsolationJudgments`) and
  `limitations` before drawing conclusions. Inconsistent source facts block an
  export and are stripped from the shared coaching payload.

Each live export has its own directory and a latest `summary.json` under the
app's `poc-recent-matches` user-data directory. **Open saved files** opens the
current directory; **Copy result** or the selectable JSON text exposes its
summary. The latest schema-3 report is restored after restarting.

## Validation

```sh
node scripts/verify-bind-poc.mjs
npm run type-check
npx vitest run electron/main/recent-match-export.test.ts electron/main/round-replay.test.ts electron/main/match-data-payload-round-replay.test.ts electron/main/coaching-facts.test.ts electron/main/valorant-recording-offset.test.ts electron/main/riot-match-history.test.ts electron/main/match-details-validation.test.ts electron/main/riot-event-time.test.ts
npm run build
```

The eight focused test files contain 51 passing tests. The Windows full-suite run
also recorded 1,109 passes, two skips and four failures in unchanged tests:
`obs-crash-sentinel.test.ts` (POSIX path expectation),
`obs-recording-exclusions.test.ts` (two POSIX path expectations), and
`replay-upload-path.test.ts` (Windows symlink permission). These are separate
from the PoC source audit and focused tests. macOS execution has not been tested
from this PC.
