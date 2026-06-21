<script setup lang="ts">
import { useVodReview } from '../../composables/useVodReview'

const {
  shortcutLegend,
  showShortcuts,
} = useVodReview()
</script>

<template>
<!-- Keyboard shortcuts overlay -->
    <Transition name="event-pop">
      <div
        v-if="showShortcuts"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
        @click.self="showShortcuts = false"
      >
        <div class="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#1a1a1a] shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
            <p class="text-sm font-semibold text-white">Keyboard shortcuts</p>
            <button class="text-gray-500 hover:text-gray-300 transition-colors" @click="showShortcuts = false">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </button>
          </div>
          <div class="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div v-for="s in shortcutLegend" :key="s.key" class="flex items-center justify-between gap-2 py-1">
              <kbd class="font-mono text-[10px] text-gray-300 bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5">{{ s.key }}</kbd>
              <span class="text-gray-500 text-right">{{ s.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
</template>
