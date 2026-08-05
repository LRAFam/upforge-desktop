# Valorant The Range recording opt-in

**Date:** 2026-08-05  
**Status:** Approved; implementing  
**Service:** `upforge-desktop`

## Problem

UpForge records Valorant The Range even though it is not a selectable mode in Settings → Recording. The Range is not in `GAME_MODES` / `ALL_MODES`, so when every *listed* mode is selected (`filterByMode` is off), Range sessions are recorded. Practice VODs waste disk and confuse users who only want real matches.

## Goal

- Add **The Range** as a normal chip under Settings → Recording → Record game modes.
- **Default off** for new and existing installs.
- Opt-in only: check the chip to record Range.

## Non-goals

- Custom games / NEWMAP / other practice queues.
- Changing Comp/Premier defaults.
- Discord announcement (product can decide later).

## Behaviour

| Situation | Result |
|-----------|--------|
| Range session, chip off (default) | Skip recording (same UX path as excluded Unrated) |
| Range session, chip on | Record as today |
| Existing users with every *old* mode selected | Stay filtered once Range is in `ALL_MODES` (Range still excluded until they check it) |
| Defaults `['COMPETITIVE', 'PREMIER']` | Unchanged; Range never auto-enabled |

## Design

### 1. Settings UI

- Chip in `GAME_MODES` (`useSettings.ts` / `SettingsRecordingPane.vue`):
  - **value:** `SHOOTING_RANGE`
  - **label:** The Range
  - **hint:** Practice range
- Default: not in `recordedModes`.

### 2. Detection

- Map Riot queue id `rangev2` → `SHOOTING_RANGE` in `_normalizeQueueId` (`riot-local-api.ts`).
- Aligns with existing `PRACTICE_MODES` in `match-details-validation.ts`.

### 3. Filter membership

- Add `SHOOTING_RANGE` to `ALL_MODES` in:
  - `electron/main/index.ts` (runtime filter)
  - `electron/main/settings-manager.ts` (legacy `recordingMode: 'all'` migration list, if still present)
- “All modes selected” means every chip including Range. Selecting every *previous* chip without Range keeps `filterByMode` on so Range is skipped.

### 4. Skip path

Reuse the existing gate:

```text
game === 'valorant' && filterByMode && gameMode && !recordedModes.includes(gameMode)
```

No parallel Range-only flag. Activity + notification copy already covers “mode not in recorded modes.”

## Tests

- Unit: `normalizeQueueId('rangev2') === 'SHOOTING_RANGE'`.
- Unit / gate helper if extracted: Range mode excluded when not in `recordedModes`; included when present.
- Manual: enter The Range with chip off → no OBS recording; chip on → records.

## Risks

- Unknown queue ids still uppercased; Range must map explicitly or it stays `RANGEV2` and would skip when filtered (safe) but would not match a checked chip until mapping lands.
- If Range presence has no `queueId` and `modeConfident` stays false while `filterByMode` is on, recording already skips (unchanged).
