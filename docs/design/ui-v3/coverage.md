# UI v3 coverage tracker

Every user-facing surface and its v3 status. **Update your rows when you finish.**
Status: **R** rebuilt in v3 · **W** wrapped (old markup in a v3 shell / scoped restyle) · **U** untouched · **n/a** not user-facing or dead.
Source: full audit on 2026-10-30 (after round 2). Round 3 owners in brackets.

## P1 — core loop
| Surface | Files | Status | Round 3 |
|---|---|---|---|
| Match page internals (player, round log, timeline, minimap, notes, intel, duel moments) | components/vod-review/**, components/analysis/**, MatchSpatialMinimap, TacticalIntelBrief | R/W — round log + match timeline sidebars, body chrome, duel moments, intel brief, review details have v3 markup branches; player transport + notebook are v3-scoped restyles | agent-vod (round 3 done) |
| Comparison workspace (side by side, workspace coach chat, source picker, access gate, divider) | vod-review/VodReviewComparison, VodWorkspaceCoach, VodComparisonSourcePicker, VodComparisonAccess, VodWorkspaceDivider | R: source picker (UfDialog), access gate, Play both (uf-btn-primary). W: workspace layout, coach chat, divider (full v3-scoped restyle, type roles) | agent-vod (round 3 done) |
| VOD states, cloud VOD actions, demo pending, League scoreboard, shortcuts | VodReviewStates, CloudVodActions, VodDemoPendingPanel, VodLeagueScoreboard, VodReviewShortcuts | R: states, shortcuts (UfDialog), demo pending. W: cloud actions, League scoreboard | agent-vod (round 3 done) |
| Review detail panels (shared with match page) | MatchRecapPanel, TimingComparisonPanel, coaching-history/MatchSavedReviews | R — own v3 markup in uiV3 branches (MatchSavedReviews rebuilt in leftovers round; old branch unchanged) | agent-leftovers |
| Practice in-session: drill running, warm-up, completion modal, session summary | TrainingHubView.vue (inline v3 branch), v3/practice/practice-session-v3.ts | R (round 3) — strips + 2 UfDialogs; tests cover data shaping, live drill not screenshotted | agent-train |
| Coach-side rosters + send sheet | components/rosters/**, v3/coaches/CoachRosterV3 | R (round 3) | agent-team |
| Shell banners + dialogs: update banner, DashboardBanners, RiotLinkPrompt, PaymentFailedAlert, achievements, TrimRangeModal, DemoAttachPicker/Guide | App.vue, components/dashboard/DashboardBanners, components/shared/*, Achievement*, DemoAttachGuide, PaymentFailedAlert | R (round 3): banner row, UfDialog for Riot link / trim / demo picker, v3 toast, v3 cloud notice | agent-shell |
| Clips player, trim, analysis confirm, upgrade, toast | ClipsView.vue modals | R (round 3: UfDialog ×4, v3 toast; covered by ClipsView.v3-dialogs.test.ts — no local clips to open) | agent-library2 |

## P2
| Surface | Files | Status | Round 3 |
|---|---|---|---|
| Practice tabs: Analytics, Leaderboards, Loadouts | v3/practice/PracticeAnalyticsV3, training/TrainingLeaderboardsTab + TrainingLoadoutsTab (in-file v3 branches) | R (round 3); old stats strip hidden in v3 | agent-train |
| Trainer results, Calibration | TrainerResultsView (v3 branch), ValorantCalibrationView (own v3 markup, leftovers round) | R results (incl. empty state, fix3) · R calibration (leftovers round) | agent-train, agent-leftovers |
| Settings panes (Account, Recording, App, Trainer, Advanced, footer, coaching briefs, diagnostics, usage) | components/settings/** | R (round 3) — in-file `uiV3` branches, styled by v3/settings/settings-v3.css; no `:deep` | agent-settings2 |
| Onboarding step markup | OnboardingView.vue | R (round 3) — ob3 markup + onboarding-v3.css; steps 1 & 4 seen in preview, 2/3/5 not reachable with this account | agent-settings2 |
| Cloud storage view + add-on picker | CloudStorageView, shared/StorageAddonPicker | R (round 3) | agent-library2 |
| Performance (PC booster), Splash | PerformanceView, SplashView | R (round 3; booster screenshot only shows the non-Windows state on this Mac) | agent-library2 |
| Squad old components cleanup (v3 builds its own) | components/squad/** | n/a in v3 — SquadV3 regained game mix, member detail (no-stats, Riot ID, most played), leaderboard star; personal panel needs a SquadView prop (lead) | agent-team |

## P3 / decisions
| Surface | Status | Note |
|---|---|---|
| Overstep view | R (round 3) | dev-mode sidebar entry added by the lead |
| Overlay | U | runtime-disabled |
| Dev view, needs-you preview | U | dev only |
| DashboardDevTools (dev-only panel inside HomeV3) | R | v3 branch: hairline row of links, dev/admin only (leftovers round) |
| Matches delete confirmations | R | UfDialog via injectable confirm (fix3) |
| CS2/Deadlock/League stats + setup panels | **R (round 3, agent-games)** | User said bring back. v3: Home setup steps (CS2 Steam name + demo folder, Deadlock Steam link, League Riot link) or per-game summary + demo/replay files; Progress per game (CS2 Valve/FACEIT, Deadlock stats + rank line from mmr_history, League matches/champions/reports). Old panels untouched (still orphaned in the old UI). See notes-games.md |
| Full post-game branch, PostGameFocusHero/IntelHero, GameSwitcher, old dashboard panels | dead | delete later (separate cleanup PR) |

## Done
(Review-3 re-audit 2026-10-30: tracker corrected — trainer-results empty state, Matches delete confirmations, DashboardDevTools added; Overstep nav done.)
Shell, Home, Post-game, Matches list, Clips grid, Coaching reviews list/detail, Practice Train tab, Progress, Settings shell, Squad, Rosters (student), Login, Onboarding rail, Match page header — see notes-*.md.


## Leftovers round (agent-leftovers, 2026-10-30)
| Surface | Status | Note |
|---|---|---|
| Recurring mistakes ("What keeps coming up") on Progress | R (new) | Read-only `progress:recurring` IPC → GET /api/knowledge-bank?sort=most_recurring. Open habits flagged in 2+ analysed matches, whole-number counts, trend, last seen, link to Practice. Cache-first, honest empty/unavailable states. Valorant Progress only (demo games keep their own panels). |
| Copy app log (dropped from v3 Home) | R | Settings › Advanced › Support: "Copy app log for support" (existing support bundle; clipboard only). |
| "More on the web" (dropped from v3 Home) | covered | Settings footer already links to upforge.gg on every tab; no duplicate added. The old rail's per-feature web links are not carried over. |
| "Coach picked" clips | gap | No coach-selected clip field exists in the API (checked models, migrations, routes). Needs an API field before a tag can show. |

## Squad vs Coaches split (2026-10-30)
The v3 nav had merged coach rosters into a "Team" item with Squad. Fixed: separate **Coaches** (/rosters, every game, review badge) and **Squad** (/squad, members only, Valorant only as shipped). Roster components moved from `v3/team/` to `v3/coaches/`; squad helpers to `v3/squad/`; `TeamTabs` deleted. Non-members see Squad only as one row in Settings › Account. See ui-v3.md "Squad vs Coaches".
