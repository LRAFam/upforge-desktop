<template>
  <div class="p-2 select-none" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Main panel -->
    <div class="bg-black/85 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3 w-[276px] shadow-2xl">
      <!-- Header: recording status + hide hint -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div :class="['w-2 h-2 rounded-full flex-shrink-0', isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-600']" />
          <span class="text-[11px] font-semibold" :class="isRecording ? 'text-red-400' : 'text-gray-500'">
            {{ isRecording ? 'Recording' : 'Standby' }}
          </span>
        </div>
        <span class="text-[10px] text-gray-600">F10 hide</span>
      </div>

      <!-- Economy info -->
      <div class="space-y-1.5 mb-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] text-gray-400">Your credits</span>
          <span class="text-[13px] font-mono font-bold text-green-400">{{ data.yourCredits ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[12px] text-gray-400">Enemy est.</span>
          <span class="text-[13px] font-mono font-bold text-red-400">{{ data.enemyEstimate ?? '—' }}</span>
        </div>
      </div>

      <!-- Round -->
      <div class="flex items-center justify-between pt-2 border-t border-white/10 mb-3">
        <span class="text-[12px] text-gray-400">Round</span>
        <span class="text-[14px] font-mono font-bold text-white">{{ data.round ?? '—' }}</span>
      </div>

      <!-- Clip button — interactive via hover trick -->
      <button
        ref="clipBtnRef"
        class="w-full flex items-center justify-center gap-2 bg-white/[0.07] hover:bg-white/[0.14] active:bg-white/[0.20] border border-white/15 rounded-lg py-2.5 transition-all duration-150 pointer-events-auto cursor-pointer"
        @click="saveClip"
      >
        <span class="text-red-400 text-base leading-none">⏺</span>
        <span class="text-[12px] font-semibold text-gray-200">Save Clip <span class="text-gray-500 font-normal">({{ hotkey }})</span></span>
      </button>
    </div>

    <!-- Bookmarked toast -->
    <Transition name="fade">
      <div
        v-if="showBookmarked"
        class="mt-2 bg-green-500/90 backdrop-blur-sm border border-green-400/30 rounded-lg px-3 py-2 text-center w-[276px]"
      >
        <span class="text-[12px] font-semibold text-white">✓ Clip bookmarked! Saves after match</span>
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
const showBookmarked = ref(false)
const hotkey = ref('F9')
const clipBtnRef = ref<HTMLButtonElement | null>(null)
let bookmarkedTimer: ReturnType<typeof setTimeout> | null = null
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
    showBookmarkFlash()
  } else {
    // Not recording — show brief "not recording" indicator
    showBookmarked.value = false
  }
}

function showBookmarkFlash() {
  showBookmarked.value = true
  if (bookmarkedTimer) clearTimeout(bookmarkedTimer)
  bookmarkedTimer = setTimeout(() => {
    showBookmarked.value = false
  }, 2500)
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
      showBookmarkFlash()
    })
  )
  // Load current hotkey binding
  try {
    const bindings = await window.api.clips.getHotkeys()
    const saveClipBinding = bindings?.['save-clip']
    if (saveClipBinding) hotkey.value = saveClipBinding
  } catch { /* use default F9 */ }
})

onUnmounted(() => {
  removeListeners.forEach(fn => fn())
  if (bookmarkedTimer) clearTimeout(bookmarkedTimer)
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
