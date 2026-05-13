<template>
  <Teleport to="body">
    <Transition name="achievement-slide">
      <AchievementToast
        v-if="current"
        :key="current.id"
        :achievement="current"
        :on-dismiss="nextToast"
        @dismiss="nextToast"
      />
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AchievementToast from './AchievementToast.vue'
import { ACHIEVEMENTS } from '../composables/useAchievements'

const toastQueue = ref<typeof ACHIEVEMENTS>([])
let gapTimer: ReturnType<typeof setTimeout> | null = null

const current = computed(() => toastQueue.value[0] ?? null)

function nextToast() {
  toastQueue.value.shift()
  if (toastQueue.value.length > 0) {
    // Small gap between toasts
    const next = toastQueue.value[0]
    toastQueue.value.shift()
    gapTimer = setTimeout(() => {
      toastQueue.value.unshift(next)
    }, 400)
  }
}

function handleUnlocked(ids: string[]) {
  for (const id of ids) {
    const def = ACHIEVEMENTS.find(a => a.id === id)
    if (def) toastQueue.value.push(def)
  }
}

declare global {
  interface Window {
    __ufAchievementUnlocked?: (ids: string[]) => void
  }
}

onMounted(() => {
  window.__ufAchievementUnlocked = handleUnlocked
})

onUnmounted(() => {
  if (gapTimer) clearTimeout(gapTimer)
  delete window.__ufAchievementUnlocked
})
</script>

<style scoped>
.achievement-slide-enter-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}
.achievement-slide-leave-active {
  transition: transform 0.2s ease-in, opacity 0.2s ease-in;
}
.achievement-slide-enter-from {
  transform: translateX(-50%) translateY(100%);
  opacity: 0;
}
.achievement-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0;
}
/* Keep the position stable while visible */
.achievement-slide-enter-to,
.achievement-slide-leave-from {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}
</style>
