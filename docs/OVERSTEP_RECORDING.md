# Overstep native match API for UpForge

Updated 1 October 2026. The integration supplies native match facts and recording decisions to UpForge. The game is the source of truth for combat and results; OBS supplies video timing. This implementation is local to the game and UpForge Desktop. It is not a public player lookup service or a server-authoritative multiplayer API.

## Match lifecycle and recording policy

Enable the Overstep integration in UpForge, then select which modes should record video: Circuit, Crosscurrent, both, or neither. Integration enablement and mode policy survive desktop restarts. Policy changes apply to new matches; an unchecked mode still exports match statistics.

The game sends `match_preparing` after spawning the match, before advancing the initial countdown. UpForge chooses recording or stats-only from the saved mode policy. It acknowledges every accepted event batch with `captureState`: `starting`, `recording`, `skipped`, or `failed`. The game continues sending events while preparation is pending. A `recording` acknowledgment requires OBS startup and a measured video-clock anchor.

Only after the decision does the game emit `match_started` and advance the full three-second countdown. Preparation is limited to 15 seconds: on timeout, gameplay proceeds and the start event explicitly records `timeout`. A late recording is never reported as covering the start. Recorder failure does not discard match stats or stop someone else's recording. Missing-video and clock-continuity failures remain explicit.

OBS capture requires the Windows desktop app and OBS Studio 30.2 or later. The current Development game package uses `Overstep.exe`. Actual Windows capture, audio and frame alignment still require hardware acceptance testing. The desktop integration is included in v2.14.3.

## Authentication and discovery

UpForge writes an ephemeral loopback port and random 64-hex-character token to `~/.upforge/overstep-bridge.json` (`%USERPROFILE%` on Windows). Every endpoint requires `Authorization: Bearer <token>`. Browser Origin requests are rejected. The service binds only `127.0.0.1`; discovery is restricted to the local user on supported filesystem permissions. Do not expose this service publicly.

The game exports schema version 2, build `overstep-2026-09-30`, ruleset `local-3v3-v1`, map revision, mode, match UUID, six participant slots with teams and human/bot roles, and `localProfileId`. That profile UUID persists in `Saved/UpForge/profile-id.txt`; it identifies this installation's local player, not an authenticated online account. Bot slots are match-local. Authority is explicitly `local`.

Native files: `Saved/UpForge/<match-id>/manifest.json` and `events.jsonl`. Desktop files: app-data `overstep-sessions/<match-id>/` and `overstep-recordings/`. `-UpForgeTelemetry` explicitly enables offline native export without a running desktop. An offline export does not wait for a recorder. Version 1 evidence is preserved on disk but not interpreted as complete version 2 statistics.

## API routes

- `POST /events`: `{manifest, events, sentAtMs}`; at most 128 events per batch. Returns `{accepted: true, captureState}`. Exact retries are idempotent. Gaps, conflicting duplicates, manifest changes and events following completion are rejected.
- `GET /v1/capabilities`: schema, modes, weapon IDs, headshot definition and preparation timeout.
- `GET /v1/recording-policy`: returns `{recordedModes: ["circuit", "crosscurrent"]}`.
- `PUT /v1/recording-policy`: replace the policy with the same shape. An empty array collects stats without video. Unknown or repeated modes are rejected.
- `GET /v1/matches`: stored match summaries with participant and weapon statistics.
- `GET /v1/matches/<match-id>`: one match summary, or 404.
- `GET /v1/matches/<match-id>/events?after=-1`: up to 128 native events and `nextAfter`; pass that sequence to retrieve the next page. This is the timeline/event feed.
- `GET /v1/players/<local-profile-id>/stats`: aggregates completed local matches; optionally filter with `?mode=circuit` or `?mode=crosscurrent`.

Mode policy is snapshotted at preparation. The API never routes native Overstep data through Riot/Valorant analysis adapters. Cloud uploads, online account linking and public leaderboard access are separate work.

## Statistics contract

For every participant, match summaries expose kills, deaths, headshot kills, firearm shots, firearm hits, firearm head hits, accepted damage, plants, defuses, K/D, accuracy and outcome. Each weapon (`r04`, `knife`) has its own attacks, landed hits, damage and kills. Knife cosmetic variants share the knife weapon identity. Weapon attribution comes from the actual attack path, including melee, rather than the currently selected item or a damage-based guess.

- Headshot percentage: `100 * firearm head hits / all landed firearm hits`.
- Headshot-kill percentage: `100 * headshot kills / all kills`, kept separate from hit-based headshot percentage.
- Firearm accuracy: `100 * landed firearm hits / firearm shots`.
- K/D: kills divided by deaths. A zero denominator returns `null`, not an invented ratio.
- Weapon headshot percentages are `null` for melee.
- Match score and winner come from the native result event. Completed ties are draws. Restarts and abandoned matches have no win/loss outcome.
- Profile totals include completed matches only, report abandoned and interrupted matches separately, and sum counts before calculating percentages. Bot statistics are not added to the local player's profile.
- `durationMs` is the native match clock, including countdowns and round breaks but excluding settings pauses and recording preparation.
- `recording.readyBeforeStart` means the acknowledged recorder and first measured anchor preceded the countdown. `capturedFromStart` additionally requires the saved video to still exist and valid recorded clock continuity. `videoAvailable` reports the current file check. Neither is inferred from the presence of a match entry.

No voice/chat data is exported. Detailed utility effect geometry, assists, account ranks and economy metrics are not currently native facts in this game and are not fabricated.

## Interrupted data and recovery

Match-data state is independent of video state: `receiving`, `complete`, `abandoned`, or `interrupted`. A missing result after 15 seconds without telemetry, disabling the integration, or reopening an unfinished saved match marks its data interrupted. The API returns the reason as `dataError`; it does not invent a result or add a loss. Stats-only and failed-capture sessions follow the same rules.

After the game reconnects, exact retries are acknowledged and subsequent ordered events resume collection. A native result completes the match normally and contributes once to profile totals. A bridge restart never begins a second recording part or pretends the video remained continuous. Existing session metadata is upgraded from the canonical saved event log.

## Validation

The native Editor target builds on Mac. Desktop validation covers strict schema handling, duplicate delivery, delayed readiness, capture failure, excluded modes, persisted policy and stats, weapon separation, win/loss/draw/abandonment, and authenticated API endpoints.

Native smoke tests run real autonomous bot matches against the production bridge with a deliberately delayed mock recorder. They verify the match clock stays at zero until the capture decision, the countdown still runs in full, and native kills reconcile with the API summary. The mock supplies no video file; it does not validate OBS capture.

```
python3 Tools/Development/run_upforge_telemetry.py
python3 Tools/Development/run_upforge_telemetry.py --skip-recording
python3 Tools/Development/run_upforge_telemetry.py --startup-timeout
python3 Tools/Development/run_upforge_telemetry.py --reject-first
python3 Tools/Development/run_upforge_telemetry.py --restart-bridge
```

Evidence is written under `Docs/Evidence/2026-09-30-upforge-api-*.json`. Each run owns isolated game and bridge processes. Before release, record a real Windows match for each mode, verify capture starts before countdown, confirm unchecked modes produce stats without video, and check audio and visible event alignment.

### Read-only Windows acceptance check

After playing a match with the updated Windows game and UpForge builds, run this from the desktop repository using Node.js 18 or later:

```
node scripts/check-overstep-match.mjs --match <match-uuid> --output overstep-acceptance.json
```

Use the match UUID returned by `GET /v1/matches`. The command discovers the running local integration, checks completed results, contiguous paged events, kill/death totals and the capture/skip decision, and writes a pass/fail report. It never changes policy, starts OBS or exposes the discovery token. Failed/late recording decisions fail acceptance. An intentionally skipped mode passes when no video was captured. `--connection <path>` is available for isolated test bridges.

The automated report cannot verify game-window contents, audible sound or visible event/frame alignment. Inspect those in the actual recording before accepting a Windows release.
