<template>
  <div class="min-h-screen p-2 select-none" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <div class="flex min-h-[calc(100vh-1rem)]" :class="overlayPositionContainerClass">
      <div ref="interactiveRegionRef" class="flex w-[288px] flex-col">
    <!-- Hotkey cheatsheet — shown when recording starts, auto-dismisses -->
    <Transition name="cheatsheet-slide">
      <div v-if="showCheatsheet" class="mb-2 w-[288px]">
        <div class="relative rounded-xl overflow-hidden bg-[#0c0c0c]/95 border border-white/[0.09] shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
          <!-- top accent -->
          <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
          <div class="px-3 pt-2.5 pb-2">
            <!-- Header -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span class="text-xs font-bold text-red-400 tracking-wider uppercase">Recording Started</span>
              </div>
              <button class="text-gray-700 hover:text-gray-500 transition-colors pointer-events-auto" @click="showCheatsheet = false">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <!-- Hotkey rows -->
            <div class="space-y-1.5">
              <div class="flex items-center gap-2.5">
                <kbd class="min-w-[28px] text-center text-xs font-bold bg-white/[0.07] border border-white/[0.12] rounded-md px-1.5 py-1 text-gray-300 shadow-sm">{{ hotkey }}</kbd>
                <span class="text-xs text-gray-300 font-medium">Save clip moment</span>
              </div>
              <div class="flex items-center gap-2.5">
                <kbd class="min-w-[28px] text-center text-xs font-bold bg-white/[0.07] border border-white/[0.12] rounded-md px-1.5 py-1 text-gray-300 shadow-sm">{{ screenshotHotkey }}</kbd>
                <span class="text-xs text-gray-300 font-medium">Take screenshot</span>
              </div>
              <div class="flex items-center gap-2.5">
                <kbd class="min-w-[28px] text-center text-xs font-bold bg-white/[0.07] border border-white/[0.12] rounded-md px-1.5 py-1 text-gray-300 shadow-sm">F10</kbd>
                <span class="text-xs text-gray-300 font-medium">Toggle this overlay</span>
              </div>
            </div>
            <!-- Countdown bar -->
            <div class="mt-2 h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full bg-red-500/50 rounded-full"
                :style="{ width: cheatsheetProgress + '%', transition: cheatsheetRunning ? `width ${CHEATSHEET_DURATION}ms linear` : 'none' }"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Training result card — flashes after a session ends, auto-dismisses -->
    <Transition name="cheatsheet-slide">
      <div v-if="trainerResult" class="mb-2 w-[288px]">
        <div :class="['relative rounded-xl overflow-hidden border shadow-[0_8px_32px_rgba(0,0,0,0.7)]', scoreAccentBg(trainerResult.score)]">
          <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-40" />
          <div class="px-3 pt-2.5 pb-2.5">
            <!-- Header -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                <span class="text-[10px] font-bold tracking-wider uppercase text-gray-300">
                  {{ SCENARIO_LABEL[trainerResult.scenario] ?? trainerResult.scenario }} Complete
                </span>
              </div>
              <button class="text-gray-600 hover:text-gray-400 transition-colors pointer-events-auto" @click="dismissTrainerResult">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <!-- Score row -->
            <div class="flex items-end gap-3 mb-2">
              <span :class="['text-[40px] font-black leading-none tabular-nums', scoreColor(trainerResult.score)]">
                {{ trainerResult.score * 10 }}
              </span>
              <span class="text-[11px] text-gray-500 font-semibold mb-1.5">/ 1000</span>
              <!-- Stat pills -->
              <div class="flex flex-col gap-0.5 ml-auto text-right">
                <span class="text-[10px] text-gray-400 font-medium">
                  {{ trainerResult.accuracy_pct.toFixed(1) }}% acc
                </span>
                <span class="text-[10px] text-gray-500">
                  {{ trainerResult.avg_reaction_ms.toFixed(0) }}ms react
                </span>
                <span class="text-[10px] text-gray-600">
                  {{ trainerResult.targets_hit }}H / {{ trainerResult.targets_missed }}M
                </span>
              </div>
            </div>
            <!-- Consistency bar -->
            <div class="h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
              <div
                :class="['h-full rounded-full transition-all duration-700', trainerResult.score >= 80 ? 'bg-green-500' : trainerResult.score >= 60 ? 'bg-yellow-500' : 'bg-red-500']"
                :style="{ width: trainerResult.score + '%' }"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Training active pill — shows while a drill is running -->
    <Transition name="cheatsheet-slide">
      <div v-if="trainerActive && !trainerResult" class="mb-2 w-[288px]">
        <div class="relative rounded-xl overflow-hidden bg-[#0c1a14]/95 border border-green-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
          <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />
          <div class="flex items-center gap-2.5 px-3 py-2">
            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span class="text-[10px] font-bold text-green-400 uppercase tracking-wider">Training</span>
            <span class="text-[10px] text-gray-400 font-medium ml-1">
              {{ SCENARIO_LABEL[trainerActive.scenario] ?? trainerActive.scenario }}
            </span>
            <span class="ml-auto text-[10px] text-gray-600 capitalize">{{ trainerActive.difficulty }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Main panel -->
    <div class="relative w-[288px] rounded-2xl overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.8)]">
      <!-- Background layers -->
      <div class="absolute inset-0 bg-[#0c0c0c]/96 backdrop-blur-2xl" />
      <div class="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
      <!-- Top accent line — red when recording, subtle otherwise -->
      <div
        :class="['absolute top-0 left-0 right-0 h-px transition-all duration-700',
          isRecording
            ? 'bg-gradient-to-r from-transparent via-red-500/80 to-transparent'
            : 'bg-gradient-to-r from-transparent via-white/15 to-transparent'
        ]"
      />
      <!-- Outer ring -->
      <div class="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.07] pointer-events-none" />

      <!-- Content -->
      <div class="relative z-10 px-3.5 pt-3 pb-3.5">
        <!-- Header row -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="relative w-4 h-4 flex items-center justify-center flex-shrink-0">
              <div :class="['w-2 h-2 rounded-full transition-colors duration-500', isRecording ? 'bg-red-500' : 'bg-gray-700']" />
              <div v-if="isRecording" class="absolute w-2 h-2 rounded-full bg-red-500 animate-ping opacity-50" />
            </div>
            <span :class="['text-xs font-bold tracking-[0.16em] uppercase transition-colors', isRecording ? 'text-red-400' : 'text-gray-600']">
              {{ isRecording ? 'Live Rec' : 'Standby' }}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              class="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-gray-500 transition-colors hover:border-white/[0.14] hover:text-white"
              @click="showLayoutTools = !showLayoutTools"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <kbd class="text-xs text-gray-700 font-medium bg-white/[0.04] border border-white/[0.07] rounded px-1.5 py-px">F10</kbd>
          </div>
        </div>

        <!-- Economy cards -->
        <div class="grid grid-cols-2 gap-1.5 mb-2.5">
          <div class="flex flex-col gap-1.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-2.5 py-2 overflow-hidden relative">
            <div class="absolute top-0 right-0 w-8 h-8 bg-green-500/[0.06] rounded-full blur-xl" />
            <span class="text-[8.5px] text-gray-600 font-semibold uppercase tracking-wider">Your Credits</span>
            <span class="text-[22px] font-black leading-none tabular-nums text-green-400 tracking-tight">
              {{ data.yourCredits != null ? data.yourCredits.toLocaleString() : '—' }}
            </span>
            <span v-if="data.yourCredits != null" :class="['self-start text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider border', economyPillClass]">
              {{ economyLabel }}
            </span>
          </div>
          <div class="flex flex-col gap-1.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-2.5 py-2 overflow-hidden relative">
            <div class="absolute top-0 right-0 w-8 h-8 bg-red-500/[0.06] rounded-full blur-xl" />
            <span class="text-[8.5px] text-gray-600 font-semibold uppercase tracking-wider">Enemy Est.</span>
            <span class="text-[22px] font-black leading-none tabular-nums text-red-400 tracking-tight">
              {{ data.enemyEstimate != null ? data.enemyEstimate.toLocaleString() : '—' }}
            </span>
          </div>
        </div>

        <!-- Round + Score bar -->
        <div class="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 mb-3">
          <div class="flex items-baseline gap-1.5 flex-1">
            <span class="text-[8.5px] text-gray-600 uppercase tracking-wider font-semibold">Rnd</span>
            <span class="text-[26px] font-black leading-none tabular-nums text-white">{{ data.round ?? '—' }}</span>
          </div>
          <div v-if="data.allyScore != null && data.enemyScore != null" class="flex items-center gap-1">
            <span class="text-[13px] font-black text-green-400 tabular-nums">{{ data.allyScore }}</span>
            <span class="text-xs text-gray-700 font-bold">–</span>
            <span class="text-[13px] font-black text-red-400 tabular-nums">{{ data.enemyScore }}</span>
          </div>
          <span v-else class="text-xs text-gray-700">–</span>
        </div>

        <!-- Clip button -->
        <button
          ref="clipBtnRef"
          :class="[
            'w-full relative flex items-center justify-center gap-2.5 py-2.5 rounded-xl border transition-all duration-200 pointer-events-auto cursor-pointer overflow-hidden group',
            isRecording
              ? 'bg-red-500/[0.1] hover:bg-red-500/[0.2] active:bg-red-500/[0.28] border-red-500/25 hover:border-red-500/40 text-red-300'
              : 'bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.10] border-white/[0.07] text-gray-500'
          ]"
          @click="saveClip"
        >
          <!-- Shine sweep on hover -->
          <div class="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6"/>
            <circle cx="8" cy="8" r="3.5" fill="#0c0c0c" opacity="0.5"/>
          </svg>
          <span class="text-[12px] font-semibold tracking-tight">
            {{ isRecording ? 'Save Clip' : 'Not in match' }}
            <span class="font-normal opacity-40 ml-1 text-xs">({{ hotkey }})</span>
          </span>
        </button>
      </div>
    </div>

    <Transition name="cheatsheet-slide">
      <div v-if="showLayoutTools" class="mt-2 w-[288px]">
        <div class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c]/95 shadow-[0_12px_48px_rgba(0,0,0,0.78)]">
          <div class="border-b border-white/[0.06] px-3 py-2.5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Overlay Layout</p>
                <p class="mt-1 text-xs font-semibold text-white">Preview how the panel sits in-game and choose its anchor.</p>
              </div>
              <span class="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-gray-400">{{ overlayPositionLabel }}</span>
            </div>
          </div>
          <div class="p-3">
            <div class="relative aspect-video overflow-hidden rounded-xl border border-white/[0.06] bg-[#081015]">
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.4),rgba(7,10,14,0.92))]" />
              <div class="absolute inset-0 opacity-40" style="background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px); background-size: 32px 32px;" />
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(244,63,94,0.18),transparent_20%),radial-gradient(circle_at_20%_70%,rgba(59,130,246,0.14),transparent_25%)]" />
              <div class="absolute h-[64px] w-[124px] rounded-xl border border-white/[0.08] bg-black/80 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" :class="overlayPreviewPositionClass">
                <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/70 to-transparent" />
                <div class="px-2.5 py-2">
                  <div class="flex items-center justify-between text-[8px] uppercase tracking-[0.14em] text-gray-500">
                    <span :class="isRecording ? 'text-red-400' : 'text-gray-500'">{{ isRecording ? 'Live Rec' : 'Standby' }}</span>
                    <span>F10</span>
                  </div>
                  <div class="mt-2 grid grid-cols-2 gap-1">
                    <div class="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1">
                      <p class="text-[7px] uppercase tracking-wide text-gray-600">Credits</p>
                      <p class="mt-1 text-[11px] font-black text-green-400">{{ data.yourCredits != null ? data.yourCredits.toLocaleString() : '—' }}</p>
                    </div>
                    <div class="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1">
                      <p class="text-[7px] uppercase tracking-wide text-gray-600">Round</p>
                      <p class="mt-1 text-[11px] font-black text-white">{{ data.round ?? '—' }}</p>
                    </div>
                  </div>
                  <div class="mt-2 h-2 rounded-full bg-white/[0.05]">
                    <div class="h-full w-1/2 rounded-full bg-red-500/60" />
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Position</p>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <button
                    v-for="cell in OVERLAY_POSITION_CELLS"
                    :key="cell.id"
                    class="flex aspect-square items-center justify-center rounded-lg border text-[10px] font-semibold transition-all"
                    :class="overlayCellClass(cell.id)"
                    @click="selectOverlayCell(cell.id)"
                  >
                    <span class="h-2.5 w-2.5 rounded-sm" :class="overlayCellDotClass(cell.id)" />
                  </button>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Preview Notes</p>
                <ul class="mt-2 space-y-1.5 text-[11px] leading-relaxed text-gray-400">
                  <li>Anchors snap to the nearest corner or centre.</li>
                  <li>The preview reflects your current overlay state.</li>
                  <li>Layout stays saved for the next session.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast notification -->
    <Transition name="toast-slide">
      <div v-if="showToast" class="mt-2 w-[288px]">
        <div
          :class="[
            'relative flex items-center gap-2.5 pl-4 pr-3.5 py-2.5 rounded-xl border overflow-hidden',
            toastType === 'success'
              ? 'bg-[#081a0f] border-green-500/20'
              : 'bg-[#1c1500] border-amber-500/20'
          ]"
        >
          <!-- Left accent bar -->
          <div
            :class="[
              'absolute left-0 top-0 bottom-0 w-[3px]',
              toastType === 'success'
                ? 'bg-gradient-to-b from-green-400 to-green-600'
                : 'bg-gradient-to-b from-amber-300 to-amber-500'
            ]"
          />
          <!-- Icon -->
          <div
            :class="[
              'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
              toastType === 'success' ? 'bg-green-500/20' : 'bg-amber-500/20'
            ]"
          >
            <svg v-if="toastType === 'success'" class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
            </svg>
            <svg v-else class="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
          </div>
          <span class="text-[11.5px] font-semibold text-white flex-1 leading-tight">{{ toastMessage }}</span>
          <!-- Countdown progress bar -->
          <div class="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
            <div
              :class="['h-full transition-none', toastType === 'success' ? 'bg-green-500/50' : 'bg-amber-500/50']"
              :style="{ width: toastProgress + '%', transition: toastRunning ? `width ${TOAST_DURATION}ms linear` : 'none' }"
            />
          </div>
        </div>
      </div>
    </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const TOAST_DURATION = 3000
const CHEATSHEET_DURATION = 7000
const TRAINER_RESULT_DURATION = 8000

// ── Trainer state ─────────────────────────────────────────────────────────────
interface TrainerResult {
  scenario: string
  score: number
  accuracy_pct: number
  avg_reaction_ms: number
  consistency_score: number
  targets_hit: number
  targets_missed: number
}
const trainerResult = ref<TrainerResult | null>(null)
const trainerActive = ref<{ scenario: string; difficulty: string; duration_seconds: number } | null>(null)
let trainerResultTimer: ReturnType<typeof setTimeout> | null = null

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}
function scoreAccentBg(score: number): string {
  if (score >= 80) return 'bg-green-500/10 border-green-500/20'
  if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/20'
  return 'bg-red-500/10 border-red-500/20'
}
const SCENARIO_LABEL: Record<string, string> = {
  flick: 'Flick',
  tracking: 'Tracking',
  microadjust: 'Micro Adjust',
  switching: 'Target Switch',
  duel: '3D Duel',
}
function dismissTrainerResult() {
  trainerResult.value = null
  if (trainerResultTimer) { clearTimeout(trainerResultTimer); trainerResultTimer = null }
}

const economyLabel = computed(() => {
  const c = data.value.yourCredits
  if (c == null) return ''
  if (c < 900) return 'ECO'
  if (c < 1900) return 'HALF'
  if (c < 3900) return 'FULL'
  return 'BONUS'
})

const economyPillClass = computed(() => {
  const c = data.value.yourCredits
  if (c == null) return ''
  if (c < 900) return 'bg-red-500/10 text-red-400 border-red-500/20'
  if (c < 1900) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
  if (c < 3900) return 'bg-green-500/10 text-green-400 border-green-500/20'
  return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
})

const data = ref<{
  yourCredits: number | null
  enemyEstimate: number | null
  round: number | null
  allyScore: number | null
  enemyScore: number | null
}>({ yourCredits: null, enemyEstimate: null, round: null, allyScore: null, enemyScore: null })

const isRecording = ref(false)
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'warning'>('success')
const toastProgress = ref(100)
const toastRunning = ref(false)
const hotkey = ref('F9')
const screenshotHotkey = ref('F8')
const clipBtnRef = ref<HTMLButtonElement | null>(null)
const interactiveRegionRef = ref<HTMLDivElement | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
const removeListeners: Array<() => void> = []

type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
type OverlayGridCell = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

const OVERLAY_POSITION_CELLS: Array<{ id: OverlayGridCell }> = [
  { id: 'top-left' },
  { id: 'top-center' },
  { id: 'top-right' },
  { id: 'middle-left' },
  { id: 'center' },
  { id: 'middle-right' },
  { id: 'bottom-left' },
  { id: 'bottom-center' },
  { id: 'bottom-right' },
]

function loadOverlayCell(): OverlayGridCell {
  try {
    const saved = localStorage.getItem('upforge-overlay-position-cell') as OverlayGridCell | null
    if (saved && OVERLAY_POSITION_CELLS.some((cell) => cell.id === saved)) return saved
  } catch {
    // ignore
  }
  return 'top-left'
}

function mapOverlayCellToPosition(cell: OverlayGridCell): OverlayPosition {
  if (cell === 'top-left' || cell === 'middle-left') return 'top-left'
  if (cell === 'top-right' || cell === 'middle-right') return 'top-right'
  if (cell === 'bottom-left') return 'bottom-left'
  if (cell === 'bottom-right') return 'bottom-right'
  return 'center'
}

const overlayGridCell = ref<OverlayGridCell>(loadOverlayCell())
const overlayPosition = computed<OverlayPosition>(() => mapOverlayCellToPosition(overlayGridCell.value))
const showLayoutTools = ref(false)

watch(overlayGridCell, (value) => {
  localStorage.setItem('upforge-overlay-position-cell', value)
})

const overlayPositionContainerClass = computed(() => {
  if (overlayPosition.value === 'top-left') return 'items-start justify-start'
  if (overlayPosition.value === 'top-right') return 'items-start justify-end'
  if (overlayPosition.value === 'bottom-left') return 'items-end justify-start'
  if (overlayPosition.value === 'bottom-right') return 'items-end justify-end'
  return 'items-center justify-center'
})

const overlayPreviewPositionClass = computed(() => {
  if (overlayPosition.value === 'top-left') return 'left-3 top-3'
  if (overlayPosition.value === 'top-right') return 'right-3 top-3'
  if (overlayPosition.value === 'bottom-left') return 'bottom-3 left-3'
  if (overlayPosition.value === 'bottom-right') return 'bottom-3 right-3'
  return 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
})

const overlayPositionLabel = computed(() => {
  if (overlayPosition.value === 'top-left') return 'Top Left'
  if (overlayPosition.value === 'top-right') return 'Top Right'
  if (overlayPosition.value === 'bottom-left') return 'Bottom Left'
  if (overlayPosition.value === 'bottom-right') return 'Bottom Right'
  return 'Centre'
})

function overlayCellClass(cell: OverlayGridCell): string {
  if (overlayGridCell.value === cell) return 'border-red-500/30 bg-red-500/12 text-red-300 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]'
  return 'border-white/[0.08] bg-black/20 text-gray-500 hover:border-white/[0.16] hover:text-white'
}

function overlayCellDotClass(cell: OverlayGridCell): string {
  if (overlayGridCell.value === cell) return 'bg-red-400'
  return 'bg-white/[0.14]'
}

function selectOverlayCell(cell: OverlayGridCell) {
  overlayGridCell.value = cell
}

// Hotkey cheatsheet (shown when recording starts)
const showCheatsheet = ref(false)
const cheatsheetProgress = ref(100)
const cheatsheetRunning = ref(false)
let cheatsheetTimer: ReturnType<typeof setTimeout> | null = null

watch(isRecording, (newVal, oldVal) => {
  if (newVal && !oldVal) {
    // Recording just started — show cheatsheet
    showCheatsheet.value = true
    cheatsheetProgress.value = 100
    cheatsheetRunning.value = false
    if (cheatsheetTimer) clearTimeout(cheatsheetTimer)
    nextTick(() => {
      cheatsheetRunning.value = true
      cheatsheetProgress.value = 0
    })
    cheatsheetTimer = setTimeout(() => {
      showCheatsheet.value = false
      cheatsheetRunning.value = false
    }, CHEATSHEET_DURATION)
  } else if (!newVal) {
    // Recording stopped — hide cheatsheet
    if (cheatsheetTimer) { clearTimeout(cheatsheetTimer); cheatsheetTimer = null }
    showCheatsheet.value = false
  }
})

function handleMouseMove(e: MouseEvent) {
  if (!interactiveRegionRef.value) return
  const rect = interactiveRegionRef.value.getBoundingClientRect()
  const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
  window.api.overlay.setInteractive(over)
}

function handleMouseLeave() {
  window.api.overlay.setInteractive(false)
}

async function saveClip() {
  window.api.overlay.setInteractive(false)
  const result = await window.api.clips.saveBookmark()
  if (result?.ok) {
    // Toast handled via overlay:clip-bookmarked IPC from main
  } else {
    showToastMsg('Not in an active match', 'warning')
  }
}

function showToastMsg(msg: string, type: 'success' | 'warning') {
  toastMessage.value = msg
  toastType.value = type
  toastProgress.value = 100
  toastRunning.value = false
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  // Start progress countdown on next frame so the CSS transition picks it up
  nextTick(() => {
    toastRunning.value = true
    toastProgress.value = 0
  })
  toastTimer = setTimeout(() => { showToast.value = false; toastRunning.value = false }, TOAST_DURATION)
}

onMounted(async () => {
  // Get initial recording state so overlay shows correct status before first event
  try {
    const s = await window.api.app.getStatus()
    isRecording.value = s.recording ?? false
  } catch { /* ignore */ }

  removeListeners.push(
    window.api.on('overlay:data', (payload: unknown) => {
      const p = payload as {
        yourCredits: number | null
        enemyEstimate: number | null
        round: number | null
        allyScore?: number | null
        enemyScore?: number | null
        recording?: boolean
      }
      data.value = {
        yourCredits: p.yourCredits,
        enemyEstimate: p.enemyEstimate,
        round: p.round,
        allyScore: p.allyScore ?? null,
        enemyScore: p.enemyScore ?? null,
      }
      if (p.recording !== undefined) isRecording.value = p.recording
    })
  )
  removeListeners.push(
    window.api.on('overlay:trainer-started', (payload: unknown) => {
      const p = payload as { scenario: string; difficulty: string; duration_seconds: number }
      trainerActive.value = p
      trainerResult.value = null
    })
  )
  removeListeners.push(
    window.api.on('overlay:trainer-result', (payload: unknown) => {
      trainerActive.value = null
      trainerResult.value = payload as TrainerResult
      if (trainerResultTimer) clearTimeout(trainerResultTimer)
      trainerResultTimer = setTimeout(dismissTrainerResult, TRAINER_RESULT_DURATION)
    })
  )
  removeListeners.push(
    window.api.on('overlay:clip-bookmarked', (payload: unknown) => {
      const p = payload as { bookmarkCount?: number; elapsedSec?: number }
      const count = p?.bookmarkCount ?? 1
      const elapsed = p?.elapsedSec
      const timeLabel = elapsed != null ? ` · ${elapsed < 60 ? elapsed + 's' : Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's'} in` : ''
      showToastMsg(`Clip #${count} saved${timeLabel}`, 'success')
    })
  )
  removeListeners.push(
    window.api.on('overlay:clip-not-recording', () => {
      showToastMsg('Not in an active match', 'warning')
    })
  )
  removeListeners.push(
    window.api.on('overlay:screenshot', async () => {
      try {
        const dataUrl = await window.api.screenshots.capture()
        if (!dataUrl) { showToastMsg('Screenshot failed', 'warning'); return }
        const result = await window.api.screenshots.save(dataUrl) as { ok: boolean; filename?: string }
        if (result.ok) {
          showToastMsg('Screenshot saved', 'success')
        } else {
          showToastMsg('Screenshot failed', 'warning')
        }
      } catch {
        showToastMsg('Screenshot failed', 'warning')
      }
    })
  )
  try {
    const bindings = await window.api.clips.getHotkeys()
    const saveClipBinding = bindings?.['save-clip']
    if (saveClipBinding) hotkey.value = saveClipBinding
    const screenshotBinding = bindings?.['take-screenshot']
    if (screenshotBinding) screenshotHotkey.value = screenshotBinding
  } catch { /* use defaults */ }
})

onUnmounted(() => {
  removeListeners.forEach(fn => fn())
  if (toastTimer) clearTimeout(toastTimer)
  if (cheatsheetTimer) clearTimeout(cheatsheetTimer)
  if (trainerResultTimer) clearTimeout(trainerResultTimer)
  window.api.overlay.setInteractive(false)
})
</script>

<style scoped>
.cheatsheet-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cheatsheet-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.cheatsheet-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.cheatsheet-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.toast-slide-enter-active {
  transition: opacity 0.2s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
