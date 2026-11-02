# Audit fixes · Settings, onboarding, Overstep, Performance (2 Nov 2026)

## What changed
| # | Finding | Fix | Files |
|---|---|---|---|
| 1 | Four toggle styles | Crosshair ON/OFF pills replaced by a new v3 editor using `SettingsToggle` (.uf-switch). Advanced › "Keep my active OBS scene" is now a SettingsRow + switch. Overstep checkboxes use `.uf-check`. Removed the old duplicate `.uf-check` rules from settings-v3.css (they fought the shared v3.css checkbox). Sliders (`.uf-range`) are bone, not red. | `SettingsAdvancedPane.vue`, `OverstepView.vue`, `v3/settings/settings-v3.css` |
| 2 | Valorant showed the empty link form while linked | Cause: the Riot list loaded last, after the user refresh + FACEIT + Deadlock calls (several seconds). `reloadAccountLinks` now runs all four in parallel; new `riotAccountsLoaded` flag; until the list lands the signed-in user's Riot ID shows as Main (no actions), and the link form only shows once the list says none are linked. Region selects default from `riot_region` / `lol_platform` / device time zone, else NA for both. | `useSettings.ts`, `SettingsAccountLinks.vue`, `v3/settings/settings-display.ts` |
| 3 | Valorant/League forms indented with a rule, CS2 not | Link forms no longer use `.uf-inset`; all games share one indent. | `SettingsAccountLinks.vue`, `settings-v3.css` |
| 4 | Two titles | H1 is always "Settings", tab purpose below, tabs. Profile section hint removed in v3. | `SettingsV3.vue`, `SettingsAccountPane.vue` |
| 5 | "Buy 3 report credits" on unlimited | Hidden when `reports.limit === null`; purchased-credit line kept when credits > 0. | `AccountUsagePanel.vue` |
| 6 | Training consent between Usage and Game accounts | Moved to App › "Privacy & data". | `SettingsAccountPane.vue`, `SettingsAppPane.vue` |
| 7 | App › Your game picker duplicated the title bar | v3 shows a read-only "Your game" row (logo + name, "switch it in the title bar"). Classic UI unchanged. | `SettingsAppPane.vue` |
| 8 | Ctrl Shift U on macOS, wide key boxes | `shortcutKeyParts()` → ⌘ ⇧ U on mac, Ctrl Shift U on Windows (also for rebindable keys); key buttons size to content. | `SettingsTrainerPane.vue`, `settings-display.ts`, `settings-v3.css` |
| 9 | No live crosshair preview | `CrosshairEditorV3.vue`: sticky canvas preview (lib/crosshair `renderCrosshairPreview`) beside the controls. | `v3/settings/CrosshairEditorV3.vue`, `crosshair-editor.ts` |
| 10 | "No UpForge media on disk" vs Matches' 30 recordings | v3 line: "No recordings saved on this PC · X free" / "X saved on this PC"; note says cloud recordings are counted in Matches / Cloud storage. | `SettingsRecordingPane.vue` |
| 11 | Onboarding | Counter/rail count only shown steps (01/05 → 04/05 is now 01/03 → 02/03); done = bone, current = red. Step 1 shows who is signed in + "Still to do". | `OnboardingView.vue`, `v3/onboarding/onboarding-steps.ts`, `OnboardingRailV3.vue`, `onboarding-v3.css` |
| 12 | Overstep | Plain title "Overstep" (no "LOCAL PLAYTEST" label), `.uf-check` boxes, one empty state instead of an empty list beside an empty column. | `OverstepView.vue` |
| 13 | Performance dead end on macOS | Honest panel ("Only on Windows", what it does, Back to Settings); Settings › App hides the "PC performance" row on macOS. | `PerformanceView.vue`, `SettingsAppPane.vue` |

## Verified
- `npx vitest run src/components/v3/settings src/components/v3/onboarding src/components/settings` → 5 files, 36 tests pass (new: `settings-display.test.ts`, extra cases in `onboarding-steps.test.ts`). SettingsToggle test passes.
- Full `npx vitest run`: 2107 pass, 1 fail in `src/components/vod-review/personal-review-placement.test.ts` (not my area).
- `npm run type-check`: only errors are in `src/components/v3/matchpage/MatchPageHeaderV3.vue` (another agent's file); none in mine.
- `npx eslint` on every changed file: clean.
- Screenshots of every Settings tab, /overstep, /performance and the onboarding preview (Continue pressed in preview only → "02 / 03"). No settings were toggled.

## Left / for the lead
- `src/components/v3/practice/CrosshairPreview.vue` didn't exist when I worked. The v3 editor draws its own canvas preview; swap in CrosshairPreview later if you want one shared preview.
- The classic `CrosshairSettingsPanel.vue` (not my file) still has green ON/OFF pills; it now only renders in the classic UI.
- `src/lib/settings-nav.ts` (not mine): App tab purpose still says "Primary game, startup, and automation"; maybe "Startup, automation and privacy".
- Splash art on the onboarding left: not added. The rail already uses `hero-agents.webp` big on wide windows; at the 720×600 onboarding size it's the band at the top.
- On macOS the sidebar still highlights Settings on /performance (shell, lead-owned).
