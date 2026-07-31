# Desktop Rosters Dual Hub Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Rosters tab with native coach full hub + student hub, Stripe/Pro/annotate via web shell.

**Architecture:** Electron IPC wraps existing Laravel Coach Hub APIs. `RostersView` picks coach vs student mode. Coach settings/members/queue are native; annotate+complete opens web feed.

**Tech Stack:** Vue 3 + Electron (upforge-desktop), Laravel Coach Hub APIs.

## Global Constraints

- No em dashes in user-facing copy.
- Do not invent API fallbacks; surface errors.
- Stripe Connect and Coach Pro stay on web (`openWebFeature`).
- Completing a roster review requires annotations → web feed handoff.
- Spec: `docs/superpowers/specs/2026-07-31-desktop-rosters-dual-hub-design.md`

## Files

| Path | Role |
|------|------|
| `electron/main/auth-manager.ts` | Coach roster API methods |
| `electron/main/ipc/auth-ipc.ts` | IPC handlers |
| `electron/preload/index.ts` | Preload coach API |
| `src/env.d.ts` | Types |
| `src/main.ts` | `/rosters` route |
| `src/lib/game-modules.ts` | Nav allowlist |
| `src/components/AppSidebar.vue` | Rosters link + badge |
| `src/composables/useRosterHubBadge.ts` | Pending counts |
| `src/lib/roster-match-display.ts` | Shared match visuals |
| `src/components/rosters/*` | UI pieces |
| `src/views/RostersView.vue` | Shell + mode switch |

---

### Task 1: Coach + student IPC

**Files:** `auth-manager.ts`, `auth-ipc.ts`, `preload/index.ts`, `env.d.ts`

- [ ] Add `fetchStudentHub`, `fetchCoachRoster`, `updateCoachRosterSettings`, `fetchCoachReviewRequests`, `startCoachReview`
- [ ] Wire IPC + preload + `env.d.ts`
- [ ] Rebuild preload (`npx electron-vite build` or `npm run dev` restart reminder)

### Task 2: Route + sidebar

**Files:** `main.ts`, `game-modules.ts`, `AppSidebar.vue`, `useRosterHubBadge.ts`

- [ ] Register `/rosters`
- [ ] Add to VALORANT (and other) nav allowlists
- [ ] Sidebar Rosters item with optional pending badge

### Task 3: Shared helpers + match row

**Files:** `roster-match-display.ts`, `RosterMatchRow.vue`

- [ ] Map/agent thumb + score `/1000` helpers
- [ ] Reusable match row for student + coach queues

### Task 4: Coach hub UI

**Files:** `RostersCoachPanel.vue` (or section in view), settings form, members, queue

- [ ] Load roster; show Closed/Draft/Live
- [ ] Toggle enable; edit free/paid + price + included + welcome; save
- [ ] Draft CTAs → web Stripe / Coach Pro
- [ ] Members list; queue → open analysis or web feed

### Task 5: Student hub UI

**Files:** `RostersStudentPanel.vue`, `RosterSendSheet.vue`

- [ ] Empty discovery; hub with coaches/reviews/send
- [ ] Honest limit labels (`Waiting on coach` / `Monthly limit`)

### Task 6: Shell + verify

**Files:** `RostersView.vue`

- [ ] Detect roles; mode toggle when both
- [ ] Smoke: coach@test.com + student@test.com paths
- [ ] Type-check touched files where practical
