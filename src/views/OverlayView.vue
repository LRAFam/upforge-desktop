<template>
  <div class="p-2 select-none" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
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
            <!-- Pulse indicator -->
            <div class="relative w-4 h-4 flex items-center justify-center flex-shrink-0">
              <div :class="['w-2 h-2 rounded-full transition-colors duration-500', isRecording ? 'bg-red-500' : 'bg-gray-700']" />
              <div v-if="isRecording" class="absolute w-2 h-2 rounded-full bg-red-500 animate-ping opacity-50" />
            </div>
            <span :class="['text-[10px] font-bold tracking-[0.16em] uppercase transition-colors', isRecording ? 'text-red-400' : 'text-gray-600']">
              {{ isRecording ? 'Live Rec' : 'Standby' }}
            </span>
          </div>
          <kbd class="text-[9px] text-gray-700 font-medium bg-white/[0.04] border border-white/[0.07] rounded px-1.5 py-px">F10</kbd>
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
            <span class="text-[10px] text-gray-700 font-bold">–</span>
            <span class="text-[13px] font-black text-red-400 tabular-nums">{{ data.enemyScore }}</span>
          </div>
          <span v-else class="text-[10px] text-gray-700">–</span>
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
            <span class="font-normal opacity-40 ml-1 text-[10px]">({{ hotkey }})</span>
          </span>
        </button>
      </div>
    </div>

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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const TOAST_DURATION = 3000

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
const clipBtnRef = ref<HTMLButtonElement | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
const removeListeners: Array<() => void> = []

function handleMouseMove(e: MouseEvent) {
  if (!clipBtnRef.value) return
  const rect = clipBtnRef.value.getBoundingClientRect()
  const over = e.clientX >= rect.left && e.clientX <= rect.right &&
    e.clientY >= rect.top && e.clientY <= rect.bottom
  window.api.overlay.setInteractive(over)
}

function handleMouseLeave() {
  window.api.overlay.setInteractive(false)
}

async function saveClip() {
  window.api.overlay.setInteractive(false)
  const result = await window.api.clips.saveBookmark()
  if (result?.ok) {
    showToastMsg('✓ Clip bookmarked! Saves after match', 'success')
  } else {
    showToastMsg('⚠ Not in an active match', 'warning')
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
    window.api.on('overlay:clip-bookmarked', (payload: unknown) => {
      const p = payload as { bookmarkCount?: number }
      const count = p?.bookmarkCount ?? 1
      showToastMsg(`✓ Clip #${count} saved! Exports after match`, 'success')
    })
  )
  removeListeners.push(
    window.api.on('overlay:clip-not-recording', () => {
      showToastMsg('⚠ Not in an active match', 'warning')
    })
  )
  try {
    const bindings = await window.api.clips.getHotkeys()
    const saveClipBinding = bindings?.['save-clip']
    if (saveClipBinding) hotkey.value = saveClipBinding
  } catch { /* use default F9 */ }
})

onUnmounted(() => {
  removeListeners.forEach(fn => fn())
  if (toastTimer) clearTimeout(toastTimer)
  window.api.overlay.setInteractive(false)
})
</script>

<style scoped>
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
