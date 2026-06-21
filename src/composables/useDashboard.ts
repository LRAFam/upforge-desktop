import { ref, computed, inject, provide, onMounted, onUnmounted, type InjectionKey } from 'vue'
import { useRouter } from 'vue-router'
import type { ProfileData, AnalysisItem, PendingRecording, ClipRecord } from '../env.d.ts'
import { formatGameMode } from '../lib/valorant'
import { getMasteryIconUrl } from '../lib/rank-assets'
import { hasAnalysisQuotaRemaining, hasArchiveQuotaRemaining, isPlatformAdmin } from '../lib/tier-features'
import { pendingTimeline } from '../stores/pendingTimeline'
import { useAchievements } from './useAchievements'
import type { CarouselPanel } from '../components/PanelCarousel.vue'
import type { SkillProfileSnapshot } from '../lib/skill-profile'
import { isPaymentPastDue, openBillingPortal as requestBillingPortal } from '../lib/billing'
import { usePrimaryGame } from './usePrimaryGame'
import { gameTheme, type GameTheme } from '../lib/game-themes'
import { loadGameAnalyses, openGameAnalysis, openGameHistoryWeb, openGameAnalyze } from '../lib/game-modules'
import { getCs2RankIconUrl, getFaceitLevelIconUrl, type Cs2FaceitConnection } from '../lib/cs2'
import { getDeadlockRankIconUrl } from '../lib/deadlock'
import {
  displayAcs,
  isAnalysisProcessing,
  isRecordingInFlight,
  recordingPipelineLabel,
  recordingRowStats,
} from '../lib/dashboard-match-row'

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
  const { primaryGame, isValorant, isCs2, isDeadlock, loadFromSettings, applyFromSettings } = usePrimaryGame()

  const theme = computed<GameTheme>(() => gameTheme(primaryGame.value))

  const profile = ref<ProfileData | null>(null)
  const profileLoading = ref(true)
  const onboardingTargetRank = ref<string | null>(null)
  const onboardingWeaknesses = ref<string[]>([])
  const cs2FaceitConnection = ref<Cs2FaceitConnection | null>(null)
  const playerCardUrl = ref('')
  const analyses = ref<AnalysisItem[]>([])
  const analysesLoading = ref(true)
  const coachingSnippets = ref<Record<number, string>>({})
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

  const dashboardHeadline = computed(() =>
    profile.value?.user?.name ? `Welcome back, ${profile.value.user.name}` : 'Your coaching dashboard',
  )
  const emptyCoachingTitle = computed(() => theme.value.coachingEmptyTitle)
  const emptyCoachingMessage = computed(() =>
    theme.value.coachingEmptyMessage({ obsConnected: status.value.obsConnected }),
  )
  const emptyCoachingAction = computed(() =>
    theme.value.coachingEmptyAction({ obsConnected: status.value.obsConnected }),
  )
  const goalsRankIcon = computed(() => {
    if (!onboardingTargetRank.value) return null
    if (isCs2.value) return getCs2RankIconUrl(onboardingTargetRank.value)
    if (isDeadlock.value) return getDeadlockRankIconUrl(onboardingTargetRank.value)
    return null
  })
  const dashboardRankLabel = computed(() => {
    if (isCs2.value) {
      if (cs2FaceitConnection.value?.connected) {
        const nick = cs2FaceitConnection.value.nickname
        const lvl = cs2FaceitConnection.value.level
        if (nick && lvl != null) return `${nick} · Lv ${lvl}`
        if (nick) return nick
      }
      return onboardingTargetRank.value || theme.value.rankFallback
    }
    if (isDeadlock.value) return onboardingTargetRank.value || theme.value.rankFallback
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
  const activityLog = ref<{ time: number; message: string }[]>([])
  const lastInsight = ref<{ text: string; score: number; agent: string | null; analysisId: number | null; date: string } | null>(null)
  const lastInsightTraining = ref(false)
  const trainerLastSession = ref<{ score: number; scenario: string; date: string } | null>(null)
  const trainerSessionCount = ref(0)
  const analysisCompleteToast = ref<{ score: number; agent: string | null } | null>(null)
  let analysisToastTimer: ReturnType<typeof setTimeout> | null = null

  const correlationInsights = ref<string[]>([])
  const playstyleProfile = ref<{
    matches_tracked: number
    last_match_at: string | null
    metrics: Record<string, unknown>
    focus_areas: Array<{ id: string; category: string; text: string; severity: 'low' | 'medium' | 'high' }>
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
    if (isValorant.value && playstyleProfile.value && playstyleProfile.value.matches_tracked > 0) {
      panels.push({ id: 'playstyle', label: 'Playstyle', accent: 'bg-violet-500' })
    }
    if (isValorant.value && skillProfile.value) {
      panels.push({ id: 'skills', label: 'Skills', accent: 'bg-emerald-500' })
    }
    if ((isCs2.value || isDeadlock.value) && (onboardingTargetRank.value || onboardingWeaknesses.value.length)) {
      panels.push({ id: 'goals', label: 'Goals', accent: isCs2.value ? 'bg-orange-500' : 'bg-teal-500' })
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
    return analyses.value.filter(a => !a.job_id || !inFlightJobIds.has(a.job_id))
  })

  const bulkUploadablePending = computed(() =>
    pendingRecordings.value.filter(r => !r.clipsOnly && !isRecordingInFlight(r, uploadProgressByRecordingId.value) && !r.cloudArchived),
  )

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

  async function loadClipCount() {
    clipCount.value = (await window.api.clips.get().catch(() => [] as ClipRecord[])).length
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
      void loadCoachingSnippets(analyses.value)
    } catch {
      analyses.value = []
    } finally {
      analysesLoading.value = false
    }
  }

  async function loadCoachingSnippets(items: AnalysisItem[]) {
    const toFetch = items.filter(a => !isAnalysisProcessing(a) && !coachingSnippets.value[a.id])
    await Promise.all(toFetch.map(async (a) => {
      const detail = await window.api.analyses.getDetail(a.id).catch(() => null)
      const snippet = detail?.top_issue ?? detail?.priority_improvements?.[0] ?? detail?.verdict ?? null
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
      if (isCs2.value) await loadCs2Faceit()
      await syncAuthUserFields()
    } catch { /* ignore */ } finally {
      profileLoading.value = false
    }
    await Promise.all([loadAnalyses(), loadClipCount()])
    if (analyses.value.length > prevCount) {
      const newest = analyses.value[0]
      if (newest?.overall_score != null) {
        if (analysisToastTimer) clearTimeout(analysisToastTimer)
        analysisCompleteToast.value = { score: newest.overall_score, agent: newest.agent ?? null }
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
    pendingRecordings.value = await window.api.recordings.get().catch(() => [])
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
    if (user && !hasAnalysisQuotaRemaining(user.analysis_stats, user.tier, user.is_admin)) {
      warning.value = 'No analyses remaining this month.'
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

  async function analyseRecording(id: string) {
    if (analysingIds.value.has(id)) return
    const user = profile.value?.user
    if (user && !hasAnalysisQuotaRemaining(user.analysis_stats, user.tier, user.is_admin)) {
      warning.value = 'No analyses remaining this month.'
      upgradeNeeded.value = true
      return
    }
    analysingIds.value.add(id)
    analysingIds.value = new Set(analysingIds.value)
    try {
      await window.api.recordings.analyse(id)
      pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
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
      : 'Remove this recording from your dashboard and delete the local file?'
    if (rec && !window.confirm(msg)) return
    await window.api.recordings.dismiss(id, { deleteLocal: true }).catch(() => {})
    pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
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

  function openRecordingReview(rec: PendingRecording) {
    if (rec.analysisId) {
      void openTimeline(rec.analysisId)
      return
    }
    router.push({ path: '/vod-review', query: { id: rec.id } })
  }

  async function openTimeline(id: number) {
    timelineLoadingId.value = id
    try {
      const data = await window.api.analyses.getTimeline(id)
      if (!data) {
        warning.value = 'Timeline data not available for this match.'
        setTimeout(() => { warning.value = null }, 10000)
        return
      }
      pendingTimeline.value = data
      router.push({ path: '/vod-review', query: { timelineId: String(id) } })
    } catch {
      warning.value = 'Could not load VOD timeline — try again.'
      setTimeout(() => { warning.value = null }, 10000)
    } finally {
      timelineLoadingId.value = null
    }
  }

  function openRiotSettings() { window.open('https://upforge.gg/settings/profile', '_blank') }
  function openAccountSetup() { window.open('https://upforge.gg/onboarding', '_blank') }

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
      warning.value = settings.autoDelete
        ? 'Low disk space — upload pending VODs in Settings → Recording to move them to the cloud and free space.'
        : 'Low disk space — turn on Auto-delete after upload in Settings so cloud VODs replace local files on your drive.'
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

    const [prof, recent, playstyle] = await Promise.all([
      window.api.profile.get().catch(() => null),
      loadGameAnalyses(primaryGame.value, 10).catch(() => [] as AnalysisItem[]),
      isValorant.value
        ? window.api.progress.playstyleProfile().catch(() => null)
        : Promise.resolve(null),
    ])

    await syncAuthUserFields()
    profile.value = prof
    profileLoading.value = false
    playstyleProfile.value = playstyle

    if (prof?.latest_stats?.player_card_id) {
      playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
    }

    analyses.value = recent
    analysesLoading.value = false
    void loadCoachingSnippets(recent)

    if (isValorant.value) {
      rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
    }
    if (isCs2.value) await loadCs2Faceit()

    pendingRecordings.value = await window.api.recordings.get().catch(() => [])
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
        await loadAnalyses()
        if (isValorant.value) {
          playstyleProfile.value = await window.api.progress.playstyleProfile().catch(() => null)
          rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
        } else if (isCs2.value) {
          await loadCs2Faceit()
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
    }))
    ipcCleanup.push(window.api.on('dashboard:analysis-progress', () => { void loadPendingRecordings() }))
    ipcCleanup.push(window.api.on('post-game:demo-status', (...args: unknown[]) => {
      const payload = args[0] as { status?: string }
      if (payload?.status === 'complete' && isDeadlock.value) void loadAnalyses()
    }))
    ipcCleanup.push(window.api.on('app:activity-log', (...args: unknown[]) => {
      activityLog.value = args[0] as { time: number; message: string }[]
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
    theme,
    profile,
    profileLoading,
    onboardingTargetRank,
    onboardingWeaknesses,
    playerCardUrl,
    analyses,
    analysesLoading,
    coachingSnippets,
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
    topAgents,
    dashboardAnalyses,
    bulkUploadablePending,
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
    forgeRankColor,
    forgeRankGradient,
    forgeRankInitial,
    getMasteryIconUrl,
    triggerPrestige,
    goWarningAction,
    uploadAllPending,
    saveRecording,
    analyseRecording,
    dismissMacPreviewBanner,
    dismissRecording,
    connectObs,
    launchAndConnectObs,
    stopRecording,
    simulateGame,
    openAnalysis,
    openAnalysisRow,
    trainLastInsight,
    openBrowser,
    openPlaystyleProfile,
    openRecordingReview,
    openRiotSettings,
    openAccountSetup,
    openEmptyCoachingAction,
    openUpgrade,
    openPpa,
    showBillingError,
    openBillingPortal,
    refreshProfile,
    recInFlight,
    recPipelineLabel,
    recRowStats,
    displayAcs,
    isAnalysisProcessing,
  }
}
