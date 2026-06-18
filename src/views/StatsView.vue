<template>
  <div class="h-full text-white flex flex-col overflow-hidden bg-[#111111]">

    <!-- Toolbar -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-white/[0.08]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-sm font-bold text-white">Performance</h1>
          <p class="text-[10px] text-gray-600 mt-0.5">
            <span class="font-semibold text-gray-400">{{ filteredAnalyses.length }}</span>
            game{{ filteredAnalyses.length !== 1 ? 's' : '' }} · {{ activeRangeLabel }}
          </p>
        </div>
        <div class="flex gap-1.5">
          <button
            v-for="r in ranges"
            :key="r.value"
            class="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border"
            :class="range === r.value
              ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'text-gray-500 border-white/[0.10] hover:text-gray-300 hover:bg-white/[0.03] hover:border-white/[0.12]'"
            @click="range = r.value"
          >{{ r.label }}</button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">

      <!-- Loading skeleton -->
      <template v-if="loading">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <div v-for="i in 5" :key="i" class="h-16 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.06]" />
        </div>
        <div class="h-28 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.06]" />
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="h-48 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.06]" />
          <div class="h-48 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.06]" />
        </div>
      </template>

      <!-- Empty state -->
      <div v-else-if="filteredAnalyses.length === 0" class="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div class="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-400">No games in this range</p>
          <p class="text-xs text-gray-600 mt-1">Play ranked and run analysis — your trends will show up here.</p>
        </div>
      </div>

      <template v-else>

        <!-- Stat cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] px-3 py-3 text-center">
            <p class="text-xl font-black tabular-nums text-white">{{ filteredAnalyses.length }}</p>
            <p class="text-[9px] font-bold text-gray-600 mt-1 uppercase tracking-wider">Games</p>
          </div>
          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] px-3 py-3 text-center">
            <p class="text-xl font-black tabular-nums" :class="winRate >= 50 ? 'text-green-400' : 'text-red-400'">{{ winRate }}%</p>
            <p class="text-[9px] font-bold text-gray-600 mt-1 uppercase tracking-wider">Win rate</p>
            <p class="text-[8px] mt-1 font-semibold uppercase tracking-[0.14em]" :class="metricDeltaClass(statDeltas.winRate)">{{ metricDeltaLabel(statDeltas.winRate, '%') }}</p>
          </div>
          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] px-3 py-3 text-center">
            <p class="text-xl font-black tabular-nums" :class="avgScore != null ? scoreColor(avgScore) : 'text-gray-600'">{{ avgScoreDisplay ?? '—' }}</p>
            <p class="text-[9px] font-bold text-gray-600 mt-1 uppercase tracking-wider">AI score</p>
            <p class="text-[8px] mt-1 font-semibold uppercase tracking-[0.14em]" :class="metricDeltaClass(statDeltas.score)">{{ metricDeltaLabel(statDeltas.score) }}</p>
          </div>
          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] px-3 py-3 text-center">
            <p class="text-xl font-black tabular-nums text-white">{{ avgKda }}</p>
            <p class="text-[9px] font-bold text-gray-600 mt-1 uppercase tracking-wider">Avg K/D</p>
            <p class="text-[8px] mt-1 font-semibold uppercase tracking-[0.14em]" :class="metricDeltaClass(statDeltas.kda)">{{ metricDeltaLabel(statDeltas.kda) }}</p>
          </div>
          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] px-3 py-3 text-center col-span-2 sm:col-span-1">
            <p class="text-xl font-black tabular-nums text-orange-400">{{ avgHs !== null ? avgHs + '%' : '—' }}</p>
            <p class="text-[9px] font-bold text-gray-600 mt-1 uppercase tracking-wider">Headshot %</p>
            <p class="text-[8px] mt-1 font-semibold uppercase tracking-[0.14em]" :class="metricDeltaClass(statDeltas.hs)">{{ metricDeltaLabel(statDeltas.hs, '%') }}</p>
          </div>
        </div>

        <!-- Recent form + trends -->
        <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] px-4 py-3 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Recent form</p>
            <p class="text-[10px] text-gray-700">Last {{ recentForm.length }} results</p>
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            <div
              v-for="(r, i) in recentForm"
              :key="i"
              class="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black flex-shrink-0"
              :class="r === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/25' : r === 'L' ? 'bg-red-500/20 text-red-400 border border-red-500/25' : 'bg-white/[0.05] text-gray-600 border border-white/[0.09]'"
            >{{ r }}</div>
          </div>

          <div v-if="sparkPoints.length > 1" class="pt-1 border-t border-white/[0.06]">
            <div class="flex items-center justify-between mb-1.5">
              <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-600">AI score trend</p>
              <p class="text-[10px] font-bold tabular-nums" :class="sparkUp ? 'text-green-400' : 'text-red-400'">
                {{ sparkUp ? '↑' : '↓' }} {{ sparkPoints[sparkPoints.length - 1] }}
              </p>
            </div>
            <svg width="100%" height="44" :viewBox="`0 0 ${SPARK_W} 44`" preserveAspectRatio="none" class="block">
              <defs>
                <linearGradient id="stats-spark-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" :stop-color="sparkUp ? '#4ade80' : '#f87171'" stop-opacity="0.28"/>
                  <stop offset="100%" :stop-color="sparkUp ? '#4ade80' : '#f87171'" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path :d="sparkArea" fill="url(#stats-spark-grad)"/>
              <path :d="sparkLine" fill="none" :stroke="sparkUp ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <div v-if="rankPoints.length > 1" class="pt-2 border-t border-white/[0.06]">
            <div class="flex items-center justify-between mb-1.5">
              <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-600">Rank progress</p>
              <p class="text-[10px] font-semibold tabular-nums" :class="rankDelta >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ rankDelta >= 0 ? '+' : '' }}{{ rankDelta }} RR
              </p>
            </div>
            <svg width="100%" height="44" :viewBox="`0 0 ${RANK_W} 44`" preserveAspectRatio="none" class="block">
              <defs>
                <linearGradient id="rank-spark-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" :stop-color="rankDelta >= 0 ? '#fb923c' : '#f87171'" stop-opacity="0.26"/>
                  <stop offset="100%" :stop-color="rankDelta >= 0 ? '#fb923c' : '#f87171'" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path :d="rankArea" fill="url(#rank-spark-grad)"/>
              <path :d="rankLine" fill="none" :stroke="rankDelta >= 0 ? '#fb923c' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="flex items-center justify-between mt-1 text-[8px] uppercase tracking-[0.14em] text-gray-700">
              <span>{{ rankStartLabel }}</span>
              <span>{{ rankEndLabel }}</span>
            </div>
          </div>
        </div>

        <!-- Best / Needs work -->
        <div v-if="bestAgent || worstMap" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-if="bestAgent" class="relative overflow-hidden rounded-xl border border-green-500/25 bg-green-500/[0.04] px-3 py-3">
            <p class="text-[9px] font-black uppercase tracking-[0.18em] text-green-500/70 mb-2">Best agent</p>
            <div class="flex items-center gap-3">
              <div
                class="h-12 w-12 rounded-xl overflow-hidden border border-white/10 p-1 flex-shrink-0"
                :style="{ background: `linear-gradient(145deg, ${getAgentColor(bestAgent.name)}33, #111)` }"
              >
                <img :src="getAgentImage(bestAgent.name)" class="h-full w-full object-contain" alt="" />
              </div>
              <div>
                <p class="text-sm font-bold text-white">{{ bestAgent.name }}</p>
                <p class="text-[10px] text-green-400 font-semibold tabular-nums">{{ bestAgent.wr }}% win · {{ bestAgent.games }} games</p>
                <p class="text-[9px] text-gray-600 mt-0.5">{{ bestAgent.kda }} K/D · {{ bestAgent.roundWr }} round WR</p>
              </div>
            </div>
          </div>
          <div v-if="worstMap" class="relative overflow-hidden rounded-xl border border-red-500/25">
            <img
              v-if="getMapImage(worstMap.name)"
              :src="getMapImage(worstMap.name)"
              class="absolute inset-0 h-full w-full object-cover opacity-35"
              alt=""
            />
            <div class="absolute inset-0 bg-gradient-to-r from-black/92 via-black/78 to-black/55" />
            <div class="relative px-3 py-3">
              <p class="text-[9px] font-black uppercase tracking-[0.18em] text-red-400/80 mb-2">Needs work</p>
              <div class="flex items-center gap-3">
                <div class="h-12 w-16 rounded-lg overflow-hidden border border-white/15 flex-shrink-0 shadow-lg">
                  <img
                    v-if="getMapImage(worstMap.name)"
                    :src="getMapImage(worstMap.name)"
                    class="h-full w-full object-cover"
                    alt=""
                  />
                </div>
                <div>
                  <p class="text-sm font-bold text-white">{{ formatMapLabel(worstMap.name) }}</p>
                  <p class="text-[10px] text-red-400 font-semibold tabular-nums">{{ worstMap.wr }}% win · {{ worstMap.games }} games</p>
                  <p class="text-[9px] text-gray-500 mt-0.5">{{ worstMap.kda }} K/D · {{ worstMap.roundWr }} round WR</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- By Agent + By Map -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">

          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] overflow-hidden">
            <div class="px-3 py-2.5 border-b border-white/[0.07]">
              <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">By agent</p>
            </div>
            <div class="divide-y divide-white/[0.04]">
              <div v-for="row in agentRows" :key="row.name" class="px-3 py-2.5 space-y-2">
                <div class="flex items-center gap-2.5">
                  <div
                    class="h-9 w-9 rounded-lg overflow-hidden border border-white/10 p-1 flex-shrink-0"
                    :style="{ background: `linear-gradient(145deg, ${getAgentColor(row.name)}33, #111)` }"
                  >
                    <img :src="getAgentImage(row.name)" class="h-full w-full object-contain" alt="" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-gray-200 truncate">{{ row.name }}</p>
                    <p class="text-[9px] text-gray-600">{{ row.games }} games</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-xs font-black tabular-nums" :class="row.wr >= 50 ? 'text-green-400' : 'text-red-400'">{{ row.wr }}%</p>
                    <p class="text-[9px] text-gray-600 tabular-nums">{{ row.kda }} K/D</p>
                  </div>
                </div>
                <div class="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="row.wr >= 50 ? 'bg-gradient-to-r from-green-500/80 to-emerald-400/80' : 'bg-gradient-to-r from-red-500/80 to-orange-400/80'"
                    :style="{ width: row.wr + '%' }"
                  />
                </div>
              </div>
              <div v-if="agentRows.length === 0" class="px-3 py-6 text-center text-[10px] text-gray-700">No agent data</div>
            </div>
          </div>

          <div class="rounded-xl border border-white/[0.09] bg-white/[0.02] overflow-hidden">
            <div class="px-3 py-2.5 border-b border-white/[0.07]">
              <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">By map</p>
            </div>
            <div class="divide-y divide-white/[0.04]">
              <div v-for="row in mapRows" :key="row.name" class="px-3 py-2.5 space-y-2">
                <div class="flex items-center gap-2.5">
                  <div class="relative h-9 w-14 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black/40">
                    <img
                      v-if="getMapImage(row.name)"
                      :src="getMapImage(row.name)"
                      class="absolute inset-0 h-full w-full object-cover"
                      alt=""
                    />
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-gray-200 truncate">{{ formatMapLabel(row.name) }}</p>
                    <p class="text-[9px] text-gray-600">{{ row.games }} games</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-xs font-black tabular-nums" :class="row.wr >= 50 ? 'text-green-400' : 'text-red-400'">{{ row.wr }}%</p>
                    <p class="text-[9px] text-gray-600 tabular-nums">{{ row.kda }} K/D</p>
                  </div>
                </div>
                <div class="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="row.wr >= 50 ? 'bg-gradient-to-r from-green-500/80 to-emerald-400/80' : 'bg-gradient-to-r from-red-500/80 to-orange-400/80'"
                    :style="{ width: row.wr + '%' }"
                  />
                </div>
              </div>
              <div v-if="mapRows.length === 0" class="px-3 py-6 text-center text-[10px] text-gray-700">No map data</div>
            </div>
          </div>

        </div>

        <button
          class="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors border border-white/[0.09] hover:border-white/[0.14] hover:bg-white/[0.02] rounded-xl"
          @click="$router.push('/history')"
        >View full coaching history →</button>

      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { AnalysisItem } from '../env.d.ts'
import {
  getAgentImage,
  getAgentColor,
  getMapImage,
  formatMapLabel,
  normalizeMapAssetKey,
  NON_MAP_NAMES,
} from '../lib/valorant'

type RangeValue = '7d' | '30d' | '90d' | 'all'

const loading = ref(true)
const allAnalyses = ref<AnalysisItem[]>([])
const rankHistory = ref<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>>([])
const range = ref<RangeValue>('30d')

const ranges: { label: string; value: RangeValue }[] = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'All', value: 'all' },
]

const activeRangeLabel = computed(() => ranges.find(r => r.value === range.value)?.label ?? '30D')

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
  return Math.round((withResult.filter(a => a.won ? 1 : 0).length / withResult.length) * 100)
})

const avgScore = computed((): number | null => {
  const scored = filteredAnalyses.value.filter(a => a.overall_score != null)
  if (!scored.length) return null
  return Math.round(scored.reduce((s, a) => s + a.overall_score!, 0) / scored.length)
})

const avgScoreDisplay = computed(() => (avgScore.value != null ? avgScore.value * 10 : null))

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
  if (s >= 78) return 'text-green-400'
  if (s >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function averageOf(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildDelta(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (clean.length < 2) return null
  const splitIndex = Math.max(1, Math.floor(clean.length / 2))
  const previous = averageOf(clean.slice(0, splitIndex))
  const recent = averageOf(clean.slice(splitIndex))
  if (previous == null || recent == null) return null
  return recent - previous
}

const statDeltas = computed(() => ({
  winRate: buildDelta([...filteredAnalyses.value].reverse().map(a => a.won == null ? null : (a.won ? 100 : 0))),
  score: buildDelta([...filteredAnalyses.value].reverse().map(a => a.overall_score ?? null)),
  kda: buildDelta([...filteredAnalyses.value].reverse().map(a => a.kills != null && a.deaths != null ? a.kills / Math.max(1, a.deaths) : null)),
  hs: buildDelta([...filteredAnalyses.value].reverse().map(a => a.hs_pct ?? null)),
}))

function metricDeltaClass(value: number | null): string {
  if (value == null || Math.abs(value) < 0.05) return 'text-gray-700'
  return value > 0 ? 'text-green-400' : 'text-red-400'
}

function metricDeltaLabel(value: number | null, suffix = ''): string {
  if (value == null || Math.abs(value) < 0.05) return 'Stable'
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Number(value.toFixed(1))
  return `${value > 0 ? 'Up' : 'Down'} ${Math.abs(rounded)}${suffix}`
}

// ── Recent form + sparkline ───────────────────────────────────────────────────

const recentForm = computed(() =>
  filteredAnalyses.value.slice(0, 15).map(a =>
    a.won != null ? (a.won ? 'W' : 'L') : '—'
  )
)

const SPARK_W = 400
const SPARK_H = 44
const SPARK_PAD = 4

const sparkPoints = computed(() =>
  [...filteredAnalyses.value]
    .filter(a => a.overall_score != null)
    .reverse()
    .slice(0, 20)
    .map(a => a.overall_score! * 10)
)

const sparkUp = computed(() => {
  const pts = sparkPoints.value
  return pts.length < 2 || pts[pts.length - 1] >= pts[0]
})

function buildSparkPath(filled: boolean): string {
  const pts = sparkPoints.value
  if (pts.length < 2) return ''
  const minVal = Math.max(0, Math.min(...pts) - 50)
  const maxVal = Math.min(1000, Math.max(...pts) + 50)
  const span = Math.max(1, maxVal - minVal)
  const xs = pts.map((_, i) => SPARK_PAD + (i / (pts.length - 1)) * (SPARK_W - SPARK_PAD * 2))
  const ys = pts.map(v => SPARK_H - SPARK_PAD - ((v - minVal) / span) * (SPARK_H - SPARK_PAD * 2))
  const pointStr = xs.map((x, i) => `${x},${ys[i]}`).join(' L ')
  if (filled) {
    return `M ${xs[0]},${SPARK_H} L ${xs[0]},${ys[0]} L ${pointStr} L ${xs[xs.length - 1]},${SPARK_H} Z`
  }
  return `M ${pointStr}`
}

const sparkLine = computed(() => buildSparkPath(false))
const sparkArea = computed(() => buildSparkPath(true))

const RANK_W = 400
const RANK_H = 44
const rankPoints = computed(() => rankHistory.value.slice(-12).map(entry => entry.rr))
const rankStartLabel = computed(() => rankHistory.value.slice(-12)[0]?.rank ?? 'Earlier')
const rankEndLabel = computed(() => rankHistory.value.slice(-12)[rankHistory.value.slice(-12).length - 1]?.rank ?? 'Latest')
const rankDelta = computed(() => {
  const points = rankPoints.value
  if (points.length < 2) return 0
  return points[points.length - 1] - points[0]
})

function buildRankPath(filled: boolean): string {
  const points = rankPoints.value
  if (points.length < 2) return ''
  const minVal = Math.min(...points)
  const maxVal = Math.max(...points)
  const span = Math.max(1, maxVal - minVal)
  const xs = points.map((_, i) => SPARK_PAD + (i / (points.length - 1)) * (RANK_W - SPARK_PAD * 2))
  const ys = points.map(value => RANK_H - SPARK_PAD - ((value - minVal) / span) * (RANK_H - SPARK_PAD * 2))
  const pointStr = xs.map((x, i) => `${x},${ys[i]}`).join(' L ')
  if (filled) {
    return `M ${xs[0]},${RANK_H} L ${xs[0]},${ys[0]} L ${pointStr} L ${xs[xs.length - 1]},${RANK_H} Z`
  }
  return `M ${pointStr}`
}

const rankLine = computed(() => buildRankPath(false))
const rankArea = computed(() => buildRankPath(true))

// ── By Agent & By Map ─────────────────────────────────────────────────────────

type BreakdownRow = { name: string; games: number; wins: number; wr: number; kda: string; roundWr: string }

function buildBreakdown(key: 'agent' | 'map'): BreakdownRow[] {
  const acc = new Map<string, { games: number; wins: number; kdSum: number; kdCount: number; roundsWon: number; roundsLost: number }>()
  for (const a of filteredAnalyses.value) {
    const raw = a[key]
    if (!raw) continue
    let name: string
    if (key === 'map') {
      const normalized = normalizeMapAssetKey(raw)
      if (!normalized || NON_MAP_NAMES.has(normalized)) continue
      name = normalized
    } else {
      name = raw
    }
    const e = acc.get(name) ?? { games: 0, wins: 0, kdSum: 0, kdCount: 0, roundsWon: 0, roundsLost: 0 }
    e.games++
    if (a.won) e.wins++
    if (a.kills != null && a.deaths != null) {
      e.kdSum += a.kills / Math.max(1, a.deaths)
      e.kdCount++
    }
    if (a.rounds_won != null) e.roundsWon += a.rounds_won
    if (a.rounds_lost != null) e.roundsLost += a.rounds_lost
    acc.set(name, e)
  }
  return Array.from(acc.entries())
    .map(([name, e]) => {
      const totalRounds = e.roundsWon + e.roundsLost
      return {
        name,
        games: e.games,
        wins: e.wins,
        wr: Math.round((e.wins / e.games) * 100),
        kda: e.kdCount > 0 ? (e.kdSum / e.kdCount).toFixed(1) : '—',
        roundWr: totalRounds > 0 ? `${Math.round((e.roundsWon / totalRounds) * 100)}%` : '—',
      }
    })
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
    const [analyses, rrHistory] = await Promise.all([
      window.api.analyses.get(100),
      window.api.stats.rrHistory().catch(() => []),
    ])
    allAnalyses.value = analyses
    rankHistory.value = rrHistory
  } catch {
    allAnalyses.value = []
    rankHistory.value = []
  }
  loading.value = false
})
</script>
