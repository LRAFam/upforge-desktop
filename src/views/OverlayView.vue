<template>
  <!-- Transparent overlay — economy + round info shown in-game -->
  <div class="p-2 pointer-events-none select-none">
    <div class="bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 w-48">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Economy</span>
        <span class="text-[10px] text-gray-600">F10 to hide</span>
      </div>
      <!-- Your credits -->
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-gray-300">You</span>
        <span class="text-[11px] font-mono text-green-400">{{ data.yourCredits ?? '—' }}</span>
      </div>
      <!-- Enemy estimate -->
      <div class="flex items-center justify-between mt-0.5">
        <span class="text-[11px] text-gray-300">Enemy est.</span>
        <span class="text-[11px] font-mono text-red-400">{{ data.enemyEstimate ?? '—' }}</span>
      </div>
      <!-- Round -->
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
        <span class="text-[11px] text-gray-400">Round</span>
        <span class="text-[11px] font-mono text-white">{{ data.round ?? '—' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const data = ref<{
  yourCredits: number | null
  enemyEstimate: number | null
  round: number | null
}>({ yourCredits: null, enemyEstimate: null, round: null })

let removeListener: (() => void) | null = null

onMounted(() => {
  removeListener = window.api.on('overlay:data', (payload: unknown) => {
    const p = payload as typeof data.value
    data.value = p
  })
})

onUnmounted(() => {
  removeListener?.()
})
</script>
