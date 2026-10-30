<template>
  <Teleport to="body">
    <Transition v-if="uiV3" name="uf-toast-out">
      <AchievementToast
        v-if="current"
        :key="current.id"
        :achievement="current"
        :on-dismiss="nextToast"
        @dismiss="nextToast"
      />
    </Transition>
    <Transition v-else name="achievement-slide">
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
import { ref, onMounted, onUnmounted } from 'vue'
import AchievementToast from './AchievementToast.vue'
import { ACHIEVEMENTS, type AchievementDef } from '../composables/useAchievements'
import { uiV3 } from '../lib/ui-v3'
import { createToastQueue } from '../lib/shell-v3'

// One toast at a time with a small gap. The queue ignores the second advance the toast
// sends (it calls onDismiss and emits dismiss), which used to skip a queued achievement.
const current = ref<AchievementDef | null>(null)
const queue = createToastQueue<AchievementDef>({ gapMs: 400, onChange: (c) => { current.value = c } })

function nextToast() {
  queue.next()
}

function handleUnlocked(ids: string[]) {
  const defs: AchievementDef[] = []
  for (const id of ids) {
    const def = ACHIEVEMENTS.find(a => a.id === id)
    if (def) defs.push(def)
  }
  queue.push(defs)
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
  queue.dispose()
  delete window.__ufAchievementUnlocked
})
</script>

<style scoped>
/* v3: the toast rises in once (uf-rise on the toast); leaving is a quick fade. */
.uf-toast-out-leave-active { transition: opacity 0.2s ease-in; }
.uf-toast-out-leave-to { opacity: 0; }
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
