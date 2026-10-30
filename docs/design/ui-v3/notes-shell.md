# Notes — shell banners & shared dialogs (agent-shell, round 3)

## Built (in-file `v-if="uiV3"` branches; old branches unchanged)
- **Banner row** (`.uf-banner` in v3.css shell section): one hairline row, 6px status dot (gold = warning, red = action needed), t4/bone text, link actions. Used by: app update (App.vue, with a 2px progress bar while downloading, "Restart now" in red when ready), OBS not connected (App.vue), DashboardBanners (payment + warnings in HomeV3), CloudUsageNotice (Matches/Clips), PaymentFailedAlert (`.uf-pay-alert`).
- **UfDialog**: RiotLinkPromptModal, TrimRangeModal (bar + steppers + range inputs), DemoAttachPickerModal (two-column picker: candidates / assessment).
- **DemoAttachGuide**: inline collapsible numbered steps.
- **Achievement toast**: square, hairline, bottom-right, `uf-rise` once, gold star only for achievements in the real catalogue, 4s timer line.
- Pure helpers + 15 tests: `src/lib/shell-v3.ts` (update line, trim maths, demo tone, genuine achievement, toast queue).

## Lead removed
- `.uf-shell-banner` overrides in v3.css and the class binding in App.vue (old OBS banner) — v3 has its own row now.
- `.cloud-usage` override: already gone; CloudUsageNotice has real v3 markup.

## Behaviour note (affects both UIs)
- **AchievementManager queue** now uses `createToastQueue`. The old queue advanced twice per dismiss (toast calls `onDismiss` and emits `dismiss`), which skipped every second queued achievement. This is a bug fix in shared script, not markup — flag for review.

## Checked
- type-check clean · eslint clean on shell files · full suite 1,493 passed / 9 skipped.
- Screenshot `/dashboard`: OBS banner row renders correctly. Update banner, payment alert, Riot link, trim, demo picker and toast were not triggerable with this account; covered by helper tests only.
