# Notes — Settings & Team (agent-settings)

## Built
- **Settings** — `src/views/v3/SettingsV3.vue`, switched in `SettingsView.vue` (`<SettingsV3 v-if="uiV3" />`).
  - SettingsView still calls `provideSettings()`; SettingsV3 uses `useSettings()`, so every pane, control,
    IPC call, `?tab=` / `?section=` deep link and the saved toast work unchanged.
  - v3 shell: `uf-label` "Settings" + `uf-d2` category title + `uf-t2` purpose; text tabs with red underline;
    a status line (Recorder ready / not connected from `captureBackendOk`, Plan from `user.tier`).
  - The existing panes render inside a scoped restyle (`:deep` under `.uf-settings-body`): square corners
    (switches keep their track), sections become a section label + hairline rows, nested panels lose their
    box, inputs flat with red focus, no glow, Plex Sans, `--game-accent` mapped to `--uf-red`.
  - `src/components/v3/settings/settings-v3-status.ts` (+ test).
- **Squad (paid team plan)** — `src/views/v3/SquadV3.vue`, switched in `SquadView.vue`. Pure view: SquadView keeps
  loading, 30 s polling, presence and invites, and passes state + handlers as props.
  - Team tabs (Squad · Coaches), head (plan label + D2 team name, refresh, "Manage on website"),
    briefing sentence (T1/T2 from the existing computed headline), stat row (online, matches this week,
    week record, shared credits — only when present), members with presence (live dot pulses only when
    recording), selected-member stats, member compare with inline bars, squad activity rows (win/loss in
    teal/red), invite form + pending invites, squad code copy, most-active list.
  - Honest states: loading skeleton, error + retry, no-squad empty state with one primary action.
- **Coaches (coach rosters)** — `src/views/v3/RostersV3.vue`, switched in `RostersView.vue`. Pure view: RostersView
  keeps load/boot/discovery/send/coach-mode logic. `RostersCoachPanel` is passed in the `#coach` slot (same
  `coachPanelRef`), and `RosterSendSheet` was moved outside the v3/old branches so sending works in both.
  - Mode switch as text tabs (Coach · Student with pending counts), stat row, coaches as hairline rows
    (avatar, Free/Paid and block state as small caps text — no pills — rank, counts, specialties, open/month
    limit bars), Send a match / With your coach / Recent notes as `TeamMatchRow` rows.
- Shared: `src/components/v3/team/{TeamTabs,TeamMatchRow}.vue`, `team-format.ts` (+ test).

## Checks
- `npm run type-check` clean · eslint clean on all my files · my tests 6/6 · full `npm test` 1377 passed.
- Screenshots: `rework-shots/settings-v3.jpg`, `squad-v3.jpg`, `rosters-v3.jpg` (Account tab; Squad and
  Coaches show their empty states because the test account has no squad or coach).

## Gaps / for the lead
- **Populated Squad/Coaches layouts are untested visually** — the test account has no squad and no coach.
  Worth a check with a seeded account (`LocalTestSeeder` student/coach) or the dev preview.
- The account pane's tier badge (purple "Plus" pill from `getTierBadgeClass`) still shows its colour inside
  the restyle. A shared rule for tier badges in v3 (e.g. plain caps text) would be better than overriding per
  screen.
- `RosterSendSheet` (modal) and `RostersCoachPanel` keep their old markup, softened by the scoped restyle
  (square corners, no panel boxes). A v3 modal pattern from the lead would let them match fully.
- Squad v3 drops the "your recent analyses/clips" panel (`SquadPersonalPanel`) — your own matches live under
  Matches in v3. Re-add if wanted; the data is still loaded by SquadView.
- Old `SettingsFooter` is reused (restyled); the version tap-to-enable-dev-mode still works.

## Round 3 (agent-team)
- **Coach side of Rosters rebuilt in v3.** Logic moved unchanged from `RostersCoachPanel.vue` into
  `src/components/rosters/useCoachRoster.ts` (same IPC: `coach.getRoster`, `getReviewRequests`,
  `updateRosterSettings`, `startReview`, `analyses.getTimeline` → `pendingTimeline` → `/vod-review`; same toasts,
  web links, `loaded`/`toast` emits, `defineExpose({ load })`). Pure rules/texts in `coach-roster.ts` (+ test).
  The panel provides the instance; with `uiV3` it renders `src/components/v3/team/CoachRosterV3.vue`
  (injects it), otherwise the old markup (byte-identical apart from `v-else` on the root).
  - v3 layout: status word (Live = win, Draft = gold, Closed = faint) + coach name · Copy invite · square
    `role="switch"` "Roster open/closed" · gold draft reason with one link (payouts / Coach Pro) · UfStatRow
    (members, in queue, this month) · Needs review (TeamMatchRow + "Annotate", "Full feed" link) · Members
    hairline rows (initial, name, Riot ID, subtitle, N open) · Community settings collapsible (aria-expanded),
    Paid/Free as UfTabs, square inputs, Save = the one primary, "Open on web" link.
  - `RostersV3.vue`: removed the `:deep()` overrides for the old panel; "Paid" tag no longer gold (gold is for
    bests); dropped the duplicate "Browse communities" header link ("Find another" + empty-state primary remain).
- **RosterSendSheet** has a `v-if="uiV3"` branch on `UfDialog` (kicker "Ask my coach", title = match label),
  coaches as hairline `role="radio"` rows in a `radiogroup` (roving tabindex, arrow keys), optional note,
  Cancel + primary "Send to <name>". Same LAST_COACH_KEY + emptyEligibleMessage. Old branch byte-identical.
  Call site (`RostersView.vue`, shared by both UIs) needs no change. Post-game doesn't use this sheet.
- **Squad**: restored from the old view using props SquadV3 already has: game mix in "Online now" sub
  (`gameMixLabel`, + test), member detail "No linked stats yet" state + Riot ID + most played agent, star next
  to the gold #1 in "Most active".
- Checks: type-check clean · eslint clean on my files · my tests 10/10 · full `npm test` 1463 pass, 1 fail in
  `settings/SettingsToggle.test.ts` (agent-settings2's file, not mine).

### For the lead
- **Personal panel (my recent analyses/clips) is still missing in Squad v3** — SquadView loads
  `recentAnalyses`/`recentClips` but doesn't pass them to SquadV3. If wanted: add two props in SquadView
  (not my file) and I'll render them as TeamMatchRow-style rows.
- **Coach side not visually verified** — the logged-in account isn't a coach (no mode switch). Seeded
  `coach@test.com` needed for a check.
- **Screenshots blank during round 3**: the app root collapsed (`#app` 980×44, `.product-shell` 54px wide)
  — shared shell/CSS, not a Team file. DOM text confirms Coaches/Squad render.

## Round 3 (agent-settings2, resumed)
- Every pane has real v3 markup (in-file `v-if="uiV3"` branches; old branches unchanged, only `v-else`/`v-else-if` added). SettingsV3 has no `:deep` overrides left.
- Lead asks done: **App › Preferences** has a v3-only "PC performance" row → `router.push('/performance')`. **Recording › Storage** now has "Cloud storage →" next to "Open folder →"; **Account › Usage** already had "Manage storage and view prices" → `/cloud-storage`.
- Trainer tab: older saved settings lack `movementSpeed` / `trainerVolume`, so the screen showed "%" and no speed. The v3 branch now shows the trainer's own defaults (Run 6.75, 80%), the same fallbacks `gaming-ipc.ts` uses. Old branch unchanged.
- `.uf-check` is now a square custom checkbox (the native unchecked box rendered white).
- `SettingsToggle.test.ts` covers both designs (lead's stub kept).
- Checks: type-check clean · eslint clean · full `npm test` 1496 passed, 9 skipped.


## Web header dead gate (spec only — web is the user's checkout)
`upforge-frontend/app/components/AppHeader.vue:48` shows the Squad link only for tiers `squad-4` / `squad-6`, which the API never sets (squad membership lives on `teams`, not the user tier). Fix: show the link when the user belongs to a team (e.g. a `team_id`/`team` on `/api/user`, or call `/api/teams/mine` once and cache), else hide it or link to `/team` as the plan page.
