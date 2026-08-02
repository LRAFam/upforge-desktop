# OBS safe watchdog design

**Date:** 2026-08-02  
**Service:** `upforge-desktop`  
**Status:** Implemented — plan `docs/superpowers/plans/2026-08-02-obs-safe-watchdog.md` (Tasks 1–8, 2026-08-02)  
**Related:** `2026-07-26-obs-recover-match-resume-design.md`, `2026-07-26-desktop-recording-reliability-telemetry-design.md`

## 1. Problem

Observed failure modes (same session can hit more than one):

| Code | Symptom | Typical cause |
|------|---------|---------------|
| **A** | OBS open, UpForge shows connected, match starts, recording never arms | Stale `outputActive`, capture recreate / settings while hot, `StartRecord` not verified |
| **B** | OBS crashes or freezes mid-match | Unstable capture recreate, hot `SetVideoSettings`, game_capture hooks, unrelated OBS bugs |
| **C** | Match ends, file missing or unreadable | Crash mid-encode without crash-safe container settle, stop→path race, orphan path not reclaimed |

Existing hardening (reconnect loop, reclaim cooldown, idle kill/relaunch, MKV/Hybrid MP4, unowned-stop attempt) helps, but:

1. Start can still throw on “already recording” without a strong clear + verify path.
2. UpForge can mutate capture/video while OBS outputs are sensitive.
3. Mid-match **process death** is only partly handled (WS reconnect; no orphan reclaim / next-match relaunch policy).
4. Hard recover (`taskkill`) is gated, but the policy is not written as an explicit kill ban around live encodes.

## 2. Goals

1. **Arm reliably** when WS is connected: match start either records or fails with a clear DNF.
2. **Never kill a writing encode** (process alive + active/owned recording).
3. **Survive OBS process death** by reclaiming what is on disk and preparing for the next match.
4. **Reduce UpForge-caused OBS instability** by banning hot mutations.
5. **Make failures measurable** via existing match telemetry DNFs / activity log.

### Success criteria

- Connected + match start → within 5s either `GetRecordStatus.outputActive === true` or a typed DNF (not a silent miss).
- `terminateObsProcess` is never called while process is running and (`isActivelyRecording` OR match-owned with disconnected-during-recording OR confirmed `outputActive`).
- After OBS process exit mid-match, orphan recording path is attempted via existing path resolver; match end still produces a best-effort file or explicit missing-file DNF.
- Capture recreate and `SetVideoSettings` only run when all relevant outputs are idle (or are skipped with a warning).

## 3. Non-goals

- Mid-match **force-kill** of a live OBS process to “recover” a hung encode.
- Replacing OBS with native capture (separate Phase 3 in reliability design).
- macOS/Linux launch parity beyond what already exists (Windows remains primary).
- Rewriting the entire match flow in `index.ts`.

## 4. Kill / restart policy (hard rules)

Call this the **safe watchdog contract**. All recover paths must obey it.

| OBS process | Output / ownership | Allowed actions |
|-------------|--------------------|-----------------|
| Alive | Match-owned recording OR `outputActive` OR disconnected-during-recording | Soft only: WS reconnect, status probe, UI status. **No `terminateObsProcess`.** |
| Alive | Idle (no match ownership, `outputActive` false, not disconnected-during-recording) | Soft probe; after failures, existing hard recover (kill + relaunch) OK |
| Dead | Match was owned | Treat encode as ended. Reclaim orphan file. Release/finalize ownership via match-end path. **Relaunch only for readiness of the next match**, not to continue the same encode |
| Dead | Idle | Launch / ensure connect as today |

**Invariant:** “Hard recover” means kill+relaunch **only when it cannot interrupt a writing encode**. If the process is already dead, there is no writing encode left to protect; reclaim files instead.

User-facing copy when stuck alive + hung: e.g. “OBS looks stuck recording. Stop recording in OBS, or restart OBS after the match.” Never auto-kill in that state.

## 5. Architecture

Keep OBS WebSocket as the control plane. Add an explicit **watchdog layer** that classifies process+WS+ownership and chooses soft vs hard vs reclaim.

```
Game detect / match start
        │
        ▼
┌───────────────────┐
│ Start-arm pipeline│  (clear stale → cold mutations → StartRecord → verify)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     process poll / WS events
│ Safe watchdog     │◄────────────────────────────
│ (classify state)  │
└─────────┬─────────┘
          │
    ┌─────┼──────────────┐
    ▼     ▼              ▼
 soft   reclaim+       hard recover
 reconnect  finalize   (idle only)
```

### Modules (intended ownership)

| Concern | Primary module | Notes |
|---------|----------------|-------|
| Kill ban / classify | New pure helpers (e.g. `obs-watchdog-policy.ts`) | Unit-tested; used by health + ensure |
| Process liveness | `obs-process.ts` | Existing; poll from recorder/health |
| Soft reconnect | `obs-recorder.ts` | Existing 15s loop |
| Idle hard recover | `obs-ensure.ts` + `obs-health.ts` | Gate via policy |
| Start arm + verify | `obs-recorder.ts` `start()` | New verify loop |
| Hot mutation guard | `obs-setup.ts`, `obs-output-settings.ts` | Gate recreate / video |
| Orphan reclaim | `recording-path-resolver.ts` + match-end | On process-dead |
| DNF reasons | `match-telemetry.ts` | Wire `unowned_obs_recording`; add if needed |

## 6. Design sections

### 6.1 Start-arm pipeline (fixes A)

Order inside `OBSRecorder.start()` after connect:

1. **Unowned clear (stronger)**  
   - If unowned `outputActive`: settle (≥400ms, prefer ~1–2s), `StopRecord`, settle again, recheck.  
   - Optional second StopRecord attempt before `blocked`.  
   - On final `blocked`: throw + DNF `unowned_obs_recording` (wire existing enum; today it is unused on this path).

2. **Cold mutations only**  
   - Before retarget / `applyObsRecordingSettings`, require outputs idle (`GetRecordStatus` and replay buffer inactive, or treat replay as non-blocking only for settings that OBS allows).  
   - Prefer `SetInputSettings` over `RemoveInput`/`CreateInput` when kind+window can be updated in place.  
   - `forceRecreate` only when idle **and** kind change / desktop-upgrade / corrupt duplicate prune requires it.

3. **`StartRecord` + verify**  
   - Call `StartRecord`.  
   - Poll `GetRecordStatus` until `outputActive` (budget ~3–5s) or fail.  
   - Only then set `_matchOwnedRecording` / `_recording` / status UI true.  
   - Today ownership flips immediately after `StartRecord` returns; that can lie if OBS accepts the call but does not actually arm.

4. **Typed failures**  
   - Map known errors to DNFs: `unowned_obs_recording`, `advanced_output`, `obs_not_ready`, disk-full (existing), plus a start-verify failure detail string.

### 6.2 Hot mutation ban (reduces B)

While any of: match-owned recording, `outputActive`, disconnected-during-recording:

- Do **not** call `RemoveInput` / `CreateInput` / prune-recreate.
- Do **not** call `SetVideoSettings`.
- Settings overlay (`SetInputSettings`) only if proven safe for the capture kind; otherwise defer refit to next idle window (e.g. post-stop or pre-start).

Gameplay refit paths that currently recreate must check the same guard.

### 6.3 Safe watchdog runtime (B + C)

Extend health / recorder to distinguish **WS down** vs **process dead**:

1. On `ConnectionClosed` while match-owned: keep ownership (existing). Start/continue soft reconnect.
2. Periodically (or on reconnect failure): `isObsProcessRunning()`.
3. If process **dead** while match-owned:
   - Set a clear internal flag (e.g. `_obsProcessDiedDuringMatch`).
   - Stop pretending reconnect will resume the same encode.
   - Kick match-end / finalize path with last known path + `resolveReadyRecordingPathDetailed` orphan search.
   - Activity log: “OBS process exited — reclaiming recording file if present.”
   - Relaunch OBS only after finalize ownership is released (next-match readiness), obeying launch cooldown.
4. If process **alive** but WS down: soft reconnect only; UI “OBS disconnected”; **no kill**.
5. If process alive, WS up, `outputActive` stuck after stop attempts outside match start: surface stuck state; no kill during match ownership.

Idle health monitor keeps today’s hard recover, but `canHardRecover` / `allowProcessRestart` must call the shared policy helper so the kill ban cannot drift.

### 6.4 Stop → file settle (helps C)

- Keep crash-safe container (Hybrid MP4 / MKV) as default.
- After `StopRecord`, keep size-stable wait; on process-death path, prefer resolver fallback over assuming `_outputPath`.
- Do not reclaim a new match during post-stop cooldown (existing 45s).
- Quit-time `forceStop` remains best-effort (non-goal to block app exit on mux); document that unclean quit can still lose the tail on non-crash-safe user overrides.

### 6.5 Telemetry / UX

- Emit `unowned_obs_recording` when start blocks after clear attempts.
- Emit start-verify failure with short detail (truncated).
- Optional: sample `reconnectCount` in OBS stats (currently always null); nice-to-have, not required for v1.
- User notifications: rate-limited; distinguish “not armed”, “disconnected (still recording locally)”, “OBS exited (reclaiming file)”, “OBS stuck (manual stop needed)”.

## 7. Testing

Prefer pure policy + recorder helpers (existing pattern in `obs-disconnect-guard.test.ts`, `obs-ensure.test.ts`):

| Case | Expect |
|------|--------|
| Policy: alive + match-owned | hard recover false |
| Policy: alive + idle | hard recover true |
| Policy: dead + match-owned | hard recover false; reclaim path true; relaunch-after-finalize true |
| Unowned clear: active → stop → idle | `cleared` |
| Unowned clear: still active | `blocked` + DNF wiring at call site |
| Start verify: StartRecord ok but never active | fail; ownership not set |
| Start verify: becomes active | ownership set |
| Hot guard: forceRecreate while active | skipped / no RemoveInput |
| Process-dead during match | finalize + orphan resolve invoked; no terminate |

Integration tests only where cheap; do not require a live OBS binary in CI.

## 8. Rollout

1. Land pure `obs-watchdog-policy` + tests.
2. Gate `ensureObsConnected` / health `canHardRecover` on policy.
3. Start-arm clear + verify + DNF wire.
4. Hot mutation guards in setup/output settings.
5. Process-dead detection + orphan finalize hook in recorder/`index.ts`.
6. Manual QA: Valorant + one window-capture game (CS2 or Deadlock): normal match, stale recording open in OBS, kill OBS mid-match (external), confirm no UpForge kill while encoding.

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Stronger clear stops a user’s intentional manual OBS recording | Only clear **unowned** output; message already says stop current OBS recording; DNF is explicit |
| Verify timeout too short on slow disks | 3–5s budget; tune from telemetry |
| Process poll false negative on non-standard OBS builds | Keep WS as primary; process poll is secondary signal |
| Deferred recreate leaves wrong capture window for a match | Retarget via `SetInputSettings` when possible; recreate only cold at pre-start |

## 10. Open decisions (resolved for this draft)

| Decision | Choice |
|----------|--------|
| Full watchdog vs start-only | Full **safe** watchdog |
| Kill writing encode | **Never** while process alive and encode/ownership active |
| Mid-match relaunch after crash | Relaunch for **next** match / after finalize only |
| Scope | Desktop OBS path only; Approach 2 start-gate included |
