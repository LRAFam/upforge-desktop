<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  conflictResults,
  conflictScanning,
  debouncedSave,
  eDpiBarClass,
  eDpiLabel,
  eDpiLevelClass,
  findConflict,
  hotkeyParts,
  hotkeyStatus,
  hotkeys,
  inGameOverlayEnabled,
  visibleInGameFeedbackOptions,
  rebinding,
  sectionOpen,
  setInGameFeedback,
  settings,
  startRebind,
  toggleSection,
} = useSettings()
</script>

<template>
<section class="space-y-4">
<div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('mouseTrainer')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3.75c-2.485 0-4.5 2.015-4.5 4.5v7.5c0 2.485 2.015 4.5 4.5 4.5s4.5-2.015 4.5-4.5v-7.5c0-2.485-2.015-4.5-4.5-4.5zM12 3.75v5.25" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Mouse & trainer</p>
                <p class="text-xs text-gray-500">Aim calibration and sensitivity setup</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.mouseTrainer ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.mouseTrainer" class="space-y-4 border-t border-white/[0.09] p-4">
            <div>
              <label class="mb-1 block text-xs text-gray-400">Game</label>
              <select v-model="settings.trainerMouse.game" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                <option value="valorant">Valorant</option>
                <option value="cs2">CS2</option>
                <option value="apex">Apex Legends</option>
                <option value="overwatch2">Overwatch 2</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label class="mb-2 block text-xs text-gray-400">Mouse DPI</label>
              <div class="mb-2 grid grid-cols-4 gap-2">
                <button
                  v-for="preset in [400, 800, 1600, 3200]"
                  :key="preset"
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

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-gray-400">Horizontal FOV</label>
                <input type="number" v-model.number="settings.trainerMouse.fov" min="60" max="120" step="1" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-400">Polling rate</label>
                <select v-model.number="settings.trainerMouse.pollingRate" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                  <option :value="125">125 Hz</option>
                  <option :value="250">250 Hz</option>
                  <option :value="500">500 Hz</option>
                  <option :value="1000">1000 Hz</option>
                  <option :value="2000">2000 Hz</option>
                  <option :value="4000">4000 Hz</option>
                </select>
              </div>
            </div>

            <div class="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Raw input</p>
                <p class="mt-1 text-xs text-gray-500">Bypass OS pointer acceleration</p>
              </div>
              <button class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" :class="settings.trainerMouse.rawInput ? 'bg-red-500' : 'bg-white/20'" @click="settings.trainerMouse.rawInput = !settings.trainerMouse.rawInput; debouncedSave()">
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.trainerMouse.rawInput ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>

            <div>
              <label class="mb-2 block text-xs text-gray-400">Movement speed</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="preset in [{ label: 'Walk', value: 4.4 }, { label: 'Run', value: 6.75 }, { label: 'Fast', value: 9.0 }]"
                  :key="preset.value"
                  class="rounded-xl border py-2 text-[11px] font-semibold transition-all"
                  :class="settings.trainerMouse.movementSpeed === preset.value ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
                  @click="settings.trainerMouse.movementSpeed = preset.value; debouncedSave()"
                >{{ preset.label }}</button>
              </div>
              <p class="mt-2 text-xs text-gray-600">Walk = Valorant shift-walk. Run = Valorant default. Fast = free aim feel.</p>
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
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('crosshair')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.122-2.122M7.757 7.757 5.636 5.636m12.728 0-2.122 2.121M7.757 16.243l-2.121 2.121M12 15a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Crosshair</p>
                <p class="text-xs text-gray-500">Preview and edit your trainer crosshair</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.crosshair ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.crosshair" class="border-t border-white/[0.09] p-4">
            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-3">
              <crosshair-settings-panel v-model="settings.crosshairSettings" @update:model-value="debouncedSave()" />
            </div>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('shortcuts')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6.75 7.5h10.5A2.25 2.25 0 0119.5 9.75v4.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 14.25v-4.5A2.25 2.25 0 016.75 7.5zM8.25 12h.008v.008H8.25V12zm3 0h.008v.008h-.008V12zm3 0h.008v.008h-.008V12z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Shortcuts</p>
                <p class="text-xs text-gray-500">Hotkeys for clips, overlay, and screenshots</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.shortcuts ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.shortcuts" class="space-y-3 border-t border-white/[0.09] p-4">
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
                  <button v-if="hotkeyStatus['save-clip'] === false" class="mt-2 inline-flex items-center gap-1 text-xs text-yellow-300 transition-colors hover:text-yellow-200" :disabled="conflictScanning" @click="findConflict">
                    <svg v-if="!conflictScanning" class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <svg v-else class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    {{ conflictScanning ? 'Scanning…' : 'Find conflicting app' }}
                  </button>
                </div>
                <button class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'save-clip' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('save-clip')">
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
                <button class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'toggle-overlay' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('toggle-overlay')">
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
                <button class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'take-screenshot' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('take-screenshot')">
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
                  <button class="text-xs text-gray-500 transition-colors hover:text-gray-300" @click="conflictResults = null">Dismiss</button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
</section>
</template>
