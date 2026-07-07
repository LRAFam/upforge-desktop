# UpForge Desktop — design reference

Saved UI mockups and generated artwork for implementation reference. **Commit these to git** so they survive across machines and chat sessions.

## Folder layout

```
design/
├── README.md
├── dashboard/
│   ├── concepts/          # AI-generated concept explorations (numbered)
│   ├── favorites/         # Shortlisted mockups the user picked
│   └── login/             # Login window references
└── training/
    └── concepts/          # Training Hub / Aim Lab mockups
└── squads/
    └── concepts/          # Squad view redesign mockups
```

## When generating new artwork

1. Save PNGs under the relevant subfolder here (not only in Cursor’s temp `assets/` folder).
2. Use descriptive kebab-case names, e.g. `dashboard-v2-combined-mockup.png`.
3. Add a one-line note to this README or the folder’s index below.

## Dashboard — favorites (Jul 2026)

| File | Concept | Use for |
|------|---------|---------|
| `favorites/coach-briefing-favorite.png` | Coach Briefing | Hero focus, match story cards, game pills |
| `favorites/split-ops-favorite.png` | Split Ops | Live ops panel, pipeline, latest coaching gauge |
| `favorites/multi-game-hub-favorite.png` | Multi-Game Hub | Game tabs, per-game cards, cross-game activity |

**Planned combo:** Merge all three — ops strip + game hub cards + coaching hero/cards.

## Dashboard — game card artwork (Jul 2026)

| File | Use for |
|------|---------|
| `dashboard/artwork/valorant-card-bg.png` | Valorant card background |
| `dashboard/artwork/cs2-card-bg.png` | CS2 card background |
| `dashboard/artwork/deadlock-card-bg.png` | Deadlock card background |
| `dashboard/artwork/*-emblem.png` | Fallback rank emblem when account not linked |

Runtime copies: `src/assets/games/`.

## Dashboard — concepts (Jul 2026)

| File | Name |
|------|------|
| `concepts/upforge-dashboard-concept-1-command-center.png` | Command Center |
| `concepts/upforge-dashboard-concept-2-coach-briefing.png` | Coach Briefing |
| `concepts/upforge-dashboard-concept-3-split-ops.png` | Split Ops |
| `concepts/upforge-dashboard-concept-4-multi-game-hub.png` | Multi-Game Hub |
| `concepts/upforge-dashboard-concept-5-performance-pulse.png` | Performance Pulse |

## Login

| File | Notes |
|------|-------|
| `login/login-current-screenshot.png` | App screenshot before redesign iterations |

## Training Hub — concepts (Jul 2026)

| File | Name | Vibe |
|------|------|------|
| `training/concepts/training-concept-1-drill-queue.png` | Drill Queue | Prioritized queue front and center; free play secondary |
| `training/concepts/training-concept-2-session-flow.png` | Session Flow | Guided warm-up → focus → cool-down as hero |
| `training/concepts/training-concept-3-progress-lab.png` | Progress Lab | Radar chart + PB carousel; data-first |
| `training/concepts/training-concept-4-coach-assignments.png` | Coach Assignments | VOD-linked gold recommendations + coach quotes |
| `training/concepts/training-concept-5-arcade-grid.png` | Arcade Grid | Tile launcher for all 10 scenarios |
| `training/concepts/training-concept-6-combined-v2.png` | Combined v2 | Session hero + VOD strip + cards with stars & rank (user pick) |

## Training Hub — artwork (Jul 2026)

| File | Use for |
|------|---------|
| `training/artwork/guided-session-hero.png` | Guided session hero background |
| `training/artwork/loadout-crosshair-art.png` | Loadouts tab accent |
| `training/artwork/leaderboard-empty.png` | Leaderboards empty state |

Bundled runtime assets live in `src/assets/training/` (PNG icons in `icons-png/` + hero artwork).

## Squad view — concepts (Jul 2026)

Current view: large per-member cards, invite row, activity + analyses columns (~730 lines in `SquadView.vue`).

| File | Name | Vibe |
|------|------|------|
| `squads/concepts/squad-concept-1-war-room.png` | War Room | Compact roster strip + wide activity timeline |
| `squads/concepts/squad-concept-2-roster-sidebar.png` | Roster Sidebar | Member list left, stats + feed right |
| `squads/concepts/squad-concept-3-live-stack.png` | Live Stack | Recording heroes on top, compact offline chips |
| `squads/concepts/squad-concept-4-team-briefing.png` | Team Briefing | Dashboard-style weekly hero + squad match cards |
| `squads/concepts/squad-concept-5-lineup.png` | Valorant Lineup | 5-slot presence row as the main focus |
| `squads/concepts/squad-concept-6-combined-v2.png` | Combined v2 | Header chips + match cards + invite rail + clips |
| `squads/concepts/squad-concept-7-universal-lineup.png` | Universal Lineup | #5 adapted — generic N slots + game pills (VAL/CS2/DL) |
| `squads/concepts/squad-concept-8-multi-game-combined.png` | Multi-Game Combined | #6 adapted — mixed-game activity + neutral match cards |

**Built (Jul 2026):** Universal lineup + multi-game combined layout in `SquadView.vue` + `src/components/squad/*`.

## Player Brain — concepts (Jul 2026)

Unified web hub for cross-game identity, VOD progression, combat patterns, and coach memory. Route today: `/valorant/playstyle` (planned: game-agnostic `/brain` or `/profile`).

| File | Name | Vibe |
|------|------|------|
| `player-brain/concepts/player-brain-concept-1-command-nexus.png` | Command Nexus | Central brain + milestone ring, game orbs, combat hotspots |
| `player-brain/concepts/player-brain-concept-2-multi-game-hub.png` | Multi-Game Hub | VAL / CS2 / DL cards, unified coach memory |
| `player-brain/concepts/player-brain-concept-3-neural-identity-sheet.png` | Neural Identity Sheet | RPG profile sheet, radar + habit panels |
| `player-brain/concepts/player-brain-concept-4-progression-timeline.png` | Progression Timeline | Milestone spine + chronological VOD memory cards |
| `player-brain/concepts/player-brain-concept-5-combined-command-brief.png` | Combined Command Brief | Immersive hero + intel panels (dashboard briefing vibe) |
| `player-brain/concepts/player-brain-dashboard-v2-reference.png` | Dashboard v2 (built ref) | Full command center — sidebar, brain nexus, combat/economy/habits grid |

**Built (Jul 2026):** `/brain` web page follows dashboard v2 reference — see `upforge-frontend/app/pages/brain.vue`.
