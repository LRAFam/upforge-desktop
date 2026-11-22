<script setup lang="ts">
import { computed } from 'vue'
import { useSettings } from '../../composables/useSettings'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import SettingsToggle from './SettingsToggle.vue'
import CrosshairSettingsPanel from '../CrosshairSettingsPanel.vue'
import { uiV3 } from '../../lib/ui-v3'
import CrosshairEditorV3 from '../v3/settings/CrosshairEditorV3.vue'
import { shortcutKeyParts } from '../v3/settings/settings-display'
import { clampTrainerMouseInput } from '../../lib/trainer-mouse-limits'
import { TRAINER_GAMES, TRAINER_GAME_LABELS } from '../../lib/trainer-games'
import { TRAINER_FRAME_CAPS, TRAINER_TARGET_PALETTES, frameCapLabel, trainerReadsTargetPalette, type TrainerWindowMode } from '../../lib/trainer-display'
import trainerPin from '../../../trainer-version.json'

const {
  conflictResults,
  conflictScanning,
  debouncedSave,
  eDpiBarClass,
  eDpiLabel,
  eDpiLevelClass,
  findConflict,
  highlightSection,
  hotkeyParts,
  hotkeyStatus,
  hotkeys,
  inGameOverlayEnabled,
  isMac,
  isWindows,
  visibleInGameFeedbackOptions,
  rebinding,
  selectTrainerGame,
  setInGameFeedback,
  settings,
  startRebind,
} = useSettings()

const MOVEMENT_PRESETS = [{ label: 'Slow', value: 4.4 }, { label: 'Run', value: 6.75 }, { label: 'Fast', value: 9.0 }]
const WINDOW_MODES: Array<{ value: TrainerWindowMode; label: string }> = [{ value: 'fullscreen', label: 'Fullscreen' }, { value: 'windowed', label: 'Window' }]
/** The offered frame caps, plus a saved one that is not among them. */
const frameCaps = computed(() => TRAINER_FRAME_CAPS.includes(settings.trainerMouse.maxFps)
  ? TRAINER_FRAME_CAPS
  : [...TRAINER_FRAME_CAPS, settings.trainerMouse.maxFps])
/** Target colour: only when the bundled trainer reads it (the launch sends it only then too). */
const targetPaletteOffered = trainerReadsTargetPalette(trainerPin.version)

const HOTKEY_ROWS = [
  { id: 'save-clip', label: 'Bookmark clip moment', hint: 'Press during a match to save a clip', fallback: 'F9', overlayOnly: false },
  { id: 'toggle-overlay', label: 'Toggle overlay', hint: 'Show or hide the in-game overlay', fallback: 'F10', overlayOnly: true },
  { id: 'take-screenshot', label: 'Take screenshot', hint: 'Capture a screenshot during a match', fallback: 'F8', overlayOnly: false },
] as const
</script>

<template>
  <div v-if="uiV3" class="uf-set-pane">
    <SettingsSection title="Mouse &amp; trainer" hint="Match the aim trainer to how your mouse feels in game">
      <SettingsRow label="Game" hint="The trainer copies this game's sensitivity scale. Sensitivity and FOV are kept for each game.">
        <select :value="settings.trainerMouse.game" aria-label="Game" class="uf-select is-inline" @change="selectTrainerGame(($event.target as HTMLSelectElement).value)">
          <option v-for="game in TRAINER_GAMES" :key="game" :value="game">{{ TRAINER_GAME_LABELS[game] }}</option>
        </select>
      </SettingsRow>
      <div class="uf-field">
        <span class="uf-t3">Mouse DPI</span>
        <div class="uf-set-row">
          <div class="uf-seg" role="group" aria-label="DPI presets">
            <button v-for="preset in [400, 800, 1600, 3200]" :key="preset" type="button" :aria-pressed="settings.trainerMouse.dpi === preset" @click="settings.trainerMouse.dpi = preset; debouncedSave()">{{ preset }}</button>
          </div>
          <input v-model.number="settings.trainerMouse.dpi" type="number" min="100" max="32000" step="100" placeholder="Custom DPI" aria-label="Custom DPI" class="uf-input" style="width: 120px" @change="debouncedSave">
        </div>
      </div>
      <SettingsRow label="In-game sensitivity" hint="Copy it from your game settings.">
        <input v-model.number="settings.trainerMouse.sensitivity" type="number" min="0.01" max="20" step="0.01" aria-label="In-game sensitivity" class="uf-input is-mono" style="width: 120px" @change="clampTrainerMouseInput(settings.trainerMouse); debouncedSave()">
      </SettingsRow>
      <div class="uf-field">
        <div class="uf-usage-head">
          <span class="uf-label">eDPI</span>
          <span><span class="uf-d4">{{ Math.round(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span> <span class="uf-t4">{{ eDpiLabel(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span></span>
        </div>
        <div class="uf-meter"><span class="uf-fill" :style="{ width: Math.min(100, (settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) / 30) + '%' }" /></div>
        <p class="uf-t4">eDPI = DPI × sensitivity, so the trainer matches your in-game feel.</p>
      </div>
      <label class="uf-field"><span class="uf-t4">Horizontal FOV</span>
        <input v-model.number="settings.trainerMouse.fov" type="number" min="60" max="120" step="1" class="uf-input" style="width: 120px" @change="clampTrainerMouseInput(settings.trainerMouse); debouncedSave()">
      </label>
      <div class="uf-field">
        <span class="uf-t3">Movement speed</span>
        <div class="uf-seg" role="group" aria-label="Movement speed">
          <button v-for="preset in MOVEMENT_PRESETS" :key="preset.value" type="button" :aria-pressed="(settings.trainerMouse.movementSpeed ?? 6.75) === preset.value" @click="settings.trainerMouse.movementSpeed = preset.value; debouncedSave()">{{ preset.label }}</button>
        </div>
        <p class="uf-t4">Run is Valorant's run speed. Hold Shift in a drill to walk.</p>
      </div>
      <div class="uf-field">
        <div class="uf-usage-head"><span class="uf-t3">Trainer volume</span><span class="uf-t4 uf-num">{{ settings.trainerMouse.trainerVolume ?? 80 }}%</span></div>
        <input :value="settings.trainerMouse.trainerVolume ?? 80" type="range" min="0" max="100" step="5" aria-label="Trainer volume" class="uf-range" @input="settings.trainerMouse.trainerVolume = Number(($event.target as HTMLInputElement).value); debouncedSave()">
        <p class="uf-t4">Hit and miss sounds in the aim trainer.</p>
      </div>
      <label class="uf-field"><span class="uf-t3">Scoped sensitivity multiplier</span>
        <input v-model.number="settings.trainerMouse.scopedMultiplier" type="number" min="0.1" max="3" step="0.01" class="uf-input" @change="debouncedSave">
        <span class="uf-t4">Match your in-game Scoped Sensitivity Multiplier</span>
      </label>
    </SettingsSection>

    <SettingsSection title="Trainer display" hint="How the aim trainer window runs. Changes apply from the next drill.">
      <SettingsRow v-if="isWindows" label="Window mode" hint="Fullscreen has the lowest input lag. Pick Window if capture software or a second screen needs it.">
        <div class="uf-seg" role="group" aria-label="Window mode">
          <button v-for="mode in WINDOW_MODES" :key="mode.value" type="button" :aria-pressed="settings.trainerMouse.windowMode === mode.value" @click="settings.trainerMouse.windowMode = mode.value; debouncedSave()">{{ mode.label }}</button>
        </div>
      </SettingsRow>
      <SettingsRow label="V-Sync" hint="Off has the lowest input lag. Turn it on if the picture tears.">
        <SettingsToggle label="V-Sync" :on="settings.trainerMouse.vsync" @click="settings.trainerMouse.vsync = !settings.trainerMouse.vsync; debouncedSave()" />
      </SettingsRow>
      <SettingsRow label="Frame cap" hint="The most frames a second the trainer draws.">
        <select :value="settings.trainerMouse.maxFps" aria-label="Frame cap" class="uf-select is-inline" @change="settings.trainerMouse.maxFps = Number(($event.target as HTMLSelectElement).value); debouncedSave()">
          <option v-for="fps in frameCaps" :key="fps" :value="fps">{{ frameCapLabel(fps) }}</option>
        </select>
      </SettingsRow>
      <SettingsRow v-if="targetPaletteOffered" label="Target colour" hint="If red and green are hard to tell apart, pick one colour for targets and enemy heads in every drill.">
        <div class="uf-seg" role="group" aria-label="Target colour">
          <button v-for="palette in TRAINER_TARGET_PALETTES" :key="palette.value" type="button" :aria-pressed="settings.trainerMouse.targetPalette === palette.value" @click="settings.trainerMouse.targetPalette = palette.value; debouncedSave()">{{ palette.label }}</button>
        </div>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Warm-up" hint="A notification when Valorant, CS2 or Deadlock opens. Never during a match.">
      <SettingsRow label="Offer a warm-up when a game opens" hint="Shows your drill once a day, only if you have not trained yet today.">
        <SettingsToggle label="Offer a warm-up when a game opens" :on="settings.warmupPrompt !== false" @click="settings.warmupPrompt = settings.warmupPrompt === false; debouncedSave()" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Crosshair" hint="Preview and edit your trainer crosshair">
      <CrosshairEditorV3 v-model="settings.crosshairSettings" @update:model-value="debouncedSave()" />
    </SettingsSection>

    <SettingsSection id="hotkeys" title="Shortcuts / in-game feedback" hint="How you save clips and know they were saved mid-match" :highlight-id="highlightSection">
      <div class="uf-field">
        <div class="uf-set-row-text">
          <span class="uf-t3">In-game feedback</span>
          <span v-if="inGameOverlayEnabled" class="uf-t4">Valorant blocks overlays in Exclusive Fullscreen. Use Notifications for reliable clip confirmation, or set Valorant to Windowed Fullscreen if you want the overlay HUD.</span>
          <span v-else class="uf-t4">Overlay is temporarily off. Use Notifications — F9 confirms clips in fullscreen.</span>
        </div>
        <div class="uf-choices" role="radiogroup" aria-label="In-game feedback">
          <button v-for="opt in visibleInGameFeedbackOptions" :key="opt.value" type="button" role="radio" class="uf-choice" :aria-checked="settings.inGameFeedback === opt.value" @click="setInGameFeedback(opt.value)">
            <span class="uf-choice-text"><span class="uf-t3">{{ opt.label }}</span><span class="uf-t4">{{ opt.hint }}</span></span>
          </button>
        </div>
      </div>
      <div class="uf-set-sec-body is-rows uf-rows-top">
        <SettingsRow label="Open or focus window" hint="Fixed system shortcut">
          <kbd v-for="part in shortcutKeyParts('CommandOrControl+Shift+U', isMac)" :key="part" class="uf-kbd">{{ part }}</kbd>
        </SettingsRow>
        <template v-for="row in HOTKEY_ROWS" :key="row.id">
          <div v-if="!row.overlayOnly || inGameOverlayEnabled" class="uf-set-row">
            <div class="uf-set-row-text">
              <p class="uf-t3">{{ row.label }}</p>
              <p v-if="hotkeyStatus[row.id] === false" class="uf-note is-warn">Failed to register — key may be in use</p>
              <p v-else class="uf-t4">{{ row.hint }}</p>
              <div v-if="row.id === 'save-clip' && hotkeyStatus['save-clip'] === false"><button type="button" class="uf-link" :disabled="conflictScanning" @click="findConflict">{{ conflictScanning ? 'Scanning…' : 'Find conflicting app →' }}</button></div>
            </div>
            <button type="button" class="uf-keybind" :class="{ 'is-listening': rebinding === row.id }" :aria-label="`Change shortcut: ${row.label}`" @click="startRebind(row.id)">
              <span v-if="rebinding === row.id" class="uf-live">Press a key…</span>
              <kbd v-for="part in shortcutKeyParts(hotkeys[row.id] ?? row.fallback, isMac)" v-else :key="part" class="uf-kbd">{{ part }}</kbd>
            </button>
          </div>
        </template>
      </div>
      <p v-if="rebinding" class="uf-t4">Press Escape to cancel. Changes apply immediately.</p>
      <div v-if="conflictResults !== null" class="uf-inset">
        <template v-if="conflictResults.found.length > 0">
          <p class="uf-note is-warn">Conflicts detected</p>
          <div v-for="c in conflictResults.found" :key="c.exe" class="uf-set-row-text"><p class="uf-t3">{{ c.name }}</p><p class="uf-t4">{{ c.fix }}</p></div>
        </template>
        <p v-else class="uf-note is-ok">No known conflicts found. Try rebinding to a different key.</p>
        <div><button type="button" class="uf-link" @click="conflictResults = null">Dismiss</button></div>
      </div>
    </SettingsSection>
  </div>
  <div v-else class="space-y-4">
    <SettingsSection
      title="Mouse & trainer"
      hint="Aim calibration and sensitivity setup"
    >
      <div>
        <label class="mb-1 block text-xs text-gray-400">Game</label>
        <select :value="settings.trainerMouse.game" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="selectTrainerGame(($event.target as HTMLSelectElement).value)">
          <option v-for="game in TRAINER_GAMES" :key="game" :value="game">{{ TRAINER_GAME_LABELS[game] }}</option>
        </select>
      </div>

      <div>
        <label class="mb-2 block text-xs text-gray-400">Mouse DPI</label>
        <div class="mb-2 grid grid-cols-4 gap-2">
          <button
            v-for="preset in [400, 800, 1600, 3200]"
            :key="preset"
            type="button"
            class="rounded-xl border py-2 text-[11px] font-semibold transition-all"
            :class="settings.trainerMouse.dpi === preset ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
            @click="settings.trainerMouse.dpi = preset; debouncedSave()"
          >{{ preset }}</button>
        </div>
        <input type="number" v-model.number="settings.trainerMouse.dpi" min="100" max="32000" step="100" placeholder="Custom DPI" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
      </div>

      <div>
        <label class="mb-1 block text-xs text-gray-400">In-game sensitivity</label>
        <input type="number" v-model.number="settings.trainerMouse.sensitivity" min="0.01" max="20" step="0.01" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
      </div>

      <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">eDPI</span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm font-bold tabular-nums text-gray-100">{{ Math.round(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="eDpiLevelClass(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity)">{{ eDpiLabel(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span>
          </div>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div class="h-full rounded-full transition-all duration-300" :class="eDpiBarClass(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity)" :style="{ width: Math.min(100, (settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) / 30) + '%' }" />
        </div>
        <p class="mt-2 text-xs text-gray-600">eDPI = DPI × sensitivity, so the trainer matches your in-game feel.</p>
      </div>

      <div>
        <label class="mb-1 block text-xs text-gray-400">Horizontal FOV</label>
        <input type="number" v-model.number="settings.trainerMouse.fov" min="60" max="120" step="1" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
      </div>

      <div>
        <label class="mb-2 block text-xs text-gray-400">Movement speed</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="preset in MOVEMENT_PRESETS"
            :key="preset.value"
            type="button"
            class="rounded-xl border py-2 text-[11px] font-semibold transition-all"
            :class="settings.trainerMouse.movementSpeed === preset.value ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
            @click="settings.trainerMouse.movementSpeed = preset.value; debouncedSave()"
          >{{ preset.label }}</button>
        </div>
        <p class="mt-2 text-xs text-gray-600">Run is Valorant's run speed. Hold Shift in a drill to walk.</p>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="text-xs text-gray-400">Trainer volume</label>
          <span class="font-mono text-xs text-gray-400">{{ settings.trainerMouse.trainerVolume }}%</span>
        </div>
        <input
          type="range"
          v-model.number="settings.trainerMouse.trainerVolume"
          min="0" max="100" step="5"
          class="w-full accent-red-500"
          @input="debouncedSave"
        />
        <p class="mt-1 text-xs text-gray-600">Hit and miss sounds in the aim trainer.</p>
      </div>

      <div>
        <label for="trainer-scoped-multiplier" class="mb-2 block text-xs text-gray-400">Scoped sensitivity multiplier</label>
        <input
          id="trainer-scoped-multiplier"
          v-model.number="settings.trainerMouse.scopedMultiplier"
          type="number" min="0.1" max="3" step="0.01"
          class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none"
          @change="debouncedSave"
        />
        <p class="mt-1 text-xs text-gray-600">Match your in-game Scoped Sensitivity Multiplier</p>
      </div>
    </SettingsSection>

    <SettingsSection
      title="Warm-up"
      hint="A notification when Valorant, CS2 or Deadlock opens. Never during a match."
    >
      <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div>
          <p class="text-sm font-semibold text-white">Offer a warm-up when a game opens</p>
          <p class="mt-1 text-xs text-gray-500">Shows your drill once a day, only if you have not trained yet today.</p>
        </div>
        <SettingsToggle label="Offer a warm-up when a game opens" :on="settings.warmupPrompt !== false" @click="settings.warmupPrompt = settings.warmupPrompt === false; debouncedSave()" />
      </div>
    </SettingsSection>

    <SettingsSection
      title="Crosshair"
      hint="Preview and edit your trainer crosshair"
    >
      <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-3">
        <crosshair-settings-panel v-model="settings.crosshairSettings" @update:model-value="debouncedSave()" />
      </div>
    </SettingsSection>

    <SettingsSection
      id="hotkeys"
      title="Shortcuts / in-game feedback"
      hint="Hotkeys for clips, overlay, and screenshots"
      :highlight-id="highlightSection"
    >
      <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4 space-y-3">
        <div>
          <p class="text-sm font-semibold text-white">In-game feedback</p>
          <p v-if="inGameOverlayEnabled" class="mt-1 text-xs text-gray-500 leading-relaxed">
            Valorant blocks overlays in Exclusive Fullscreen. Use
            <span class="text-gray-400">Notifications</span> for reliable clip confirmation, or set Valorant to
            <span class="text-gray-400"> Windowed Fullscreen</span> if you want the overlay HUD.
          </p>
          <p v-else class="mt-1 text-xs text-gray-500 leading-relaxed">
            Overlay is temporarily off. Use <span class="text-gray-400">Notifications</span> — F9 confirms clips in fullscreen.
          </p>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            v-for="opt in visibleInGameFeedbackOptions"
            :key="opt.value"
            type="button"
            class="rounded-xl border px-3 py-2.5 text-left transition-colors"
            :class="settings.inGameFeedback === opt.value
              ? 'border-red-500/35 bg-red-500/10'
              : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]'"
            @click="setInGameFeedback(opt.value)"
          >
            <p class="text-xs font-semibold" :class="settings.inGameFeedback === opt.value ? 'text-white' : 'text-gray-300'">{{ opt.label }}</p>
            <p class="mt-0.5 text-[11px] text-gray-600">{{ opt.hint }}</p>
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
        <div>
          <p class="text-sm text-gray-200">Open or focus window</p>
          <p class="mt-1 text-xs text-gray-500">Fixed system shortcut</p>
        </div>
        <div class="flex items-center gap-1">
          <kbd v-for="part in ['Ctrl', 'Shift', 'U']" :key="part" class="rounded-md border border-white/[0.12] bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-gray-300">{{ part }}</kbd>
        </div>
      </div>

      <div class="space-y-3 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-gray-200">Bookmark clip moment</p>
            <p class="mt-1 text-xs" :class="hotkeyStatus['save-clip'] === false ? 'text-yellow-400/80' : 'text-gray-500'">{{ hotkeyStatus['save-clip'] === false ? 'Failed to register — key may be in use' : 'Press during a match to save a clip' }}</p>
            <button v-if="hotkeyStatus['save-clip'] === false" type="button" class="mt-2 inline-flex items-center gap-1 text-xs text-yellow-300 transition-colors hover:text-yellow-200" :disabled="conflictScanning" @click="findConflict">
              <svg v-if="!conflictScanning" class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <svg v-else class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              {{ conflictScanning ? 'Scanning…' : 'Find conflicting app' }}
            </button>
          </div>
          <button type="button" class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'save-clip' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('save-clip')">
            <span v-if="rebinding === 'save-clip'">Press a key…</span>
            <span v-else class="flex items-center justify-end gap-1">
              <kbd v-for="part in hotkeyParts(hotkeys['save-clip'] ?? 'F9')" :key="part" class="rounded-md border border-white/[0.12] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">{{ part }}</kbd>
            </span>
          </button>
        </div>

        <div v-if="inGameOverlayEnabled" class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-gray-200">Toggle overlay</p>
            <p class="mt-1 text-xs" :class="hotkeyStatus['toggle-overlay'] === false ? 'text-yellow-400/80' : 'text-gray-500'">{{ hotkeyStatus['toggle-overlay'] === false ? 'Failed to register — key may be in use' : 'Show or hide the in-game overlay' }}</p>
          </div>
          <button type="button" class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'toggle-overlay' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('toggle-overlay')">
            <span v-if="rebinding === 'toggle-overlay'">Press a key…</span>
            <span v-else class="flex items-center justify-end gap-1">
              <kbd v-for="part in hotkeyParts(hotkeys['toggle-overlay'] ?? 'F10')" :key="part" class="rounded-md border border-white/[0.12] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">{{ part }}</kbd>
            </span>
          </button>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-gray-200">Take screenshot</p>
            <p class="mt-1 text-xs" :class="hotkeyStatus['take-screenshot'] === false ? 'text-yellow-400/80' : 'text-gray-500'">{{ hotkeyStatus['take-screenshot'] === false ? 'Failed to register — key may be in use' : 'Capture a screenshot during a match' }}</p>
          </div>
          <button type="button" class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'take-screenshot' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('take-screenshot')">
            <span v-if="rebinding === 'take-screenshot'">Press a key…</span>
            <span v-else class="flex items-center justify-end gap-1">
              <kbd v-for="part in hotkeyParts(hotkeys['take-screenshot'] ?? 'F8')" :key="part" class="rounded-md border border-white/[0.12] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">{{ part }}</kbd>
            </span>
          </button>
        </div>
      </div>

      <p v-if="rebinding" class="px-1 text-xs text-gray-500">Press Escape to cancel. Changes apply immediately.</p>

      <Transition name="result-slide">
        <div v-if="conflictResults !== null" class="overflow-hidden rounded-2xl border" :class="conflictResults.found.length > 0 ? 'border-yellow-500/20 bg-yellow-500/6' : 'border-white/[0.10] bg-white/[0.02]'">
          <div class="space-y-2 px-4 py-3">
            <template v-if="conflictResults.found.length > 0">
              <div class="flex items-center gap-2">
                <svg class="h-3.5 w-3.5 flex-shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">Conflicts detected</p>
              </div>
              <div v-for="c in conflictResults.found" :key="c.exe" class="space-y-0.5 border-l border-yellow-500/20 pl-3">
                <p class="text-xs font-medium text-gray-200">{{ c.name }}</p>
                <p class="text-xs leading-snug text-gray-500">{{ c.fix }}</p>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2 text-xs text-gray-400">
                <svg class="h-3.5 w-3.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                No known conflicts found. Try rebinding to a different key.
              </div>
            </template>
          </div>
          <div class="border-t border-white/[0.09] px-4 py-2">
            <button type="button" class="text-xs text-gray-500 transition-colors hover:text-gray-300" @click="conflictResults = null">Dismiss</button>
          </div>
        </div>
      </Transition>
    </SettingsSection>
  </div>
</template>
