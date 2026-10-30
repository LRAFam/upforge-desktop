# UI v3 — review against the rulebook

Reviewer pass, 30 Oct 2026. Scope: `src/views/v3/*`, `src/components/v3/{home,postgame,matches,practice,progress,settings,team}/**`,
the v3 branch of `ClipsView.vue`, and the switches in the nine views. Lead-owned files (App.vue, v3.css, base components, rr-history) excluded.

**Checks run:** `npm run type-check` clean · `npx eslint src --ext .ts,.vue` clean · `npx vitest run src/views/v3 src/components/v3 src/lib/ui-v3.test.ts` → 10 files, 49 tests pass.
**Screenshots:** `scratchpad/rework-shots/review-*.jpg` (+ `sheet0/1/3.jpg`). The test account has no matches/clips/squad/coach, so only empty states were seen.

What's already right: one primary per screen state everywhere; one `uf-t1` per state (the extras are `v-if` alternatives); no game tabs inside screens;
no icon-only buttons without labels; no clickable non-buttons (only a dialog backdrop `@click.self`); no gradient buttons/text; truth rules held —
every user-facing number or sentence traces to real data or a static empty-state message (Practice dropped the view's invented fallback reasons and loadout name).
All old Matches actions (watch, delete, bulk delete, open folder, dismiss, groups, open best, cloud) are reachable in v3.

## P1 — must fix

None found in the agents' areas. (Lead-owned: the OBS warning banner and `CloudUsageNotice` still render in the old style on every v3 screen — see P2-1.)

## P2 — should fix

1. **Old-style shared strips on every v3 screen.** `DashboardBanners`/OBS banner (App shell) and `src/components/shared/CloudUsageNotice.vue`
   (Matches, Clips) use rounded bordered boxes, amber fills and old type. *Rule 2/3/5.* **Fix (lead):** add a v3 branch: a single hairline row,
   `uf-t4` text, gold dot for warnings, actions as `UfButton variant="link"`.
2. **Six private tab styles, all off-scale (14px / 13px).** `SettingsV3.vue:96`, `PracticeV3.vue:197`, `RostersV3.vue:214`, `TeamTabs.vue:25`,
   `MatchesTabsV3.vue:43`, `ProgressV3.vue:189`, plus filter tabs `MatchesV3.vue:147`, `PracticeV3.vue:221`, ClipsView `.uf-cl-filter`.
   *Rule 5 (type roles only) + consistency.* **Fix:** lead adds one base `UfTabs` (text `uf-t3` 15/600 for page tabs, `uf-t4` 13 for filters,
   red 2px underline when on); every screen uses it and drops its local CSS.
3. **Tabs sit in different places.** Matches/Clips/Practice/Settings: label → D2 title → tabs. Squad/Coaches: tabs *above* the header
   (`SquadV3.vue:117`, `RostersV3.vue:89`), and Squad's empty/loading states have no title at all. *Consistency.* **Fix:** render
   `uf-label "Team"` + D2 (`Squad` / `Your coaches`) first, then `TeamTabs`, on every state.
4. **Two D2s on one screen.** Empty states repeat the display role under the header title: `MatchesV3.vue:74` ("No matches yet"),
   `ClipsView.vue:181` ("No clips yet"). *Rule 1/5 (one hero).* **Fix:** use `uf-t1` for the empty-state sentence (as Rosters/Squad do).
5. **Off-scale sizes.** `RostersV3.vue:226` and `ClipTileV3.vue:78` use 11px tags → use `.uf-label` (12px). `RostersV3.vue:222` avatar 22px,
   `SquadV3.vue:271` 18px, `SquadV3.vue:292` 22px code → `uf-d4` (26) or `uf-t3`. `SettingsV3.vue:93/100`, `RostersV3.vue:236`,
   `SquadV3.vue:274/287`, `PracticeV3.vue:230`, `PostGameV3.vue:191`, `RankJourney.vue:94` (20px arrow) → nearest role (`uf-t3` 15 or `uf-t4` 13).
6. **Focus "miss" painted brand red.** `HomeFocusPanel.vue:71` `.hf-slot--miss { background: var(--uf-red) }`. A missed game is loss data.
   *Rule 4.* **Fix:** `var(--uf-loss)`; keep red for the focus progress fill only.
7. **Boxes inside boxes in Settings › Account.** `SettingsAccountPane.vue:~99` button grid renders as four bordered boxes (Sign out tinted red),
   and `SettingsAccountLinks.vue:382` "Link game accounts" is a bordered card containing a bordered Valorant card. *Rule 2.* **Fix (agent-settings,
   scoped CSS):** flatten to hairline rows: actions as `UfButton secondary` in one row, Sign out as `variant="link"`; drop the outer card border.
8. **Home drops live pipeline status.** v3 Home removes `DashboardLiveOps` (capture → upload → AI analysis progress), `DashboardActivityFeed`,
   and the right rail's weekly sessions. The title bar only shows OBS/recording. A user can't see "analysis running / upload waiting" on Home.
   *Done-when: no behaviour regressions.* **Fix:** add a one-line live status under the actions in `HomeV3.vue` (`uf-live` dot + `uf-t4`,
   reusing `useDashboard` pipeline state) when an upload/analysis is in progress; keep "Recent activity" reachable via Matches › Coaching reviews.
9. **Duplicated logic will drift.** `src/components/v3/matches/useFootageLibrary.ts` is a copy of `RecordingsView.vue`'s script (276 vs 617 lines),
   and Clips v3 is inline in `ClipsView.vue` (~2,000 lines). **Fix (follow-up):** make `RecordingsView.vue` use `useFootageLibrary` too, so both
   UIs share one source of truth; leave ClipsView as is until the old UI is removed.

## P3 — polish

1. Decorative brand red on step numbers: `HomeV3.vue:144` ("01" red) and `PracticeV3.vue:107`. Use `--uf-faint` for all numbers, or bone for the current step.
2. `RankJourney.vue:64–83` hard-codes hex in SVG attributes. Use `currentColor` / CSS vars so tokens stay the single source.
3. Post-game: result word is mixed case ("Victory") while Home/board use caps (`post-game-v3.ts:17`) — return `VICTORY`/`DEFEAT`.
   Primary "Review coaching" uses the `home` icon (`PostGameV3.vue:122`) — use `spark` or none.
4. Settings › Account shows the purple "Plus" tier badge (outside the four colours). Show the plan as plain `uf-t3` text, or gold with a star for Pro.
5. Clips v3 lost the grid/list toggle and "Expand all / Collapse" (old header). Fine to drop, but say so in notes or restore as text links.
6. Practice header stats ("— day streak · 0 · 0") read as three big numbers next to the D2 title; use `uf-t4` with a `uf-d4` number, or drop when all zero.
7. Status dots use 4px radius on 7px dots (`SettingsV3.vue:94`, `RostersV3.vue:237`, `SquadV3.vue:277`, `PostGameV3.vue:173`) — fine as circles, but match the shell's 6px/3px dot.

## Fixes applied — fixer A (30 Oct 2026)

- **P2-2 one tab style.** New base `src/components/v3/UfTabs.vue` (+ `UfTabs.test.ts`, 3 tests): `size="page"` 15/600 with 22px gap, `size="filter"` 13/600, red 2px underline when on, `role="tablist"`/`tab`, `aria-selected`, roving tabindex, ←/→ keys, optional counts and `divider`. Replaced every hand-rolled tab row and dropped the local tab CSS: `SettingsV3` (sections), `PracticeV3` (sections + drill categories), `RostersV3` (Coach/Student mode, as filter), `team/TeamTabs.vue` (now a thin wrapper), `matches/MatchesTabsV3.vue`, `MatchesV3` (game + status filters — game logos dropped from the filter text), `ProgressV3` (range), `ClipsView` v3 (type / group / sort). State wiring unchanged.
- **P2-3 header order.** Squad and Coaches now render `uf-label "Team"` → D2 → `TeamTabs` on every state; Squad loading/error/empty states get the same header ("Squad"). Label simplified to "Team" / "Team · {plan}".
- **P2-4 one D2.** Empty states use `uf-t1`: `MatchesV3` "No matches yet", `ClipsView` "No clips yet".
- **P2-5 off-scale sizes.** Rosters tag 11→12 label, avatar 22→26 (D4), toast 14→15/600, dot 6/3; Squad member mark 18→26, presence →13/400, input 14→16, code 22→26; ClipTileV3 tag 11→12; Settings status values → `uf-t3`, toast →15/600, dot 6/3; Practice select 14→16; RankJourney arrow 20→15. (Settings buttons stay 14 to match the base secondary button.)
- **P2-7 Settings › Account.** Scoped restyle in `SettingsV3`: the 2×2 bordered button grid is one hairline-topped row of outlined buttons with **Sign out as a quiet text link** (loss colour on hover); "Link game accounts" loses its outer box and each game card becomes a hairline row under a section label.
- **P3 quick wins.** Practice step numbers faint, not red (P3-1); Practice header stats hidden while all zero (P3-6); Settings tier badge as plain text, gold for Pro (P3-4); post-game result word in caps (`VICTORY`/`DEFEAT`/`DRAW`) and primary icon `spark` (P3-3); status dots 6/3 (P3-7).
- **Truth fix.** `ProgressV3` note said the rank line shows "the last 30 days"; the lead now fetches all history in v3, so it reads "covers your whole rank history".
- Not touched (other owners): App.vue / OBS banner, `v3.css`, `CloudUsageNotice`, Home (P2-1, P2-6, P2-8), `useFootageLibrary` dedupe (P2-9).

Checks: `npm run type-check` clean · `npx eslint` on all 17 changed files clean · `npx vitest run src/components/v3 src/views/v3` 54/54 · full `npm test` 1385 passed, 9 skipped. Screenshots: `scratchpad/rework-shots/fixA-*.jpg` (+ `fixA-sheet.jpg`).
