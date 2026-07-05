<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard'

const {
  pendingRecordings,
  analysingIds,
  bulkAnalysablePending,
  analyseOldestPending,
  analyseRecording,
  recAnalysisReady,
  recInFlight,
  saveRecording,
  savingIds,
} = useDashboard()
</script>

<template>
  <div v-if="pendingRecordings.length" class="dash-panel overflow-hidden flex-shrink-0 border border-amber-500/15">
    <div class="px-3.5 py-2.5 border-b border-white/[0.07] flex items-center justify-between bg-amber-500/[0.04]">
      <div class="flex items-center gap-2">
        <span class="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-black">!</span>
        <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Needs you</p>
      </div>
      <span class="text-[10px] text-gray-500">{{ pendingRecordings.length }} pending</span>
    </div>
    <ul class="divide-y divide-white/[0.05]">
      <li v-for="rec in pendingRecordings.slice(0, 3)" :key="rec.id" class="px-3.5 py-3 flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
          {{ rec.map?.slice(0, 2).toUpperCase() || '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-semibold text-gray-200 truncate">{{ rec.agent || 'Recording' }} · {{ rec.map || '—' }}</p>
          <p class="text-[10px] text-gray-500 truncate">{{ rec.pipelineStatus || 'Local file ready' }}</p>
        </div>
        <button
          v-if="!rec.clipsOnly && recAnalysisReady(rec) && !recInFlight(rec)"
          type="button"
          class="flex-shrink-0 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-gradient-to-r from-red-600 to-orange-600 text-white disabled:opacity-50"
          :disabled="analysingIds.has(rec.id)"
          @click="analyseRecording(rec.id)"
        >Analyse</button>
        <button
          v-else-if="!rec.cloudArchived && !rec.jobId && !recInFlight(rec)"
          type="button"
          class="flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold rounded-lg border border-emerald-500/30 text-emerald-300 disabled:opacity-50"
          :disabled="savingIds.has(rec.id)"
          @click="saveRecording(rec.id)"
        >Save</button>
      </li>
    </ul>
    <button
      v-if="bulkAnalysablePending.length > 1"
      type="button"
      class="w-full py-2.5 text-[10px] font-semibold text-red-400/90 border-t border-white/[0.06] hover:bg-white/[0.02]"
      @click="analyseOldestPending"
    >Analyse next in queue</button>
  </div>
</template>
