# Match Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate avoidable UpForge CPU, disk, network, GPU, and interruption overhead while a supported game or match is active, then publish a tagged desktop release.

**Architecture:** Extend the existing match-priority boundary so game detection immediately stops interruptible heavy work and all later work waits for match end. Keep capture quality unchanged, fix definite OBS configuration mistakes, reduce high-frequency scans, and suppress automated match-time interruptions. Preserve all overlay code behind its existing runtime gate.

**Tech Stack:** Electron, TypeScript, Vue 3, OBS WebSocket, Vitest, electron-vite.

## Global Constraints

- Do not lower recording resolution, FPS, audio quality, or visual quality.
- Do not delete overlay code; keep it runtime-disabled.
- Automated notifications are silent; deliberate F8/F9 feedback may use sound.
- Avoid forcing an OBS profile or encoder when hardware support is unknown.
- Do not commit unrelated generated files, caches, screenshots, or `.DS_Store` files.

---

### Task 1: Match-priority coordinator

**Files:**
- Modify: `electron/main/match-priority-guard.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/late-clip-retry.ts`
- Test: `electron/main/match-priority-guard.test.ts`
- Test: `electron/main/late-clip-retry.test.ts`

**Interfaces:**
- `pauseHeavyBackgroundWork(...)` aborts active uploads and VOD compression.
- `waitUntilBackgroundWorkAllowed(...)` gates uploads, extraction, replay parsing, and retries.

- [ ] Write failing tests for immediate abort and retry deferral.
- [ ] Run focused Vitest tests and confirm expected failures.
- [ ] Abort active uploads and stop the trainer as soon as a game starts.
- [ ] Remove the post-game upload bypass and gate clip/replay retry work.
- [ ] Run focused tests and confirm they pass.

### Task 2: Match-aware updater and interruption policy

**Files:**
- Modify: `electron/main/updater.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/post-game-api.ts`
- Test: `electron/main/updater.test.ts`
- Test: `electron/main/post-game-api.test.ts`

**Interfaces:**
- Updater accepts an activity predicate and defers checks/downloads until idle.
- Pregame brief remains Discord/API-only and never opens a browser automatically.

- [ ] Write failing tests for update deferral and browser-free pregame fallback.
- [ ] Run tests and confirm expected failures.
- [ ] Implement match-aware update checks/downloads and idle resumption.
- [ ] Remove automatic pregame browser fallback.
- [ ] Run focused tests and confirm they pass.

### Task 3: Polling and disk-scan reductions

**Files:**
- Modify: `electron/main/deadlock-steam-cache.ts`
- Modify: `electron/main/deadlock-match-watcher.ts`
- Modify: `electron/main/index.ts`
- Test: `electron/main/deadlock-steam-cache.test.ts`
- Test: `electron/main/deadlock-match-watcher.test.ts`

**Interfaces:**
- Steam cache directory resolution is cached.
- Every successful scan advances its watermark.
- Deadlock polling uses a slower bounded cadence.
- Valorant process checks use a slower cached cadence while overlay polling is disabled.

- [ ] Write failing tests for cached resolution and scan watermark behavior.
- [ ] Run tests and confirm expected failures.
- [ ] Cache Steam path resolution, advance the watermark on no-hit scans, and slow polling.
- [ ] Reduce redundant process-check cadence.
- [ ] Run focused tests and confirm they pass.

### Task 4: Safe OBS corrections

**Files:**
- Modify: `electron/main/obs-output-settings.ts`
- Modify: `electron/main/obs-recorder.ts`
- Modify: `electron/main/obs-profile-installer.ts`
- Modify: `resources/obs/upforge-profile/basic.ini`
- Test: `electron/main/obs-output-settings.test.ts`
- Test: `electron/main/obs-profile-installer.test.ts`

**Interfaces:**
- `RecRB` remains a replay-buffer boolean.
- `RecRBTime` controls replay duration.
- Replay buffer starts only for clips-only sessions.

- [ ] Write failing tests for correct OBS parameter names and replay policy.
- [ ] Run tests and confirm expected failures.
- [ ] Correct profile keys/logging and disable unnecessary replay buffer during full VOD recording.
- [ ] Preserve user encoder/profile choice while reporting actual configuration accurately.
- [ ] Run focused tests and confirm they pass.

### Task 5: Existing overlay and notification hardening

**Files:**
- Verify current uncommitted overlay, notification, and menu-watch changes.
- Test: `electron/main/in-game-feedback.test.ts`
- Test: `electron/main/menu-watch.test.ts`

- [ ] Review current diff for consistency with global constraints.
- [ ] Run focused tests.
- [ ] Fix any integration or type issues found by the production build.

### Task 6: Verification and release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Synchronize version metadata to the next unused patch version.
- [ ] Run all relevant focused tests.
- [ ] Run `npm run build`.
- [ ] Run type-check and separate new failures from known repository failures.
- [ ] Review the complete diff and exclude unrelated files.
- [ ] Commit the release, create the matching annotated tag, and push `main` plus the tag.
