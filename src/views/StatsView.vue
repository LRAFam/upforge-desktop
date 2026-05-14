<template>
  <div class="px-3 py-3 space-y-4 overflow-y-auto">

    <!-- Header + date range filter -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div>
        <h2 class="text-xs font-semibold text-white">Performance Stats</h2>
        <p class="text-[10px] text-gray-600 mt-0.5">{{ filteredAnalyses.length }} game{{ filteredAnalyses.length !== 1 ? 's' : '' }} in range</p>
      </div>
      <div class="flex items-center gap-0.5">
        <button
          v-for="r in ranges"
          :key="r.value"
          class="px-2 py-1 text-[10px] font-medium rounded transition-colors"
          :class="range === r.value
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'text-gray-600 hover:text-gray-400 border border-transparent'"
          @click="range = r.value"
        >{{ r.label }}</button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <template v-if="loading">
      <div class="grid grid-cols-5 gap-2">
        <div v-for="i in 5" :key="i" class="h-14 bg-white/[0.02] rounded-xl animate-pulse" />
      </div>
      <div class="h-20 bg-white/[0.02] rounded-xl animate-pulse" />
      <div class="grid grid-cols-2 gap-3">
        <div class="h-40 bg-white/[0.02] rounded-xl animate-pulse" />
        <div class="h-40 bg-white/[0.02] rounded-xl animate-pulse" />
      </div>
    </template>

    <!-- Empty state -->
    <div v-else-if="filteredAnalyses.length === 0" class="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div class="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      </div>
      <div>
        <p class="text-sm text-gray-400">No games in this range</p>
        <p class="text-xs text-gray-600 mt-0.5">Play some games and they'll appear here after analysis</p>
      </div>
    </div>

    <template v-else>

      <!-- Stat cards -->
      <div class="grid grid-cols-5 gap-2">
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl px-2 py-2.5 text-center">
          <p class="text-base font-black tabular-nums text-white">{{ filteredAnalyses.length }}</p>
          <p class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wider">Games</p>
        </div>
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl px-2 py-2.5 text-center">
          <p class="text-base font-black tabular-nums" :class="winRate >= 50 ? 'text-green-400' : 'text-red-400'">{{ winRate }}%</p>
          <p class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wider">Win Rate</p>
        </div>
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl px-2 py-2.5 text-center">
          <p class="text-base font-black tabular-nums" :class="avgScore !== null ? scoreColor(avgScore) : 'text-gray-600'">{{ avgScore ?? '—' }}</p>
          <p class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wider">AI Score</p>
        </div>
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl px-2 py-2.5 text-center">
          <p class="text-base font-black tabular-nums text-white">{{ avgKda }}</p>
          <p class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wider">Avg K/D</p>
        </div>
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl px-2 py-2.5 text-center">
          <p class="text-base font-black tabular-nums text-orange-400">{{ avgHs !== null ? avgHs + '%' : '—' }}</p>
          <p class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wider">HS%</p>
        </div>
      </div>

      <!-- Recent form + score sparkline -->
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2.5 space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Recent Form</p>
          <p class="text-[10px] text-gray-700">last {{ recentForm.length }} results</p>
        </div>
        <div class="flex items-center gap-1 flex-wrap">
          <div
            v-for="(r, i) in recentForm"
            :key="i"
            class="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black flex-shrink-0"
            :class="r === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/20' : r === 'L' ? 'bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-white/[0.05] text-gray-600 border border-white/[0.05]'"
          >{{ r }}</div>
        </div>
        <!-- Score sparkline (only if we have scored analyses) -->
        <div v-if="sparkPoints.length > 1" class="pt-1">
          <div class="flex items-center justify-between mb-1">
            <p class="text-[9px] text-gray-700">AI Score trend</p>
            <p class="text-[9px] font-bold" :class="sparkUp ? 'text-green-400' : 'text-red-400'">
              {{ sparkUp ? '↑' : '↓' }} {{ sparkPoints[sparkPoints.length - 1] }}
            </p>
          </div>
          <svg width="100%" height="40" :viewBox="`0 0 ${SPARK_W} 40`" preserveAspectRatio="none" style="display:block">
            <defs>
              <linearGradient id="stats-spark-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="sparkUp ? '#4ade80' : '#f87171'" stop-opacity="0.25"/>
                <stop offset="100%" :stop-color="sparkUp ? '#4ade80' : '#f87171'" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path :d="sparkArea" fill="url(#stats-spark-grad)"/>
            <path :d="sparkLine" fill="none" :stroke="sparkUp ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Two-column: By Agent + By Map -->
      <div class="grid grid-cols-2 gap-3">

        <!-- By Agent -->
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
          <div class="px-2.5 py-2 border-b border-white/[0.04]">
            <p class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">By Agent</p>
          </div>
          <div class="divide-y divide-white/[0.03]">
            <div v-for="row in agentRows" :key="row.name" class="flex items-center gap-2 px-2.5 py-1.5">
              <img :src="getAgentImage(row.name)" class="w-5 h-5 rounded object-cover flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-semibold text-gray-300 truncate">{{ row.name }}</p>
                <p class="text-[9px] text-gray-700">{{ row.games }}g</p>
              </div>
              <div class="text-right flex-shrink-0 space-y-px">
                <p class="text-[10px] font-bold tabular-nums" :class="row.wr >= 50 ? 'text-green-400' : 'text-red-400'">{{ row.wr }}%</p>
                <p class="text-[9px] text-gray-700 tabular-nums">{{ row.kda }}kd</p>
              </div>
            </div>
            <div v-if="agentRows.length === 0" class="px-3 py-4 text-center text-[10px] text-gray-700">No data</div>
          </div>
        </div>

        <!-- By Map -->
        <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
          <div class="px-2.5 py-2 border-b border-white/[0.04]">
            <p class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">By Map</p>
          </div>
          <div class="divide-y divide-white/[0.03]">
            <div v-for="row in mapRows" :key="row.name" class="flex items-center gap-2 px-2.5 py-1.5">
              <div class="w-5 h-5 rounded overflow-hidden flex-shrink-0 bg-white/[0.06]">
                <img :src="getMapMinimap(row.name)" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-semibold text-gray-300 truncate capitalize">{{ row.name }}</p>
                <p class="text-[9px] text-gray-700">{{ row.games }}g</p>
              </div>
              <div class="text-right flex-shrink-0 space-y-px">
                <p class="text-[10px] font-bold tabular-nums" :class="row.wr >= 50 ? 'text-green-400' : 'text-red-400'">{{ row.wr }}%</p>
                <p class="text-[9px] text-gray-700 tabular-nums">{{ row.kda }}kd</p>
              </div>
            </div>
            <div v-if="mapRows.length === 0" class="px-3 py-4 text-center text-[10px] text-gray-700">No data</div>
          </div>
        </div>

      </div>

      <!-- Best / Needs Work callout cards -->
      <div v-if="bestAgent || worstMap" class="grid grid-cols-2 gap-3">
        <div v-if="bestAgent" class="bg-green-500/[0.04] border border-green-500/20 rounded-xl px-3 py-2.5">
          <p class="text-[9px] font-semibold text-green-500/60 uppercase tracking-widest mb-1.5">Best Agent</p>
          <div class="flex items-center gap-2">
            <img :src="getAgentImage(bestAgent.name)" class="w-7 h-7 rounded object-cover flex-shrink-0" />
            <div>
              <p class="text-xs font-bold text-white">{{ bestAgent.name }}</p>
              <p class="text-[9px] text-green-400">{{ bestAgent.wr }}% win rate · {{ bestAgent.games }}g</p>
            </div>
          </div>
        </div>
        <div v-if="worstMap" class="bg-red-500/[0.04] border border-red-500/20 rounded-xl px-3 py-2.5">
          <p class="text-[9px] font-semibold text-red-500/60 uppercase tracking-widest mb-1.5">Needs Work</p>
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded overflow-hidden flex-shrink-0 bg-white/[0.05]">
              <img :src="getMapMinimap(worstMap.name)" class="w-full h-full object-cover" />
            </div>
            <div>
              <p class="text-xs font-bold text-white capitalize">{{ worstMap.name }}</p>
              <p class="text-[9px] text-red-400">{{ worstMap.wr }}% win rate · {{ worstMap.games }}g</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Link to full coaching history -->
      <button
        class="w-full py-2 text-xs text-gray-600 hover:text-gray-300 transition-colors border border-white/[0.05] hover:border-white/[0.1] rounded-xl"
        @click="$router.push('/history')"
      >View full coaching history →</button>

    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { AnalysisItem } from '../env.d.ts'
import { getAgentImage, getMapMinimap } from '../lib/valorant'

type RangeValue = '7d' | '30d' | '90d' | 'all'

const loading = ref(true)
const allAnalyses = ref<AnalysisItem[]>([])
const range = ref<RangeValue>('30d')

const ranges: { label: string; value: RangeValue }[] = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'All', value: 'all' },
]

const filteredAnalyses = computed(() => {
  if (range.value === 'all') return allAnalyses.value
  const days = range.value === '7d' ? 7 : range.value === '30d' ? 30 : 90
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return allAnalyses.value.filter(a => new Date(a.created_at).getTime() >= cutoff)
})

// ── Stat cards ────────────────────────────────────────────────────────────────

const winRate = computed(() => {
  const withResult = filteredAnalyses.value.filter(a => a.won != null)
  if (!withResult.length) return 0
  return Math.round((withResult.filter(a => a.won).length / withResult.length) * 100)
})

const avgScore = computed((): number | null => {
  const scored = filteredAnalyses.value.filter(a => a.overall_score != null)
  if (!scored.length) return null
  return Math.round(scored.reduce((s, a) => s + a.overall_score!, 0) / scored.length)
})

const avgKda = computed((): string => {
  const withKd = filteredAnalyses.value.filter(a => a.kills != null && a.deaths != null)
  if (!withKd.length) return '—'
  const total = withKd.reduce((s, a) => s + a.kills! / Math.max(1, a.deaths!), 0)
  return (total / withKd.length).toFixed(2)
})

const avgHs = computed((): number | null => {
  const withHs = filteredAnalyses.value.filter(a => a.hs_pct != null)
  if (!withHs.length) return null
  return Math.round(withHs.reduce((s, a) => s + a.hs_pct!, 0) / withHs.length)
})

function scoreColor(s: number): string {
  if (s >= 80) return 'text-green-400'
  if (s >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

// ── Recent form + sparkline ───────────────────────────────────────────────────

const recentForm = computed(() =>
  filteredAnalyses.value.slice(0, 15).map(a =>
    a.won === true ? 'W' : a.won === false ? 'L' : '—'
  )
)

const SPARK_W = 400
const SPARK_H = 40
const SPARK_PAD = 4

const sparkPoints = computed(() =>
  [...filteredAnalyses.value]
    .filter(a => a.overall_score != null)
    .reverse()
    .slice(0, 20)
    .map(a => a.overall_score!)
)

const sparkUp = computed(() => {
  const pts = sparkPoints.value
  return pts.length < 2 || pts[pts.length - 1] >= pts[0]
})

function buildSparkPath(filled: boolean): string {
  const pts = sparkPoints.value
  if (pts.length < 2) return ''
  const minVal = Math.max(0, Math.min(...pts) - 5)
  const maxVal = Math.min(100, Math.max(...pts) + 5)
  const range = Math.max(1, maxVal - minVal)
  const xs = pts.map((_, i) => SPARK_PAD + (i / (pts.length - 1)) * (SPARK_W - SPARK_PAD * 2))
  const ys = pts.map(v => SPARK_H - SPARK_PAD - ((v - minVal) / range) * (SPARK_H - SPARK_PAD * 2))
  const pointStr = xs.map((x, i) => `${x},${ys[i]}`).join(' L ')
  if (filled) {
    return `M ${xs[0]},${SPARK_H} L ${xs[0]},${ys[0]} L ${pointStr} L ${xs[xs.length - 1]},${SPARK_H} Z`
  }
  return `M ${pointStr}`
}

const sparkLine = computed(() => buildSparkPath(false))
const sparkArea = computed(() => buildSparkPath(true))

// ── By Agent & By Map ─────────────────────────────────────────────────────────

type BreakdownRow = { name: string; games: number; wins: number; wr: number; kda: string }

function buildBreakdown(key: 'agent' | 'map'): BreakdownRow[] {
  const acc = new Map<string, { games: number; wins: number; kdSum: number; kdCount: number }>()
  for (const a of filteredAnalyses.value) {
    const raw = a[key]
    if (!raw) continue
    const name = key === 'map' ? raw.toLowerCase() : raw
    const e = acc.get(name) ?? { games: 0, wins: 0, kdSum: 0, kdCount: 0 }
    e.games++
    if (a.won) e.wins++
    if (a.kills != null && a.deaths != null) {
      e.kdSum += a.kills / Math.max(1, a.deaths)
      e.kdCount++
    }
    acc.set(name, e)
  }
  return Array.from(acc.entries())
    .map(([name, e]) => ({
      name,
      games: e.games,
      wins: e.wins,
      wr: Math.round((e.wins / e.games) * 100),
      kda: e.kdCount > 0 ? (e.kdSum / e.kdCount).toFixed(1) : '—',
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 6)
}

const agentRows = computed(() => buildBreakdown('agent'))
const mapRows = computed(() => buildBreakdown('map'))

// ── Callout cards ─────────────────────────────────────────────────────────────

const bestAgent = computed((): BreakdownRow | null => {
  const qualified = agentRows.value.filter(r => r.games >= 3)
  const pool = qualified.length ? qualified : agentRows.value
  if (!pool.length) return null
  return pool.reduce((best, r) => r.wr > best.wr ? r : best, pool[0])
})

const worstMap = computed((): BreakdownRow | null => {
  const qualified = mapRows.value.filter(r => r.games >= 3)
  if (!qualified.length) return null
  return qualified.reduce((worst, r) => r.wr < worst.wr ? r : worst, qualified[0])
})

// ── Data load ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    allAnalyses.value = await window.api.analyses.get(100)
  } catch { /* non-critical */ }
  loading.value = false
})
</script>
