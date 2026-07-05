<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import {
  getAgentImage,
  getAgentColor,
  getMapImage,
} from '../../lib/valorant'
import { formatRelativeTime } from '../../lib/dashboard-match-row'

const {
  router,
  dashboardAnalyses,
  coachingSnippets,
  analysesLoading,
  openAnalysisRow,
  profile,
} = useDashboard()

const preview = computed(() =>
  [...dashboardAnalyses.value]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3),
)

function snippet(id: number): string {
  return coachingSnippets.value[id] ?? ''
}

function scoreLine(a: typeof preview.value[0]): string {
  if (a.rounds_won != null && a.rounds_lost != null) return `${a.rounds_won} – ${a.rounds_lost}`
  return '—'
}

const coachName = computed(() => profile.value?.user.name?.split(' ')[0] ?? 'Coach')
</script>

<template>
  <div class="flex-shrink-0 flex flex-col min-h-0">
    <div class="flex items-center justify-between mb-3 px-0.5">
      <h2 class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Recent matches</h2>
      <button type="button" class="text-[11px] font-semibold text-red-400/80 hover:text-red-400" @click="router.push('/history')">View all matches →</button>
    </div>

    <div v-if="analysesLoading" class="grid grid-cols-3 gap-3">
      <div v-for="i in 3" :key="i" class="h-[220px] rounded-2xl bg-white/[0.03] animate-pulse border border-white/[0.07]" />
    </div>

    <div v-else-if="preview.length === 0" class="dash-panel px-6 py-12 text-center">
      <p class="text-sm font-semibold text-gray-400">No analysed matches yet</p>
      <p class="text-[12px] text-gray-600 mt-1.5">Play a ranked game — UpForge captures and coaches automatically</p>
    </div>

    <div v-else class="grid grid-cols-3 gap-3">
      <button
        v-for="a in preview"
        :key="a.id"
        type="button"
        class="match-story-card group text-left relative overflow-hidden rounded-2xl min-h-[220px] flex flex-col"
        @click="openAnalysisRow(a)"
      >
        <img
          v-if="a.map && getMapImage(a.map)"
          :src="getMapImage(a.map)"
          alt=""
          class="absolute inset-0 w-full h-full object-cover object-center scale-105 transition-transform duration-300 group-hover:scale-[1.08]"
        />
        <div
          class="absolute inset-0 opacity-35 transition-opacity group-hover:opacity-45"
          :style="a.agent ? { background: `radial-gradient(ellipse at 50% 52%, ${getAgentColor(a.agent)}66, transparent 62%)` } : undefined"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/95 via-[#0a0a0a]/72 to-[#0a0a0a]/35" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/55 via-transparent to-[#0a0a0a]/92" />

        <div class="relative z-10 p-3.5 flex flex-col flex-1">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Map · {{ a.map || 'Unknown' }}</p>
              <p class="text-2xl font-black text-white tabular-nums mt-1 leading-none">{{ scoreLine(a) }}</p>
            </div>
            <span
              v-if="a.won != null"
              class="text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wide flex-shrink-0"
              :class="a.won ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'"
            >{{ a.won ? 'Win' : 'Loss' }}</span>
          </div>

          <div class="flex-1 flex flex-col items-center justify-center py-2 min-h-[108px]">
            <img
              v-if="a.agent && getAgentImage(a.agent)"
              :src="getAgentImage(a.agent)"
              alt=""
              class="w-[104px] h-[112px] object-cover object-top drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-[1.03]"
            />
            <p class="text-sm font-black text-white mt-1.5 text-center">{{ a.agent || 'Unknown agent' }}</p>
            <p class="text-[10px] text-gray-400">{{ formatRelativeTime(a.created_at) }}</p>
          </div>

          <div v-if="snippet(a.id)" class="relative z-10 mt-3 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5">
            <div class="flex gap-2">
              <span class="text-lg leading-none font-serif" :class="a.won ? 'text-emerald-500/70' : 'text-red-500/70'">"</span>
              <div class="min-w-0">
                <p class="text-[11px] text-gray-300 leading-relaxed line-clamp-3 italic">{{ snippet(a.id) }}</p>
                <p class="text-[9px] text-gray-600 mt-1.5">— {{ coachName }}</p>
              </div>
            </div>
          </div>
          <div v-else-if="a.overall_score != null" class="relative z-10 mt-3 flex items-baseline gap-1">
            <span class="text-lg font-black tabular-nums text-gray-300">{{ a.overall_score * 10 }}</span>
            <span class="text-[9px] font-bold text-gray-600 uppercase">AI score</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.match-story-card {
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.match-story-card:hover {
  border-color: rgba(255, 70, 85, 0.28);
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 70, 85, 0.08);
}
</style>
