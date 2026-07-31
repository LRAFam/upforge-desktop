# Desktop Rosters Tab Implementation Plan

> **For agentic workers:** Implement task-by-task. Rosters is a student-facing desktop tab.

**Goal:** Sidebar **Rosters** tab. Empty → open authenticated web discovery (`/coaches`). Joined → native hub (coaches, review status, send/open notes).

**Files:**
- `src/views/RostersView.vue` (new)
- `src/main.ts` (route)
- `src/components/AppSidebar.vue` (nav)
- `src/lib/game-modules.ts` (nav allowlist)
- `electron/main/auth-manager.ts` + `auth-ipc.ts` + `env.d.ts` + `preload` (student hub IPC)

## Task 1: student-hub IPC
Call `GET /api/coach/student-hub`. Expose `coach.getStudentHub`.

## Task 2: RostersView
- Load hub; empty → CTA + `openWebFeature('/coaches')` on mount once
- Hub: coaches (free/paid), pending/completed reviews, recent sendable matches, open VOD Review / web notes

## Task 3: Sidebar + route `/rosters` for all games that have coaching

## Task 4: `npm run type-check`
