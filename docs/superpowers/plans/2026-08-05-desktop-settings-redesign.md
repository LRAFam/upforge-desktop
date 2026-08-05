# Desktop Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild UpForge Desktop Settings with a left category rail, clearer Account / Recording / Trainer / App / Advanced split, status strips, and legacy deep-link compatibility.

**Architecture:** Pure `settings-nav` module owns tab/section query resolution. `SettingsView` becomes a shell (rail + pane + footer). Existing tab bodies are split into panes and shared section/row primitives; `useSettings` stays the IPC/save source of truth with updated category IDs.

**Tech Stack:** Vue 3 + Vue Router, TypeScript, Tailwind (existing desktop classes), Vitest, Electron IPC via `window.api` / `useSettings`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-05-desktop-settings-redesign-design.md`
- No new settings values or IPC APIs beyond navigation/presentation
- Keep auto-save + toast; keep footer version tap / Get help / upforge.gg
- No hero blur orb; no purple gradient upgrade CTA; solid accent only
- OBS setup lives under Advanced; Recording links to it
- Badge gallery leaves Account → Advanced Developer (hidden in screenshot mode)
- Do not bump `package.json` version in this plan
- Do not commit unrelated dirty files (`App.vue`, `screenshot-mode.ts`, etc.) unless a task explicitly requires them

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/settings-nav.ts` | Category IDs, legacy tab map, section ids, resolve helpers |
| `src/lib/settings-nav.test.ts` | Unit tests for query resolution |
| `src/components/settings/SettingsSection.vue` | Stacked section chrome |
| `src/components/settings/SettingsRow.vue` | Label/hint + control row |
| `src/components/settings/SettingsStatusStrip.vue` | Status dots row |
| `src/views/SettingsView.vue` | Shell: rail + active pane + footer + toast |
| `src/components/settings/SettingsAccountPane.vue` | Account only (from GeneralTab minus App prefs) |
| `src/components/settings/SettingsAppPane.vue` | Primary game + behavior toggles |
| `src/components/settings/SettingsRecordingPane.vue` | Capture/storage/clips (no OBS block) |
| `src/components/settings/SettingsTrainerPane.vue` | Trainer flattened |
| `src/components/settings/SettingsAdvancedPane.vue` | OBS + diagnostics + updates + developer |
| `src/components/settings/SettingsFooter.vue` | Slim footer (updates primary UI moves to Advanced) |
| `src/composables/useSettings.ts` | Category list, query sync, section highlight hook |
| `src/components/AppSidebar.vue` | Account/settings active + open links |
| `src/lib/account-link-navigation.ts` | Prefer `tab=account` |
| Delete after migrate: `SettingsGeneralTab.vue`, `SettingsRecordingTab.vue`, `SettingsTrainerTab.vue`, `SettingsSystemTab.vue` |

---

### Task 1: Settings nav resolver (TDD)

**Files:**
- Create: `src/lib/settings-nav.ts`
- Create: `src/lib/settings-nav.test.ts`

**Interfaces:**
- Produces:
  - `export type SettingsCategoryId = 'account' | 'recording' | 'trainer' | 'app' | 'advanced'`
  - `export type SettingsSectionId = 'obs' | 'storage' | 'discord' | 'developer' | 'capture' | 'usage' | 'hotkeys'`
  - `export function resolveSettingsCategory(tabQuery: unknown): SettingsCategoryId`
  - `export function resolveSettingsSection(sectionQuery: unknown): SettingsSectionId | null`
  - `export function isSettingsCategoryId(value: string): value is SettingsCategoryId`
  - `export const SETTINGS_CATEGORY_META: ReadonlyArray<{ id: SettingsCategoryId; label: string; purpose: string; icon: string }>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  resolveSettingsCategory,
  resolveSettingsSection,
} from './settings-nav'

describe('resolveSettingsCategory', () => {
  it('maps legacy and new tab ids', () => {
    expect(resolveSettingsCategory(undefined)).toBe('account')
    expect(resolveSettingsCategory('general')).toBe('account')
    expect(resolveSettingsCategory('account')).toBe('account')
    expect(resolveSettingsCategory('recording')).toBe('recording')
    expect(resolveSettingsCategory('trainer')).toBe('trainer')
    expect(resolveSettingsCategory('system')).toBe('advanced')
    expect(resolveSettingsCategory('advanced')).toBe('advanced')
    expect(resolveSettingsCategory('app')).toBe('app')
  })

  it('falls back to account for unknown values', () => {
    expect(resolveSettingsCategory('nope')).toBe('account')
    expect(resolveSettingsCategory(['recording', 'trainer'])).toBe('account')
  })
})

describe('resolveSettingsSection', () => {
  it('accepts known section ids', () => {
    expect(resolveSettingsSection('obs')).toBe('obs')
    expect(resolveSettingsSection('storage')).toBe('storage')
    expect(resolveSettingsSection('discord')).toBe('discord')
    expect(resolveSettingsSection('developer')).toBe('developer')
  })

  it('returns null for missing or unknown', () => {
    expect(resolveSettingsSection(undefined)).toBeNull()
    expect(resolveSettingsSection('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd upforge-desktop && npx vitest run src/lib/settings-nav.test.ts`

Expected: FAIL (module not found / export missing)

- [ ] **Step 3: Write minimal implementation**

```ts
export type SettingsCategoryId = 'account' | 'recording' | 'trainer' | 'app' | 'advanced'

export type SettingsSectionId =
  | 'obs'
  | 'storage'
  | 'discord'
  | 'developer'
  | 'capture'
  | 'usage'
  | 'hotkeys'

const CATEGORY_IDS: ReadonlySet<string> = new Set([
  'account',
  'recording',
  'trainer',
  'app',
  'advanced',
])

const SECTION_IDS: ReadonlySet<string> = new Set([
  'obs',
  'storage',
  'discord',
  'developer',
  'capture',
  'usage',
  'hotkeys',
])

const LEGACY_TAB_MAP: Record<string, SettingsCategoryId> = {
  general: 'account',
  system: 'advanced',
}

export function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return CATEGORY_IDS.has(value)
}

export function resolveSettingsCategory(tabQuery: unknown): SettingsCategoryId {
  const raw = Array.isArray(tabQuery) ? tabQuery[0] : tabQuery
  if (typeof raw !== 'string' || !raw) return 'account'
  if (isSettingsCategoryId(raw)) return raw
  return LEGACY_TAB_MAP[raw] ?? 'account'
}

export function resolveSettingsSection(sectionQuery: unknown): SettingsSectionId | null {
  const raw = Array.isArray(sectionQuery) ? sectionQuery[0] : sectionQuery
  if (typeof raw !== 'string' || !raw) return null
  return SECTION_IDS.has(raw) ? (raw as SettingsSectionId) : null
}

export const SETTINGS_CATEGORY_META: ReadonlyArray<{
  id: SettingsCategoryId
  label: string
  purpose: string
  icon: string
}> = [
  {
    id: 'account',
    label: 'Account',
    purpose: 'Plan, linked games, and sign-in',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>',
  },
  {
    id: 'recording',
    label: 'Recording',
    purpose: 'Capture, quality, clips, and storage',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>',
  },
  {
    id: 'trainer',
    label: 'Trainer',
    purpose: 'Aim calibration, crosshair, and hotkeys',
    icon: '<circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/>',
  },
  {
    id: 'app',
    label: 'App',
    purpose: 'Primary game, startup, and automation',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 6h9m-9 6h9m-9 6h9M4.5 6h.008v.008H4.5V6zm0 6h.008v.008H4.5V12zm0 6h.008v.008H4.5V18z"/>',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    purpose: 'OBS, diagnostics, updates, and developer tools',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
  },
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd upforge-desktop && npx vitest run src/lib/settings-nav.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings-nav.ts src/lib/settings-nav.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): add category and section query resolver

EOF
)"
```

---

### Task 2: Shared settings UI primitives

**Files:**
- Create: `src/components/settings/SettingsSection.vue`
- Create: `src/components/settings/SettingsRow.vue`
- Create: `src/components/settings/SettingsStatusStrip.vue`

**Interfaces:**
- Consumes: none from Task 1 (visual only); section `id` props use `SettingsSectionId` string values
- Produces: three Vue SFCs used by all panes

- [ ] **Step 1: Create `SettingsSection.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  id?: string
  title: string
  hint?: string
  highlightId?: string | null
}>()

const root = ref<HTMLElement | null>(null)
const highlighted = computed(() => !!props.id && props.highlightId === props.id)

onMounted(() => {
  if (highlighted.value) scrollIntoView()
})

watch(
  () => props.highlightId,
  (id) => {
    if (props.id && id === props.id) scrollIntoView()
  },
)

function scrollIntoView() {
  requestAnimationFrame(() => {
    root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
</script>

<template>
  <section
    :id="id ? `settings-section-${id}` : undefined"
    ref="root"
    class="rounded-xl border border-white/[0.10] bg-white/[0.02] overflow-hidden transition-shadow duration-500"
    :class="highlighted ? 'ring-2 ring-[color:var(--game-accent,#ef4444)]/40' : ''"
  >
    <div class="px-4 py-3 border-b border-white/[0.08]">
      <p class="text-sm font-semibold text-white">{{ title }}</p>
      <p v-if="hint" class="mt-0.5 text-xs text-gray-500">{{ hint }}</p>
    </div>
    <div class="p-4 space-y-4">
      <slot />
    </div>
  </section>
</template>
```

- [ ] **Step 2: Create `SettingsRow.vue`**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
}>()
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0 flex-1">
      <p class="text-sm text-gray-200">{{ label }}</p>
      <p v-if="hint" class="mt-1 text-xs text-gray-500">{{ hint }}</p>
      <slot name="below" />
    </div>
    <div class="flex-shrink-0">
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create `SettingsStatusStrip.vue`**

```vue
<script setup lang="ts">
export type StatusTone = 'ok' | 'warn' | 'bad' | 'neutral'

export type StatusItem = {
  id: string
  label: string
  detail: string
  tone: StatusTone
}

defineProps<{
  items: StatusItem[]
}>()

const toneDot: Record<StatusTone, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-400',
  bad: 'bg-red-500',
  neutral: 'bg-gray-500',
}
</script>

<template>
  <div class="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-white/[0.10] bg-black/20 px-3 py-2.5">
    <div v-for="item in items" :key="item.id" class="flex min-w-0 items-center gap-2">
      <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="toneDot[item.tone]" />
      <div class="min-w-0">
        <p class="text-[11px] font-medium text-gray-300">{{ item.label }}</p>
        <p class="truncate text-[11px] text-gray-500">{{ item.detail }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsSection.vue src/components/settings/SettingsRow.vue src/components/settings/SettingsStatusStrip.vue
git commit -m "$(cat <<'EOF'
feat(settings): add section, row, and status strip primitives

EOF
)"
```

---

### Task 3: Wire category state + SettingsView shell

**Files:**
- Modify: `src/composables/useSettings.ts` (tabs, active category, query sync, highlight)
- Modify: `src/views/SettingsView.vue` (left rail shell; temporary pane placeholders OK until later tasks)

**Interfaces:**
- Consumes: `SETTINGS_CATEGORY_META`, `resolveSettingsCategory`, `resolveSettingsSection` from Task 1
- Produces from `createSettings` / `provideSettings`:
  - `activeCategory: Ref<SettingsCategoryId>` (replace `activeTab` usages)
  - `setActiveCategory(id: SettingsCategoryId): void`
  - `highlightSection: Ref<SettingsSectionId | null>`
  - `SETTINGS_CATEGORIES` (alias of meta for template)
  - Keep exporting `activeTab` as deprecated alias of `activeCategory` only if needed for one commit; prefer full rename in this task

- [ ] **Step 1: Update `useSettings.ts` category list and mount query handling**

Replace `SETTINGS_TABS` / `activeTab` with:

```ts
import {
  SETTINGS_CATEGORY_META,
  resolveSettingsCategory,
  resolveSettingsSection,
  type SettingsCategoryId,
  type SettingsSectionId,
} from '../lib/settings-nav'

const SETTINGS_CATEGORIES = SETTINGS_CATEGORY_META
const activeCategory = ref<SettingsCategoryId>('account')
const highlightSection = ref<SettingsSectionId | null>(null)

function setActiveCategory(id: SettingsCategoryId): void {
  activeCategory.value = id
  const nextQuery: Record<string, string> = { tab: id }
  const link = route.query.link
  if (typeof link === 'string' && link) nextQuery.link = link
  if (highlightSection.value) nextQuery.section = highlightSection.value
  void router.replace({ path: '/settings', query: nextQuery })
}

// in onMounted, replace tabQuery block:
activeCategory.value = resolveSettingsCategory(route.query.tab)
highlightSection.value = resolveSettingsSection(route.query.section)
// clear highlight after 1s
if (highlightSection.value) {
  window.setTimeout(() => {
    highlightSection.value = null
  }, 1000)
}
```

Export `SETTINGS_CATEGORIES`, `activeCategory`, `setActiveCategory`, `highlightSection`. Remove old `SETTINGS_TABS` / `activeTab` (update all references in this file’s return object).

Watch `route.query.tab` so external navigations update `activeCategory` (dashboard deep links while Settings is already open):

```ts
watch(
  () => route.query.tab,
  (tab) => {
    activeCategory.value = resolveSettingsCategory(tab)
  },
)
watch(
  () => route.query.section,
  (section) => {
    const resolved = resolveSettingsSection(section)
    highlightSection.value = resolved
    if (resolved) {
      window.setTimeout(() => {
        if (highlightSection.value === resolved) highlightSection.value = null
      }, 1000)
    }
  },
)
```

- [ ] **Step 2: Rewrite `SettingsView.vue` shell**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { provideSettings } from '../composables/useSettings'
import { useGameTheme } from '../composables/useGameTheme'
import SettingsAccountPane from '../components/settings/SettingsAccountPane.vue'
import SettingsRecordingPane from '../components/settings/SettingsRecordingPane.vue'
import SettingsTrainerPane from '../components/settings/SettingsTrainerPane.vue'
import SettingsAppPane from '../components/settings/SettingsAppPane.vue'
import SettingsAdvancedPane from '../components/settings/SettingsAdvancedPane.vue'
import SettingsFooter from '../components/settings/SettingsFooter.vue'

const { theme, cssVars } = useGameTheme()
const {
  SETTINGS_CATEGORIES,
  activeCategory,
  setActiveCategory,
  savedToast,
  toastMessage,
} = provideSettings()

const activeMeta = computed(
  () => SETTINGS_CATEGORIES.find((c) => c.id === activeCategory.value) ?? SETTINGS_CATEGORIES[0],
)

const railActiveClass = computed(
  () => `${theme.value.accentBg} ${theme.value.accentText} ring-1 ${theme.value.accentBorder}`,
)
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden text-white" :style="cssVars">
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <nav class="flex w-[168px] flex-shrink-0 flex-col gap-0.5 border-r border-white/[0.09] bg-[#141414] px-2 py-3">
        <p class="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">Settings</p>
        <button
          v-for="cat in SETTINGS_CATEGORIES"
          :key="cat.id"
          type="button"
          class="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors"
          :class="activeCategory === cat.id ? railActiveClass : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'"
          @click="setActiveCategory(cat.id)"
        >
          <svg class="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-html="cat.icon" />
          {{ cat.label }}
        </button>
      </nav>

      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div class="flex-shrink-0 border-b border-white/[0.08] px-4 py-3">
          <h1 class="text-lg font-semibold tracking-tight text-white">{{ activeMeta.label }}</h1>
          <p class="mt-0.5 text-xs text-gray-500">{{ activeMeta.purpose }}</p>
        </div>

        <div class="flex-1 space-y-4 scroll-col px-4 py-4">
          <SettingsAccountPane v-if="activeCategory === 'account'" />
          <SettingsRecordingPane v-else-if="activeCategory === 'recording'" />
          <SettingsTrainerPane v-else-if="activeCategory === 'trainer'" />
          <SettingsAppPane v-else-if="activeCategory === 'app'" />
          <SettingsAdvancedPane v-else-if="activeCategory === 'advanced'" />
        </div>
      </div>
    </div>

    <SettingsFooter />

    <Transition name="toast-slide">
      <div
        v-if="savedToast"
        class="pointer-events-none fixed right-5 bottom-5 flex items-center gap-2 rounded-xl border border-green-500/20 bg-[#121212] px-4 py-2.5 text-sm text-white shadow-xl"
      >
        <svg class="h-4 w-4 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
        {{ toastMessage || 'Settings saved' }}
      </div>
    </Transition>
  </div>
</template>
```

Note: panes do not exist yet. Create stub panes in this same step so type-check/dev do not break:

```vue
<!-- each stub: SettingsAccountPane.vue etc. -->
<script setup lang="ts"></script>
<template>
  <p class="text-xs text-gray-500">Coming in next tasks.</p>
</template>
```

- [ ] **Step 3: Run type-check (expect stubs OK)**

Run: `cd upforge-desktop && npm run type-check`

Expected: PASS (or only pre-existing errors unrelated to settings)

- [ ] **Step 4: Commit**

```bash
git add src/composables/useSettings.ts src/views/SettingsView.vue src/components/settings/SettingsAccountPane.vue src/components/settings/SettingsAppPane.vue src/components/settings/SettingsRecordingPane.vue src/components/settings/SettingsTrainerPane.vue src/components/settings/SettingsAdvancedPane.vue
git commit -m "$(cat <<'EOF'
feat(settings): add left-rail shell and category routing

EOF
)"
```

---

### Task 4: App pane (primary game + behavior)

**Files:**
- Modify: `src/components/settings/SettingsAppPane.vue`
- Source markup from: `src/components/settings/SettingsGeneralTab.vue` (Your game + General preferences + Discord status)

**Interfaces:**
- Consumes: `useSettings()` toggles, `PRIMARY_GAMES`, `selectPrimaryGame`, Discord refresh pattern from GeneralTab
- Produces: full App category UI

- [ ] **Step 1: Move “Your game” block into `SettingsAppPane`** wrapped in `SettingsSection` (`title="Your game"`)

- [ ] **Step 2: Move behavior toggles + Discord status block into App pane** using `SettingsSection` + `SettingsRow` (no accordion). Pass `highlight-id` / `id="discord"` on the Discord-related row’s parent section when `highlightSection === 'discord'`.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SettingsAppPane.vue
git commit -m "$(cat <<'EOF'
feat(settings): extract App preferences pane

EOF
)"
```

---

### Task 5: Account pane cleanup

**Files:**
- Modify: `src/components/settings/SettingsAccountPane.vue`
- Source: `SettingsGeneralTab.vue` (AccountLinks, Account profile/billing, Usage)
- Do **not** include: Your game, General preferences, badge gallery

**Interfaces:**
- Consumes: existing GeneralTab account/usage logic via `useSettings`
- Produces: Account-only pane

- [ ] **Step 1: Port `SettingsAccountLinks` + profile/billing/sign-out into Account pane** as stacked `SettingsSection`s (`Profile`, optional payment alert inside). Remove accordion toggles.

- [ ] **Step 2: Port Usage section** with `id="usage"` and `highlightId` from `useSettings().highlightSection`. Replace purple gradient upgrade button with solid accent:

```vue
<button
  class="mt-3 w-full rounded-xl py-2 text-xs font-semibold text-white transition-colors"
  :class="theme.accentBg"
  @click="openUpgrade"
>
  Upgrade plan
</button>
```

Import `useGameTheme` for `theme` (or use existing red solid `bg-red-500` if theme helper is awkward in-pane).

- [ ] **Step 3: Confirm badge gallery is absent from Account**

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsAccountPane.vue
git commit -m "$(cat <<'EOF'
feat(settings): rebuild Account pane without app prefs clutter

EOF
)"
```

---

### Task 6: Recording pane (OBS out, status strip, cross-link)

**Files:**
- Modify: `src/components/settings/SettingsRecordingPane.vue`
- Source: `SettingsRecordingTab.vue` minus OBS block (lines ~234–315 in current file)
- Keep: game modes / CS2 / Deadlock capture, format presets, audio, full VOD, save path, storage, clips, auto-delete controls

**Interfaces:**
- Consumes: `SettingsStatusStrip`, `SettingsSection`, `useSettings` recording fields
- Produces: Recording category without OBS setup

- [ ] **Step 1: Build status strip items** in the pane script:

```ts
import { computed } from 'vue'
import type { StatusItem } from './SettingsStatusStrip.vue'

const statusItems = computed<StatusItem[]>(() => {
  const items: StatusItem[] = []
  items.push({
    id: 'obs',
    label: 'OBS',
    detail: obsStatus.value?.connected
      ? `Connected · v${obsStatus.value.obsVersion ?? '?'}`
      : 'Not connected',
    tone: obsStatus.value?.connected ? 'ok' : 'warn',
  })
  items.push({
    id: 'disk',
    label: 'Disk',
    detail: diskSpaceCritical.value ? 'Critical' : diskSpaceLow.value ? 'Low' : storageSummary.value,
    tone: diskSpaceCritical.value ? 'bad' : diskSpaceLow.value ? 'warn' : 'ok',
  })
  return items
})
```

(Pull `obsStatus`, `diskSpaceCritical`, `diskSpaceLow`, `storageSummary` from `useSettings`.)

- [ ] **Step 2: Port capture + format + storage + clips markup** into stacked sections. Section ids: `capture`, `storage`. No accordion headers.

- [ ] **Step 3: Add Advanced cross-link** under the status strip:

```vue
<button
  type="button"
  class="text-xs font-medium text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
  @click="router.push({ path: '/settings', query: { tab: 'advanced', section: 'obs' } })"
>
  OBS &amp; capture setup
</button>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsRecordingPane.vue
git commit -m "$(cat <<'EOF'
feat(settings): rebuild Recording pane without OBS setup

EOF
)"
```

---

### Task 7: Advanced pane (OBS + diagnostics + updates + developer)

**Files:**
- Modify: `src/components/settings/SettingsAdvancedPane.vue`
- Modify: `src/components/settings/SettingsFooter.vue` (slim: keep version/help/site; compact “update ready” link OK; remove primary Check for updates UX if duplicated)
- Source OBS from `SettingsRecordingTab.vue`; diagnostics from `SettingsSystemTab.vue`; badge gallery from `SettingsGeneralTab.vue`; update controls from `SettingsFooter.vue`

**Interfaces:**
- Consumes: OBS actions + system diagnostics + update phase from `useSettings`
- Produces: Advanced category as the home for OBS/diagnostics/updates

- [ ] **Step 1: Status strip** for Advanced: OBS + capture backend (`captureBackendOk` / `captureBackendDescription`)

- [ ] **Step 2: Port full OBS block** into `SettingsSection` with `id="obs"` and `highlightId`

- [ ] **Step 3: Port System diagnostics** (capture method, match detection test, preview onboarding) into sections (no accordion)

- [ ] **Step 4: Port updates UI** (check / downloading % / restart) into an Updates section

- [ ] **Step 5: Developer section** (`id="developer"`): badge gallery + only when `!SCREENSHOT_MODE`. Collapsed by default via local `ref(false)` “Show developer tools” toggle (not global `sectionOpen`)

- [ ] **Step 6: Slim `SettingsFooter`**: version tap, Get help, upforge.gg; if `updatePhase === 'ready'`, keep a compact “Restart to update” text button so users still see it from any category

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/SettingsAdvancedPane.vue src/components/settings/SettingsFooter.vue
git commit -m "$(cat <<'EOF'
feat(settings): build Advanced pane for OBS, diagnostics, updates

EOF
)"
```

---

### Task 8: Trainer pane flatten

**Files:**
- Modify: `src/components/settings/SettingsTrainerPane.vue`
- Source: `SettingsTrainerTab.vue`

**Interfaces:**
- Consumes: existing trainer/crosshair/hotkey state from `useSettings`
- Produces: flattened Trainer category

- [ ] **Step 1: Port Mouse & trainer, Crosshair, Shortcuts / in-game feedback** into three `SettingsSection`s (ids: none / none / `hotkeys`). Remove accordion chevrons.

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/SettingsTrainerPane.vue
git commit -m "$(cat <<'EOF'
feat(settings): flatten Trainer settings pane

EOF
)"
```

---

### Task 9: Deep links + callers + delete old tabs

**Files:**
- Modify: `src/lib/account-link-navigation.ts`
- Modify: `src/components/AppSidebar.vue`
- Modify: any remaining `tab=general` / `tab=system` internal links optionally (legacy still works via resolver; prefer updating when touching)
- Delete: `SettingsGeneralTab.vue`, `SettingsRecordingTab.vue`, `SettingsTrainerTab.vue`, `SettingsSystemTab.vue`
- Grep: ensure no imports of deleted files

**Interfaces:**
- Consumes: `resolveSettingsCategory` semantics (already in useSettings)
- Produces: sidebar Account vs Settings active states for new IDs

- [ ] **Step 1: Update account link helper**

```ts
export function accountLinkSettingsPath(game: PrimaryGame): {
  path: string
  query: { tab: 'account'; link: PrimaryGame }
} {
  return { path: '/settings', query: { tab: 'account', link: game } }
}
```

- [ ] **Step 2: Update `AppSidebar.vue`**

```ts
const settingsActive = computed(() => {
  if (route.path !== '/settings') return false
  const tab = resolveSettingsCategory(route.query.tab)
  return tab !== 'account'
})

const accountActive = computed(() => {
  if (route.path !== '/settings') return false
  return resolveSettingsCategory(route.query.tab) === 'account'
})

function openAccount() {
  router.push({ path: '/settings', query: { tab: 'account' } }).catch(() => {})
}

function openSettings() {
  router.push({ path: '/settings', query: { tab: 'recording' } }).catch(() => {})
}
```

Import `resolveSettingsCategory` from `../lib/settings-nav`.

- [ ] **Step 3: Delete old `*Tab.vue` files** and fix any leftover imports

- [ ] **Step 4: Optional cleanup** — update dashboard copy that says “System” to “Advanced” only if such copy exists (grep `tab=system` / `System settings`)

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/account-link-navigation.ts src/components/AppSidebar.vue src/components/settings/
git commit -m "$(cat <<'EOF'
feat(settings): update deep links and remove legacy tab components

EOF
)"
```

---

### Task 10: Verify

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `cd upforge-desktop && npx vitest run src/lib/settings-nav.test.ts`

Expected: PASS

- [ ] **Step 2: Type-check**

Run: `cd upforge-desktop && npm run type-check`

Expected: PASS

- [ ] **Step 3: Manual smoke checklist** (dev app)

1. Open Settings → left rail shows Account / Recording / Trainer / App / Advanced
2. Account has links + profile + usage; no startup toggles; no badge gallery
3. App has primary game + toggles + Discord status
4. Recording has status strip + “OBS & capture setup” link → Advanced scrolls/highlights OBS
5. Advanced has OBS, diagnostics, updates, developer gallery (when not screenshot mode)
6. Footer still shows version / help / site; update-ready still reachable
7. From dashboard OBS warning (`/settings?tab=recording`) still lands on Recording
8. Account link flow with `?tab=general` still opens Account
9. Save a toggle → toast still appears

- [ ] **Step 4: Final commit only if Step 3 found small fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(settings): polish settings redesign smoke findings

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Left category rail | 3 |
| Account / Recording / Trainer / App / Advanced IA | 4–8 |
| Legacy tab query map | 1, 3, 9 |
| Section deep links + highlight | 1, 2, 3, 6, 7 |
| OBS under Advanced + Recording cross-link | 6, 7 |
| Status strips | 2, 6, 7 |
| Remove blur / purple upgrade / nested accordions | 3, 5, 4–8 |
| Badge gallery → Advanced Developer | 5, 7 |
| Updates in Advanced; slim footer | 7 |
| Keep auto-save/toast/help | 3, 7 |
| Tests + type-check | 1, 10 |
| No new IPC / no version bump | Global constraints |

## Self-review notes

- No TBD placeholders in tasks
- `activeTab` fully renamed in Task 3 to avoid dual APIs
- Pane tasks move existing markup rather than inventing new controls
- Unrelated dirty tree files stay unstaged unless required
