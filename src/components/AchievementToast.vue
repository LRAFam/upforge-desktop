<template>
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] w-72">
    <div class="rounded-2xl border border-[#ff4655]/30 bg-[#0d1520] shadow-[0_16px_60px_rgba(0,0,0,0.9)] overflow-hidden">
      <!-- Top accent bar -->
      <div class="h-px bg-gradient-to-r from-transparent via-[#ff4655]/60 to-transparent" />

      <div class="px-4 py-3.5">
        <!-- Row 1: label -->
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-[9px] font-black uppercase tracking-[0.18em] text-[#ff4655]">🏆 Achievement Unlocked</span>
          <button
            class="text-gray-600 hover:text-gray-400 transition-colors leading-none"
            @click="dismiss"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Row 2: icon + name + description -->
        <div class="flex items-center gap-3">
          <span class="text-2xl leading-none flex-shrink-0">{{ achievement.icon }}</span>
          <div class="min-w-0">
            <div class="text-sm font-black text-white leading-tight">{{ achievement.name }}</div>
            <div class="text-xs text-gray-400 leading-snug mt-0.5">{{ achievement.description }}</div>
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="h-px bg-white/[0.05]" />
      <div class="h-0.5 bg-[#0d1520] overflow-hidden">
        <div class="h-full bg-[#ff4655]/70 achievement-progress-bar" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import type { AchievementDef } from '../composables/useAchievements'

const props = defineProps<{
  achievement: AchievementDef
  onDismiss: () => void
}>()

const emit = defineEmits<{ dismiss: [] }>()

let timer: ReturnType<typeof setTimeout> | null = null

function dismiss() {
  if (timer) clearTimeout(timer)
  props.onDismiss()
  emit('dismiss')
}

onMounted(() => {
  timer = setTimeout(dismiss, 4000)
})
</script>

<style scoped>
.achievement-progress-bar {
  width: 100%;
  animation: achievement-shrink 4s linear forwards;
}

@keyframes achievement-shrink {
  from { width: 100%; }
  to   { width: 0%; }
}
</style>
