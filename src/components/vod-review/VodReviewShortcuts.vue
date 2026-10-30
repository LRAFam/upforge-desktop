<script setup lang="ts">
import { uiV3 } from '../../lib/ui-v3'
import UfDialog from '../v3/UfDialog.vue'
import { computed } from 'vue'
import { useVodReview } from '../../composables/useVodReview'

const {
  shortcutLegend,
  showShortcuts,
} = useVodReview()

const coachShortcutKeys = new Set(['C', 'G', 'Shift + J / L', '1 – 9'])
const coachShortcuts = computed(() => shortcutLegend.value.filter(s => coachShortcutKeys.has(s.key)))
const generalShortcuts = computed(() => shortcutLegend.value.filter(s => !coachShortcutKeys.has(s.key)))
</script>

<template>
<template v-if="uiV3">
  <UfDialog :open="showShortcuts" title="Keyboard shortcuts" kicker="Match review" :width="520" @close="showShortcuts = false">
    <section v-if="coachShortcuts.length" class="ks3">
      <span class="uf-label">Coach notes</span>
      <div v-for="s in coachShortcuts" :key="s.key" class="ks3-row"><span class="uf-t4">{{ s.label }}</span><kbd class="ks3-key">{{ s.key }}</kbd></div>
    </section>
    <section class="ks3">
      <span v-if="coachShortcuts.length" class="uf-label">Playback</span>
      <div v-for="s in generalShortcuts" :key="s.key" class="ks3-row"><span class="uf-t4">{{ s.label }}</span><kbd class="ks3-key">{{ s.key }}</kbd></div>
    </section>
  </UfDialog>
</template>
<template v-else>
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
          <div class="px-4 py-3 space-y-3 text-xs max-h-[min(70vh,520px)] overflow-y-auto scrollbar-hide">
            <div v-if="coachShortcuts.length" class="space-y-2">
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400/80">Coach notes</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div v-for="s in coachShortcuts" :key="s.key" class="flex items-center justify-between gap-2 py-1">
                  <kbd class="font-mono text-[10px] text-gray-300 bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5">{{ s.key }}</kbd>
                  <span class="text-gray-500 text-right">{{ s.label }}</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <p v-if="coachShortcuts.length" class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Playback</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div v-for="s in generalShortcuts" :key="s.key" class="flex items-center justify-between gap-2 py-1">
                  <kbd class="font-mono text-[10px] text-gray-300 bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5">{{ s.key }}</kbd>
                  <span class="text-gray-500 text-right">{{ s.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
</template>
</template>

<style scoped>
.ks3 { display: flex; flex-direction: column; }
.ks3 .uf-label { padding-bottom: 6px; }
.ks3-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 0; border-top: 1px solid var(--uf-line); }
.ks3-row .uf-t4 { color: var(--uf-muted); }
.ks3-key { font: 600 12px/1 var(--uf-body); color: var(--uf-bone); border: 1px solid var(--uf-line-2); padding: 4px 7px; font-variant-numeric: tabular-nums; }
</style>
