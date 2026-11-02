<script setup lang="ts">
import { provideDashboard } from '../composables/useDashboard'
import DashboardActionQueue from '../components/dashboard/DashboardActionQueue.vue'
import { uiV3 } from '../lib/ui-v3'

provideDashboard()
</script>

<template>
  <div v-if="uiV3" class="nyp3">
    <p class="uf-t4 nyp3-note"><span class="uf-label">Preview</span> Example pending matches for reviewing this layout. Every button is switched off here.</p>
    <div class="nyp3-body">
      <DashboardActionQueue preview />
    </div>
  </div>
  <div v-else class="min-h-full flex flex-col bg-[#0a0a0a]">
    <div class="flex-shrink-0 px-5 py-3 border-b border-yellow-500/15 bg-yellow-500/[0.04]">
      <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-yellow-400/90">Preview mode</p>
      <p class="text-[12px] text-gray-500 mt-0.5">Mock pending matches — no Wi‑Fi or live game needed.</p>
    </div>
    <div class="flex-1 px-5 py-4 overflow-y-auto scroll-col">
      <DashboardActionQueue preview />
    </div>
  </div>
</template>

<style scoped>
.nyp3 { min-height: 100%; display: flex; flex-direction: column; background: var(--uf-bg); }
.nyp3-note { flex: none; margin: 0; display: flex; align-items: baseline; gap: 12px; padding: 12px 40px; border-bottom: 1px solid var(--uf-line); }
.nyp3-body { flex: 1; overflow-y: auto; padding: 26px 40px 32px; max-width: 1100px; }
</style>
