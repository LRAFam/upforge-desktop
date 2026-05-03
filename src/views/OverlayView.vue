<template>
  <div class="p-2 select-none" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Main panel -->
    <div class="bg-black/90 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3.5 w-[296px] shadow-2xl">
      <!-- Header: recording status + hide hint -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div :class="['w-2.5 h-2.5 rounded-full flex-shrink-0', isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-600']" />
          <span class="text-[12px] font-bold tracking-wide" :class="isRecording ? 'text-red-400' : 'text-gray-500'">
            {{ isRecording ? '● RECORDING' : 'STANDBY' }}
          </span>
        </div>
        <span class="text-[11px] text-gray-500 font-medium">F10 hide</span>
      </div>

      <!-- Economy info -->
      <div class="space-y-2 mb-3">
        <div class="flex items-center justify-between">
          <span class="text-[13px] text-gray-400">Your credits</span>
          <span class="text-[14px] font-mono font-bold text-green-400">{{ data.yourCredits ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[13px] text-gray-400">Enemy est.</span>
          <span class="text-[14px] font-mono font-bold text-red-400">{{ data.enemyEstimate ?? '—' }}</span>
        </div>
      </div>

      <!-- Round -->
      <div class="flex items-center justify-between pt-2.5 border-t border-white/10 mb-3">
        <span class="text-[13px] text-gray-400">Round</span>
        <span class="text-[15px] font-mono font-bold text-white">{{ data.round ?? '—' }}</span>
      </div>

      <!-- Clip button — interactive via hover trick -->
      <button
        ref="clipBtnRef"
        :class="[
          'w-full flex items-center justify-center gap-2 border rounded-lg py-3 transition-all duration-150 pointer-events-auto cursor-pointer',
          isRecording
            ? 'bg-red-500/15 hover:bg-red-500/25 active:bg-red-500/35 border-red-500/40 text-red-300'
            : 'bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.18] border-white/15 text-gray-400'
        ]"
        @click="saveClip"
      >
        <span class="text-base leading-none">⏺</span>
        <span class="text-[13px] font-semibold">
          {{ isRecording ? 'Save Clip' : 'Not in match' }}
          <span class="font-normal opacity-60 ml-1">({{ hotkey }})</span>
        </span>
      </button>
    </div>

    <!-- Bookmarked toast -->
    <Transition name="fade">
      <div
        v-if="showToast"
        :class="[
          'mt-2 backdrop-blur-sm border rounded-lg px-3 py-2 text-center w-[296px]',
          toastType === 'success'
            ? 'bg-green-500/90 border-green-400/30'
            : 'bg-amber-500/90 border-amber-400/30'
        ]"
      >
        <span class="text-[13px] font-semibold text-white">{{ toastMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const data = ref<{
  yourCredits: number | null
  enemyEstimate: number | null
  round: number | null
}>({ yourCredits: null, enemyEstimate: null, round: null })

const isRecording = ref(false)
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'warning'>('success')
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
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { showToast.value = false }, 2500)
}

onMounted(async () => {
  removeListeners.push(
    window.api.on('overlay:data', (payload: unknown) => {
      const p = payload as { yourCredits: number | null; enemyEstimate: number | null; round: number | null; recording?: boolean }
      data.value = p
      if (p.recording !== undefined) isRecording.value = p.recording
    })
  )
  removeListeners.push(
    window.api.on('overlay:clip-bookmarked', () => {
      showToastMsg('✓ Clip bookmarked! Saves after match', 'success')
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
