<script setup lang="ts">
import { provideDashboard } from '../composables/useDashboard'
import DashboardActionQueue from '../components/dashboard/DashboardActionQueue.vue'

provideDashboard()
</script>

<template>
  <div class="min-h-full flex flex-col bg-[#0a0a0a]">
    <div class="flex-shrink-0 px-5 py-3 border-b border-yellow-500/15 bg-yellow-500/[0.04]">
      <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-yellow-400/90">Preview mode</p>
      <p class="text-[12px] text-gray-500 mt-0.5">Mock pending matches — no Wi‑Fi or live game needed.</p>
    </div>
    <div class="flex-1 px-5 py-4 overflow-y-auto scroll-col">
      <DashboardActionQueue preview />
    </div>
  </div>
</template>
