<template>
  <ProgressV3
    v-model:range="range"
    :loading="loading"
    :refreshing="refreshing"
    :refresh-failed="refreshFailed"
    :ranges="ranges"
    :game-count="filteredAnalyses.length"
    :excluded-fun-mode-count="excludedFunModeCount"
    :last-analysed-at="lastAnalysedAt"
    :is-valorant="primaryGame === 'valorant'"
    :rank-history="rankHistory"
    :win-rate="winRate"
    :score-stat="v3ScoreStat"
    :avg-kda="avgKda"
    :avg-hs="avgHs"
    :deltas="statDeltas"
    :recent-form="recentForm"
    :agent-rows="agentRows"
    :map-rows="mapRows"
    @retry="loadStatsData"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useLifetime } from '../composables/useLifetime'
import ProgressV3 from './v3/ProgressV3.vue'
import { averageMatchScore, matchScore } from '../lib/upforge-score'
import { analysisCountsTowardProgress } from '../lib/game-queue'
import { halfDelta } from '../components/v3/progress/progress-chart'
import { readCache, writeCache } from '../lib/stale-cache'
import type { AnalysisItem } from '../env.d.ts'
import { useGameTheme } from '../composables/useGameTheme'
import { invalidateGameAnalysesCache, loadGameAnalyses } from '../lib/game-modules'
import { normalizeMapAssetKey, NON_MAP_NAMES } from '../lib/valorant'

type RangeValue = '7d' | '30d' | '90d' | 'all'

const { primaryGame } = useGameTheme()

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

const analysesInRange = computed(() => {
  if (range.value === 'all') return allAnalyses.value
  const days = range.value === '7d' ? 7 : range.value === '30d' ? 30 : 90
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return allAnalyses.value.filter(a => new Date(a.created_at).getTime() >= cutoff)
})

// Fun modes (Wingman, Deathmatch, Swiftplay, Unrated…) play differently: keep them out of win rate,
// score and the tables, and say how many were left out (game-queue.ts).
const filteredAnalyses = computed(() => analysesInRange.value.filter(a => analysisCountsTowardProgress(primaryGame.value, a)))
const excludedFunModeCount = computed(() => analysesInRange.value.length - filteredAnalyses.value.length)

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

// v3: the stats-based UpForge score averaged over scored matches only. With none scored yet, the coach's
// average rating out of 10 under its own name (never mixed, never shown as an UpForge score).
const v3ScoreStat = computed(() => {
  const uf = averageMatchScore(filteredAnalyses.value)
  if (uf) {
    return {
      value: String(uf.value),
      caption: 'UpForge score',
      delta: buildDelta([...filteredAnalyses.value].reverse().map(a => a.upforge_score ?? null)),
    }
  }
  const coach = matchScore({ overall_score: avgScore.value })
  if (!coach) return null
  // statDeltas.score is in stored 0–100 points; the rating is out of 10.
  const d = buildDelta([...filteredAnalyses.value].reverse().map(a => a.overall_score ?? null))
  return { value: coach.text, caption: 'Coach rating', delta: d == null ? null : d / 10 }
})
// The newest analysis of any date.
const lastAnalysedAt = computed(() => allAnalyses.value.reduce<string | null>((best, a) => (a.created_at && (!best || a.created_at > best) ? a.created_at : best), null))

const avgKda = computed((): string => {
  const withKd = filteredAnalyses.value.filter(a => a.kills != null && a.deaths != null)
  if (!withKd.length) return '-'
  const total = withKd.reduce((s, a) => s + a.kills! / Math.max(1, a.deaths!), 0)
  return (total / withKd.length).toFixed(2)
})

const avgHs = computed((): number | null => {
  const withHs = filteredAnalyses.value.filter(a => a.hs_pct != null)
  if (!withHs.length) return null
  return Math.round(withHs.reduce((s, a) => s + a.hs_pct!, 0) / withHs.length)
})

// Same minimum sample as Progress: ≥3 matches per half, else no delta ("Early read").
function buildDelta(values: Array<number | null | undefined>): number | null {
  const d = halfDelta(values)
  return d ? d.last - d.first : null
}

const statDeltas = computed(() => ({
  winRate: buildDelta([...filteredAnalyses.value].reverse().map(a => a.won == null ? null : (a.won ? 100 : 0))),
  score: buildDelta([...filteredAnalyses.value].reverse().map(a => a.overall_score ?? null)),
  kda: buildDelta([...filteredAnalyses.value].reverse().map(a => a.kills != null && a.deaths != null ? a.kills / Math.max(1, a.deaths) : null)),
  hs: buildDelta([...filteredAnalyses.value].reverse().map(a => a.hs_pct ?? null)),
}))

// ── Recent form ───────────────────────────────────────────────────

const recentForm = computed(() =>
  filteredAnalyses.value.slice(0, 15).map(a =>
    a.won != null ? (a.won ? 'W' : 'L') : '-'
  )
)


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
        kda: e.kdCount > 0 ? (e.kdSum / e.kdCount).toFixed(1) : '-',
        roundWr: totalRounds > 0 ? `${Math.round((e.roundsWon / totalRounds) * 100)}%` : '-',
      }
    })
    .sort((a, b) => b.games - a.games)
    .slice(0, 6)
}

const agentRows = computed(() => buildBreakdown('agent'))
const mapRows = computed(() => buildBreakdown('map'))

// ── Data load ─────────────────────────────────────────────────────────────────

// ── Cache-first (last data draws at once, refresh is quiet, a failed refresh keeps it) ──
type ProgressCache = { analyses: AnalysisItem[]; rank: typeof rankHistory.value }
const refreshing = ref(false)
const refreshFailed = ref(false)
function hydrateProgress(): boolean {
  const hit = readCache<ProgressCache>(`progress:${primaryGame.value}`)?.value
  if (!hit || !Array.isArray(hit.analyses)) return false
  allAnalyses.value = hit.analyses
  rankHistory.value = Array.isArray(hit.rank) ? hit.rank : []
  loading.value = false
  return true
}
hydrateProgress()
// The title-bar game switch doesn't remount this view; Progress reloads for the new game.
watch(primaryGame, () => {
  allAnalyses.value = []
  rankHistory.value = []
  loading.value = true
  refreshFailed.value = false
  void loadStatsData()
})

async function loadStatsData() {
  const game = primaryGame.value
  const hasData = !loading.value || hydrateProgress()
  loading.value = !hasData
  refreshing.value = hasData
  try {
    const [analyses, rrHistory] = await Promise.all([
      loadGameAnalyses(game, 100),
      window.api.stats.rrHistory('all').catch(() => null),
    ])
    if (game !== primaryGame.value) return
    allAnalyses.value = analyses
    if (rrHistory) rankHistory.value = rrHistory
    refreshFailed.value = false
    writeCache<ProgressCache>(`progress:${game}`, { analyses, rank: rankHistory.value })
  } catch {
    if (!hasData) { allAnalyses.value = []; rankHistory.value = [] }
    else refreshFailed.value = true
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const life = useLifetime() // listeners registered after an await stop with this view

onMounted(async () => {
  await loadStatsData()
  life.own(window.api.on('dashboard:refresh', () => {
    invalidateGameAnalysesCache(primaryGame.value)
    void loadStatsData()
  }))
})

</script>
