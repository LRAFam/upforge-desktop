<template>
  <div class="h-full text-white flex flex-col overflow-hidden" style="background: #080808">

    <!-- Header bar -->
    <div class="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0 bg-[#0c0c0c]">
      <button
        class="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors text-xs"
        @click="$router.back()"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back
      </button>
      <div class="w-px h-4 bg-white/[0.08]" />
      <h1 class="text-sm font-black text-white tracking-tight">Coaching History</h1>
      <span class="ml-auto text-xs text-gray-600">{{ filteredAnalyses.length }} sessions</span>
    </div>

    <!-- Score trend chart -->
    <div v-if="chartData" class="px-4 pt-3 flex-shrink-0">
      <div class="rounded-xl border border-white/[0.06] overflow-hidden" style="background: #0d1520">
        <div class="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
          <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Score Trend</span>
          <div class="flex-1 h-px bg-white/[0.04]" />
          <span class="text-[9px] font-bold" :class="chartData.up ? 'text-green-400' : 'text-red-400'">
            {{ chartData.up ? '↑' : '↓' }} {{ chartData.last * 10 }}
          </span>
        </div>
        <div class="relative px-2 pt-1.5 pb-0.5">
          <div class="absolute left-2 top-1.5 flex flex-col pointer-events-none" style="height: 80px; justify-content: space-between">
            <span class="text-[7px] text-gray-700 tabular-nums leading-none">100</span>
            <span class="text-[7px] text-gray-700 tabular-nums leading-none">50</span>
            <span class="text-[7px] text-gray-700 tabular-nums leading-none">0</span>
          </div>
          <div class="pl-6 pr-1">
            <svg width="100%" :height="chartData.H" :viewBox="`0 0 ${chartData.W} ${chartData.H}`" preserveAspectRatio="none" style="height:80px; display:block">
              <defs>
                <linearGradient id="hist-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" :stop-color="chartData.up ? '#4ade80' : '#f87171'" stop-opacity="0.3"/>
                  <stop offset="100%" :stop-color="chartData.up ? '#4ade80' : '#f87171'" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <line v-for="gl in chartData.gridLines" :key="gl.score" :x1="chartData.pad" :y1="gl.y" :x2="chartData.W - chartData.pad" :y2="gl.y" stroke="rgba(255,255,255,0.05)" stroke-width="0.75"/>
              <path :d="chartData.areaPath" fill="url(#hist-area-grad)" />
              <path :d="chartData.linePath" fill="none" :stroke="chartData.up ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div class="flex justify-between mt-0.5">
              <span class="text-[7px] text-gray-700">{{ chartData.firstDate }}</span>
              <span class="text-[7px] text-gray-700">{{ chartData.lastDate }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary stats row -->
    <div v-if="allAnalyses.length" class="flex gap-2 px-4 pt-3 flex-shrink-0">
      <div class="flex-1 rounded-xl border border-white/[0.06] px-2 py-2.5 text-center" style="background: #0d1520">
        <div class="text-sm font-black text-white tabular-nums">{{ allAnalyses.length }}</div>
        <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Games</div>
      </div>
      <div class="flex-1 rounded-xl border border-white/[0.06] px-2 py-2.5 text-center" style="background: #0d1520">
        <div class="text-sm font-black tabular-nums" :class="winRate >= 50 ? 'text-green-400' : 'text-red-400'">{{ winRate }}%</div>
        <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Win Rate</div>
      </div>
      <div class="flex-1 rounded-xl border border-white/[0.06] px-2 py-2.5 text-center" style="background: #0d1520">
        <div class="text-sm font-black tabular-nums" :class="avgScore !== null ? scoreColor(avgScore) : 'text-gray-600'">{{ avgScore != null ? avgScore * 10 : '—' }}</div>
        <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg Score</div>
      </div>
      <div class="flex-1 rounded-xl border border-white/[0.06] px-2 py-2.5 text-center" style="background: #0d1520">
        <div class="text-sm font-black text-white tabular-nums">{{ avgKD }}</div>
        <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg K/D</div>
      </div>
    </div>

    <!-- Filter row: result tabs + map pills -->
    <div class="px-4 pt-3 pb-1 flex-shrink-0 space-y-2">
      <!-- Result filter -->
      <div class="flex gap-1.5">
        <button
          v-for="f in (['All', 'Wins', 'Losses', 'Scored'] as const)"
          :key="f"
          class="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border"
          :class="activeFilter === f
            ? 'bg-red-500/15 text-red-400 border-red-500/30'
            : 'text-gray-500 border-white/[0.06] hover:text-gray-300 hover:bg-white/[0.03] hover:border-white/[0.12]'"
          @click="activeFilter = f"
        >{{ f }}</button>
      </div>
      <!-- Map filter -->
      <div v-if="availableMaps.length > 1" class="flex gap-1 flex-wrap">
        <button
          class="px-2 py-1 rounded-full text-[10px] font-semibold transition-all border capitalize"
          :class="activeMap === null
            ? 'bg-white/[0.06] text-gray-300 border-white/[0.12]'
            : 'text-gray-600 border-white/[0.06] hover:text-gray-400 hover:bg-white/[0.03]'"
          @click="activeMap = null"
        >All maps</button>
        <button
          v-for="map in availableMaps"
          :key="map"
          class="px-2 py-1 rounded-full text-[10px] font-semibold transition-all border capitalize"
          :class="activeMap === map
            ? 'bg-white/[0.06] text-gray-300 border-white/[0.12]'
            : 'text-gray-600 border-white/[0.06] hover:text-gray-400 hover:bg-white/[0.03]'"
          @click="activeMap = map"
        >{{ map }}</button>
      </div>
    </div>

    <!-- Scrollable list -->
    <div class="flex-1 overflow-y-auto px-4 pb-4" style="scrollbar-width: none">
      <div v-if="loading" class="space-y-2 pt-2">
        <div v-for="i in 5" :key="i" class="h-[52px] bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.04]" />
      </div>

      <div v-else-if="filteredAnalyses.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <div class="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
          <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
        </div>
        <p class="text-xs text-gray-500">{{ allAnalyses.length === 0 ? 'No analyses yet' : 'No results for this filter' }}</p>
        <p v-if="allAnalyses.length === 0" class="text-xs text-gray-700 mt-0.5">Play a game to get your first coaching session</p>
      </div>

      <!-- Analysis rows -->
      <div v-else class="space-y-1.5 pt-2">
        <div v-for="a in filteredAnalyses" :key="a.id">
          <!-- Row -->
          <div
            class="w-full flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.08] transition-all cursor-pointer"
            :class="expandedId === a.id ? 'rounded-t-xl border-b-transparent' : 'rounded-xl'"
            @click="toggleExpand(a)"
          >
            <!-- Agent icon with map background -->
            <div
              class="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center relative"
              :style="a.agent ? { backgroundColor: getAgentColor(a.agent) + '22' } : {}"
            >
              <img v-if="a.map && getMapMinimap(a.map)" :src="getMapMinimap(a.map)" class="absolute inset-0 w-full h-full object-cover opacity-20" />
              <img v-if="a.agent && getAgentImage(a.agent)" :src="getAgentImage(a.agent)" class="relative w-7 h-7 object-contain" />
              <template v-else>
                <svg v-if="a.job_id" class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
                </svg>
                <svg v-else class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </template>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <p class="text-xs font-medium text-gray-200 truncate">
                  {{ a.agent || 'Unknown' }} <span class="text-gray-600">&middot;</span> {{ a.map || 'Unknown' }}
                </p>
                <span
                  v-if="a.agent"
                  class="flex-shrink-0 text-[8px] font-semibold px-1 py-px rounded"
                  :style="{ color: getRoleColor(getAgentRole(a.agent)), backgroundColor: getRoleColor(getAgentRole(a.agent)) + '20' }"
                >{{ getAgentRole(a.agent) }}</span>
                <!-- game_mode badge -->
                <span
                  v-if="a.game_mode && a.game_mode.toLowerCase() !== 'competitive'"
                  class="flex-shrink-0 text-[8px] font-semibold px-1.5 py-px rounded-full bg-white/[0.05] text-gray-600 border border-white/[0.06] capitalize"
                >{{ a.game_mode }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-0.5 flex items-center gap-1.5">
                <span>{{ formatDate(a.created_at) }}</span>
                <span v-if="a.won != null" :class="a.won ? 'text-green-500/70' : 'text-red-500/60'">{{ a.won ? 'W' : 'L' }}</span>
                <span v-if="a.rounds_won != null && a.rounds_lost != null" class="text-gray-700">{{ a.rounds_won }}–{{ a.rounds_lost }}</span>
                <span v-if="a.kda != null">{{ a.kda.toFixed(2) }} K/D</span>
              </p>
            </div>

            <!-- Score badge / spinner / ACS -->
            <div v-if="a.overall_score != null" class="flex-shrink-0 flex flex-col items-end gap-0.5">
              <span class="text-xs font-bold tabular-nums" :class="a.overall_score >= 78 ? 'text-green-400' : a.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ a.overall_score * 10 }}</span>
              <span class="text-[8px] font-bold px-1 py-px rounded" :class="scoreGradeBadgeClass(a.overall_score)">{{ scoreGrade(a.overall_score) }}</span>
            </div>
            <div v-else-if="['queued', 'processing', 'pending'].includes(a.status)" class="flex-shrink-0">
              <svg class="w-4 h-4 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
            <div v-else-if="a.combat_score" class="flex-shrink-0 text-right">
              <span class="text-xs font-bold text-gray-400 tabular-nums">{{ a.combat_score }}</span>
              <span class="block text-xs text-gray-700">ACS</span>
            </div>

            <!-- Expand chevron -->
            <svg
              class="w-3.5 h-3.5 text-gray-700 flex-shrink-0 transition-transform duration-200"
              :class="expandedId === a.id ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>

          <!-- Expandable detail panel -->
          <Transition name="detail-expand">
            <div
              v-if="expandedId === a.id"
              class="border border-t-0 border-white/[0.05] rounded-b-xl overflow-hidden"
              style="background: rgba(255,255,255,0.015)"
            >
              <!-- Loading -->
              <div v-if="detailLoading" class="flex items-center justify-center gap-2 py-4">
                <svg class="w-3.5 h-3.5 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span class="text-[10px] text-gray-600">Loading detail…</span>
              </div>

              <!-- No detail (unanalysed) -->
              <div v-else-if="!expandedDetail" class="px-4 py-3 text-center text-[10px] text-gray-600">
                No coaching detail available for this session.
                <button class="block mt-1.5 mx-auto text-[10px] text-red-400/70 hover:text-red-400 underline" @click.stop="openTimeline(a.id)">Open in VOD Review →</button>
              </div>

              <!-- Detail content -->
              <div v-else class="px-4 py-3 space-y-3">
                <!-- Score + round outcome -->
                <div class="flex items-center gap-3 flex-wrap">
                  <div v-if="expandedDetail.ally_score != null" class="flex items-center gap-1.5">
                    <span class="text-xs font-black" :class="(expandedDetail.ally_score ?? 0) > (expandedDetail.enemy_score ?? 0) ? 'text-green-400' : 'text-red-400'">{{ expandedDetail.ally_score }}</span>
                    <span class="text-xs text-gray-600">–</span>
                    <span class="text-xs font-black text-gray-500">{{ expandedDetail.enemy_score }}</span>
                  </div>
                  <div v-if="a.hs_pct != null" class="text-[10px] text-gray-500">
                    <span class="font-bold" :class="a.hs_pct >= 25 ? 'text-orange-400' : 'text-gray-400'">{{ a.hs_pct }}%</span>
                    <span class="text-gray-700"> HS</span>
                  </div>
                  <div v-if="a.combat_score" class="text-[10px] text-gray-500">
                    <span class="font-bold text-gray-300">{{ a.combat_score }}</span>
                    <span class="text-gray-700"> ACS</span>
                  </div>
                </div>

                <!-- Verdict -->
                <div v-if="expandedDetail.verdict" class="flex items-start gap-2 px-2.5 py-2 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                  <svg class="w-3 h-3 text-red-400/60 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                  <p class="text-[10px] text-gray-400 leading-relaxed italic">{{ expandedDetail.verdict }}</p>
                </div>

                <!-- Improvements -->
                <div v-if="expandedDetail.priority_improvements?.length" class="space-y-1">
                  <p class="text-[8px] font-black uppercase tracking-widest text-gray-600">Focus areas</p>
                  <div v-for="(imp, i) in expandedDetail.priority_improvements" :key="i" class="flex items-start gap-2">
                    <span class="text-[9px] font-bold w-3.5 flex-shrink-0 mt-0.5" :class="i === 0 ? 'text-red-400' : 'text-gray-600'">{{ i + 1 }}</span>
                    <p class="text-[10px] text-gray-400 leading-relaxed">{{ imp }}</p>
                  </div>
                </div>

                <!-- Coaching tags -->
                <div v-if="expandedDetail.coaching_tags?.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in expandedDetail.coaching_tags"
                    :key="tag"
                    class="text-[8px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400/70 border border-red-500/15 capitalize"
                  >{{ tag.replace(/_/g, ' ') }}</span>
                </div>

                <!-- VOD Review link -->
                <button
                  class="w-full text-center text-[10px] text-gray-600 hover:text-gray-400 transition-colors py-1"
                  @click.stop="openTimeline(a.id)"
                >View full VOD timeline →</button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { AnalysisItem } from '../env.d.ts'
import { getAgentImage, getAgentRole, getAgentColor, getMapMinimap, getRoleColor } from '../lib/valorant'
import { pendingTimeline } from '../stores/pendingTimeline'

const router = useRouter()
const allAnalyses = ref<AnalysisItem[]>([])
const loading = ref(true)
const activeFilter = ref<'All' | 'Wins' | 'Losses' | 'Scored'>('All')
const activeMap = ref<string | null>(null)
const timelineLoadingId = ref<number | null>(null)

const expandedId = ref<number | null>(null)
const detailLoading = ref(false)
const expandedDetail = ref<{
  verdict: string | null
  top_issue: string | null
  priority_improvements: string[]
  coaching_tags: string[]
  ally_score: number | null
  enemy_score: number | null
} | null>(null)

onMounted(async () => {
  window.api.discord.setState('reviewing').catch(() => {})
  allAnalyses.value = await window.api.analyses.get(100).catch(() => [])
  loading.value = false
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
})

const availableMaps = computed(() => {
  const maps = new Set<string>()
  for (const a of allAnalyses.value) {
    if (a.map) maps.add(a.map.toLowerCase())
  }
  return [...maps].sort()
})

const filteredAnalyses = computed(() => {
  let list = allAnalyses.value
  switch (activeFilter.value) {
    case 'Wins': list = list.filter(a => a.won); break
    case 'Losses': list = list.filter(a => a.won === false || a.won === 0 as unknown); break
    case 'Scored': list = list.filter(a => a.overall_score != null); break
  }
  if (activeMap.value) list = list.filter(a => a.map?.toLowerCase() === activeMap.value)
  return list
})

const winRate = computed(() => {
  const withResult = allAnalyses.value.filter(a => a.won != null)
  if (!withResult.length) return 0
  return Math.round((withResult.filter(a => a.won).length / withResult.length) * 100)
})

const avgScore = computed<number | null>(() => {
  const scored = allAnalyses.value.filter(a => a.overall_score != null)
  if (!scored.length) return null
  return Math.round(scored.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / scored.length)
})

const avgKD = computed<string>(() => {
  const withKD = allAnalyses.value.filter(a => a.kda != null)
  if (!withKD.length) return '—'
  return (withKD.reduce((sum, a) => sum + (a.kda ?? 0), 0) / withKD.length).toFixed(2)
})

const chartData = computed(() => {
  const scored = [...allAnalyses.value].filter(a => a.overall_score != null).reverse()
  if (scored.length < 2) return null
  const scores = scored.map(a => a.overall_score!)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const range = max - min || 1
  const W = 100, H = 64, pad = 4
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2)
    const y = H - pad - ((s - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const areaPath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ') +
    ` L ${(pad + (W - pad * 2)).toFixed(1)} ${H} L ${pad} ${H} Z`
  const linePath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ')
  const last = scores[scores.length - 1]
  const up = last >= scores[0]
  const gridLines = [0, 50, 100].map(score => ({
    score,
    y: parseFloat((H - pad - ((score - min) / range) * (H - pad * 2)).toFixed(1)),
  }))
  const firstDate = formatDate(scored[0].created_at)
  const lastDate = formatDate(scored[scored.length - 1].created_at)
  return { areaPath, linePath, W, H, up, last, gridLines, pad, firstDate, lastDate }
})

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 78) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'E'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Outstanding'
  if (score >= 78) return 'Strong Game'
  if (score >= 65) return 'Solid'
  if (score >= 50) return 'Room to Improve'
  if (score >= 35) return 'Below Average'
  return 'Lots to Work On'
}

function scoreGradeBadgeClass(score: number): string {
  if (score >= 90) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
  if (score >= 78) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
  if (score >= 65) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
  if (score >= 35) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

async function toggleExpand(a: AnalysisItem) {
  if (expandedId.value === a.id) {
    expandedId.value = null
    expandedDetail.value = null
    return
  }
  expandedId.value = a.id
  expandedDetail.value = null
  if (!a.overall_score && !['queued', 'processing', 'pending'].includes(a.status)) return
  detailLoading.value = true
  try {
    expandedDetail.value = await window.api.analyses.getDetail(a.id)
  } catch { /* ignore */ } finally {
    detailLoading.value = false
  }
}

async function openTimeline(id: number) {
  timelineLoadingId.value = id
  try {
    const data = await window.api.analyses.getTimeline(id)
    if (data) {
      pendingTimeline.value = data
      router.push({ path: '/vod-review', query: { timelineId: id } })
    } else {
      router.push('/vod-review')
    }
  } catch {
    router.push('/vod-review')
  } finally {
    timelineLoadingId.value = null
  }
}
</script>

<style scoped>
.detail-expand-enter-active,
.detail-expand-leave-active {
  transition: max-height 0.2s ease, opacity 0.15s ease;
  max-height: 400px;
  overflow: hidden;
}
.detail-expand-enter-from,
.detail-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
