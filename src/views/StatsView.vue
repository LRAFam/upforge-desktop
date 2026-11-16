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
import { halfDelta } from '../components/v3/progress/progress-chart'
import { readCache, writeCache } from '../lib/stale-cache'
import type { AnalysisItem } from '../env.d.ts'
import { useGameTheme } from '../composables/useGameTheme'
import { invalidateGameAnalysesCache, loadGameAnalyses } from '../lib/game-modules'
import { breakdownRows, progressHs, progressKd, progressMatches, progressWinRate } from '../components/v3/progress/progress-stats'
import { toMatchWon } from '../lib/match-stats'

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

// One row per real match, newest played first, in range by when it was played. Fun modes (Wingman,
// Deathmatch, Swiftplay, Unrated…) play differently: kept out of win rate, score and the tables, and
// the view says how many were left out (game-queue.ts, progress-stats.ts).
const progress = computed(() => progressMatches(allAnalyses.value, primaryGame.value, range.value))
const filteredAnalyses = computed(() => progress.value.counted)
const excludedFunModeCount = computed(() => progress.value.excluded)

// ── Stat cards ────────────────────────────────────────────────────────────────

const winRate = computed(() => progressWinRate(filteredAnalyses.value))

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

// K/D = total kills / total deaths; HS% = mean of the per-match values the API sends.
const avgKda = computed((): string => progressKd(filteredAnalyses.value))
const avgHs = computed((): number | null => progressHs(filteredAnalyses.value))

// Same minimum sample as Progress: ≥3 matches per half, else no delta ("Early read").
function buildDelta(values: Array<number | null | undefined>): number | null {
  const d = halfDelta(values)
  return d ? d.last - d.first : null
}

const statDeltas = computed(() => ({
  winRate: buildDelta([...filteredAnalyses.value].reverse().map(a => { const w = toMatchWon(a.won); return w == null ? null : (w ? 100 : 0) })),
  score: buildDelta([...filteredAnalyses.value].reverse().map(a => a.overall_score ?? null)),
  kda: buildDelta([...filteredAnalyses.value].reverse().map(a => a.kills != null && a.deaths != null ? a.kills / Math.max(1, a.deaths) : null)),
  hs: buildDelta([...filteredAnalyses.value].reverse().map(a => a.hs_pct ?? null)),
}))

// ── Recent form ───────────────────────────────────────────────────

const recentForm = computed(() =>
  filteredAnalyses.value.slice(0, 15).map(a =>
    toMatchWon(a.won) == null ? '-' : (toMatchWon(a.won) ? 'W' : 'L')
  )
)


// ── By Agent & By Map ─────────────────────────────────────────────────────────

const agentRows = computed(() => breakdownRows(filteredAnalyses.value, 'agent'))
const mapRows = computed(() => breakdownRows(filteredAnalyses.value, 'map'))

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
