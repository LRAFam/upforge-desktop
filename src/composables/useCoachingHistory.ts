import { ref, computed, watch, onMounted, onUnmounted, inject, provide, type InjectionKey } from 'vue'
import { useRouter } from 'vue-router'
import type { AnalysisItem } from '../env.d.ts'
import {
  getAgentImage,
  getAgentRole,
  getAgentColor,
  getMapImage,
  getRankIconUrl,
  getRankHexColor,
  getRoleColor,
  formatGameMode,
  formatMapLabel,
  isDisplayableGameMode,
  normalizeCombatScoreToAcs,
  normalizeMapAssetKey,
  NON_MAP_NAMES,
} from '../lib/valorant'
import { buildTacticalIntelBrief } from '../lib/coaching-brief'
import type { TacticalIntelBrief as TacticalIntelBriefData } from '../lib/coaching-brief'
import { useGameTheme } from '../composables/useGameTheme'
import { loadGameAnalyses, openGameAnalysis } from '../lib/game-modules'
import { fetchCoachReviewSummary, loadCoachReviewSummaries, type CoachReviewSummary } from '../lib/coach-review-cache'
import { openAnalysisVodReview } from '../lib/open-vod-review'
import { scoreGrade, scoreLabel, scoreGradeBadgeClass } from '../lib/analysis-scoring'

export const COACHING_HISTORY_KEY: InjectionKey<ReturnType<typeof createCoachingHistory>> = Symbol('coachingHistory')

export function provideCoachingHistory() {
  const ctx = createCoachingHistory()
  provide(COACHING_HISTORY_KEY, ctx)
  return ctx
}

export function useCoachingHistory() {
  const ctx = inject(COACHING_HISTORY_KEY)
  if (!ctx) throw new Error('useCoachingHistory() must be used within CoachingHistoryView')
  return ctx
}

function createCoachingHistory() {
  const router = useRouter()
  const { theme, features, primaryGame } = useGameTheme()
  const RESULT_FILTERS = ['All', 'Wins', 'Losses', 'Scored'] as const
  const allAnalyses = ref<AnalysisItem[]>([])
  const loading = ref(true)
  const activeFilter = ref<(typeof RESULT_FILTERS)[number]>('All')
  const activeMap = ref<string | null>(null)
  const timelineLoadingId = ref<number | null>(null)
  
  const selectedId = ref<number | null>(null)
  const detailLoading = ref(false)
  const expandedDetail = ref<{
    verdict: string | null
    top_issue: string | null
    priority_improvements: string[]
    coaching_tags: string[]
    ally_score: number | null
    enemy_score: number | null
  } | null>(null)
  const coachReviewSummary = ref<CoachReviewSummary | null>(null)
  const coachReviewByAnalysisId = ref<Record<number, CoachReviewSummary>>({})
  
  const expandedBrief = computed((): TacticalIntelBriefData | null => {
    const d = expandedDetail.value
    const raw = d?.top_issue ?? d?.verdict ?? null
    if (!raw) return null
    return buildTacticalIntelBrief(raw, {
      improvements: d?.priority_improvements ?? [],
      tags: d?.coaching_tags ?? [],
      source: 'coaching',
    })
  })
  
  function displayAcs(a: AnalysisItem): number | null {
    const rounds = a.rounds_won != null && a.rounds_lost != null
      ? a.rounds_won + a.rounds_lost
      : null
    return normalizeCombatScoreToAcs(a.combat_score, rounds)
  }
  
  function pickTopByCount(
    analyses: AnalysisItem[],
    pick: (item: AnalysisItem) => string | null | undefined,
  ): string | null {
    const counts = new Map<string, number>()
    for (const item of analyses) {
      const key = pick(item)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    let best: string | null = null
    let max = 0
    for (const [key, count] of counts) {
      if (count > max) {
        max = count
        best = key
      }
    }
    return best
  }
  
  const topAgent = computed(() => pickTopByCount(allAnalyses.value, a => a.agent))
  const topMap = computed(() => {
    const key = pickTopByCount(allAnalyses.value, a => {
      if (!a.map) return null
      const normalized = normalizeMapAssetKey(a.map)
      return normalized && !NON_MAP_NAMES.has(normalized) ? normalized : null
    })
    return key
  })
  
  const selectedAnalysis = computed(() =>
    allAnalyses.value.find(a => a.id === selectedId.value) ?? null,
  )
  
  function isWideLayout(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  }
  
  onMounted(async () => {
    window.api.discord.setState('reviewing').catch(() => {})
    await reloadAnalyses()
  })
  
  watch(primaryGame, () => {
    void reloadAnalyses()
  })
  
  async function reloadAnalyses() {
    loading.value = true
    activeMap.value = null
    allAnalyses.value = await loadGameAnalyses(primaryGame.value, 100)
    coachReviewByAnalysisId.value = await loadCoachReviewSummaries(
      allAnalyses.value.slice(0, 24).map(a => a.id),
    )
    loading.value = false
  }
  
  onUnmounted(() => {
    window.api.discord.setState('idle').catch(() => {})
  })
  
  const availableMaps = computed(() => {
    const keys = new Set<string>()
    for (const a of allAnalyses.value) {
      if (!a.map) continue
      const key = normalizeMapAssetKey(a.map)
      if (!key || NON_MAP_NAMES.has(key)) continue
      keys.add(key)
    }
    return [...keys].sort((a, b) => formatMapLabel(a).localeCompare(formatMapLabel(b)))
  })
  
  const filteredAnalyses = computed(() => {
    let list = allAnalyses.value
    switch (activeFilter.value) {
      case 'Wins': list = list.filter(a => a.won); break
      case 'Losses': list = list.filter(a => a.won === false || a.won === 0 as unknown); break
      case 'Scored': list = list.filter(a => a.overall_score != null); break
    }
    if (activeMap.value) list = list.filter(a => normalizeMapAssetKey(a.map) === activeMap.value)
    return list
  })
  
  watch([filteredAnalyses, loading], () => {
    if (loading.value) return
    const list = filteredAnalyses.value
    if (!list.length) {
      selectedId.value = null
      expandedDetail.value = null
      return
    }
    const stillVisible = selectedId.value != null && list.some(a => a.id === selectedId.value)
    if (stillVisible) return
    if (isWideLayout()) {
      void selectSession(list[0])
    } else {
      selectedId.value = null
      expandedDetail.value = null
    }
  })
  
  const groupedAnalyses = computed(() => {
    const groups: Array<{ label: 'Today' | 'Yesterday' | 'This Week' | 'Earlier'; items: AnalysisItem[] }> = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'This Week', items: [] },
      { label: 'Earlier', items: [] },
    ]
  
    for (const analysis of filteredAnalyses.value) {
      const label = getDateGroup(analysis.created_at)
      const group = groups.find(entry => entry.label === label)
      if (group) group.items.push(analysis)
    }
  
    return groups.filter(group => group.items.length > 0)
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
  
  function getDateGroup(d: string): 'Today' | 'Yesterday' | 'This Week' | 'Earlier' {
    const target = new Date(d)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    const diffDays = Math.floor((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000)
  
    if (diffDays <= 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return 'This Week'
    return 'Earlier'
  }
  
  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  
  async function selectSession(a: AnalysisItem) {
    selectedId.value = a.id
    expandedDetail.value = null
    coachReviewSummary.value = null
    if (!features.value.coachingDetail || a.game_mode === 'DEADLOCK') {
      detailLoading.value = false
      return
    }
    if (!a.overall_score && !['queued', 'processing', 'pending'].includes(a.status)) {
      detailLoading.value = false
      return
    }
    detailLoading.value = true
    try {
      const [detail, coachReview] = await Promise.all([
        window.api.analyses.getDetail(a.id).catch(() => null),
        fetchCoachReviewSummary(a.id),
      ])
      expandedDetail.value = detail
      coachReviewSummary.value = coachReview
    } catch { /* ignore */ } finally {
      detailLoading.value = false
    }
  }
  
  async function openSession(a: AnalysisItem) {
    await openGameAnalysis(primaryGame.value, a, router)
  }
  
  async function openTimeline(id: number, opts?: { coachNotes?: boolean }) {
    if (!features.value.vodReviewTimeline) return
    timelineLoadingId.value = id
    try {
      const ok = await openAnalysisVodReview(router, id, { coachNotes: opts?.coachNotes })
      if (!ok) router.push('/vod-review')
    } catch {
      router.push('/vod-review')
    } finally {
      timelineLoadingId.value = null
    }
  }

  async function openCoachNotes(id: number) {
    await openTimeline(id, { coachNotes: true })
  }
  

  return {
    RESULT_FILTERS,
    activeFilter,
    activeMap,
    allAnalyses,
    availableMaps,
    avgKD,
    avgScore,
    chartData,
    coachReviewByAnalysisId,
    coachReviewSummary,
    detailLoading,
    displayAcs,
    expandedBrief,
    expandedDetail,
    features,
    filteredAnalyses,
    formatDate,
    formatGameMode,
    formatMapLabel,
    getAgentColor,
    getAgentImage,
    getAgentRole,
    getDateGroup,
    getMapImage,
    getRankHexColor,
    getRankIconUrl,
    getRoleColor,
    groupedAnalyses,
    isDisplayableGameMode,
    isWideLayout,
    loading,
    openSession,
    openCoachNotes,
    openTimeline,
    pickTopByCount,
    primaryGame,
    reloadAnalyses,
    router,
    scoreColor,
    scoreGrade,
    scoreGradeBadgeClass,
    scoreLabel,
    selectSession,
    selectedAnalysis,
    selectedId,
    theme,
    timelineLoadingId,
    topAgent,
    topMap,
    winRate,
  }
}
