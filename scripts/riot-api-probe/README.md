# Riot API Probe

**Run this before we write any real-time event code.**  
It captures everything the Riot Client exposes during a Valorant match so we know exactly what's available.

## Setup (one time)

```
cd upforge-desktop/scripts/riot-api-probe
npm install
```

## How to run

1. **Open the Riot Client** (Valorant launcher must be running — lockfile must exist)
2. Open a terminal in this folder and run:

```
node probe.js
```

3. You'll see static endpoint results immediately (PUUID, presence state, etc.)
4. **Queue into a match and play it while the probe is running**
5. When the match ends, press **Ctrl+C**
6. A `probe-output-<timestamp>/` folder is created

## What gets captured

| File | Contents |
|---|---|
| `snapshot.json` | All static endpoint responses on launch |
| `events.jsonl` | Every WebSocket event with timestamp (one JSON per line) |
| `shootergame.log` | Real-time tail of the Valorant game log |
| `summary.txt` | Event count summary |

## What to share

Zip and share the entire `probe-output-<timestamp>/` folder.  
We will analyse it to find which events fire on kills, round starts, spike plants, and match end — before writing any implementation code.

## What we're testing

- ✅ Lockfile readable (port + password)
- ✅ `/entitlements/v1/token` → own PUUID
- ✅ `/chat/v4/presences` → sessionLoopState, queueId, matchMap
- ✅ `/help` → full list of available WebSocket events
- ❓ Which WebSocket events fire during kills?
- ❓ Which WebSocket events fire on round start/end?
- ❓ Does the score in presence update within seconds of a round ending?
- ❓ Does ShooterGame.log contain kill lines?
- ❓ Does `/riot-messaging-service` carry match state?
