# OBS Force UpForge Scene Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default match recording to force-switch OBS to the `UpForge` scene, with a one-time migration for existing installs and an Advanced opt-out for content creators.

**Architecture:** Keep existing `switchScene: !obsPreserveActiveScene` runtime. Change the default to `false`, add a pure `migrateObsPreserveSceneDefaultV2` helper (same pattern as `migrateOnboardingFlags`), call it during `SettingsManager.load()`, and persist so the sentinel sticks. Update UI/composable fallbacks so nothing hardcodes `?? true`.

**Tech Stack:** Electron main TypeScript, Vue 3 settings UI, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-obs-force-upforge-scene-default-design.md`
- Sentinel key: `obsPreserveSceneDefaultV2` (boolean, `true` means migration already applied)
- New default: `obsPreserveActiveScene: false`
- No stream-detection / warn-block UI in this change
- No em dashes in user-facing copy
- Do not commit unless the user asks

## File map

| File | Responsibility |
|------|----------------|
| `electron/main/obs-preserve-scene-migrate.ts` | Pure migration helper |
| `electron/main/obs-preserve-scene-migrate.test.ts` | Unit tests for migration |
| `electron/main/settings-manager.ts` | `DEFAULTS`, type field, call migrate + persist on load |
| `src/env.d.ts` | Renderer `AppSettings` type parity |
| `src/composables/useSettings.ts` | Local settings fallback default |
| `electron/main/index.ts` | `obsPreserveActiveScene ?? false` when building recorder settings |
| `src/components/settings/SettingsAdvancedPane.vue` | Checkbox hint copy |

---

### Task 1: Migration helper (TDD)

**Files:**
- Create: `electron/main/obs-preserve-scene-migrate.ts`
- Create: `electron/main/obs-preserve-scene-migrate.test.ts`

**Interfaces:**
- Consumes: none
- Produces:

```ts
export type ObsPreserveSceneMigrateInput = {
  obsPreserveActiveScene?: boolean
  obsPreserveSceneDefaultV2?: boolean
}

export function migrateObsPreserveSceneDefaultV2<T extends ObsPreserveSceneMigrateInput>(
  parsed: T,
): T
```

Behaviour:
- If `obsPreserveSceneDefaultV2 !== true`: return copy with `obsPreserveActiveScene: false` and `obsPreserveSceneDefaultV2: true`
- If already `true`: return shallow copy unchanged (including `obsPreserveActiveScene: true`)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { migrateObsPreserveSceneDefaultV2 } from './obs-preserve-scene-migrate'

describe('migrateObsPreserveSceneDefaultV2', () => {
  it('forces preserve off and sets sentinel when sentinel missing', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: true,
      }),
    ).toEqual({
      obsPreserveActiveScene: false,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('forces preserve off when sentinel is false', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: true,
        obsPreserveSceneDefaultV2: false,
      }),
    ).toEqual({
      obsPreserveActiveScene: false,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('leaves creator opt-in alone after migration', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: true,
        obsPreserveSceneDefaultV2: true,
      }),
    ).toEqual({
      obsPreserveActiveScene: true,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('leaves preserve off alone after migration', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: false,
        obsPreserveSceneDefaultV2: true,
      }),
    ).toEqual({
      obsPreserveActiveScene: false,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('does not mutate the input object', () => {
    const input = { obsPreserveActiveScene: true as boolean }
    migrateObsPreserveSceneDefaultV2(input)
    expect(input).toEqual({ obsPreserveActiveScene: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd upforge-desktop && npx vitest run electron/main/obs-preserve-scene-migrate.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement helper**

```ts
export type ObsPreserveSceneMigrateInput = {
  obsPreserveActiveScene?: boolean
  obsPreserveSceneDefaultV2?: boolean
}

export function migrateObsPreserveSceneDefaultV2<T extends ObsPreserveSceneMigrateInput>(
  parsed: T,
): T {
  const next = { ...parsed }
  if (next.obsPreserveSceneDefaultV2 === true) {
    return next
  }
  next.obsPreserveActiveScene = false
  next.obsPreserveSceneDefaultV2 = true
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd upforge-desktop && npx vitest run electron/main/obs-preserve-scene-migrate.test.ts`

Expected: PASS

---

### Task 2: Wire defaults + load migration in SettingsManager

**Files:**
- Modify: `electron/main/settings-manager.ts`
- Modify: `src/env.d.ts` (add optional `obsPreserveSceneDefaultV2?: boolean` next to `obsPreserveActiveScene`)

**Interfaces:**
- Consumes: `migrateObsPreserveSceneDefaultV2` from Task 1
- Produces: `AppSettings` includes `obsPreserveSceneDefaultV2?: boolean`; `DEFAULTS.obsPreserveActiveScene === false`; load path migrates and persists when sentinel was applied this load

- [ ] **Step 1: Update types and DEFAULTS**

In `settings-manager.ts` `AppSettings`, after `obsPreserveActiveScene`:

```ts
  /** One-time migration: force UpForge scene switch default (v2). */
  obsPreserveSceneDefaultV2?: boolean
```

Set:

```ts
  obsPreserveActiveScene: false,
```

in `DEFAULTS` (do not put the sentinel in `DEFAULTS`; absence means “not migrated yet” for brand-new files that get written on first save with preserve false — see Step 3).

In `src/env.d.ts` add the same optional field and keep the existing `obsPreserveActiveScene` comment accurate.

- [ ] **Step 2: Call migrate during load**

Import:

```ts
import { migrateObsPreserveSceneDefaultV2 } from './obs-preserve-scene-migrate'
```

In `load()`, after other parse migrations (e.g. after `migrateOnboardingFlags`) and **before** merging DEFAULTS:

```ts
      const beforeMigrate = parsed.obsPreserveSceneDefaultV2 === true
      parsed = migrateObsPreserveSceneDefaultV2(parsed)
      const needsPersist = !beforeMigrate
```

Then build `merged` as today. After successful merge, if `needsPersist`, write `settings.json` with the merged settings (same write pattern as `save()`), and assign `this.settings` path accordingly.

Concrete load tail (adapt to existing structure):

```ts
      const beforeMigrate = parsed.obsPreserveSceneDefaultV2 === true
      parsed = migrateObsPreserveSceneDefaultV2(parsed)
      const merged = { ...DEFAULTS, ...parsed, obsEnabled: true }
      // ... existing clipCapture / recordedModesByGame / savePath / preset merges ...
      const result = { ...merged, ...applyRecordingPresetFields(merged) }
      if (!beforeMigrate) {
        try {
          fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
          fs.writeFileSync(this.filePath, JSON.stringify(result, null, 2))
        } catch (err: unknown) {
          console.error('[SettingsManager] Failed to persist obs preserve-scene migration:', err)
        }
      }
      return result
```

For the `catch` branch that returns `{ ...DEFAULTS }` (no settings file): leave as-is (new install). On first `save()`, file will get `obsPreserveActiveScene: false`. Optionally set `obsPreserveSceneDefaultV2: true` on first save of fresh defaults so a later code path does not re-force; safest: in the no-file `catch` return:

```ts
      return {
        ...DEFAULTS,
        obsPreserveSceneDefaultV2: true,
      }
```

so new installs also carry the sentinel and never get a spurious “migration” rewrite later.

- [ ] **Step 3: Sanity-check with existing migrate unit tests still green**

Run: `cd upforge-desktop && npx vitest run electron/main/obs-preserve-scene-migrate.test.ts electron/main/onboarding-settings.test.ts`

Expected: PASS

---

### Task 3: Fix hardcoded `true` fallbacks

**Files:**
- Modify: `electron/main/index.ts` (OBS recorder settings getter ~line 346)
- Modify: `src/composables/useSettings.ts` (~line 495 local defaults object)

**Interfaces:**
- Consumes: new default `false`
- Produces: no code path defaults preserve to `true` when the key is missing

- [ ] **Step 1: Patch fallbacks**

`index.ts`:

```ts
      obsPreserveActiveScene: s?.obsPreserveActiveScene ?? false,
```

`useSettings.ts` defaults object:

```ts
    obsPreserveActiveScene: false,
```

- [ ] **Step 2: Grep for leftover true defaults**

Run: `cd upforge-desktop && rg "obsPreserveActiveScene.*true|obsPreserveActiveScene: true" -g '!docs/**' -g '!**/node_modules/**'`

Expected: no runtime defaults of `true` (tests asserting migration input `true` are fine)

---

### Task 4: Settings Advanced copy

**Files:**
- Modify: `src/components/settings/SettingsAdvancedPane.vue` (checkbox label/hint ~lines 165–169)

**Interfaces:**
- Consumes: unchanged `v-model="settings.obsPreserveActiveScene"`
- Produces: updated hint text only

- [ ] **Step 1: Update hint**

Keep label: `Keep my active OBS scene when a match starts`

Replace hint with:

```text
Off by default so matches record the UpForge scene (gameplay). Turn on if you stream with face cam and overlays; UpForge still retargets game capture but will not force-switch scenes.
```

No em dashes.

- [ ] **Step 2: Type-check**

Run: `cd upforge-desktop && npm run type-check`

Expected: PASS

---

### Task 5: Verify + mark spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-obs-force-upforge-scene-default-design.md` (status line only)

- [ ] **Step 1: Run focused tests**

Run: `cd upforge-desktop && npx vitest run electron/main/obs-preserve-scene-migrate.test.ts`

Expected: PASS

- [ ] **Step 2: Update spec status**

Change status to: `Approved; implementing` (or `Implemented` after manual check)

- [ ] **Step 3: Manual check (when OBS available)**

1. OBS on a non-`UpForge` scene, Advanced preserve **off**
2. Start a match (or trigger record start)
3. Confirm OBS program scene switches to `UpForge`
4. Toggle preserve **on**, repeat: scene stays on the custom layout

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Default `obsPreserveActiveScene: false` | Task 2, 3 |
| One-time migration + sentinel `obsPreserveSceneDefaultV2` | Task 1, 2 |
| Persist sentinel | Task 2 |
| Creator checkbox remains | Task 4 (copy only; control already exists) |
| No stream-detection | (none added) |
| Unit tests for migrate + default | Task 1 |
| Fix `?? true` / composable defaults | Task 3 |
