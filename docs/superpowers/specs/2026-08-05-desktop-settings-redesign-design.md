# Desktop settings redesign (approach A)

## Goal

Make UpForge Desktop Settings easier to navigate and quieter visually, while closing known product gaps. Keep controls that already work; restructure findability and hierarchy.

## Success criteria

- A user can answer “where is X?” from the left rail without opening nested accordions.
- Account is identity/billing/links only; app behavior lives under App.
- Recording is capture/storage/clips; OBS setup lives under Advanced with a clear cross-link.
- Deep links from dashboard / sidebar / account-link flows still land correctly (legacy query compat).
- Visual chrome is restrained: no hero blur orb, no purple gradient upgrade CTA, fewer nested cards.

## Information architecture

### Categories (left rail)

| ID | Label | Contents |
|----|--------|----------|
| `account` | Account | Profile, plan, usage, linked games, billing, sign out |
| `recording` | Recording | Capture modes, format/presets, audio, full VOD, clips, storage, save path |
| `trainer` | Trainer | Mouse/eDPI, crosshair, hotkeys, in-game feedback |
| `app` | App | Primary game, startup, notifications, Discord RP, automation toggles |
| `advanced` | Advanced | OBS connect/setup, diagnostics, match detection, updates, onboarding preview, help-adjacent tools |

### Deep link compatibility

| Incoming query | Resolves to |
|----------------|-------------|
| `?tab=general` (or missing) | `account` |
| `?tab=recording` | `recording` |
| `?tab=trainer` | `trainer` |
| `?tab=system` | `advanced` |
| `?tab=app` | `app` |
| `?tab=account` | `account` |
| `?tab=advanced` | `advanced` |

Optional: `?section=<id>` scrolls to and briefly highlights a section within the active category (e.g. `obs`, `storage`, `discord`).

Existing callers (`AppSidebar`, dashboard OBS warnings, account-link navigation, recordings) keep working via the legacy map above. Prefer updating internal links to new IDs when touched.

### Keep as-is

- Auto-save + saved toast
- Footer: version tap (dev mode), Get help, upforge.gg
- Core control behavior (modes, presets, hotkeys, billing portal, storage actions)

### Demote / relocate

- Badge/rank icon gallery: remove from Account; place under Advanced → Developer (collapsed by default; hidden entirely in screenshot mode)
- Updates UI: move from footer-only into Advanced (footer may still show “update ready” as a compact link)
- Nested accordions: replace with stacked sections; optional collapse only for long Advanced OBS detail

## UI layout

### Shell

- Left rail (~160–180px): icon + label per category; active state uses solid game-theme accent (no pill clusters)
- Main pane: category title + one-line purpose, then stacked sections
- Sticky footer: version · help · site (slim). Updates primary home is Advanced

### Content patterns

- `SettingsSection`: headline, short hint, controls
- `SettingsRow`: label/hint left, control right
- `SettingsStatusStrip` on Recording and Advanced: one row (OBS / capture / disk; Discord on App when relevant). Status dot + plain text, not floating badges
- Recording cross-link: “OBS & capture setup” → Advanced (`?tab=advanced&section=obs`)

### Visual cleanup

- Remove Settings hero blur orb and “Desktop App” eyebrow chrome
- Upgrade CTA: solid accent button (no purple gradient)
- One elevation level for sections (border + subtle bg); avoid cards-in-cards
- Preserve `useGameTheme` accents, restrained

### Motion

- Category switch: instant or ~150ms fade
- Keep existing save toast transition
- Section deep-link: brief highlight pulse (~1s), then clear

### Narrow window

- Prefer labels; icon-only rail collapse is optional stretch, not required for v1

## Components & data flow

### Files (intended)

- `SettingsView.vue` — shell: rail + active pane + footer
- Panes: `SettingsAccountPane`, `SettingsRecordingPane`, `SettingsTrainerPane`, `SettingsAppPane`, `SettingsAdvancedPane` (rename/split from current `*Tab` components)
- Shared: `SettingsSection`, `SettingsStatusStrip`, `SettingsRow`
- Reuse without rewrite: `SettingsAccountLinks`, trainer/crosshair pieces, OBS/storage actions via `useSettings`

### State

- Keep `provideSettings` / `useSettings` as IPC/save/load source of truth
- `SETTINGS_TABS` → category list with new IDs; legacy query mapper on mount
- Sync `route.query.tab` when the user changes category (replace, not push spam)
- `sectionOpen` accordion state largely unused after flatten; Advanced may keep one optional OBS detail collapse

### Product gaps closed

1. Split Account vs App preferences
2. Reduce Recording density (OBS out)
3. Give Advanced a real home (diagnostics + updates + OBS)
4. Section deep links (+ legacy tab map)
5. Remove Account badge gallery clutter (dev-only or gone)
6. Strip decorative blur / purple upgrade chrome
7. Status strip on Recording / Advanced (and Discord under App toggle)

## Out of scope

- New settings values or IPC APIs beyond navigation/presentation
- Search-first settings UI
- Moving Trainer settings into Training Hub
- Redesigning onboarding or billing flows themselves
- Desktop version bump / release tagging (follow normal release process after merge)

## Testing

- Unit: legacy `tab` query → category ID mapping (including `general` → `account`, `system` → `advanced`)
- Type-check (`npm run type-check`)
- Manual smoke: open each category; deep link from dashboard OBS warning; account link focus; save toast still fires; updates check from Advanced

## Risks

- Call sites that assume old tab labels in UI copy (“Open Settings → Recording” still correct; System → Advanced needs copy awareness)
- Large `useSettings.ts` stays a god object for v1; split only if required for the panes
