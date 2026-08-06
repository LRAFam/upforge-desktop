# Post-match pipeline cleanup Implementation Plan

> **For agentic workers:** Behavior-preserving extract. Do not change product semantics. Move + test, then delete duplicates.

**Goal:** Make post-match flow one clear step sequence with one analyse gate and one pause/resume API, without changing what users see or when upload/analyse runs.

**Architecture:** Extract pure decision helpers and thin orchestration modules from `electron/main/index.ts`. Keep `index.ts` as the wiring layer (OBS, auth, windows). UI keeps defense-in-depth disable, but shared helpers own the rules and copy.

**Tech Stack:** TypeScript, Vitest, existing `analysis-readiness.ts`, `match-priority-guard.ts`, `post-match-worker.ts`.

**Spec:** `docs/superpowers/specs/2026-08-06-post-match-pipeline-cleanup-design.md`

## Global Constraints

- No intentional behavior change (gates, auto-analyse, pause timing stay the same).
- Desktop only; no version bump unless asked.
- Do not commit unless the user asks.
- Verify: `npx vitest run <touched>` and `npm run type-check`.

## File map

| File | Responsibility |
|------|----------------|
| `electron/main/post-match-steps.ts` | Pure next-step decision after VOD save |
| `electron/main/analyse-gate.ts` | `canStartAnalyse` / blocked reason (main) |
| `src/lib/analyse-gate.ts` | Same rules for renderer (ready + not deferred) |
| `src/lib/post-match-copy.ts` | Shared user-facing pause/wait/resume strings |
| `electron/main/match-priority-guard.ts` | Single abort-for-match API |
| `electron/main/index.ts` | Wire helpers; delete duplicated branches |
| UI surfaces | Call shared copy + analyse-gate helpers |

---

### Task 1: Shared copy + step decision (pure)

- [x] Add `src/lib/post-match-copy.ts` with pause / wait / resume / auto-off strings
- [x] Add `electron/main/post-match-steps.ts` with `decidePostMatchNextStep(...)`
- [x] Unit tests for step decision matrix
- [x] Wire `index.ts` activity log lines to copy helpers

### Task 2: Analyse gate

- [x] Add `src/lib/analyse-gate.ts` (`isAnalyseReady`, `isAnalyseBlockedByMatch`, labels)
- [x] Use from dashboard / PostGame / Recordings / ActionQueue
- [x] Main IPC analyse path uses same blocked-by-match check via thin re-export or shared lib

### Task 3: Unify pause/abort helpers

- [x] Merge game-start + match-capture abort into one `abortHeavyBackgroundWork` with reason
- [x] Keep recording-only defer gate for waitUntil
- [x] Update tests

### Task 4: Collapse match-end triple readiness check

- [x] Replace early/mid/late readiness branches with one `decidePostMatchNextStep` call after VOD registered + probe
- [x] Keep reveal-on-pending/upload behavior

### Task 5: Verify

- [x] `npx vitest run` on new/changed tests
- [x] `npm run type-check`
