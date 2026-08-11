# OBS: default force UpForge scene

**Date:** 2026-08-11  
**Status:** Approved; implementing  
**Service:** `upforge-desktop`

## Problem

Match recording uses OBS’s **current program scene**. UpForge creates an `UpForge` scene with game/window capture, but the Advanced setting **Keep my active OBS scene when a match starts** defaults to **on** (`obsPreserveActiveScene: true`).

If the user leaves a different scene active (e.g. a layout for recording the UpForge app UI), the match VOD captures that scene instead of gameplay.

## Goal

- By default, switch to the `UpForge` scene on OBS connect and before match recording.
- Keep an explicit opt-out for content creators who stream with custom layouts (face cam, overlays).
- Apply the new default to **existing installs** once, not only new users.

## Non-goals

- Auto-detect “streaming” and skip the switch.
- Warn/block UI when the wrong scene is active.
- Changing how capture sources are retargeted inside the UpForge scene.
- Renaming scenes or supporting a user-chosen scene name.

## Behaviour

| Situation | Result |
|-----------|--------|
| New install | `obsPreserveActiveScene === false` → switch to `UpForge` |
| Existing install, one-time migration | Force `obsPreserveActiveScene` to `false` once |
| Creator opts in (checkbox on) | Do not call `SetCurrentProgramScene`; still retarget UpForge capture |
| Connect / setup / retarget before record | Same `switchScene: !obsPreserveActiveScene` path as today |

Recording always records the program scene. Forcing `UpForge` is what makes the VOD match gameplay for coaching.

## Design

### 1. Default

In `settings-manager.ts` `DEFAULTS` and matching UI/composables fallbacks (`useSettings.ts`, `index.ts` `??` fallback):

- `obsPreserveActiveScene: false`

### 2. One-time migration

Existing `settings.json` almost always already contains `obsPreserveActiveScene: true` from prior saves, so flipping `DEFAULTS` alone does **not** fix current users.

On settings load:

1. If `obsPreserveSceneDefaultV2` is not `true`:
   - Set `obsPreserveActiveScene` to `false`
   - Set `obsPreserveSceneDefaultV2` to `true`
   - Persist (write settings after migrate so the sentinel sticks)
2. If `obsPreserveSceneDefaultV2` is already `true`: leave `obsPreserveActiveScene` alone (including creators who re-enabled preserve)

Do **not** try to infer “user intentionally wanted preserve” from the old default `true`; that was the shipped default for everyone.

### 3. Settings copy

Advanced pane checkbox stays. Update helper text so the default is clear, e.g.:

- Label: Keep my active OBS scene when a match starts
- Hint: Off by default so matches record the UpForge scene (gameplay). Turn on if you stream with face cam and overlays; UpForge still retargets game capture but will not force-switch scenes.

### 4. Runtime (unchanged logic)

`OBSRecorder` already passes `switchScene: !obsPreserveActiveScene` into `setupUpForgeScene` / `retargetUpForgeCapture`. No protocol change beyond settings default + migration.

## Tests

- Unit: load path with no sentinel + saved `obsPreserveActiveScene: true` → after migrate, `false` and sentinel set.
- Unit: load path with sentinel + `obsPreserveActiveScene: true` → stays `true`.
- Unit / existing: `DEFAULTS.obsPreserveActiveScene === false`.
- Manual: wrong scene active, preserve off → match start switches to `UpForge` and VOD is gameplay.

## Risks

- Creators who relied on the old default without noticing the checkbox will get an unexpected scene switch once; they re-enable Advanced → Keep my active OBS scene.
- `index.ts` / `useSettings` must not hardcode `?? true` or they undo the default for partial reads.
