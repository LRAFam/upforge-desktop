import { ref, computed, inject, provide, onMounted, onUnmounted, type InjectionKey } from 'vue'
import { useRouter } from 'vue-router'
import type { ProfileData, AnalysisItem, PendingRecording, ClipRecord, DeadlockProfileStats } from '../env.d.ts'
import { formatGameMode, getRankIconUrl } from '../lib/valorant'
import { getMasteryIconUrl } from '../lib/rank-assets'
import { hasAnalysisQuotaRemaining, hasArchiveQuotaRemaining, isPlatformAdmin } from '../lib/tier-features'
import { useAchievements } from './useAchievements'
import type { CarouselPanel } from '../components/PanelCarousel.vue'
import type { SkillProfileSnapshot } from '../lib/skill-profile'
import { buildSessionReview } from '../lib/session-review'
import { buildWeeklyFocusPlan } from '../lib/weekly-focus'
import { isPaymentPastDue, openBillingPortal as requestBillingPortal } from '../lib/billing'
import { usePrimaryGame } from './usePrimaryGame'
import { gameTheme, type GameTheme } from '../lib/game-themes'
import { openAccountLinkSettings } from '../lib/account-link-navigation'
import {
  loadGameAnalyses,
  openGameHistoryWeb,
  openGameAnalyze,
} from '../lib/game-modules'
import { openGameAnalysis } from '../lib/open-game-analysis'
import { loadCoachReviewSummaries, type CoachReviewSummary } from '../lib/coach-review-cache'
import { openAnalysisVodReview } from '../lib/open-vod-review'
import { getFaceitLevelIconUrl, type Cs2FaceitConnection, type Cs2ProfilePayload } from '../lib/cs2'
import {
  displayAcs,
  isAnalysisProcessing,
  isRecordingDeferred,
  isRecordingInFlight,
  recordingPipelineLabel,
  recordingRowStats,
  recordingUploadProgress,
} from '../lib/dashboard-match-row'
import { buildAnalysisErrorPayload, type AnalysisErrorPayload } from '../lib/analysis-failure-messages'
import { canOpenTimeline, canWatchRawRecording } from '../lib/recording-demo-status'
import { type DemoDownloadProgress, demoDownloadProgressLabel } from '../lib/demo-download-progress'
import { recordingTimelineReady } from '../lib/recording-demo-status'

export interface LolRecentMatch {
  match_id: string
  queue_id: number
  champion: string
  role: string
  lane: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  game_duration_seconds: number
  game_creation: number
}

const HIDDEN_ANALYSES_KEY = 'upforge:hiddenAnalysisIds'

function loadHiddenAnalyses(): Set<number> {
  try {
    const raw = localStorage.getItem(HIDDEN_ANALYSES_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : [])
  } catch {
    return new Set()
  }
}

function saveHiddenAnalyses(ids: Set<number>): void {
  try {
    localStorage.setItem(HIDDEN_ANALYSES_KEY, JSON.stringify([...ids]))
  } catch { /* ignore */ }
}

export const DASHBOARD_KEY: InjectionKey<ReturnType<typeof createDashboard>> = Symbol('dashboard')

export function provideDashboard() {
  const ctx = createDashboard()
  provide(DASHBOARD_KEY, ctx)
  return ctx
}

export function useDashboard() {
  const ctx = inject(DASHBOARD_KEY)
  if (!ctx) throw new Error('useDashboard() must be used within DashboardView')
  return ctx
}

function createDashboard() {
  const router = useRouter()
  const achievements = useAchievements()
  const { primaryGame, isValorant, isCs2, isDeadlock, isLol, loadFromSettings, applyFromSettings } = usePrimaryGame()

  const theme = computed<GameTheme>(() => gameTheme(primaryGame.value))

  const profile = ref<ProfileData | null>(null)
  const profileLoading = ref(true)
  const onboardingTargetRank = ref<string | null>(null)
  const onboardingWeaknesses = ref<string[]>([])
  const cs2FaceitConnection = ref<Cs2FaceitConnection | null>(null)
  const cs2Profile = ref<Cs2ProfilePayload | null>(null)
  const cs2SteamName = ref('')
  const cs2LinksLoading = ref(true)
  const deadlockLinked = ref(false)
  const deadlockStats = ref<DeadlockProfileStats | null>(null)
  const deadlockLinksLoading = ref(true)
  const lolRecentMatches = ref<LolRecentMatch[]>([])
  const lolLinksLoading = ref(true)
  const playerCardUrl = ref('')
  const analyses = ref<AnalysisItem[]>([])
  const analysesLoading = ref(true)
  const hiddenAnalysisIds = ref<Set<number>>(loadHiddenAnalyses())
  const coachingSnippets = ref<Record<number, string>>({})
  const coachReviewByAnalysisId = ref<Record<number, CoachReviewSummary>>({})
  const pendingRecordings = ref<PendingRecording[]>([])
  const uploadProgressByRecordingId = ref<Record<string, number>>({})
  const analysingIds = ref(new Set<string>())
  const savingIds = ref(new Set<string>())
  const status = ref({
    recording: false,
    recordingStarting: false,
    currentGame: null as string | null,
    waitingForMatch: false,
    ffmpegOk: true,
    obsConnected: false,
    recordedModes: [] as string[],
    recordingBackend: 'obs' as const,
    currentQueueMode: null as string | null,
  })
  const isDev = ref(false)
  const platform = ref('')
  const macPreviewDismissed = ref(localStorage.getItem('dismissedMacPreviewBanner') === '1')
  const showMacPreviewBanner = computed(() =>
    platform.value !== '' && platform.value !== 'win32' && !macPreviewDismissed.value,
  )
  const hotkeys = ref<Record<string, string>>({})
  const clipCount = ref(0)
  const isAdmin = computed(() =>
    isPlatformAdmin(profile.value?.user?.tier, profile.value?.user?.is_admin),
  )
  const paymentPastDue = computed(() =>
    isPaymentPastDue(profile.value?.user?.stripe_subscription_status),
  )
  const billingPortalLoading = ref(false)

  const dashboardHeadline = computed(() => {
    const pending = pendingRecordings.value.filter((r) => !r.clipsOnly)
    if (hasOnboardingGoals.value && pending.length > 0 && onboardingWeaknesses.value.length > 0) {
      const focus = onboardingWeaknesses.value[0]!
      const agent = pending[0]?.agent
      return agent
        ? `You wanted to work on ${focus} — analyse your ${agent} game when ready`
        : `You wanted to work on ${focus} — analyse your latest match when ready`
    }
    return profile.value?.user?.name ? `Welcome back, ${profile.value.user.name}` : 'Your coaching dashboard'
  })
  const emptyCoachingTitle = computed(() => theme.value.coachingEmptyTitle)
  const emptyCoachingMessage = computed(() =>
    theme.value.coachingEmptyMessage({ obsConnected: status.value.obsConnected }),
  )
  const emptyCoachingAction = computed(() =>
    theme.value.coachingEmptyAction({ obsConnected: status.value.obsConnected }),
  )
  const hasOnboardingGoals = computed(
    () => !!(onboardingTargetRank.value || onboardingWeaknesses.value.length),
  )
  const goalsRankIcon = computed(() => {
    if (!isValorant.value || !onboardingTargetRank.value) return null
    return getRankIconUrl(onboardingTargetRank.value)
  })
  const dashboardRankLabel = computed(() => {
    if (isCs2.value) {
      const valve = cs2Profile.value?.valve_stats
      if (valve?.matches_tracked && valve.avg_kd != null) {
        return `${valve.avg_kd} K/D · ${valve.matches_tracked} matches`
      }
      const steam = cs2Profile.value?.identity?.steam_display_name
      if (steam) return steam
      if (cs2FaceitConnection.value?.connected) {
        const nick = cs2FaceitConnection.value.nickname
        const lvl = cs2FaceitConnection.value.level
        if (nick && lvl != null) return `${nick} · FACEIT Lv ${lvl}`
        if (nick) return `${nick} · FACEIT`
      }
      return theme.value.rankFallback
    }
    if (isDeadlock.value) return theme.value.rankFallback
    if (isLol.value) {
      const last = lolRecentMatches.value[0]
      if (last) return `${last.champion} · ${last.win ? 'W' : 'L'} ${last.kills}/${last.deaths}/${last.assists}`
      return theme.value.rankFallback
    }
    return profile.value?.latest_stats?.current_rank || theme.value.rankFallback
  })
  const totalSessionsAnalysed = computed(() => {
    const total = profile.value?.user?.analysis_stats?.total
    if (total != null) return Math.max(0, total)
    return analyses.value.filter(a => a.overall_score != null).length
  })

  const devOpen = ref(false)
  const simulating = ref(false)
  const simStatus = ref('')
  const recordingStartedAt = ref<number | null>(null)
  const recordingElapsed = ref('')
  const stopping = ref(false)
  const obsConnecting = ref(false)

  const showRankHistory = ref(false)
  const warning = ref<string | null>(null)
  const warningAction = ref<{ label: string; route: string } | null>(null)
  const bulkUploading = ref(false)
  const rrHistory = ref<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>>([])

  const rrSparkline = computed(() => {
    const data = rrHistory.value
    if (data.length < 2) return null
    const eloValues = data.map(d => d.elo)
    const minElo = Math.min(...eloValues)
    const maxElo = Math.max(...eloValues)
    const range = maxElo - minElo || 1
    const W = 120, H = 24, pad = 2
    const points = eloValues.map((elo, i) => {
      const x = pad + (i / (eloValues.length - 1)) * (W - pad * 2)
      const y = H - pad - ((elo - minElo) / range) * (H - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const lastElo = eloValues[eloValues.length - 1]
    const firstElo = eloValues[0]
    return { points: points.join(' '), trending: lastElo >= firstElo, W, H }
  })

  const upgradeNeeded = ref(false)
  const activityLog = ref<{ time: number; message: string; game?: string }[]>([])
  const demoDownloadProgress = ref<DemoDownloadProgress | null>(null)
  const lastInsight = ref<{ text: string; score: number; agent: string | null; analysisId: number | null; date: string } | null>(null)
  const lastInsightTraining = ref(false)
  const trainerLastSession = ref<{ score: number; scenario: string; date: string } | null>(null)
  const trainerSessionCount = ref(0)
  const analysisCompleteToast = ref<{
    score: number
    agent: string | null
    analysisId?: number | null
    remaining?: number | null
    limit?: number | null
  } | null>(null)
  const analysisFailure = ref<AnalysisErrorPayload | null>(null)
  const activityToast = ref<string | null>(null)
  const backgroundWorkBanner = ref(false)
  let analysisToastTimer: ReturnType<typeof setTimeout> | null = null
  let analysisFailureTimer: ReturnType<typeof setTimeout> | null = null
  let activityToastTimer: ReturnType<typeof setTimeout> | null = null
  let pendingReloadTimer: ReturnType<typeof setTimeout> | null = null
  let lastPendingReloadAt = 0
  const PENDING_RELOAD_MIN_MS = 15_000

  const correlationInsights = ref<string[]>([])
  const playstyleProfile = ref<{
    matches_tracked: number
    vods_analyzed?: number
    profile_milestone?: {
      level: number
      label: string
      vods: number
      next_level_vods: number | null
    }
    last_match_at: string | null
    metrics: Record<string, unknown> & {
      combat?: {
        untraded_death_rate_pct?: number
        death_hotspots?: Array<{ callout: string; count: number }>
      }
    }
    focus_areas: Array<{ id: string; category: string; text: string; severity: 'low' | 'medium' | 'high' }>
    brain_habits?: Array<{ id: string; category: string; text: string; severity: 'low' | 'medium' | 'high' }>
    agent_pool: Record<string, number>
  } | null>(null)
  const skillProfile = ref<SkillProfileSnapshot | null>(null)
  const skillProfilePrevious = ref<SkillProfileSnapshot | null>(null)
  const playerRankName = computed(() => profile.value?.latest_stats?.current_rank ?? null)

  const leftInsightIndex = ref(0)
  const rightInsightIndex = ref(0)
  const timelineLoadingId = ref<number | null>(null)

  const leftInsightPanels = computed<CarouselPanel[]>(() => {
    const panels: CarouselPanel[] = []
    if (profile.value?.user.forge_rank) {
      panels.push({ id: 'mastery', label: 'Mastery', accent: 'bg-yellow-500' })
    }
    if (isValorant.value && scoreChartData.value) {
      panels.push({ id: 'score', label: 'AI Score', accent: 'bg-green-500' })
    }
    if (isValorant.value && topAgents.value.length && topAgents.value.some(a => a.hasWinData || a.avgScore != null)) {
      panels.push({ id: 'agents', label: 'Agents', accent: 'bg-red-500' })
    }
    return panels
  })

  const rightInsightPanels = computed<CarouselPanel[]>(() => {
    const panels: CarouselPanel[] = []
    if (isValorant.value && playstyleProfile.value && (playstyleProfile.value.matches_tracked > 0 || (playstyleProfile.value.vods_analyzed ?? 0) > 0)) {
      panels.push({ id: 'playstyle', label: 'Player brain', accent: 'bg-violet-500' })
    }
    if (isValorant.value && skillProfile.value) {
      panels.push({ id: 'skills', label: 'Skills', accent: 'bg-emerald-500' })
    }
    if (isValorant.value && hasOnboardingGoals.value) {
      panels.push({ id: 'goals', label: 'Goals', accent: 'bg-red-500' })
    }
    if (isValorant.value && correlationInsights.value.length) {
      panels.push({ id: 'impact', label: 'Impact', accent: 'bg-red-500' })
    }
    panels.push({ id: 'training', label: 'Aim Training', accent: 'bg-orange-500' })
    return panels
  })

  const lastFivePerf = computed(() => {
    const last5 = analyses.value.slice(0, 5)
    if (!last5.length) return null
    const wins = last5.filter(a => a.won === true).length
    const losses = last5.filter(a => a.won === false).length
    const wl = last5.map(a => a.won)
    const acsItems = last5.filter(a => displayAcs(a) != null)
    const scoreItems = last5.filter(a => a.overall_score != null)
    const hsItems = last5.filter(a => a.hs_pct != null)
    return {
      wl,
      wins,
      losses,
      avgAcs: acsItems.length ? Math.round(acsItems.reduce((s, a) => s + (displayAcs(a) ?? 0), 0) / acsItems.length) : null,
      avgScore: scoreItems.length ? Math.round(scoreItems.reduce((s, a) => s + (a.overall_score ?? 0), 0) / scoreItems.length) : null,
      avgHs: hsItems.length ? Math.round(hsItems.reduce((s, a) => s + (a.hs_pct ?? 0), 0) / hsItems.length) : null,
    }
  })

  const sessionReview = computed(() => {
    if (!isValorant.value) return null
    return buildSessionReview(analyses.value, skillProfile.value, 8)
  })

  const weeklyFocus = computed(() => {
    if (!isValorant.value) return null
    return buildWeeklyFocusPlan({
      skillProfile: skillProfile.value,
      playstyleFocus: playstyleProfile.value?.focus_areas ?? null,
      rankName: playerRankName.value,
      sessionFix: sessionReview.value?.fixThisWeek ?? null,
      avgSessionScore: sessionReview.value?.avgScore ?? null,
    })
  })

  const topAgents = computed(() => {
    const map: Record<string, { wins: number; total: number; wonTracked: number; scores: number[] }> = {}
    for (const a of analyses.value) {
      if (!a.agent) continue
      if (!map[a.agent]) map[a.agent] = { wins: 0, total: 0, wonTracked: 0, scores: [] }
      map[a.agent].total++
      if (a.won === true) { map[a.agent].wins++; map[a.agent].wonTracked++ }
      else if (a.won === false) map[a.agent].wonTracked++
      if (a.overall_score != null) map[a.agent].scores.push(a.overall_score)
    }
    return Object.entries(map)
      .filter(([, d]) => d.total >= 2 && (d.wonTracked > 0 || d.scores.length > 0))
      .map(([agent, d]) => ({
        agent,
        total: d.total,
        hasWinData: d.wonTracked > 0,
        winRate: d.wonTracked > 0 ? Math.round((d.wins / d.wonTracked) * 100) : 0,
        avgScore: d.scores.length ? Math.round(d.scores.reduce((s, v) => s + v, 0) / d.scores.length) : null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  })

  const dashboardAnalyses = computed(() => {
    const inFlightJobIds = new Set(
      pendingRecordings.value.map(r => r.jobId).filter((id): id is string => !!id),
    )
    return analyses.value.filter(a =>
      !hiddenAnalysisIds.value.has(a.id)
      && (!a.job_id || !inFlightJobIds.has(a.job_id)),
    )
  })

  async function removeAnalysis(a: AnalysisItem) {
    const result = await window.api.analyses.remove(a.id, a.job_id).catch(() => null)
    if (!result?.removed) return
    hiddenAnalysisIds.value = new Set(hiddenAnalysisIds.value).add(a.id)
    saveHiddenAnalyses(hiddenAnalysisIds.value)
    analyses.value = analyses.value.filter(x => x.id !== a.id)
  }

  const bulkUploadablePending = computed(() =>
    pendingRecordings.value.filter(r =>
      !r.clipsOnly
      && !isRecordingInFlight(r, uploadProgressByRecordingId.value)
      && !r.cloudArchived
      && !r.jobId,
    ),
  )

  const bulkAnalysablePending = computed(() =>
    pendingRecordings.value.filter((r) =>
      !r.clipsOnly
      && !isRecordingInFlight(r, uploadProgressByRecordingId.value)
      && !isRecordingDeferred(r)
      && (r.analysisReadiness?.ready ?? false),
    ),
  )

  const inFlightUploadCount = computed(() =>
    pendingRecordings.value.filter((r) => r.pipelineStatus === 'uploading').length,
  )

  const inFlightAnalysisCount = computed(() =>
    pendingRecordings.value.filter((r) => r.pipelineStatus === 'analysing').length,
  )

  const deferredUploadCount = computed(() =>
    pendingRecordings.value.filter((r) => isRecordingDeferred(r)).length,
  )

  const quotaRemaining = computed(() => {
    const stats = profile.value?.user?.analysis_stats
    if (!stats || stats.limit == null || isAdmin.value) return null
    return Math.max(0, stats.limit - stats.total)
  })

  const quotaLowWarning = computed(() => {
    if (quotaRemaining.value == null) return null
    if (quotaPercent.value >= 80 && quotaRemaining.value > 0) {
      return `${quotaRemaining.value} coaching ${quotaRemaining.value === 1 ? 'credit' : 'credits'} left this month`
    }
    if (quotaRemaining.value === 0) {
      return 'No coaching credits left this month'
    }
    return null
  })

  const groupedAnalyses = computed(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const weekAgo = new Date(today.getTime() - 7 * 86400000)
    const groups: { label: string; items: AnalysisItem[] }[] = []
    const todayItems = dashboardAnalyses.value.filter(a => new Date(a.created_at) >= today)
    const yestItems = dashboardAnalyses.value.filter(a => { const d = new Date(a.created_at); return d >= yesterday && d < today })
    const weekItems = dashboardAnalyses.value.filter(a => { const d = new Date(a.created_at); return d >= weekAgo && d < yesterday })
    const olderItems = dashboardAnalyses.value.filter(a => new Date(a.created_at) < weekAgo)
    if (todayItems.length) groups.push({ label: 'Today', items: todayItems })
    if (yestItems.length) groups.push({ label: 'Yesterday', items: yestItems })
    if (weekItems.length) groups.push({ label: 'This week', items: weekItems })
    if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems })
    return groups
  })

  const quotaPercent = computed(() => {
    const stats = profile.value?.user?.analysis_stats
    if (!stats || stats.limit == null || isAdmin.value) return 0
    return Math.min(100, Math.round((stats.total / stats.limit) * 100))
  })

  const archiveQuotaPercent = computed(() => {
    const stats = profile.value?.user?.archive_stats
    if (!stats?.limit || isAdmin.value) return 0
    return Math.min(100, Math.round((stats.count / stats.limit) * 100))
  })

  /** Free-tier cloud keep nudge — shown when user already has ≥1 archived VOD. */
  const archiveRetentionDismissed = ref(false)
  const archiveRetentionNudge = computed(() => {
    if (archiveRetentionDismissed.value || isAdmin.value) return null
    const u = profile.value?.user
    if (!u || u.tier !== 'free') return null
    const stats = u.archive_stats
    if (!stats || (stats.count ?? 0) < 1) return null
    const days = stats.retention_days
    const max = stats.limit
    if (days == null || max == null) return null
    return `Free keeps cloud VODs for ${days} days (${max} max). Plus keeps them 90 days.`
  })
  function dismissArchiveRetentionNudge() {
    archiveRetentionDismissed.value = true
  }

  const avgScore = computed<number | null>(() => {
    const scored = analyses.value.filter(a => a.overall_score != null)
    if (!scored.length) return null
    return Math.round(scored.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / scored.length)
  })

  const scoreTrend = computed<number | null>(() => {
    const scored = analyses.value.filter(a => a.overall_score != null)
    if (scored.length < 2) return null
    const recent = scored.slice(0, Math.ceil(scored.length / 2))
    const older = scored.slice(Math.ceil(scored.length / 2))
    const recentAvg = recent.reduce((s, a) => s + (a.overall_score ?? 0), 0) / recent.length
    const olderAvg = older.reduce((s, a) => s + (a.overall_score ?? 0), 0) / older.length
    const diff = Math.round(recentAvg - olderAvg)
    return diff === 0 ? null : diff
  })

  const scoreChartData = computed(() => {
    const scored = [...analyses.value].filter(a => a.overall_score != null).reverse().slice(0, 20)
    if (scored.length < 2) return null
    const scores = scored.map(a => a.overall_score!)
    const W = 100, H = 32, pad = 2
    const pts = scores.map((s, i) => {
      const x = pad + (i / (scores.length - 1)) * (W - pad * 2)
      const y = H - pad - (s / 100) * (H - pad * 2)
      return `${x.toFixed(1)} ${y.toFixed(1)}`
    })
    const areaPath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ') +
      ` L ${(pad + (W - pad * 2)).toFixed(1)} ${H} L ${pad} ${H} Z`
    const linePath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ')
    const last = scores[scores.length - 1]
    return { areaPath, linePath, W, H, up: last >= scores[0], last }
  })

  const currentStreak = computed<number>(() => {
    const withResult = analyses.value.filter(a => a.won != null)
    if (!withResult.length) return 0
    const first = withResult[0].won
    let streak = 0
    for (const a of withResult) {
      if (a.won === first) streak++
      else break
    }
    return first ? streak : -streak
  })

  const formatMode = formatGameMode

  let pollInterval: ReturnType<typeof setInterval>
  let durationInterval: ReturnType<typeof setInterval>

  function formatEntryDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return dateStr.slice(0, 10)
    }
  }

  function rrDelta(reversedIndex: number): number {
    const reversed = rrHistory.value.slice().reverse()
    if (reversedIndex >= reversed.length - 1) return 0
    return reversed[reversedIndex].elo - reversed[reversedIndex + 1].elo
  }

  function updateRecordingElapsed() {
    if (!recordingStartedAt.value) { recordingElapsed.value = ''; return }
    const secs = Math.floor((Date.now() - recordingStartedAt.value) / 1000)
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    recordingElapsed.value = `${m}:${s}`
  }

  function formatLogTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function logEntryColor(message: string): string {
    const m = message.toLowerCase()
    if (m.includes('error') || m.includes('fail') || m.includes('crash')) return 'bg-red-500'
    if (m.includes('warn') || m.includes('low') || m.includes('retry')) return 'bg-yellow-500'
    if (m.includes('record') || m.includes('start')) return 'bg-red-400'
    if (m.includes('stop') || m.includes('finish') || m.includes('complet')) return 'bg-green-500'
    if (m.includes('upload') || m.includes('analys')) return 'bg-blue-400'
    if (m.includes('clip') || m.includes('bookmark')) return 'bg-purple-400'
    return 'bg-gray-600'
  }

  function clearLog() {
    activityLog.value = []
  }

  function formatActivityLogText(entries = activityLog.value): string {
    if (entries.length === 0) return ''
    const lines = entries.map(
      (entry) => `[${new Date(entry.time).toISOString()}] ${entry.message}`,
    )
    return ['UpForge Activity Log', ...lines].join('\n')
  }

  async function copyActivityLog(): Promise<boolean> {
    const text = formatActivityLogText()
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async function loadClipCount() {
    clipCount.value = (await window.api.clips.get({ game: primaryGame.value }).catch(() => [] as ClipRecord[])).length
  }

  async function loadSkillProfileFromSettings() {
    const saved = await window.api.settings.get().catch(() => null) as {
      skillProfile?: SkillProfileSnapshot | null
      skillProfilePrevious?: SkillProfileSnapshot | null
    } | null
    skillProfile.value = saved?.skillProfile ?? null
    skillProfilePrevious.value = saved?.skillProfilePrevious ?? null
  }

  async function loadAnalyses() {
    analysesLoading.value = true
    try {
      analyses.value = await loadGameAnalyses(primaryGame.value, 10)
      coachingSnippets.value = {}
      coachReviewByAnalysisId.value = {}
      void loadCoachingSnippets(analyses.value)
      void loadCoachReviewBadges(analyses.value)
    } catch {
      analyses.value = []
    } finally {
      analysesLoading.value = false
    }
  }

  async function loadCoachReviewBadges(items: AnalysisItem[]) {
    const ids = items
      .filter(a => !isAnalysisProcessing(a))
      .map(a => a.id)
    if (!ids.length) return
    coachReviewByAnalysisId.value = await loadCoachReviewSummaries(ids)
  }

  async function openCoachNotesVod(analysisId: number) {
    timelineLoadingId.value = analysisId
    try {
      const ok = await openAnalysisVodReview(router, analysisId, { coachNotes: true })
      if (!ok) {
        warning.value = 'Timeline data not available for this match.'
        setTimeout(() => { warning.value = null }, 10000)
      }
    } catch {
      warning.value = 'Could not open coach notes — try again.'
      setTimeout(() => { warning.value = null }, 10000)
    } finally {
      timelineLoadingId.value = null
    }
  }

  async function loadCoachingSnippets(items: AnalysisItem[]) {
    const toFetch = items.filter(a => !isAnalysisProcessing(a) && !coachingSnippets.value[a.id])
    await Promise.all(toFetch.map(async (a) => {
      const detail = await window.api.analyses.getDetail(a.id).catch(() => null)
      const snippet = detail?.top_issue
        ?? detail?.priority_improvements?.[0]
        ?? detail?.match_highlights?.[0]?.reason
        ?? detail?.heatmap_insight
        ?? detail?.verdict
        ?? null
      if (snippet) coachingSnippets.value[a.id] = snippet
    }))
  }

  async function loadCs2Faceit() {
    try {
      cs2FaceitConnection.value = await window.api.cs2.getFaceitConnection()
    } catch {
      cs2FaceitConnection.value = null
    }
  }

  async function loadCs2Profile() {
    try {
      cs2Profile.value = await window.api.cs2.getProfile()
    } catch {
      cs2Profile.value = null
    }
  }

  async function loadDeadlockProfile() {
    try {
      const result = await window.api.deadlock.getStats()
      deadlockLinked.value = result.linked
      deadlockStats.value = result.stats
    } catch {
      deadlockLinked.value = false
      deadlockStats.value = null
    }
  }

  async function loadLolProfile() {
    // Prefer dedicated LoL account; fall back to shared Valorant Riot ID.
    const hasLol = Boolean(profile.value?.user?.lol_riot_name?.trim())
    const hasRiot = Boolean(profile.value?.user?.riot_name?.trim())
    if (!hasLol && !hasRiot) {
      lolRecentMatches.value = []
      return
    }
    try {
      lolRecentMatches.value = await window.api.lol.getRecentMatches()
    } catch {
      lolRecentMatches.value = []
    }
  }

  async function loadCs2LinkState() {
    cs2LinksLoading.value = true
    try {
      const settings = await window.api.settings.get().catch(() => null)
      cs2SteamName.value = settings?.cs2SteamName?.trim() ?? ''
      await Promise.all([loadCs2Faceit(), loadCs2Profile()])
    } finally {
      cs2LinksLoading.value = false
    }
  }

  async function loadDeadlockLinkState() {
    deadlockLinksLoading.value = true
    try {
      await loadDeadlockProfile()
    } finally {
      deadlockLinksLoading.value = false
    }
  }

  async function loadLolLinkState() {
    lolLinksLoading.value = true
    try {
      await loadLolProfile()
    } finally {
      lolLinksLoading.value = false
    }
  }

  function loadGameLinkState(game: string): Promise<void> {
    if (game === 'cs2') return loadCs2LinkState()
    if (game === 'deadlock') return loadDeadlockLinkState()
    if (game === 'lol') return loadLolLinkState()
    return Promise.resolve()
  }

  /**
   * Load the ACTIVE game's account links first (awaited), then the other games
   * in the background. Previously every game's link state (FACEIT, CS2 profile,
   * Deadlock stats, LoL matches) was fetched on every dashboard mount and game
   * switch, holding all loading flags until the slowest finished — Deadlock
   * alone could take ~48s on a failed auth refresh. Only the active game's panel
   * is visible, so the rest can settle lazily.
   */
  async function loadAllGameLinkStates() {
    const active = primaryGame.value
    await loadGameLinkState(active)
    const others = ['cs2', 'deadlock', 'lol'].filter((g) => g !== active)
    for (const g of others) void loadGameLinkState(g)
  }

  async function syncAuthUserFields() {
    const authUser = await window.api.auth.refreshUser().catch(() => null) as {
      onboarding_target_rank?: string | null
      onboarding_weaknesses?: string[]
    } | null
    onboardingTargetRank.value = authUser?.onboarding_target_rank ?? null
    onboardingWeaknesses.value = authUser?.onboarding_weaknesses ?? []
    await loadFromSettings()
  }

  async function refreshProfile() {
    const prevCount = analyses.value.length
    profileLoading.value = true
    try {
      const prof = await window.api.profile.get()
      profile.value = prof
      if (prof?.latest_stats?.player_card_id) {
        playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
      }
      if (isValorant.value) {
        playstyleProfile.value = await window.api.progress.playstyleProfile().catch(() => null)
        rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
      }
      await loadAllGameLinkStates()
      await syncAuthUserFields()
    } catch { /* ignore */ } finally {
      profileLoading.value = false
    }
    await Promise.all([loadAnalyses(), loadClipCount()])
    if (analyses.value.length > prevCount) {
      const newest = analyses.value[0]
      if (newest?.overall_score != null) {
        if (analysisToastTimer) clearTimeout(analysisToastTimer)
        analysisCompleteToast.value = {
          score: newest.overall_score,
          agent: newest.agent ?? null,
          analysisId: newest.id,
          remaining: quotaRemaining.value,
          limit: profile.value?.user?.analysis_stats?.limit ?? null,
        }
        analysisToastTimer = setTimeout(() => { analysisCompleteToast.value = null }, 5000)
      }
    }
  }

  const FORGE_RANK_COLORS: Record<number, string> = {
    1: '#9ca3af', 2: '#f97316', 3: '#3b82f6', 4: '#8b5cf6',
    5: '#ec4899', 6: '#06b6d4', 7: '#ef4444', 8: '#eab308',
  }
  const FORGE_RANK_GRADIENTS: Record<number, string> = {
    1: 'linear-gradient(135deg,#374151,#1f2937)', 2: 'linear-gradient(135deg,#c2410c,#92400e)',
    3: 'linear-gradient(135deg,#1d4ed8,#1e3a8a)', 4: 'linear-gradient(135deg,#7c3aed,#4c1d95)',
    5: 'linear-gradient(135deg,#db2777,#9d174d)', 6: 'linear-gradient(135deg,#0891b2,#164e63)',
    7: 'linear-gradient(135deg,#dc2626,#7f1d1d)', 8: 'linear-gradient(135deg,#d97706,#78350f)',
  }

  function forgeRankColor(tier: number) { return FORGE_RANK_COLORS[tier] ?? '#9ca3af' }
  function forgeRankGradient(tier: number) { return FORGE_RANK_GRADIENTS[tier] ?? FORGE_RANK_GRADIENTS[1] }
  function forgeRankInitial(tierName: string) { return tierName.charAt(0).toUpperCase() }

  async function triggerPrestige() {
    try {
      await window.api.forgeRank.prestige()
      await refreshProfile()
    } catch { /* ignore */ }
  }

  async function loadPendingRecordings() {
    lastPendingReloadAt = Date.now()
    pendingRecordings.value = await window.api.recordings.get().catch(() => [])
  }

  function schedulePendingReload(force = false) {
    const now = Date.now()
    if (!force && now - lastPendingReloadAt < PENDING_RELOAD_MIN_MS) {
      if (pendingReloadTimer) return
      pendingReloadTimer = setTimeout(() => {
        pendingReloadTimer = null
        void loadPendingRecordings()
      }, PENDING_RELOAD_MIN_MS - (now - lastPendingReloadAt))
      return
    }
    if (pendingReloadTimer) {
      clearTimeout(pendingReloadTimer)
      pendingReloadTimer = null
    }
    void loadPendingRecordings()
  }

  function goWarningAction() {
    if (!warningAction.value) return
    router.push(warningAction.value.route)
    warning.value = null
    warningAction.value = null
  }

  async function uploadAllPending() {
    if (bulkUploading.value || bulkUploadablePending.value.length === 0) return
    const user = profile.value?.user
    if (user && !hasArchiveQuotaRemaining(user.archive_stats, user.tier, user.is_admin)) {
      warning.value = 'Cloud storage limit reached — upgrade for more archived VODs.'
      upgradeNeeded.value = true
      return
    }
    bulkUploading.value = true
    try {
      const result = await window.api.storage.uploadPending()
      if (!result.ok) {
        warning.value = result.error
        setTimeout(() => { warning.value = null }, 12000)
        return
      }
      if (result.stoppedEarly) {
        warning.value = `Uploaded ${result.uploaded} — ${result.stopReason ?? 'analysis limit reached'}`
        upgradeNeeded.value = true
      }
      await loadPendingRecordings()
      await loadAnalyses()
    } catch {
      warning.value = 'Bulk upload failed — try again from Settings → Recording.'
      setTimeout(() => { warning.value = null }, 12000)
    } finally {
      bulkUploading.value = false
    }
  }

  async function saveRecording(id: string) {
    if (savingIds.value.has(id)) return
    const user = profile.value?.user
    if (user && !hasArchiveQuotaRemaining(user.archive_stats, user.tier, user.is_admin)) {
      warning.value = 'Cloud storage limit reached — upgrade for more archived VODs.'
      upgradeNeeded.value = true
      return
    }
    savingIds.value.add(id)
    savingIds.value = new Set(savingIds.value)
    try {
      const result = await window.api.recordings.saveToCloud(id)
      if (!result.ok) {
        warning.value = result.error ?? 'Could not save to cloud'
        if (/archive.limit|cloud storage/i.test(result.error ?? '')) upgradeNeeded.value = true
        setTimeout(() => { warning.value = null }, 12000)
        return
      }
      await loadPendingRecordings()
    } catch {
      warning.value = 'Save to cloud failed — check your connection'
      setTimeout(() => { warning.value = null }, 12000)
    } finally {
      savingIds.value.delete(id)
      savingIds.value = new Set(savingIds.value)
    }
  }

  async function analyseOldestPending() {
    const rec = bulkAnalysablePending.value[0]
    if (!rec) return
    await analyseRecording(rec.id)
  }

  async function retryRecording(id: string) {
    await analyseRecording(id)
  }

  function recUploadProgress(rec: PendingRecording) {
    return recordingUploadProgress(rec, uploadProgressByRecordingId.value)
  }

  function recIsDeferred(rec: PendingRecording) {
    return isRecordingDeferred(rec)
  }

  function recAnalysisReady(rec: PendingRecording) {
    return rec.analysisReadiness?.ready === true
  }

  function recAnalysisBlockedLabel(rec: PendingRecording) {
    if (rec.analysisReadiness?.message) return rec.analysisReadiness.message
    const state = rec.analysisReadiness?.state
    if (state === 'syncing') return 'Syncing match stats…'
    if (state === 'finalizing') return 'Finalizing recording…'
    if (state === 'file_missing') return 'Recording file missing'
    if (state === 'mode_unsupported') return 'Mode not supported for coaching'
    if (state === 'file_unreadable') return 'Recording unreadable'
    return 'Not ready to analyse'
  }

  function recAnalysisStatusShort(rec: PendingRecording) {
    if (
      (rec.game === 'cs2' || rec.game === 'deadlock')
      && demoDownloadProgress.value
      && !recordingTimelineReady(rec.timeline)
    ) {
      return demoDownloadProgressLabel(
        demoDownloadProgress.value,
        rec.game as 'cs2' | 'deadlock',
      )
    }
    const state = rec.analysisReadiness?.state
    if (state === 'syncing') {
      if (rec.analysisReadiness?.message) return rec.analysisReadiness.message
      if (rec.game === 'cs2') return 'Waiting for CS2 demo…'
      if (rec.game === 'deadlock') return 'Waiting for replay…'
      return 'Syncing stats…'
    }
    if (state === 'finalizing') return 'Finalizing…'
    if (state === 'no_deaths' || state === 'mode_unsupported' || state === 'file_missing' || state === 'file_unreadable' || state === 'unavailable') {
      return 'Not ready'
    }
    return recAnalysisBlockedLabel(rec)
  }

  async function analyseRecording(id: string) {
    if (analysingIds.value.has(id)) return
    const rec = pendingRecordings.value.find((r) => r.id === id)
    if (rec && !recAnalysisReady(rec)) {
      const canRetryFromCloud = Boolean(rec.lastAnalysisError && rec.jobId)
      if (!canRetryFromCloud) {
        warning.value = recAnalysisBlockedLabel(rec)
        setTimeout(() => { warning.value = null }, 12000)
        return
      }
    }
    const user = profile.value?.user
    if (user && !hasAnalysisQuotaRemaining(user.analysis_stats, user.tier, user.is_admin)) {
      warning.value = 'No analyses remaining this month.'
      upgradeNeeded.value = true
      return
    }
    analysingIds.value.add(id)
    analysingIds.value = new Set(analysingIds.value)
    const isCloudRetry = Boolean(rec?.lastAnalysisError && rec?.jobId)
    try {
      const result = await window.api.recordings.analyse(id) as { ok?: boolean; error?: string; code?: string }
      if (result?.error) {
        throw new Error(result.error)
      }
      if (isCloudRetry) {
        await loadPendingRecordings()
      } else {
        pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
      }
    } catch (e) {
      analysingIds.value.delete(id)
      analysingIds.value = new Set(analysingIds.value)
      warning.value = e instanceof Error ? e.message : 'Analysis failed — check your connection and try again.'
      setTimeout(() => { warning.value = null }, 12000)
    }
  }

  function dismissMacPreviewBanner() {
    macPreviewDismissed.value = true
    localStorage.setItem('dismissedMacPreviewBanner', '1')
  }

  async function dismissRecording(id: string) {
    const rec = pendingRecordings.value.find(r => r.id === id)
    const msg = rec?.clipsOnly
      ? 'Remove this match from your dashboard? Your clips will stay in the Clips library.'
      : (rec?.cloudUploaded || rec?.jobId || rec?.archiveId)
        ? 'Remove this session from your dashboard? Your cloud copy stays available.'
        : 'Remove this recording from your dashboard and delete the local file?'
    if (rec && !window.confirm(msg)) return
    await window.api.recordings.dismiss(id, { deleteLocal: true }).catch(() => {})
    pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
  }

  async function abortInFlightRecording(id: string) {
    const result = await window.api.recordings.abortInFlight(id).catch(() => ({ ok: false as const }))
    if (!result?.ok) {
      warning.value = 'Could not stop — try again or restart UpForge.'
      setTimeout(() => { warning.value = null }, 8000)
      return
    }
    await loadPendingRecordings()
  }

  async function connectObs() {
    obsConnecting.value = true
    try {
      const result = await window.api.obs.connect()
      if (result.ok) status.value = { ...status.value, obsConnected: true }
      else {
        warning.value = result.error ?? 'Could not connect to OBS'
        setTimeout(() => { warning.value = null }, 12000)
      }
    } finally {
      obsConnecting.value = false
    }
  }

  async function launchAndConnectObs() {
    obsConnecting.value = true
    try {
      const result = await window.api.obs.launchAndConnect()
      if (result.ok) status.value = { ...status.value, obsConnected: true }
      else {
        warning.value = result.error ?? 'Could not launch or connect to OBS'
        setTimeout(() => { warning.value = null }, 12000)
      }
    } finally {
      obsConnecting.value = false
    }
  }

  async function stopRecording() {
    if (stopping.value) return
    stopping.value = true
    try {
      const result = await window.api.recorder.stop()
      if (!result.ok) {
        const msg = result.reason === 'not_recording'
          ? 'Nothing is recording right now.'
          : result.reason === 'already_handled'
            ? 'This match was already finished.'
            : `Could not end match: ${result.reason ?? 'unknown error'}`
        warning.value = msg
        setTimeout(() => { warning.value = null }, 12000)
        stopping.value = false
        return
      }
      status.value = { ...status.value, recording: false, recordingStarting: false, currentQueueMode: null }
      recordingStartedAt.value = null
    } catch {
      warning.value = 'Could not end the match — try again or finish the game normally.'
      setTimeout(() => { warning.value = null }, 12000)
      stopping.value = false
    }
  }

  function simulateGame(game: string, durationMs: number) {
    simulating.value = true
    simStatus.value = `Simulating ${game} for ${durationMs / 1000}s...`
    window.api.dev.simulateGame(game, durationMs)
    setTimeout(() => { simulating.value = false; simStatus.value = 'Done' }, durationMs + 500)
  }

  function openAnalysis(id: number) {
    window.open(`https://upforge.gg/valorant/results/${id}`, '_blank')
  }

  async function openAnalysisRow(a: AnalysisItem) {
    timelineLoadingId.value = a.id
    try {
      await openGameAnalysis(primaryGame.value, a, router)
    } finally {
      timelineLoadingId.value = null
    }
  }

  const WEAKNESS_TO_SCENARIO_DASH: Record<string, string> = {
    flick: 'flick', 'one tap': 'flick', reflex: 'flick', headshot: 'flick',
    accuracy: 'flick', 'first shot': 'flick', aim: 'flick', click: 'flick',
    track: 'tracking', moving: 'tracking', movement: 'tracking', smooth: 'tracking',
    spray: 'microadjust', recoil: 'microadjust', control: 'microadjust',
    crosshair: 'switching', placement: 'switching', switching: 'switching',
    rotate: 'switching', retake: 'switching',
  }

  async function trainLastInsight() {
    if (!lastInsight.value || lastInsightTraining.value) return
    lastInsightTraining.value = true
    try {
      const text = lastInsight.value.text.toLowerCase()
      let scenario = 'flick'
      for (const [keyword, s] of Object.entries(WEAKNESS_TO_SCENARIO_DASH)) {
        if (text.includes(keyword)) { scenario = s; break }
      }
      await window.api.trainer.launch({ scenario, difficulty: 'medium', duration: 60 })
    } catch (e) {
      console.error('[Dashboard] Trainer launch failed:', e)
    } finally {
      lastInsightTraining.value = false
    }
  }

  function openBrowser() {
    openGameHistoryWeb(primaryGame.value)
  }

  function openPlaystyleProfile() {
    window.open('https://upforge.gg/valorant/playstyle', '_blank')
  }

  function openRecordingReview(rec: PendingRecording, mode: 'raw' | 'timeline' = 'timeline') {
    if (mode === 'timeline' && rec.analysisId) {
      void openTimeline(rec.analysisId)
      return
    }
    if (mode === 'timeline' && !canOpenTimeline(rec)) {
      warning.value = recAnalysisBlockedLabel(rec)
      setTimeout(() => { warning.value = null }, 10_000)
      return
    }
    if (!canWatchRawRecording(rec)) {
      warning.value = 'Recording file not available — check Settings → Recording.'
      setTimeout(() => { warning.value = null }, 10_000)
      return
    }
    router.push({ path: '/vod-review', query: { id: rec.id } })
  }

  async function openTimeline(id: number, opts?: { coachNotes?: boolean }) {
    timelineLoadingId.value = id
    try {
      const ok = await openAnalysisVodReview(router, id, { coachNotes: opts?.coachNotes })
      if (!ok) {
        warning.value = 'Timeline data not available for this match.'
        setTimeout(() => { warning.value = null }, 10000)
      }
    } catch {
      warning.value = 'Could not load VOD timeline — try again.'
      setTimeout(() => { warning.value = null }, 10000)
    } finally {
      timelineLoadingId.value = null
    }
  }

  function openRiotSettings() { void openAccountLinkSettings(router, 'valorant') }
  function openAccountSetup() { void openAccountLinkSettings(router, primaryGame.value) }

  function openEmptyCoachingAction() {
    if (isCs2.value || isDeadlock.value) openGameAnalyze(primaryGame.value)
    else if (!status.value.obsConnected) router.push('/settings?tab=recording')
    else {
      warning.value = 'Launch Valorant — UpForge will auto-record your next match.'
      setTimeout(() => { warning.value = null }, 10000)
    }
  }

  function openUpgrade() { window.open('https://upforge.gg/pricing', '_blank') }
  function openPpa() { window.open('https://upforge.gg/valorant/analyze', '_blank') }
  function openBundles() { window.open('https://upforge.gg/pricing#bundles', '_blank') }

  function showBillingError(message: string) {
    warning.value = message
    setTimeout(() => { warning.value = null }, 12000)
  }

  async function openBillingPortal() {
    if (billingPortalLoading.value) return
    billingPortalLoading.value = true
    try {
      const result = await requestBillingPortal()
      if (!result.ok) showBillingError(result.error ?? 'Could not open billing portal.')
    } finally {
      billingPortalLoading.value = false
    }
  }

  const DISK_MIGRATION_HINT_KEY = 'upforge-disk-hint-v1'
  const LOW_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024

  async function maybeShowDiskMigrationHint() {
    try {
      if (localStorage.getItem(DISK_MIGRATION_HINT_KEY)) return
      const [usage, settings] = await Promise.all([
        window.api.storage.getUsage(),
        window.api.settings.get(),
      ])
      if (usage.freeDiskBytes >= LOW_FREE_DISK_BYTES) return
      if (settings.autoDelete && settings.autoAnalyse !== false) return
      localStorage.setItem(DISK_MIGRATION_HINT_KEY, '1')
      const pendingCount = pendingRecordings.value.filter((r) => !r.clipsOnly && !r.cloudArchived).length
      const pendingNote = pendingCount > 0 ? ` (${pendingCount} pending on dashboard)` : ''
      warning.value = settings.autoDelete
        ? `Low disk space${pendingNote} — save pending VODs to cloud in Settings → Recording.`
        : `Low disk space${pendingNote} — turn on Auto-delete after upload so cloud VODs replace local files.`
      warningAction.value = { label: 'Open Settings', route: '/settings?tab=recording' }
    } catch { /* optional */ }
  }

  function openClipsForSession(rec: PendingRecording) {
    const query: Record<string, string> = {}
    if (rec.agent) query.agent = rec.agent
    if (rec.matchId) query.matchId = rec.matchId
    router.push({ path: '/clips', query })
  }

  function recInFlight(rec: PendingRecording) {
    return isRecordingInFlight(rec, uploadProgressByRecordingId.value)
  }

  function recPipelineLabel(rec: PendingRecording) {
    return recordingPipelineLabel(rec, uploadProgressByRecordingId.value)
  }

  function recRowStats(rec: PendingRecording) {
    return recordingRowStats(rec)
  }

  onMounted(async () => {
    try {
      const s = await window.api.app.getStatus()
      isDev.value = s.isDev
      platform.value = s.platform ?? ''
      if (!s.authenticated) {
        router.push(s.firstRun ? '/welcome' : '/login')
        return
      }
      status.value = {
        recording: s.recording,
        recordingStarting: false,
        currentGame: s.currentGame,
        waitingForMatch: s.waitingForMatch ?? false,
        ffmpegOk: s.ffmpegOk !== false,
        obsConnected: s.obsConnected === true,
        recordedModes: s.recordedModes ?? [],
        recordingBackend: 'obs',
        currentQueueMode: s.currentQueueMode ?? null,
      }
      if (s.recording) recordingStartedAt.value = s.recordingStartedAt ?? Date.now()
    } catch {
      router.push('/login')
      return
    }

    const earlySettings = await window.api.settings.get().catch(() => ({ primaryGame: 'valorant' as const }))
    applyFromSettings(earlySettings)

    const [prof, recent, playstyle, pending] = await Promise.all([
      window.api.profile.get().catch(() => null),
      loadGameAnalyses(primaryGame.value, 10).catch(() => [] as AnalysisItem[]),
      isValorant.value
        ? window.api.progress.playstyleProfile().catch(() => null)
        : Promise.resolve(null),
      window.api.recordings.get().catch(() => [] as PendingRecording[]),
    ])

    await syncAuthUserFields()
    profile.value = prof
    profileLoading.value = false
    playstyleProfile.value = playstyle

    if (prof?.latest_stats?.player_card_id) {
      playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
    }

    analyses.value = recent
    pendingRecordings.value = pending
    analysesLoading.value = false
    void loadCoachingSnippets(recent)

    if (isValorant.value) {
      rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
    }
    void loadAllGameLinkStates()

    activityLog.value = await window.api.app.getActivityLog().catch(() => [])

    const hkBindings = await window.api.clips.getHotkeys().catch(() => null) as Record<string, string> | null
    if (hkBindings) hotkeys.value = hkBindings
    await loadClipCount()

    try {
      const hist = await window.api.trainer.getHistory()
      if (hist?.sessions.length) {
        const last = hist.sessions[hist.sessions.length - 1]
        trainerLastSession.value = { score: last.score, scenario: last.scenario, date: last.completed_at }
        trainerSessionCount.value = hist.total
      }
    } catch { /* optional */ }

    if (isValorant.value) {
      try {
        const insights = await window.api.trainer.getCorrelation()
        if (Array.isArray(insights)) correlationInsights.value = insights
      } catch { /* optional */ }
    }

    const savedSettings = await window.api.settings.get().catch(() => null) as ({
      lastInsight?: typeof lastInsight.value
      skillProfile?: SkillProfileSnapshot | null
      skillProfilePrevious?: SkillProfileSnapshot | null
    } | null)
    if (savedSettings?.lastInsight) lastInsight.value = savedSettings.lastInsight
    skillProfile.value = savedSettings?.skillProfile ?? null
    skillProfilePrevious.value = savedSettings?.skillProfilePrevious ?? null
    void maybeShowDiskMigrationHint()
    if (quotaLowWarning.value && !warning.value) {
      warning.value = quotaLowWarning.value
      if (quotaRemaining.value === 0) upgradeNeeded.value = true
    }

    const BACKGROUND_BANNER_KEY = 'upforge-background-upload-banner'

    await achievements.load()
    if (savedSettings?.lastInsight?.score) {
      const newAchs = await achievements.check({ hasAnalysis: true })
      if (newAchs.length) window.__ufAchievementUnlocked?.(newAchs)
    }

    pollInterval = setInterval(async () => {
      if (document.hidden) return
      try {
        const s = await window.api.app.getStatus()
        const wasRecording = status.value.recording
        status.value = {
          recording: s.recording,
          recordingStarting: status.value.recordingStarting,
          currentGame: s.currentGame,
          waitingForMatch: s.waitingForMatch ?? false,
          ffmpegOk: s.ffmpegOk !== false,
          obsConnected: s.obsConnected === true,
          recordedModes: s.recordedModes ?? [],
          recordingBackend: s.recordingBackend ?? status.value.recordingBackend,
          currentQueueMode: s.currentQueueMode ?? null,
        }
        if (s.recording && !wasRecording) recordingStartedAt.value = Date.now()
        if (!s.recording) { recordingStartedAt.value = null; stopping.value = false }
      } catch { /* ignore */ }
    }, 5000)

    durationInterval = setInterval(updateRecordingElapsed, 1000)

    const ipcCleanup: (() => void)[] = []
    ipcCleanup.push(window.api.on('settings:changed', async (...args: unknown[]) => {
      const s = args[0] as { primaryGame?: string } | undefined
      if (!s) return
      const prevGame = primaryGame.value
      applyFromSettings(s)
      if (s.primaryGame && s.primaryGame !== prevGame) {
        await Promise.all([loadAnalyses(), loadClipCount()])
        void loadAllGameLinkStates()
        if (isValorant.value) {
          playstyleProfile.value = await window.api.progress.playstyleProfile().catch(() => null)
          rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
        }
      }
    }))
    ipcCleanup.push(window.api.on('dashboard:refresh', async () => {
      await refreshProfile()
      await loadSkillProfileFromSettings()
      if (isDeadlock.value) await loadAnalyses()
    }))
    ipcCleanup.push(window.api.on('dashboard:last-insight', (...args: unknown[]) => {
      lastInsight.value = args[0] as typeof lastInsight.value
    }))
    ipcCleanup.push(window.api.on('recordings:updated', loadPendingRecordings))
    ipcCleanup.push(window.api.on('dashboard:upload-progress', (...args: unknown[]) => {
      const data = args[0] as { recordingId: string; progress: number }
      if (!data?.recordingId) return
      uploadProgressByRecordingId.value = { ...uploadProgressByRecordingId.value, [data.recordingId]: data.progress }
      if (!sessionStorage.getItem(BACKGROUND_BANNER_KEY)) {
        backgroundWorkBanner.value = true
        sessionStorage.setItem(BACKGROUND_BANNER_KEY, '1')
      }
    }))
    ipcCleanup.push(window.api.on('dashboard:analysis-progress', (...args: unknown[]) => {
      const data = args[0] as { jobId?: string; progress?: number; current_step?: string | null }
      if (!data?.jobId) {
        schedulePendingReload()
        return
      }
      const idx = pendingRecordings.value.findIndex(r => r.jobId === data.jobId)
      if (idx < 0) {
        schedulePendingReload()
        return
      }
      pendingRecordings.value = pendingRecordings.value.map((r, i) =>
        i === idx
          ? {
              ...r,
              pipelineStatus: 'analysing' as const,
              analysisProgress: data.progress ?? r.analysisProgress,
              analysisStep: data.current_step ?? r.analysisStep,
            }
          : r,
      )
    }))
    ipcCleanup.push(window.api.on('dashboard:analysis-failed', (...args: unknown[]) => {
      const data = args[0] as AnalysisErrorPayload
      if (!data?.message) return
      analysisFailure.value = data
      warning.value = data.message
      if (analysisFailureTimer) clearTimeout(analysisFailureTimer)
      analysisFailureTimer = setTimeout(() => {
        analysisFailure.value = null
        if (warning.value === data.message) warning.value = null
      }, 20_000)
      void loadPendingRecordings()
    }))
    ipcCleanup.push(window.api.on('app:activity-log', (...args: unknown[]) => {
      activityLog.value = args[0] as { time: number; message: string; game?: string }[]
    }))
    ipcCleanup.push(window.api.on('post-game:demo-status', (...args: unknown[]) => {
      const payload = args[0] as { status?: string }
      if (payload?.status === 'complete' && isDeadlock.value) void loadAnalyses()
    }))
    ipcCleanup.push(window.api.on('post-game:demo-download-progress', (...args: unknown[]) => {
      demoDownloadProgress.value = (args[0] as DemoDownloadProgress | null) ?? null
    }))
    ipcCleanup.push(window.api.on('app:activity-toast', (...args: unknown[]) => {
      const data = args[0] as { message?: string }
      if (!data?.message) return
      activityToast.value = data.message
      if (activityToastTimer) clearTimeout(activityToastTimer)
      activityToastTimer = setTimeout(() => { activityToast.value = null }, 8000)
    }))
    ipcCleanup.push(window.api.on('dashboard:open-latest-analysis', (...args: unknown[]) => {
      const data = args[0] as { analysisId?: number }
      if (data?.analysisId != null) void openAnalysis(data.analysisId)
    }))
    ipcCleanup.push(window.api.on('dashboard:analyse-recording', (...args: unknown[]) => {
      const data = args[0] as { id?: string }
      if (data?.id) void analyseRecording(data.id)
    }))
    ipcCleanup.push(window.api.on('app:ffmpeg-status', (...args: unknown[]) => {
      const data = args[0] as { ok: boolean }
      status.value = { ...status.value, ffmpegOk: data.ok }
    }))
    ipcCleanup.push(window.api.on('obs:connection-changed', (...args: unknown[]) => {
      const data = args[0] as { connected?: boolean }
      if (typeof data?.connected === 'boolean') status.value = { ...status.value, obsConnected: data.connected }
    }))
    ipcCleanup.push(window.api.on('recording:status-changed', (...args: unknown[]) => {
      const data = args[0] as { recording: boolean; error: string | null }
      const wasRecording = status.value.recording
      status.value = { ...status.value, recording: data.recording, recordingStarting: false }
      if (data.recording && !wasRecording) recordingStartedAt.value = Date.now()
      if (!data.recording) { recordingStartedAt.value = null; stopping.value = false }
      if (!data.recording && data.error) {
        warning.value = `Recording stopped: ${data.error}`
        setTimeout(() => { warning.value = null }, 15000)
      }
    }))
    ipcCleanup.push(window.api.on('recording:starting', (...args: unknown[]) => {
      const data = args[0] as { starting: boolean }
      status.value = { ...status.value, recordingStarting: data.starting }
    }))
    ipcCleanup.push(window.api.on('app:warning', (...args: unknown[]) => {
      const data = args[0] as { message: string; actionLabel?: string; actionRoute?: string }
      warning.value = data.message
      warningAction.value = data.actionLabel && data.actionRoute
        ? { label: data.actionLabel, route: data.actionRoute }
        : null
      setTimeout(() => { warning.value = null; warningAction.value = null }, 15000)
    }))
    ipcCleanup.push(window.api.on('analysis:timeout', () => {
      warning.value = 'Clip analysis timed out — please try re-submitting from the Clips tab.'
      setTimeout(() => { warning.value = null }, 12000)
    }))
    ipcCleanup.push(window.api.on('recording:waiting-for-match', (...args: unknown[]) => {
      const data = args[0] as { waiting: boolean }
      status.value = { ...status.value, waitingForMatch: data.waiting }
    }))
    ipcCleanup.push(window.api.on('auth:session-expired', () => { router.push('/login') }))
    ipcCleanup.push(window.api.on('app:hotkey-status', (...args: unknown[]) => {
      const data = args[0] as { saveClipRegistered: boolean }
      if (!data.saveClipRegistered) {
        const hk = hotkeys.value['save-clip'] || 'F9'
        warning.value = `Clip hotkey (${hk}) failed to register — another app may be using it.`
        setTimeout(() => { warning.value = null }, 15000)
      }
    }))
    ;(window as Window & { _dashboardIpcCleanup?: (() => void)[] })._dashboardIpcCleanup = ipcCleanup
  })

  onUnmounted(() => {
    clearInterval(pollInterval)
    clearInterval(durationInterval)
    recordingStartedAt.value = null
    recordingElapsed.value = ''
    const cleanup = (window as Window & { _dashboardIpcCleanup?: (() => void)[] })._dashboardIpcCleanup
    cleanup?.forEach(fn => fn())
    delete (window as Window & { _dashboardIpcCleanup?: (() => void)[] })._dashboardIpcCleanup
  })

  return {
    router,
    primaryGame,
    isValorant,
    isCs2,
    isDeadlock,
    isLol,
    theme,
    profile,
    profileLoading,
    onboardingTargetRank,
    onboardingWeaknesses,
    cs2FaceitConnection,
    cs2Profile,
    cs2SteamName,
    cs2LinksLoading,
    deadlockLinked,
    deadlockStats,
    deadlockLinksLoading,
    lolRecentMatches,
    lolLinksLoading,
    playerCardUrl,
    analyses,
    analysesLoading,
    coachingSnippets,
    coachReviewByAnalysisId,
    pendingRecordings,
    analysingIds,
    savingIds,
    status,
    isDev,
    platform,
    showMacPreviewBanner,
    clipCount,
    isAdmin,
    paymentPastDue,
    billingPortalLoading,
    dashboardHeadline,
    emptyCoachingTitle,
    emptyCoachingMessage,
    emptyCoachingAction,
    goalsRankIcon,
    dashboardRankLabel,
    totalSessionsAnalysed,
    devOpen,
    simulating,
    simStatus,
    recordingElapsed,
    stopping,
    obsConnecting,
    showRankHistory,
    warning,
    warningAction,
    bulkUploading,
    rrHistory,
    rrSparkline,
    upgradeNeeded,
    activityLog,
    lastInsight,
    lastInsightTraining,
    trainerLastSession,
    trainerSessionCount,
    analysisCompleteToast,
    analysisFailure,
    activityToast,
    backgroundWorkBanner,
    archiveRetentionNudge,
    dismissArchiveRetentionNudge,
    correlationInsights,
    playstyleProfile,
    skillProfile,
    skillProfilePrevious,
    playerRankName,
    leftInsightIndex,
    rightInsightIndex,
    leftInsightPanels,
    rightInsightPanels,
    lastFivePerf,
    sessionReview,
    weeklyFocus,
    topAgents,
    dashboardAnalyses,
    bulkUploadablePending,
    bulkAnalysablePending,
    inFlightUploadCount,
    inFlightAnalysisCount,
    deferredUploadCount,
    quotaRemaining,
    quotaLowWarning,
    groupedAnalyses,
    quotaPercent,
    archiveQuotaPercent,
    avgScore,
    scoreTrend,
    scoreChartData,
    currentStreak,
    formatMode,
    formatEntryDate,
    rrDelta,
    formatLogTime,
    logEntryColor,
    clearLog,
    formatActivityLogText,
    copyActivityLog,
    forgeRankColor,
    forgeRankGradient,
    forgeRankInitial,
    getMasteryIconUrl,
    triggerPrestige,
    goWarningAction,
    uploadAllPending,
    analyseOldestPending,
    retryRecording,
    saveRecording,
    analyseRecording,
    dismissMacPreviewBanner,
    dismissRecording,
    removeAnalysis,
    abortInFlightRecording,
    connectObs,
    launchAndConnectObs,
    stopRecording,
    simulateGame,
    openAnalysis,
    openAnalysisRow,
    openCoachNotesVod,
    openClipsForSession,
    openTimeline,
    timelineLoadingId,
    trainLastInsight,
    openBrowser,
    openPlaystyleProfile,
    openRecordingReview,
    openRiotSettings,
    openAccountSetup,
    openEmptyCoachingAction,
    openUpgrade,
    openPpa,
    openBundles,
    showBillingError,
    openBillingPortal,
    refreshProfile,
    recInFlight,
    recIsDeferred,
    recAnalysisReady,
    recAnalysisBlockedLabel,
    recAnalysisStatusShort,
    recUploadProgress,
    recPipelineLabel,
    recRowStats,
    demoDownloadProgress,
    displayAcs,
    isAnalysisProcessing,
  }
}
