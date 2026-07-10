import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject, provide, type InjectionKey } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getWeaponImage, getAgentImage, getAbilityIcon, getMapImage, getAgentColor, formatGameMode, normalizeGameModeId } from '../lib/valorant'
import { pendingTimeline } from '../stores/pendingTimeline'
import { buildTacticalIntelBrief } from '../lib/coaching-brief'
import type { CoachingEvidence } from '../lib/coaching-brief'
import type { MatchSpatialSummary, SpatialTimelineEvent } from '../lib/spatial-types'
import type { DuelMoment, DuelMomentManifest } from '../lib/duel-moments'
import { normalizeDuelMoments } from '../lib/duel-moments'
import {
  buildReplaySpatialSummary,
  findSpatialEventAtPlayback,
  spatialEventToastLabel,
} from '../lib/spatial-replay-sync'
import { canSpatialVodSeek } from '../lib/tier-features'
import { roundOutcomeIcon as resolveRoundOutcomeIcon, timelineEventIcon as resolveTimelineEventIcon, spikeEventIcon as resolveSpikeEventIcon } from '../lib/timeline-event-icons'
import {
  isAbilityKill,
  killSourceImage,
  killSourceLabel,
  resolveKillSourceFields,
} from '../lib/match-kill-display'
import { isWeaponName } from '../lib/valorant-ability-images'

// Round outcome icons — game-aware via timeline-event-icons.ts

interface KillEvent {
  killerName: string
  victimName: string
  assistants?: string[]
  weapon?: string
  abilitySlot?: 'grenade' | 'ability1' | 'ability2' | 'ultimate'
  finishingDamage?: {
    damageType?: string
    damageItem?: string
  }
  videoOffsetMs?: number
  round?: number
  type?: 'kill' | 'death'
  killerPuuid?: string
  victimPuuid?: string
}

interface TimelineEvent extends Omit<KillEvent, 'type'> {
  type: 'kill' | 'death' | 'neutral' | 'plant' | 'defuse' | 'detonation'
  isFirstBlood?: boolean
  // Spike-specific fields
  planter?: string
  defuser?: string
  site?: string
}

interface RoundGroup {
  roundNumber: number
  won: boolean
  spikePlanted: boolean
  spikeDefused: boolean
  spikeDetonated: boolean
  ceremony: string | null
  firstVideoOffsetMs: number | null
  events: TimelineEvent[]
}

interface RoundSummary {
  roundNumber: number
  winningTeam: string | null
  spikePlanted: boolean
  spikeDefused: boolean
  spikeDetonated?: boolean
  ceremony?: string | null
}

interface FinalStats {
  kills: number
  deaths: number
  assists: number
  won?: boolean
}

interface TeamPlayerSnapshot {
  summonerName: string
  agent: string | null
  team: string
  kills: number
  deaths: number
  assists: number
  score: number
  level: number
  puuid: string | null
  competitiveTier: number
  competitiveTierName: string
  abilityCasts: { grenade: number; ability1: number; ability2: number; ultimate: number } | null
}

interface RecordingTimeline {
  id: string
  jobId?: string | null
  analysisId?: number | null
  archiveId?: string | null
  videoPath: string | null
  localFileMissing?: boolean
  hasLocalFile?: boolean
  uploadedToCloud?: boolean
  cloudUploaded?: boolean
  map: string | null
  agent: string | null
  game: string
  gameMode: string
  recordedAt: number
  kills: KillEvent[]
  deaths: KillEvent[]
  roundSummaries: RoundSummary[]
  finalStats: FinalStats | null
  finalScore?: { allyScore: number; enemyScore: number } | null
  teamSnapshot: TeamPlayerSnapshot[]
  spikePlants?: Array<{ videoOffsetMs?: number; round?: number; planter?: string; site?: string }>
  spikeDefuses?: Array<{ videoOffsetMs?: number; round?: number; defuser?: string }>
  spikeDetonations?: Array<{ videoOffsetMs?: number; round?: number }>
  firstBloods?: Array<{ killerName: string; victimName: string; killerPuuid?: string; victimPuuid?: string; round?: number }>
  spatialSummary?: MatchSpatialSummary | null
  duelMoments?: DuelMomentManifest[]
  videoSyncOffsetMs?: number
}

interface AnalysisDetail {
  verdict: string | null
  top_issue: string | null
  priority_improvements: string[]
  coaching_tags: string[]
  ally_score: number | null
  enemy_score: number | null
  duel_moments?: DuelMoment[] | null
}

interface ProgressMarker {
  key: string
  kind: 'round' | 'kill' | 'death' | 'neutral' | 'plant' | 'defuse' | 'detonation'
  label: string
  percent: number
  timeSeconds: number
}

export const VOD_REVIEW_KEY: InjectionKey<ReturnType<typeof createVodReview>> = Symbol('vodReview')

export function provideVodReview() {
  const ctx = createVodReview()
  provide(VOD_REVIEW_KEY, ctx)
  return ctx
}

export function useVodReview() {
  const ctx = inject(VOD_REVIEW_KEY)
  if (!ctx) throw new Error('useVodReview() must be used within VODReviewView')
  return ctx
}

function createVodReview() {
  const route = useRoute()
  const router = useRouter()
  const videoEl = ref<HTMLVideoElement | null>(null)
  const videoAreaEl = ref<HTMLElement | null>(null)
  const videoFrameEl = ref<HTMLElement | null>(null)
  const sidebarEl = ref<HTMLElement | null>(null)
  const theaterMode = ref(false)
  const isFullscreen = ref(false)
  const videoAspect = ref(16 / 9)
  const videoFrameSize = ref({ width: 0, height: 0 })
  let videoAreaObserver: ResizeObserver | null = null
  
  const timeline = ref<RecordingTimeline | null>(null)
  const reviewGame = computed(() => timeline.value?.game ?? null)
  const isCs2Review = computed(() => reviewGame.value === 'cs2')
  const timelineLoading = ref(true)
  const timelineError = ref<string | null>(null)
  const showShortcuts = ref(false)
  
  const baseShortcutLegend = [
    { key: 'Space', label: 'Play / pause' },
    { key: '← / →', label: 'Skip 5s (Shift: 1s)' },
    { key: 'J / L', label: 'Prev / next event' },
    { key: '[ / ]', label: 'Slower / faster' },
    { key: 'T', label: 'Theater mode' },
    { key: 'F', label: 'Fullscreen' },
    { key: 'M', label: 'Toggle intel map' },
    { key: 'B', label: 'Round log panel' },
    { key: 'N', label: 'Review notes' },
    { key: 'V', label: 'Mute / unmute' },
    { key: 'S', label: 'Scoreboard' },
    { key: 'R', label: 'Round detail' },
    { key: 'Esc', label: 'Back / exit' },
    { key: '?', label: 'This help' },
  ]
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const trimModalOpen = ref(false)
  const trimStartSec = ref(0)
  const trimEndSec = ref(0)
  const trimLoading = ref(false)
  const trimError = ref<string | null>(null)
  const initialSeekDone = ref(false)
  const hoverTime = ref<number | null>(null)
  const playbackSpeed = ref(1)
  const videoSeeking = ref(false)
  const videoBuffering = ref(false)
  const activeEventNotif = ref<TimelineEvent | null>(null)
  let spatialNotifTimer: ReturnType<typeof setTimeout> | null = null
  const showScoreboard = ref(false)
  const showInsightsPanel = ref(false)
  const activeCoachNoteId = ref<number | null>(null)
  const SPATIAL_MAP_VISIBLE_KEY = 'upforge_vod_map_visible'
  const SPATIAL_MAP_LARGE_KEY = 'upforge_vod_map_large'
  const SPATIAL_HUD_VISIBLE_KEY = 'upforge_vod_spatial_hud'
  const SPATIAL_REPLAY_SYNC_KEY = 'upforge_spatial_replay_sync'
  const THEATER_MODE_KEY = 'upforge_vod_theater_mode'
  const ROUND_LOG_COLLAPSED_KEY = 'upforge_vod_round_log_collapsed'
  const PLAYBACK_POS_PREFIX = 'upforge_vod_pos:'
  const PLAYBACK_MUTE_KEY = 'upforge_vod_muted'
  
  const spatialMapVisible = ref(false)
  const spatialMapLarge = ref(false)
  const spatialHudVisible = ref(true)
  const spatialReplaySync = ref(true)
  const roundLogCollapsed = ref(false)
  const roundLogFilter = ref<'all' | 'mine'>('mine')
  const expandedRoundNumber = ref<number | null>(null)
  const isMuted = ref(false)
  const dockChipsEl = ref<HTMLElement | null>(null)
  const activeSpatialIndex = ref<number | null>(null)
  const activeSpatialNotif = ref<SpatialTimelineEvent | null>(null)
  const recordingId = ref<string | null>(null)
  const playbackRefreshing = ref(false)
  const playbackError = ref<string | null>(null)
  const userTier = ref('free')
  const SPATIAL_PREVIEW_KEY = 'upforge_spatial_seek_preview_used'
  
  const canSeekFromSpatial = computed(() => canSpatialVodSeek(userTier.value))
  const spatialPreviewUsed = ref(false)
  const spatialPreviewAvailable = computed(() =>
    !canSeekFromSpatial.value && !spatialPreviewUsed.value,
  )
  
  const spatialModes = [
    { id: 'heat' as const, label: 'Heat' },
    { id: 'sites' as const, label: 'Sites' },
    { id: 'peek' as const, label: 'Peek' },
    { id: 'dots' as const, label: 'Dots' },
  ]
  
  function loadSpatialPreviewState() {
    try {
      spatialPreviewUsed.value = localStorage.getItem(SPATIAL_PREVIEW_KEY) === '1'
    } catch {
      spatialPreviewUsed.value = false
    }
  }
  
  function loadSpatialUiPrefs() {
    try {
      const vis = localStorage.getItem(SPATIAL_MAP_VISIBLE_KEY)
      if (vis !== null) spatialMapVisible.value = vis === '1'
      const large = localStorage.getItem(SPATIAL_MAP_LARGE_KEY)
      if (large !== null) spatialMapLarge.value = large === '1'
      const hud = localStorage.getItem(SPATIAL_HUD_VISIBLE_KEY)
      if (hud !== null) spatialHudVisible.value = hud === '1'
      const replay = localStorage.getItem(SPATIAL_REPLAY_SYNC_KEY)
      if (replay !== null) spatialReplaySync.value = replay === '1'
      const theater = localStorage.getItem(THEATER_MODE_KEY)
      if (theater !== null) theaterMode.value = theater === '1'
      const logCollapsed = localStorage.getItem(ROUND_LOG_COLLAPSED_KEY)
      if (logCollapsed !== null) roundLogCollapsed.value = logCollapsed === '1'
      const muted = localStorage.getItem(PLAYBACK_MUTE_KEY)
      if (muted !== null) isMuted.value = muted === '1'
    } catch { /* ignore */ }
  }
  
  watch(spatialMapVisible, (v) => {
    try { localStorage.setItem(SPATIAL_MAP_VISIBLE_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(spatialMapLarge, (v) => {
    try { localStorage.setItem(SPATIAL_MAP_LARGE_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(spatialHudVisible, (v) => {
    try { localStorage.setItem(SPATIAL_HUD_VISIBLE_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(spatialReplaySync, (v) => {
    try { localStorage.setItem(SPATIAL_REPLAY_SYNC_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(theaterMode, (v) => {
    try { localStorage.setItem(THEATER_MODE_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(roundLogCollapsed, (v) => {
    try { localStorage.setItem(ROUND_LOG_COLLAPSED_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(isMuted, (v) => {
    if (videoEl.value) videoEl.value.muted = v
    try { localStorage.setItem(PLAYBACK_MUTE_KEY, v ? '1' : '0') } catch { /* ignore */ }
  })
  
  watch(activeSpatialIndex, () => {
    nextTick(() => {
      if (activeSpatialIndex.value == null || !dockChipsEl.value) return
      const chip = dockChipsEl.value.querySelector(`[data-spatial-chip="${activeSpatialIndex.value}"]`)
      chip?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    })
  })
  
  function markSpatialPreviewUsed() {
    spatialPreviewUsed.value = true
    try {
      localStorage.setItem(SPATIAL_PREVIEW_KEY, '1')
    } catch { /* ignore */ }
  }
  const spatialViewMode = ref<'heat' | 'sites' | 'peek' | 'dots'>('heat')
  const spatialRoundFilter = ref<number | null>(null)
  const videoSyncOffsetMs = ref(0)
  const selectedRound = ref<RoundGroup | null>(null)
  const roundDetailExpanded = ref(false)
  const coachingDetail = ref<AnalysisDetail | null>(null)
  const activeDuelMomentId = ref<string | null>(null)
  const coachReview = ref<{
    id: number
    status: string
    student_question: string | null
    coach_perspective?: string | null
    coach?: { display_name: string }
    annotations: Array<{
      id: number
      round_number: number | null
      video_offset_ms: number | null
      body: string
    }>
  } | null>(null)
  const ownPuuid = ref<string | null>(null)
  let notifTimer: ReturnType<typeof setTimeout> | null = null
  
  // ── Cursor auto-hide ──────────────────────────────────────────────────────────
  const cursorHidden = ref(false)
  let cursorHideTimer: ReturnType<typeof setTimeout> | null = null
  
  function onVideoMouseMove() {
    cursorHidden.value = false
    if (cursorHideTimer) clearTimeout(cursorHideTimer)
    if (isPlaying.value) {
      cursorHideTimer = setTimeout(() => { cursorHidden.value = true }, 2500)
    }
  }
  
  watch(isPlaying, (playing) => {
    if (!playing) {
      cursorHidden.value = false
      if (cursorHideTimer) { clearTimeout(cursorHideTimer); cursorHideTimer = null }
    }
  })
  
  // Weapon icon URLs — delegate to shared valorant.ts helper
  function getWeaponIcon(weapon: string): string | undefined {
    return getWeaponImage(weapon) || undefined
  }
  
  const abilityCastSlots = [
    { key: 'grenade' as const, slot: 'grenade' as const, label: 'C ability' },
    { key: 'ability1' as const, slot: 'ability1' as const, label: 'Q ability' },
    { key: 'ability2' as const, slot: 'ability2' as const, label: 'E ability' },
    { key: 'ultimate' as const, slot: 'ultimate' as const, label: 'Ultimate' },
  ]
  
  /** Returns an ability icon URL for a kill event where weapon is Ability/Ultimate. */
  function getAbilityKillIcon(event: TimelineEvent): string {
    const killerAgent = agentByPuuid(event.killerPuuid)
    return killSourceImage(
      {
        weapon: event.weapon,
        abilitySlot: event.abilitySlot,
        killerAgent,
        finishingDamage: event.finishingDamage,
      },
      getWeaponImage,
    )
  }

  function getEventSourceImage(event: TimelineEvent): string | undefined {
    if (event.type !== 'kill' && event.type !== 'death') return undefined
    const killerAgent = agentByPuuid(event.killerPuuid)
    const resolved = resolveKillSourceFields({
      weapon: event.weapon,
      abilitySlot: event.abilitySlot,
      killerAgent,
      finishingDamage: event.finishingDamage,
    })
    if (resolved.weapon && isWeaponName(resolved.weapon)) {
      const gun = getWeaponImage(resolved.weapon)
      if (gun) return gun
    }
    if (isAbilityKill({ weapon: event.weapon, abilitySlot: event.abilitySlot, killerAgent, finishingDamage: event.finishingDamage })) {
      const ability = getAbilityKillIcon(event)
      if (ability) return ability
    }
    return undefined
  }

  function getKillSourceLabel(event: TimelineEvent): string | null {
    return killSourceLabel({
      weapon: event.weapon,
      abilitySlot: event.abilitySlot,
      killerAgent: agentByPuuid(event.killerPuuid),
      finishingDamage: event.finishingDamage,
    })
  }

  function nearEventHighlightClass(event: TimelineEvent): string {
    if (!isNearEvent(event)) return ''
    if (event.type === 'kill') return 'bg-emerald-500/[0.08] ring-1 ring-inset ring-emerald-500/25'
    if (event.type === 'death') return 'bg-red-500/[0.08] ring-1 ring-inset ring-red-500/25'
    if (event.type === 'plant') return 'bg-orange-500/[0.08] ring-1 ring-inset ring-orange-500/25'
    if (event.type === 'defuse') return 'bg-cyan-500/[0.08] ring-1 ring-inset ring-cyan-500/25'
    return 'bg-white/[0.06] ring-1 ring-inset ring-white/15'
  }

  const lastScrolledEventKey = ref<string | null>(null)

  function scrollActiveEventIntoView(event: TimelineEvent | null) {
    if (event?.videoOffsetMs == null) return
    nextTick(() => {
      const el = document.querySelector(
        `[data-round-event="${event.round ?? expandedRoundNumber.value}-${event.videoOffsetMs}"]`,
      ) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
  
  /** Returns whether a timeline event is a spike-related event type. */
  function isSpikeEvent(event: TimelineEvent): boolean {
    return event.type === 'plant' || event.type === 'defuse' || event.type === 'detonation'
  }
  
  function defaultSyncMsForGame(game: string | undefined): number {
    return game === 'valorant' ? -8000 : 0
  }
  
  /** Looks up the agent name for a player by puuid from the team snapshot. */
  function agentByPuuid(puuid: string | null | undefined): string | null {
    if (!puuid || !timeline.value?.teamSnapshot) return null
    return timeline.value.teamSnapshot.find(p => p.puuid === puuid)?.agent ?? null
  }
  
  /** Resolve planter/defuser/killer labels — never show raw PUUIDs in the UI. */
  function formatPlayerLabel(nameOrPuuid: string | null | undefined): string {
    if (!nameOrPuuid) return ''
    if (nameOrPuuid === 'You') return 'You'
    const fromTeam = timeline.value?.teamSnapshot?.find(
      p => p.puuid === nameOrPuuid || p.summonerName === nameOrPuuid,
    )
    if (fromTeam) {
      if (fromTeam.puuid === ownPuuid.value) return 'You'
      return fromTeam.summonerName || fromTeam.agent || 'Teammate'
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrPuuid)) {
      return agentByPuuid(nameOrPuuid) ?? 'Enemy'
    }
    return nameOrPuuid
  }
  
  function getRankColor(tierName: string): string {
    const lower = tierName.toLowerCase()
    if (lower.includes('radiant')) return '#fde68a'
    if (lower.includes('immortal')) return '#f87171'
    if (lower.includes('ascendant')) return '#34d399'
    if (lower.includes('diamond')) return '#60a5fa'
    if (lower.includes('platinum')) return '#22d3ee'
    if (lower.includes('gold')) return '#fbbf24'
    if (lower.includes('silver')) return '#d1d5db'
    if (lower.includes('bronze')) return '#fb923c'
    if (lower.includes('iron')) return '#9ca3af'
    return '#6b7280'
  }
  
  const sortedTeamSnapshot = computed(() => {
    if (!timeline.value?.teamSnapshot?.length) return []
    return [...timeline.value.teamSnapshot].sort((a, b) => b.score - a.score)
  })
  
  const ownTeam = computed(() => {
    if (!ownPuuid.value || !timeline.value?.teamSnapshot) return null
    return timeline.value.teamSnapshot.find(p => p.puuid === ownPuuid.value)?.team ?? null
  })
  
  function roundOutcomeIcon(round: RoundGroup): string | null {
    return resolveRoundOutcomeIcon(round, reviewGame.value)
  }

  function spikeEventIcon(kind: 'plant' | 'defuse' | 'detonation'): string {
    return resolveSpikeEventIcon(kind, reviewGame.value)
  }
  
  function roundOutcomeLabel(round: RoundGroup): string {
    const c = round.ceremony?.toLowerCase() ?? ''
    const result = round.won ? 'WIN' : 'LOSS'
    if (c.includes('bombdefused') || c.includes('defus')) return `DEFUSE ${result}`
    if (c.includes('timer') || c.includes('time')) return `TIME ${result}`
    if (c.includes('detonat') || round.spikeDetonated) return `SPIKE ${result}`
    if (c.includes('elim') || c.includes('roundceremon')) return `ELIM ${result}`
    return result
  }
  
  const scoreboardGroups = computed(() => {
    if (!sortedTeamSnapshot.value.length) return []
    const mePlayer = sortedTeamSnapshot.value.find(p => p.puuid === ownPuuid.value)
    const allyTeamId = mePlayer?.team ?? null
    const allies = allyTeamId
      ? sortedTeamSnapshot.value.filter(p => p.team === allyTeamId)
      : sortedTeamSnapshot.value.slice(0, Math.ceil(sortedTeamSnapshot.value.length / 2))
    const enemies = allyTeamId
      ? sortedTeamSnapshot.value.filter(p => p.team !== allyTeamId)
      : sortedTeamSnapshot.value.slice(Math.ceil(sortedTeamSnapshot.value.length / 2))
    return [
      { isAlly: true, players: allies },
      { isAlly: false, players: enemies },
    ].filter(g => g.players.length > 0)
  })
  
  const agentImageUrl = computed(() => {
    if (!timeline.value?.agent) return null
    return getAgentImage(timeline.value.agent) || null
  })
  
  const agentAccentStyle = computed(() => {
    const agent = timeline.value?.agent
    if (!agent) return {}
    const color = getAgentColor(agent)
    return { boxShadow: `inset 0 0 0 1px ${color}44`, background: `linear-gradient(145deg, ${color}22, rgba(0,0,0,0.5))` }
  })
  
  const displayGameMode = computed(() => {
    const mode = normalizeGameModeId(timeline.value?.gameMode)
    return mode ? formatGameMode(mode) : ''
  })
  
  const mapPosterUrl = computed(() => getMapImage(timeline.value?.map) || '')
  
  const videoFrameStyle = computed(() => {
    const { width, height } = videoFrameSize.value
    if (width > 0 && height > 0) {
      return { width: `${width}px`, height: `${height}px` }
    }
    return { width: '100%', height: '100%', maxHeight: '100%' }
  })
  
  function updateVideoFrameSize(): void {
    const el = videoAreaEl.value
    if (!el || isFullscreen.value) return
    const { width: cw, height: ch } = el.getBoundingClientRect()
    if (cw <= 0 || ch <= 0) return
  
    const aspect = videoAspect.value > 0 ? videoAspect.value : 16 / 9
    let width = cw
    let height = width / aspect
    if (height > ch) {
      height = ch
      width = height * aspect
    }
    videoFrameSize.value = {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    }
  }
  
  function toggleTheaterMode(): void {
    theaterMode.value = !theaterMode.value
    nextTick(() => updateVideoFrameSize())
  }
  
  async function toggleFullscreen(): Promise<void> {
    const frame = videoFrameEl.value
    if (!frame) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await frame.requestFullscreen()
      }
    } catch {
      /* fullscreen denied or unavailable */
    }
  }
  
  function onFullscreenChange(): void {
    isFullscreen.value = document.fullscreenElement === videoFrameEl.value
    nextTick(() => updateVideoFrameSize())
  }
  
  const activePlaybackAnalysisId = computed((): number | null => {
    const fromTimeline = timeline.value?.analysisId
    if (fromTimeline != null && !Number.isNaN(fromTimeline)) return fromTimeline
    const fromQuery = Number(route.query.timelineId)
    if (!Number.isNaN(fromQuery) && fromQuery > 0) return fromQuery
    return null
  })
  
  const activePlaybackArchiveId = computed((): string | null => {
    const fromTimeline = timeline.value?.archiveId
    if (typeof fromTimeline === 'string' && fromTimeline.length > 0) return fromTimeline
    return null
  })
  
  const canRefreshCloudPlayback = computed(() =>
    activePlaybackAnalysisId.value != null
    || activePlaybackArchiveId.value != null
    || !!recordingId.value,
  )
  
  const videoSrc = computed(() => {
    const path = timeline.value?.videoPath
    if (!path) return ''
    if (/^https?:\/\//i.test(path)) return path
    const normalized = path.replace(/\\/g, '/')
    return normalized.startsWith('/')
      ? encodeURI(`file://${normalized}`)
      : encodeURI(`file:///${normalized}`)
  })

  const isCloudVideo = computed(() => /^https?:\/\//i.test(timeline.value?.videoPath ?? ''))

  const canTrimLocalVod = computed(() =>
    !!recordingId.value && !isCloudVideo.value && duration.value > 5,
  )

  const trimHint = computed(() => {
    if (!timeline.value?.analysisId && !timeline.value?.archiveId) return null
    return 'This match is saved to cloud — trimming only updates your local file. Re-upload to refresh the cloud copy.'
  })
  
  function needsCloudPlaybackRefresh(path: string | null | undefined): boolean {
    if (!path) return true
    if (/^https?:\/\//i.test(path)) return true
    const normalized = path.replace(/\\/g, '/')
    return !/\.(mp4|webm|m4v|mov)$/i.test(normalized)
  }
  
  async function refreshPlaybackUrl(): Promise<boolean> {
    if (playbackRefreshing.value || !canRefreshCloudPlayback.value) return false
    playbackRefreshing.value = true
    try {
      const analysisId = activePlaybackAnalysisId.value
      const archiveId = activePlaybackArchiveId.value
      let url: string | null = null
      if (analysisId != null) {
        url = await window.api.analyses.refreshPlayback(analysisId)
      } else if (recordingId.value) {
        url = await window.api.recordings.refreshPlayback(recordingId.value)
      } else if (archiveId) {
        url = await window.api.archives.refreshPlayback(archiveId)
      }
      if (url && timeline.value) {
        playbackError.value = null
        timeline.value = {
          ...timeline.value,
          videoPath: url,
          analysisId: analysisId ?? timeline.value.analysisId ?? null,
          archiveId: archiveId ?? timeline.value.archiveId ?? null,
        }
        duration.value = 0
        currentTime.value = 0
        await nextTick()
        if (videoEl.value) {
          videoEl.value.load()
        }
        return true
      }
      playbackError.value = 'Cloud playback URL unavailable — try Retry or open this match on upforge.gg.'
      return false
    } finally {
      playbackRefreshing.value = false
    }
  }
  
  function onVideoError() {
    if (!canRefreshCloudPlayback.value) {
      playbackError.value = 'This recording cannot be played in the desktop app.'
      return
    }
    void refreshPlaybackUrl().then((ok) => {
      if (ok && videoEl.value) {
        void videoEl.value.play().catch(() => {})
      } else if (!ok) {
        playbackError.value = playbackError.value ?? 'Cloud video failed to load — try Retry cloud playback.'
      }
    })
  }
  
  const progressPercent = computed(() => {
    if (!duration.value) return 0
    return (currentTime.value / duration.value) * 100
  })
  
  const allTimelineEvents = computed((): TimelineEvent[] => {
    if (!timeline.value) return []
  
    const me = ownPuuid.value
  
    // Build set of first-blood killers per round for badge display
    const firstBloodKeys = new Set(
      (timeline.value.firstBloods ?? []).map(fb => `${fb.round ?? 0}:${fb.killerPuuid ?? fb.killerName}`)
    )
  
    // Classify every kill event by comparing killer/victim to the local player.
    // playerKills contains ALL match kill events (not just the player's) so we
    // must inspect each event individually rather than assuming array = type.
    const classified: TimelineEvent[] = (timeline.value.kills ?? [])
      .filter(k => k.videoOffsetMs != null && !isNaN(k.videoOffsetMs))
      .map(k => {
        const isMyKill  = (me && k.killerPuuid === me) || k.killerName === 'You'
        const isMyDeath = (me && k.victimPuuid === me) || k.victimName === 'You'
        const type: TimelineEvent['type'] = isMyKill ? 'kill' : isMyDeath ? 'death' : 'neutral'
        return {
          ...k,
          type,
          isFirstBlood: firstBloodKeys.has(`${k.round ?? 0}:${k.killerPuuid ?? k.killerName}`)
        }
      })
  
    // Include any deaths from the deaths array that aren't already captured above
    // (guard against double-counting if both arrays have the same event)
    const seenOffsets = new Set(classified.map(e => e.videoOffsetMs))
    const extraDeaths: TimelineEvent[] = (timeline.value.deaths ?? [])
      .filter(d => d.videoOffsetMs != null && !isNaN(d.videoOffsetMs) && !seenOffsets.has(d.videoOffsetMs))
      .map(d => ({ ...d, type: 'death' as const }))
  
    const plants: TimelineEvent[] = (timeline.value.spikePlants ?? [])
      .filter(p => p.videoOffsetMs != null)
      .map(p => ({
        type: 'plant' as const,
        killerName: p.planter ?? '',
        victimName: '',
        planter: p.planter,
        site: p.site,
        videoOffsetMs: p.videoOffsetMs,
        round: p.round,
      }))
    const defuses: TimelineEvent[] = (timeline.value.spikeDefuses ?? [])
      .filter(d => d.videoOffsetMs != null)
      .map(d => ({
        type: 'defuse' as const,
        killerName: d.defuser ?? '',
        victimName: '',
        defuser: d.defuser,
        videoOffsetMs: d.videoOffsetMs,
        round: d.round,
      }))
    const detonations: TimelineEvent[] = (timeline.value.spikeDetonations ?? [])
      .filter(d => d.videoOffsetMs != null)
      .map(d => ({
        type: 'detonation' as const,
        killerName: '',
        victimName: '',
        videoOffsetMs: d.videoOffsetMs,
        round: d.round,
      }))
  
    return [...classified, ...extraDeaths, ...plants, ...defuses, ...detonations]
      .sort((a, b) => (a.videoOffsetMs ?? 0) - (b.videoOffsetMs ?? 0))
  })
  
  const roundGroups = computed((): RoundGroup[] => {
    if (!timeline.value) return []
    const roundMap = new Map<number, RoundGroup>()
  
    const summaries = timeline.value.roundSummaries ?? []
    for (const s of summaries) {
      const won = isCs2Review.value
        ? s.winningTeam === 'ALLY'
        : ownTeam.value
          ? s.winningTeam === ownTeam.value
          : s.winningTeam === 'ALLY'
      roundMap.set(s.roundNumber, {
        roundNumber: s.roundNumber,
        won,
        spikePlanted: s.spikePlanted,
        spikeDefused: s.spikeDefused,
        spikeDetonated: (s as RoundSummary).spikeDetonated ?? false,
        ceremony: (s as RoundSummary).ceremony ?? null,
        firstVideoOffsetMs: null,
        events: []
      })
    }
  
    for (const event of allTimelineEvents.value) {
      const r = event.round ?? 0
      if (isCs2Review.value && summaries.length > 0 && r >= summaries.length) continue
      if (!roundMap.has(r)) {
        roundMap.set(r, { roundNumber: r, won: false, spikePlanted: false, spikeDefused: false, spikeDetonated: false, ceremony: null, firstVideoOffsetMs: null, events: [] })
      }
      const group = roundMap.get(r)!
      group.events.push(event)
      if (group.firstVideoOffsetMs === null || (event.videoOffsetMs ?? Infinity) < group.firstVideoOffsetMs) {
        group.firstVideoOffsetMs = event.videoOffsetMs ?? null
      }
    }
  
    return Array.from(roundMap.values()).sort((a, b) => a.roundNumber - b.roundNumber)
  })
  
  const roundRecord = computed(() => {
    const rounds = roundGroups.value
    if (!rounds.length) return null
    const wins = rounds.filter(r => r.won).length
    return { wins, losses: rounds.length - wins, total: rounds.length }
  })

  const matchScoreline = computed(() => {
    const d = coachingDetail.value
    if (d?.ally_score != null && d?.enemy_score != null) {
      return { ally: d.ally_score, enemy: d.enemy_score }
    }
    const fs = timeline.value?.finalScore
    if (fs) {
      return { ally: fs.allyScore, enemy: fs.enemyScore }
    }
    const rec = roundRecord.value
    if (!rec) return null
    return { ally: rec.wins, enemy: rec.losses }
  })
  
  const roundSeparators = computed(() => {
    if (!duration.value || !roundGroups.value.length) return []
    return roundGroups.value
      .filter(r => r.firstVideoOffsetMs != null && r.firstVideoOffsetMs > 0)
      .map(r => ({ percent: ((r.firstVideoOffsetMs! / 1000) / duration.value) * 100 }))
  })
  
  const activeRoundNumber = computed<number | null>(() => {
    if (!roundGroups.value.length) return null
    const timedRounds = roundGroups.value
      .filter(round => round.firstVideoOffsetMs != null)
      .sort((a, b) => (a.firstVideoOffsetMs ?? 0) - (b.firstVideoOffsetMs ?? 0))
  
    if (!timedRounds.length) return roundGroups.value[0]?.roundNumber ?? null
  
    const currentMs = currentTime.value * 1000
    for (let index = 0; index < timedRounds.length; index += 1) {
      const currentRound = timedRounds[index]
      const nextRound = timedRounds[index + 1]
      const roundStart = currentRound.firstVideoOffsetMs ?? 0
      const nextStart = nextRound?.firstVideoOffsetMs ?? duration.value * 1000 + 1
      if (currentMs < roundStart && index === 0) return currentRound.roundNumber
      if (currentMs >= roundStart && currentMs < nextStart) return currentRound.roundNumber
    }
  
    return timedRounds[timedRounds.length - 1]?.roundNumber ?? null
  })
  
  watch(activeRoundNumber, (roundNumber) => {
    if (roundNumber == null) return
    expandedRoundNumber.value = roundNumber
  })
  
  const activeRoundSegment = computed(() => {
    if (!duration.value || activeRoundNumber.value == null) return null
    const timedRounds = roundGroups.value
      .filter(round => round.firstVideoOffsetMs != null)
      .sort((a, b) => (a.firstVideoOffsetMs ?? 0) - (b.firstVideoOffsetMs ?? 0))
    const idx = timedRounds.findIndex(r => r.roundNumber === activeRoundNumber.value)
    if (idx < 0) return null
    const start = (timedRounds[idx].firstVideoOffsetMs ?? 0) / 1000
    const end = idx + 1 < timedRounds.length
      ? (timedRounds[idx + 1].firstVideoOffsetMs ?? duration.value * 1000) / 1000
      : duration.value
    if (end <= start) return null
    return {
      left: (start / duration.value) * 100,
      width: ((end - start) / duration.value) * 100,
    }
  })
  
  const hoverRoundLabel = computed(() => {
    if (hoverTime.value == null || !duration.value) return null
    const ms = hoverTime.value * 1000
    const timedRounds = roundGroups.value
      .filter(round => round.firstVideoOffsetMs != null)
      .sort((a, b) => (a.firstVideoOffsetMs ?? 0) - (b.firstVideoOffsetMs ?? 0))
    for (let i = 0; i < timedRounds.length; i += 1) {
      const round = timedRounds[i]
      const start = round.firstVideoOffsetMs ?? 0
      const end = i + 1 < timedRounds.length
        ? (timedRounds[i + 1].firstVideoOffsetMs ?? duration.value * 1000)
        : duration.value * 1000
      if (ms >= start && ms < end) return `R${round.roundNumber + 1}`
    }
    return null
  })
  
  const progressMarkers = computed((): ProgressMarker[] => {
    if (!duration.value) return []
  
    const markers: ProgressMarker[] = []
  
    for (const round of roundGroups.value) {
      if (round.firstVideoOffsetMs == null) continue
      const timeSeconds = round.firstVideoOffsetMs / 1000
      markers.push({
        key: `round-${round.roundNumber}`,
        kind: 'round',
        label: `Round ${round.roundNumber + 1}`,
        percent: (timeSeconds / duration.value) * 100,
        timeSeconds,
      })
    }
  
    for (const event of allTimelineEvents.value) {
      if (event.videoOffsetMs == null) continue
      if (!['kill', 'death', 'plant', 'defuse', 'detonation'].includes(event.type)) continue
  
      let label = 'Event'
      if (event.type === 'kill') label = `Kill · ${event.victimName || 'Unknown'}`
      if (event.type === 'death') label = `Death · ${event.killerName || 'Unknown'}`
      if (event.type === 'plant') label = event.site ? `Plant · Site ${event.site}` : 'Spike Plant'
      if (event.type === 'defuse') label = 'Spike Defuse'
      if (event.type === 'detonation') label = 'Spike Detonation'
  
      markers.push({
        key: `${event.type}-${event.videoOffsetMs}-${event.round ?? 'na'}-${event.killerName ?? event.planter ?? event.defuser ?? 'event'}`,
        kind: event.type,
        label,
        percent: ((event.videoOffsetMs / 1000) / duration.value) * 100,
        timeSeconds: event.videoOffsetMs / 1000,
      })
    }
  
    return markers.filter(marker => marker.percent >= 0 && marker.percent <= 100)
  })
  
  const spatialSummary = computed(() => timeline.value?.spatialSummary ?? null)

  const duelMoments = computed((): DuelMoment[] => {
    const fromDetail = coachingDetail.value?.duel_moments
    if (fromDetail?.length) return normalizeDuelMoments(fromDetail)
    const manifest = timeline.value?.duelMoments ?? []
    return normalizeDuelMoments(manifest as DuelMoment[])
  })

  const hasDuelMoments = computed(() => duelMoments.value.length > 0)

  function seekDuelMoment(offsetMs: number, momentId?: string) {
    if (momentId) activeDuelMomentId.value = momentId
    seekToTime(Math.max(0, offsetMs / 1000 - 3))
  }

  function onDuelMomentBandSelect(moment: DuelMomentManifest) {
    activeDuelMomentId.value = moment.moment_id
    seekDuelMoment(moment.window_start_ms, moment.moment_id)
  }
  const tacticalIntelBrief = computed(() => {
    const d = coachingDetail.value
    const coachingRaw = d?.top_issue ?? d?.verdict ?? null
    if (coachingRaw) {
      return buildTacticalIntelBrief(coachingRaw, {
        improvements: d?.priority_improvements ?? [],
        tags: d?.coaching_tags ?? [],
        source: 'coaching',
      })
    }
    const heat = spatialSummary.value?.heatmapInsight
    if (heat) {
      return buildTacticalIntelBrief(heat, { source: 'heatmap' })
    }
    return null
  })
  const hasSpatialIntel = computed(() => (spatialSummary.value?.events?.length ?? 0) > 0)
  
  const spatialEventList = computed(() => {
    const events = spatialSummary.value?.events ?? []
    const round = spatialRoundFilter.value
    return events
      .map((ev, index) => ({ ev, index }))
      .filter(x => round == null || x.ev.round === round)
  })
  
  const baseDisplaySpatialSummary = computed((): MatchSpatialSummary | null => {
    const base = spatialSummary.value
    if (!base) return null
    const filtered = spatialEventList.value.map(x => x.ev)
    if (!filtered.length) return base
    return { ...base, events: filtered }
  })
  
  const displaySpatialSummary = computed((): MatchSpatialSummary | null => {
    const base = baseDisplaySpatialSummary.value
    if (!base) return null
    return buildReplaySpatialSummary(base, currentTime.value, 0, spatialReplaySync.value)
  })
  
  const activeSpatialDisplayIndex = computed(() => {
    if (activeSpatialIndex.value == null) return null
    const events = displaySpatialSummary.value?.events ?? []
    const activeEv = spatialSummary.value?.events?.[activeSpatialIndex.value]
    if (!activeEv) return null
    const idx = events.indexOf(activeEv)
    return idx >= 0 ? idx : null
  })
  
  const activeSpatialToast = computed(() => {
    const ev = activeSpatialNotif.value
    return ev ? spatialEventToastLabel(ev) : null
  })
  
  const displayDeathCount = computed(
    () => spatialEventList.value.filter(x => x.ev.type === 'death').length,
  )
  
  const spatialDeathChips = computed(() =>
    spatialEventList.value
      .map((item, displayIndex) => ({ ...item, displayIndex }))
      .filter(x => x.ev.type === 'death'),
  )
  
  const availableSpatialRounds = computed(() => {
    const rounds = new Set<number>()
    for (const e of spatialSummary.value?.events ?? []) rounds.add(e.round)
    return [...rounds].sort((a, b) => a - b)
  })
  
  const effectiveSyncMs = computed(
    () => timeline.value?.videoSyncOffsetMs
      ?? videoSyncOffsetMs.value
      ?? defaultSyncMsForGame(timeline.value?.game),
  )
  
  const syncOffsetLabel = computed(() => {
    const ms = effectiveSyncMs.value
    const sign = ms > 0 ? '+' : ''
    return `${sign}${(ms / 1000).toFixed(1)}s`
  })
  
  function preRollSeconds(type: string): number {
    return type === 'death' ? DEATH_PRE_ROLL_SECONDS : EVENT_PRE_ROLL_SECONDS
  }
  
  function openUpgrade() {
    window.open('https://upforge.gg/pricing', '_blank')
  }
  
  function onSpatialSelect(ev: SpatialTimelineEvent, _displayIndex: number) {
    const globalIdx = spatialSummary.value?.events.indexOf(ev) ?? null
    activeSpatialIndex.value = globalIdx
  
    if (!canSeekFromSpatial.value) {
      if (!spatialPreviewUsed.value) {
        markSpatialPreviewUsed()
      } else {
        openUpgrade()
        return
      }
    }
  
    const preRoll = preRollSeconds(ev.type)
    if (ev.videoOffsetMs != null && !isNaN(ev.videoOffsetMs)) {
      seekToTime(Math.max(0, ev.videoOffsetMs / 1000 - preRoll))
      return
    }
    const death = timeline.value?.deaths?.find(
      d => d.round === ev.round && d.victimName === 'You',
    )
    if (death?.videoOffsetMs != null) {
      seekToTime(Math.max(0, death.videoOffsetMs / 1000 - DEATH_PRE_ROLL_SECONDS))
    }
  }
  
  async function reloadTimelineFromStore() {
    if (!recordingId.value) return
    const fresh = await window.api.recordings.getTimeline(recordingId.value)
    if (fresh) {
      timeline.value = fresh
      videoSyncOffsetMs.value = fresh.videoSyncOffsetMs ?? 0
    }
  }
  
  async function nudgeTimelineSync(deltaMs: number) {
    if (!recordingId.value) return
    const res = await window.api.recordings.nudgeSync(recordingId.value, deltaMs)
    if (res.ok) {
      videoSyncOffsetMs.value = res.videoSyncOffsetMs ?? 0
      await reloadTimelineFromStore()
    }
  }
  
  async function resetTimelineSync() {
    if (!recordingId.value) return
    const res = await window.api.recordings.resetSync(recordingId.value)
    if (res.ok) {
      videoSyncOffsetMs.value = 0
      await reloadTimelineFromStore()
    }
  }
  
  const coachingNotes = computed(() => {
    const detail = coachingDetail.value
    const notes: string[] = []
  
    if (detail?.verdict) notes.push(detail.verdict)
    if (detail?.top_issue) notes.push(detail.top_issue)
    if (detail?.priority_improvements?.length) notes.push(...detail.priority_improvements)
    if (detail?.coaching_tags?.length) {
      notes.push(`Focus areas: ${detail.coaching_tags.map(tag => tag.replace(/_/g, ' ')).join(' · ')}`)
    }
  
    if (notes.length) return notes.slice(0, 6)
  
    const kills = timeline.value?.finalStats?.kills ?? 0
    const deaths = timeline.value?.finalStats?.deaths ?? 0
    const firstBloodDeaths = allTimelineEvents.value.filter(event => event.type === 'death' && event.isFirstBlood).length
    const spikeRounds = roundGroups.value.filter(round => round.spikePlanted || round.spikeDefused || round.spikeDetonated).length
  
    if (deaths > kills) {
      notes.push('Review the rounds where you were picked first. Slowing your first peek and preserving utility should create more stable openings.')
    }
    if (firstBloodDeaths > 0) {
      notes.push(`You were involved in ${firstBloodDeaths} first-blood deaths. Pause those rounds and check your spacing before the duel starts.`)
    }
    if (spikeRounds > 0) {
      notes.push(`There are ${spikeRounds} spike-focused rounds marked in the timeline. Use those timestamps to review your post-plant positioning and timing.`)
    }
    if (!notes.length) {
      notes.push('Use the event markers below the video to jump between rounds, deaths, and clutch moments for a faster review workflow.')
    }
  
    return notes
  })
  
  const supplementalCoachingNotes = computed(() => {
    const brief = tacticalIntelBrief.value
    const rawNotes = coachingNotes.value
    if (!brief) return rawNotes
  
    const covered = new Set<string>()
    if (brief.headline) covered.add(brief.headline.toLowerCase())
    if (brief.fix) covered.add(brief.fix.toLowerCase())
    for (const ev of brief.evidence) covered.add(ev.text.toLowerCase())
    for (const imp of brief.improvements) covered.add(imp.toLowerCase())
  
    return rawNotes.filter(note => {
      const lower = note.toLowerCase()
      if (covered.has(lower)) return false
      return ![...covered].some(chunk => chunk.length > 24 && lower.includes(chunk.slice(0, 40)))
    })
  })
  
  function visibleRoundEvents(round: RoundGroup): TimelineEvent[] {
    const events = roundLogFilter.value === 'mine'
      ? round.events.filter(event =>
        event.type === 'kill'
        || event.type === 'death'
        || isSpikeEvent(event),
      )
      : round.events
    return events
  }
  
  function toggleMute(): void {
    isMuted.value = !isMuted.value
  }
  
  function getSavedPlaybackPosition(id: string): number | null {
    try {
      const raw = localStorage.getItem(`${PLAYBACK_POS_PREFIX}${id}`)
      if (raw == null) return null
      const value = Number(raw)
      return Number.isFinite(value) && value >= 0 ? value : null
    } catch {
      return null
    }
  }
  
  let lastPlaybackSaveAt = 0
  function savePlaybackPosition(): void {
    if (!recordingId.value || !duration.value || duration.value <= 0) return
    const now = Date.now()
    if (now - lastPlaybackSaveAt < 4000) return
    lastPlaybackSaveAt = now
    try {
      localStorage.setItem(`${PLAYBACK_POS_PREFIX}${recordingId.value}`, String(currentTime.value))
    } catch { /* ignore */ }
  }
  
  function eventPercent(event: TimelineEvent): number {
    if (!duration.value || event.videoOffsetMs == null) return 0
    return (event.videoOffsetMs / 1000 / duration.value) * 100
  }
  
  function eventVideoSeconds(event: TimelineEvent): number | null {
    if (event.videoOffsetMs == null || isNaN(event.videoOffsetMs)) return null
    return event.videoOffsetMs / 1000
  }
  
  function isNearEvent(event: TimelineEvent): boolean {
    const eventSec = eventVideoSeconds(event)
    if (eventSec == null) return false
    // Highlight while in pre-roll window or at the kill/death moment
    return (
      Math.abs(currentTime.value - eventSec) < 1
      || (currentTime.value >= eventSec - preRollSeconds(event.type) && currentTime.value <= eventSec + 0.5)
    )
  }
  
  function formatMs(ms: number | undefined): string {
    if (ms == null || isNaN(ms)) return '--'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }
  
  function formatSeconds(s: number, zeroAsDash = false): string {
    if (isNaN(s) || (!s && zeroAsDash)) return '--:--'
    if (!s) return '0:00'
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }
  
  /** Seconds to rewind before an event so the user sees lead-up (markers stay at true event time). */
  const EVENT_PRE_ROLL_SECONDS = 2
  const DEATH_PRE_ROLL_SECONDS = 4
  const COACH_ANNOTATION_PRE_ROLL_SECONDS = 5

  const hasCoachFeedback = computed(() => {
    const review = coachReview.value
    if (!review) return false
    return Boolean(
      review.coach_perspective
      || review.annotations?.length
      || review.student_question,
    )
  })

  const notesAutoOpened = ref(false)

  type SidePanelTab = 'notes' | 'map'

  const sidePanelOpen = computed(() => showInsightsPanel.value || spatialMapVisible.value)

  function setSidePanelTab(tab: SidePanelTab | null) {
    if (tab === null) {
      showInsightsPanel.value = false
      spatialMapVisible.value = false
    } else if (tab === 'notes') {
      showInsightsPanel.value = true
      spatialMapVisible.value = false
    } else {
      spatialMapVisible.value = true
      showInsightsPanel.value = false
    }
    nextTick(() => updateVideoFrameSize())
  }

  function toggleSidePanelTab(tab: SidePanelTab) {
    const isOpen = tab === 'notes' ? showInsightsPanel.value : spatialMapVisible.value
    setSidePanelTab(isOpen ? null : tab)
  }

  watch(showInsightsPanel, (open) => {
    if (open && spatialMapVisible.value) spatialMapVisible.value = false
  })
  watch(spatialMapVisible, (open) => {
    if (open && showInsightsPanel.value) showInsightsPanel.value = false
  })
  watch([showInsightsPanel, spatialMapVisible, roundLogCollapsed], () => {
    nextTick(() => updateVideoFrameSize())
  })

  watch(
    () => Boolean(tacticalIntelBrief.value) || hasCoachFeedback.value,
    (shouldShow) => {
      if (shouldShow && !notesAutoOpened.value) {
        setSidePanelTab('notes')
        notesAutoOpened.value = true
      }
    },
  )

  const coachProgressMarkers = computed((): ProgressMarker[] => {
    if (!duration.value || !coachReview.value?.annotations?.length) return []
    return coachReview.value.annotations
      .filter(note => note.video_offset_ms != null && !isNaN(note.video_offset_ms))
      .map(note => ({
        key: `coach-${note.id}`,
        kind: 'neutral' as const,
        label: note.body.length > 48 ? `${note.body.slice(0, 48)}…` : note.body,
        percent: ((note.video_offset_ms! / 1000) / duration.value) * 100,
        timeSeconds: note.video_offset_ms! / 1000,
      }))
      .filter(marker => marker.percent >= 0 && marker.percent <= 100)
  })

  const sortedCoachAnnotations = computed(() => {
    const notes = coachReview.value?.annotations ?? []
    return [...notes].sort((a, b) => {
      const aMs = a.video_offset_ms ?? Number.MAX_SAFE_INTEGER
      const bMs = b.video_offset_ms ?? Number.MAX_SAFE_INTEGER
      return aMs - bMs
    })
  })

  const shortcutLegend = computed(() => {
    if (!hasCoachFeedback.value) return baseShortcutLegend
    const coachShortcuts = [
      { key: 'C', label: 'Coach notes panel' },
      { key: 'G', label: 'First coach note' },
      { key: 'Shift + J / L', label: 'Prev / next coach note' },
      { key: '1 – 9', label: 'Jump to coach note #' },
    ]
    const insertAt = baseShortcutLegend.findIndex(s => s.key === 'N')
    if (insertAt < 0) return [...coachShortcuts, ...baseShortcutLegend]
    return [
      ...baseShortcutLegend.slice(0, insertAt + 1),
      ...coachShortcuts,
      ...baseShortcutLegend.slice(insertAt + 1),
    ]
  })
  
  function togglePlay() {
    if (!videoEl.value) return
    if (videoEl.value.paused) videoEl.value.play().catch(e => {
      if (e.name !== 'AbortError') console.error('[VOD] play() failed:', e)
    })
    else videoEl.value.pause()
  }
  
  function skip(secs: number) {
    if (!videoEl.value) return
    videoEl.value.currentTime = Math.max(0, Math.min(duration.value, videoEl.value.currentTime + secs))
  }
  
  function cycleSpeed() {
    const speeds = [0.25, 0.5, 1, 1.5, 2]
    const idx = speeds.indexOf(playbackSpeed.value)
    playbackSpeed.value = speeds[(idx + 1) % speeds.length]
    if (videoEl.value) videoEl.value.playbackRate = playbackSpeed.value
  }
  
  function cycleSpeedDown() {
    const speeds = [0.25, 0.5, 1, 1.5, 2]
    const idx = speeds.indexOf(playbackSpeed.value)
    playbackSpeed.value = speeds[Math.max(0, idx - 1)]
    if (videoEl.value) videoEl.value.playbackRate = playbackSpeed.value
  }
  
  function seekToTime(timeSeconds: number, options?: { autoPlay?: boolean }) {
    if (!videoEl.value) return
    const video = videoEl.value
    const maxTime = duration.value > 0 ? duration.value : (Number.isFinite(video.duration) ? video.duration : timeSeconds)
    const target = Math.max(0, Math.min(maxTime, timeSeconds))
    const shouldResume = options?.autoPlay === true && !video.paused

    video.pause()

    const finishSeek = () => {
      videoSeeking.value = false
      currentTime.value = video.currentTime
      if (shouldResume) {
        video.play().catch(e => {
          if (e.name !== 'AbortError') console.error('[VOD] play() failed:', e)
        })
      }
    }

    if (isCloudVideo.value) {
      videoSeeking.value = true
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        finishSeek()
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = target
      window.setTimeout(() => {
        if (videoSeeking.value) finishSeek()
      }, 2500)
      return
    }

    video.currentTime = target
    currentTime.value = target
    if (shouldResume) {
      video.play().catch(e => {
        if (e.name !== 'AbortError') console.error('[VOD] play() failed:', e)
      })
    }
  }

  function seekCoachAnnotation(offsetMs: number | null, noteId?: number) {
    if (offsetMs == null) return
    if (noteId != null) activeCoachNoteId.value = noteId
    setSidePanelTab('notes')
    seekToTime(Math.max(0, offsetMs / 1000 - COACH_ANNOTATION_PRE_ROLL_SECONDS))
    nextTick(() => scrollActiveCoachNoteIntoView(noteId ?? null))
  }

  function scrollActiveCoachNoteIntoView(noteId: number | null) {
    if (noteId == null) return
    nextTick(() => {
      const el = document.querySelector(`[data-coach-note="${noteId}"]`) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function seekCoachNoteByIndex(index: number) {
    const notes = sortedCoachAnnotations.value.filter(
      n => n.video_offset_ms != null && !isNaN(n.video_offset_ms),
    )
    const note = notes[index]
    if (!note) return
    seekCoachAnnotation(note.video_offset_ms, note.id)
  }

  function seekFirstCoachNote() {
    seekCoachNoteByIndex(0)
  }

  function seekPrevCoachNote() {
    const notes = sortedCoachAnnotations.value.filter(
      n => n.video_offset_ms != null && !isNaN(n.video_offset_ms),
    )
    if (!notes.length) return
    const currentMs = currentTime.value * 1000
    const activeIdx = activeCoachNoteId.value != null
      ? notes.findIndex(n => n.id === activeCoachNoteId.value)
      : -1
    let targetIdx = activeIdx
    if (targetIdx < 0) {
      const before = notes.filter(n => (n.video_offset_ms ?? 0) < currentMs - 500)
      targetIdx = before.length ? before.length - 1 : notes.length - 1
    } else {
      targetIdx = Math.max(0, targetIdx - 1)
    }
    const note = notes[targetIdx]
    if (note) seekCoachAnnotation(note.video_offset_ms, note.id)
  }

  function seekNextCoachNote() {
    const notes = sortedCoachAnnotations.value.filter(
      n => n.video_offset_ms != null && !isNaN(n.video_offset_ms),
    )
    if (!notes.length) return
    const currentMs = currentTime.value * 1000
    const activeIdx = activeCoachNoteId.value != null
      ? notes.findIndex(n => n.id === activeCoachNoteId.value)
      : -1
    let targetIdx = activeIdx
    if (targetIdx < 0) {
      const after = notes.findIndex(n => (n.video_offset_ms ?? 0) > currentMs + 500)
      targetIdx = after >= 0 ? after : 0
    } else {
      targetIdx = Math.min(notes.length - 1, targetIdx + 1)
    }
    const note = notes[targetIdx]
    if (note) seekCoachAnnotation(note.video_offset_ms, note.id)
  }

  function toggleCoachNotesPanel() {
    setSidePanelTab('notes')
    if (sortedCoachAnnotations.value.length) {
      nextTick(() => scrollActiveCoachNoteIntoView(activeCoachNoteId.value))
    }
  }

  function jumpToCoachMarker(marker: ProgressMarker) {
    setSidePanelTab('notes')
    seekToTime(Math.max(0, marker.timeSeconds - COACH_ANNOTATION_PRE_ROLL_SECONDS))
  }
  
  function jumpToMarker(marker: ProgressMarker) {
    const preRoll = ['kill', 'death'].includes(marker.kind) ? preRollSeconds(marker.kind) : 0
    seekToTime(Math.max(0, marker.timeSeconds - preRoll))
  }
  
  function scrollActiveRoundIntoView(roundNumber: number | null) {
    if (roundNumber == null) return
    nextTick(() => {
      const activeButton = sidebarEl.value?.querySelector(`[data-round-anchor="${roundNumber}"]`) as HTMLElement | null
      activeButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
  
  function seekToEvent(event: TimelineEvent) {
    const eventSec = eventVideoSeconds(event)
    if (!videoEl.value || eventSec == null) return
    const wasPlaying = !videoEl.value.paused
    const preRoll = ['kill', 'death'].includes(event.type)
      ? preRollSeconds(event.type)
      : 0
    seekToTime(Math.max(0, eventSec - preRoll), { autoPlay: wasPlaying })
  }
  
  function seekCoachingEvidence(evidence: CoachingEvidence) {
    const round = roundGroups.value.find(r => r.roundNumber === evidence.roundNumber)
    if (round) {
      selectedRound.value = round
      scrollActiveRoundIntoView(round.roundNumber)
    }
    seekToTime(Math.max(0, evidence.timeSeconds - 2))
  }
  
  function seekToRound(round: RoundGroup) {
    selectedRound.value = round
    expandedRoundNumber.value = round.roundNumber
    scrollActiveRoundIntoView(round.roundNumber)
    if (!videoEl.value || round.firstVideoOffsetMs == null) return
    const wasPlaying = !videoEl.value.paused
    seekToTime(Math.max(0, round.firstVideoOffsetMs / 1000 - 2), { autoPlay: wasPlaying })
  }

  function toggleRoundExpanded(round: RoundGroup) {
    expandedRoundNumber.value = expandedRoundNumber.value === round.roundNumber
      ? null
      : round.roundNumber
    scrollActiveRoundIntoView(round.roundNumber)
  }
  
  function seekPrevEvent() {
    const events = allTimelineEvents.value
    const ct = currentTime.value
    const prev = [...events].reverse().find(e => {
      const sec = eventVideoSeconds(e)
      return sec != null && sec < ct - 0.5
    })
    if (prev) seekToEvent(prev)
  }
  
  function seekNextEvent() {
    const events = allTimelineEvents.value
    const ct = currentTime.value
    const next = events.find(e => {
      const sec = eventVideoSeconds(e)
      return sec != null && sec > ct + 0.5
    })
    if (next) seekToEvent(next)
  }
  
  function onVideoWaiting() {
    videoBuffering.value = true
  }

  function onVideoCanPlay() {
    videoBuffering.value = false
  }

  function onVideoPlaying() {
    videoBuffering.value = false
    videoSeeking.value = false
  }

  function onTimeUpdate() {
    if (!videoEl.value) return
    currentTime.value = videoEl.value.currentTime
    savePlaybackPosition()
    // Popup when playback reaches the event (not when pre-roll seek lands early)
    const near = allTimelineEvents.value.find(e => {
      const sec = eventVideoSeconds(e)
      return sec != null && Math.abs(sec - currentTime.value) < 0.35
    })
    if (near && (!activeEventNotif.value || activeEventNotif.value !== near)) {
      activeEventNotif.value = near
      if (notifTimer) clearTimeout(notifTimer)
      notifTimer = setTimeout(() => { activeEventNotif.value = null }, 2500)
    }

    const playbackNear = allTimelineEvents.value.find(e => isNearEvent(e))
    if (playbackNear && expandedRoundNumber.value === playbackNear.round) {
      const scrollKey = `${playbackNear.type}-${playbackNear.videoOffsetMs}`
      if (scrollKey !== lastScrolledEventKey.value) {
        lastScrolledEventKey.value = scrollKey
        scrollActiveEventIntoView(playbackNear)
      }
    } else if (!playbackNear) {
      lastScrolledEventKey.value = null
    }
  
    const playbackEvents = spatialEventList.value.map(x => x.ev)
    const nearSpatial = findSpatialEventAtPlayback(playbackEvents, currentTime.value, 0)
    if (nearSpatial) {
      const globalIdx = spatialEventList.value[nearSpatial.index]?.index ?? null
      if (globalIdx != null) activeSpatialIndex.value = globalIdx
      if (activeSpatialNotif.value !== nearSpatial.ev) {
        activeSpatialNotif.value = nearSpatial.ev
        if (spatialNotifTimer) clearTimeout(spatialNotifTimer)
        spatialNotifTimer = setTimeout(() => { activeSpatialNotif.value = null }, 2800)
      }
    }
  }
  
  const playbackDurationRetryDone = ref(false)
  
  function onLoadedMetadata() {
    if (!videoEl.value) return
    videoEl.value.muted = isMuted.value
    const d = videoEl.value.duration
    if (!isNaN(d) && isFinite(d) && d > 0) duration.value = d
    if (videoEl.value.videoWidth > 0 && videoEl.value.videoHeight > 0) {
      videoAspect.value = videoEl.value.videoWidth / videoEl.value.videoHeight
      updateVideoFrameSize()
    }
    if (
      duration.value <= 0
      && canRefreshCloudPlayback.value
      && !playbackDurationRetryDone.value
    ) {
      playbackDurationRetryDone.value = true
      void refreshPlaybackUrl()
      return
    }
    tryInitialGameplaySeek()
  }
  
  /** Skip map-load black frames — land on first real gameplay moment for review (and screenshots). */
  function pickInitialSeekSeconds(): number | null {
    const MIN_OFFSET_MS = 8000
    const events = allTimelineEvents.value
    const firstGameplay = events.find(e => {
      const ms = e.videoOffsetMs
      return ms != null && !isNaN(ms) && ms >= MIN_OFFSET_MS
    })
    if (firstGameplay?.videoOffsetMs != null) {
      const preRoll = ['kill', 'death'].includes(firstGameplay.type)
        ? preRollSeconds(firstGameplay.type)
        : 2
      return Math.max(0, firstGameplay.videoOffsetMs / 1000 - preRoll)
    }
  
    const firstRound = roundGroups.value.find(
      r => r.firstVideoOffsetMs != null && r.firstVideoOffsetMs >= MIN_OFFSET_MS,
    )
    if (firstRound?.firstVideoOffsetMs != null) {
      return Math.max(0, firstRound.firstVideoOffsetMs / 1000 - 2)
    }
  
    if (duration.value > 15) return 12
    return null
  }
  
  function tryInitialGameplaySeek() {
    if (initialSeekDone.value) return
  
    const routeSeekMs = Number(route.query.seekMs)
    if (!Number.isNaN(routeSeekMs) && routeSeekMs >= 0) {
      initialSeekDone.value = true
      return
    }
  
    if (!videoEl.value || duration.value <= 0) return
  
    const saved = recordingId.value ? getSavedPlaybackPosition(recordingId.value) : null
    if (saved != null && saved > 8 && saved < duration.value - 15) {
      videoEl.value.currentTime = saved
      currentTime.value = saved
      initialSeekDone.value = true
      return
    }
  
    const target = pickInitialSeekSeconds()
    if (target != null && target > 0.5) {
      videoEl.value.currentTime = target
      currentTime.value = target
    }
    initialSeekDone.value = true
  }
  
  function onScrubberClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (videoEl.value) {
      videoEl.value.currentTime = pct * duration.value
    }
  }
  
  function onScrubberHover(e: MouseEvent) {
    if (!duration.value || isNaN(duration.value)) return
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    hoverTime.value = Math.max(0, Math.min(duration.value, ((e.clientX - rect.left) / rect.width) * duration.value))
  }
  
  function applyTimelineDerivedState() {
    if (!timeline.value) return
    const ownKill = timeline.value.kills?.find((k: KillEvent) => k.killerName === 'You')
    if (ownKill?.killerPuuid) {
      ownPuuid.value = ownKill.killerPuuid
    } else {
      const ownDeath = timeline.value.deaths?.find((d: KillEvent) => d.victimName === 'You')
      if (ownDeath?.victimPuuid) ownPuuid.value = ownDeath.victimPuuid
    }
  }
  
  function applyCoachReviewUiState() {
    if (!hasCoachFeedback.value) return
    setSidePanelTab('notes')
    const routeSeekMs = Number(route.query.seekMs)
    if (!Number.isNaN(routeSeekMs) && routeSeekMs >= 0) return
    const firstNote = coachReview.value?.annotations?.find(
      note => note.video_offset_ms != null && !isNaN(note.video_offset_ms),
    )
    if (route.query.coachNotes === '1' && firstNote?.video_offset_ms != null && !initialSeekDone.value) {
      applyInitialSeek(firstNote.video_offset_ms)
    }
  }

  function applyInitialSeek(seekMsOverride?: number) {
    const seekMs = seekMsOverride ?? Number(route.query.seekMs)
    if (Number.isNaN(seekMs) || seekMs < 0) return
    initialSeekDone.value = true
    const prerollMs = (route.query.coachNotes === '1' || seekMsOverride != null)
      ? COACH_ANNOTATION_PRE_ROLL_SECONDS * 1000
      : 0
    const trySeek = () => {
      if (videoEl.value && duration.value > 0) {
        seekToTime(Math.max(0, (seekMs - prerollMs) / 1000))
      } else {
        setTimeout(trySeek, 200)
      }
    }
    trySeek()
  }
  
  async function loadTimeline() {
    timelineLoading.value = true
    timelineError.value = null
    playbackError.value = null
    timeline.value = null
    playbackDurationRetryDone.value = false
    try {
      const id = route.query.id as string
      const timelineId = route.query.timelineId as string
      const numericTimelineId = Number(timelineId)
  
      if (timelineId && pendingTimeline.value) {
        timeline.value = pendingTimeline.value
        pendingTimeline.value = null
        videoSyncOffsetMs.value = timeline.value?.videoSyncOffsetMs
          ?? defaultSyncMsForGame(timeline.value?.game)
      } else if (id) {
        recordingId.value = id
        timeline.value = await window.api.recordings.getTimeline(id)
        if (!timeline.value) {
          timelineError.value = 'Recording timeline not found.'
          return
        }
        videoSyncOffsetMs.value = timeline.value.videoSyncOffsetMs
          ?? defaultSyncMsForGame(timeline.value.game)
      } else if (timelineId && !Number.isNaN(numericTimelineId)) {
        const data = await window.api.analyses.getTimeline(numericTimelineId)
        if (!data) {
          timelineError.value = 'Timeline data is not available for this match yet.'
          return
        }
        timeline.value = data
        videoSyncOffsetMs.value = timeline.value.videoSyncOffsetMs
          ?? defaultSyncMsForGame(timeline.value.game)
      } else {
        timelineError.value = 'No match selected — open a match from the Dashboard.'
        return
      }
  
      if (timelineId && !Number.isNaN(numericTimelineId)) {
        coachingDetail.value = await window.api.analyses.getDetail(numericTimelineId).catch(() => null)
        const review = await window.api.coach.getAnalysisReview(numericTimelineId).catch(() => null)
        if (review?.id) {
          const detail = await window.api.coach.getReviewAnnotations(review.id).catch(() => null)
          coachReview.value = {
            id: review.id,
            status: review.status,
            student_question: review.student_question,
            coach_perspective: detail?.coach_perspective ?? review.coach_perspective ?? null,
            coach: review.coach,
            annotations: detail?.annotations ?? review.annotations ?? [],
          }
        } else {
          coachReview.value = null
        }
      }

      applyCoachReviewUiState()

      applyTimelineDerivedState()
      if (canRefreshCloudPlayback.value && needsCloudPlaybackRefresh(timeline.value?.videoPath)) {
        await refreshPlaybackUrl()
      }
      if (route.query.coachNotes === '1') {
        const routeSeekMs = Number(route.query.seekMs)
        if (!Number.isNaN(routeSeekMs) && routeSeekMs >= 0) {
          applyInitialSeek()
        }
      } else {
        applyInitialSeek()
      }
    } catch {
      timelineError.value = 'Could not load match timeline — check your connection and try again.'
    } finally {
      timelineLoading.value = false
    }
  }
  
  onMounted(async () => {
    loadSpatialPreviewState()
    loadSpatialUiPrefs()
    window.api.discord.setState('reviewing').catch(() => {})
    window.api.app.getStatus().then(s => {
      if (s.user?.tier) userTier.value = s.user.tier
    }).catch(() => {})
  
    await loadTimeline()
  
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
  
    nextTick(() => {
      updateVideoFrameSize()
      if (videoAreaEl.value) {
        videoAreaObserver = new ResizeObserver(() => updateVideoFrameSize())
        videoAreaObserver.observe(videoAreaEl.value)
      }
    })
  })
  
  onUnmounted(() => {
    window.api.discord.setState('idle').catch(() => {})
    window.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    videoAreaObserver?.disconnect()
    videoAreaObserver = null
    if (document.fullscreenElement === videoFrameEl.value) {
      document.exitFullscreen().catch(() => {})
    }
  })
  
  watch(theaterMode, () => nextTick(() => updateVideoFrameSize()))

  function openVodTrim() {
    if (!canTrimLocalVod.value) return
    trimStartSec.value = 0
    trimEndSec.value = Math.round(duration.value * 10) / 10
    trimError.value = null
    trimModalOpen.value = true
  }

  async function confirmVodTrim() {
    if (!recordingId.value || trimEndSec.value <= trimStartSec.value) {
      trimError.value = 'End must be after start'
      return
    }
    trimLoading.value = true
    trimError.value = null
    try {
      const result = await window.api.recordings.trim(
        recordingId.value,
        trimStartSec.value,
        trimEndSec.value,
      )
      if (!result.ok) {
        trimError.value = result.error ?? 'Trim failed'
        return
      }
      trimModalOpen.value = false
      initialSeekDone.value = false
      currentTime.value = 0
      timeline.value = await window.api.recordings.getTimeline(recordingId.value)
      videoSyncOffsetMs.value = timeline.value?.videoSyncOffsetMs
        ?? defaultSyncMsForGame(timeline.value?.game)
      applyTimelineDerivedState()
      await nextTick()
      videoEl.value?.load()
      duration.value = 0
    } catch (e) {
      trimError.value = e instanceof Error ? e.message : 'Trim failed'
    } finally {
      trimLoading.value = false
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    // Don't capture keyboard events when user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (trimModalOpen.value) {
      if (e.key === 'Escape' && !trimLoading.value) {
        e.preventDefault()
        trimModalOpen.value = false
      }
      return
    }

    if (e.shiftKey && (e.key === 'j' || e.key === 'J')) {
      if (hasCoachFeedback.value && sortedCoachAnnotations.value.length) {
        e.preventDefault()
        seekPrevCoachNote()
        return
      }
    }
    if (e.shiftKey && (e.key === 'l' || e.key === 'L')) {
      if (hasCoachFeedback.value && sortedCoachAnnotations.value.length) {
        e.preventDefault()
        seekNextCoachNote()
        return
      }
    }
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      if (hasCoachFeedback.value && sortedCoachAnnotations.value.length) {
        e.preventDefault()
        seekCoachNoteByIndex(Number(e.key) - 1)
        return
      }
    }
  
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      showShortcuts.value = !showShortcuts.value
      return
    }
  
    if (showShortcuts.value && e.key === 'Escape') {
      e.preventDefault()
      showShortcuts.value = false
      return
    }
  
    switch (e.key) {
      case ' ':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowLeft':
        e.preventDefault()
        skip(e.shiftKey ? -1 : -5)
        break
      case 'ArrowRight':
        e.preventDefault()
        skip(e.shiftKey ? 1 : 5)
        break
      case 'j':
      case 'J':
        seekPrevEvent()
        break
      case 'l':
      case 'L':
        seekNextEvent()
        break
      case ']':
        cycleSpeed()
        break
      case '[':
        cycleSpeedDown()
        break
      case 'Escape':
        if (document.fullscreenElement) {
          e.preventDefault()
          document.exitFullscreen().catch(() => {})
        } else if (theaterMode.value) {
          e.preventDefault()
          theaterMode.value = false
          nextTick(() => updateVideoFrameSize())
        } else {
          router.back()
        }
        break
      case 'f':
      case 'F':
        e.preventDefault()
        toggleFullscreen()
        break
      case 't':
      case 'T':
        e.preventDefault()
        toggleTheaterMode()
        break
      case 'm':
      case 'M':
        if (hasSpatialIntel.value) {
          e.preventDefault()
          toggleSidePanelTab('map')
        }
        break
      case 'b':
      case 'B':
        if (!theaterMode.value && roundGroups.value.length) {
          e.preventDefault()
          roundLogCollapsed.value = !roundLogCollapsed.value
        }
        break
      case 'n':
      case 'N':
        e.preventDefault()
        toggleSidePanelTab('notes')
        break
      case 'c':
      case 'C':
        if (hasCoachFeedback.value) {
          e.preventDefault()
          toggleCoachNotesPanel()
        }
        break
      case 'g':
      case 'G':
        if (hasCoachFeedback.value && sortedCoachAnnotations.value.length) {
          e.preventDefault()
          seekFirstCoachNote()
        }
        break
      case 'v':
      case 'V':
        if (timeline.value?.videoPath) {
          e.preventDefault()
          toggleMute()
        }
        break
      case 'r':
      case 'R':
        if (selectedRound.value) {
          e.preventDefault()
          roundDetailExpanded.value = !roundDetailExpanded.value
        }
        break
      case 's':
      case 'S':
        showScoreboard.value = !showScoreboard.value
        break
    }
  }
  
  watch(playbackSpeed, (val) => {
    if (videoEl.value) videoEl.value.playbackRate = val
  })
  
  watch(activeRoundNumber, (roundNumber) => {
    if (roundNumber == null) return
    if (roundDetailExpanded.value) {
      const activeRound = roundGroups.value.find(round => round.roundNumber === roundNumber) ?? null
      if (activeRound) selectedRound.value = activeRound
    }
    scrollActiveRoundIntoView(roundNumber)
  })

  return {
    DEATH_PRE_ROLL_SECONDS,
    EVENT_PRE_ROLL_SECONDS,
    PLAYBACK_MUTE_KEY,
    PLAYBACK_POS_PREFIX,
    ROUND_LOG_COLLAPSED_KEY,
    SPATIAL_HUD_VISIBLE_KEY,
    SPATIAL_MAP_LARGE_KEY,
    SPATIAL_MAP_VISIBLE_KEY,
    SPATIAL_PREVIEW_KEY,
    SPATIAL_REPLAY_SYNC_KEY,
    THEATER_MODE_KEY,
    abilityCastSlots,
    activeCoachNoteId,
    activeEventNotif,
    activePlaybackAnalysisId,
    activePlaybackArchiveId,
    activeRoundNumber,
    activeRoundSegment,
    activeSpatialDisplayIndex,
    activeSpatialIndex,
    activeSpatialNotif,
    activeSpatialToast,
    agentAccentStyle,
    agentByPuuid,
    agentImageUrl,
    allTimelineEvents,
    applyInitialSeek,
    applyTimelineDerivedState,
    availableSpatialRounds,
    baseDisplaySpatialSummary,
    canRefreshCloudPlayback,
    canTrimLocalVod,
    confirmVodTrim,
    canSeekFromSpatial,
    COACH_ANNOTATION_PRE_ROLL_SECONDS,
    coachProgressMarkers,
    coachReview,
    hasCoachFeedback,
    coachingDetail,
    coachingNotes,
    currentTime,
    cursorHidden,
    cursorHideTimer,
    cycleSpeed,
    cycleSpeedDown,
    defaultSyncMsForGame,
    displayDeathCount,
    displayGameMode,
    displaySpatialSummary,
    duelMoments,
    hasDuelMoments,
    activeDuelMomentId,
    seekDuelMoment,
    onDuelMomentBandSelect,
    dockChipsEl,
    duration,
    trimEndSec,
    trimError,
    trimHint,
    trimLoading,
    trimModalOpen,
    trimStartSec,
    effectiveSyncMs,
    eventPercent,
    eventVideoSeconds,
    expandedRoundNumber,
    formatMs,
    formatPlayerLabel,
    formatSeconds,
    getAbilityIcon,
    getAbilityKillIcon,
    getKillSourceLabel,
    getEventSourceImage,
    getAgentImage,
    getRankColor,
    getSavedPlaybackPosition,
    getWeaponIcon,
    handleKeyDown,
    hasSpatialIntel,
    hoverRoundLabel,
    hoverTime,
    initialSeekDone,
    isCloudVideo,
    isFullscreen,
    isMuted,
    isNearEvent,
    isPlaying,
    isSpikeEvent,
    jumpToCoachMarker,
    jumpToMarker,
    lastPlaybackSaveAt,
    loadSpatialPreviewState,
    loadSpatialUiPrefs,
    loadTimeline,
    mapPosterUrl,
    nearEventHighlightClass,
    markSpatialPreviewUsed,
    matchScoreline,
    needsCloudPlaybackRefresh,
    notifTimer,
    nudgeTimelineSync,
    onFullscreenChange,
    onLoadedMetadata,
    onScrubberClick,
    onScrubberHover,
    onSpatialSelect,
    onTimeUpdate,
    onVideoCanPlay,
    onVideoPlaying,
    onVideoWaiting,
    onVideoError,
    onVideoMouseMove,
    openUpgrade,
    openVodTrim,
    ownPuuid,
    ownTeam,
    pickInitialSeekSeconds,
    playbackDurationRetryDone,
    playbackError,
    playbackRefreshing,
    playbackSpeed,
    preRollSeconds,
    progressMarkers,
    progressPercent,
    recordingId,
    refreshPlaybackUrl,
    reloadTimelineFromStore,
    resetTimelineSync,
    roundDetailExpanded,
    roundGroups,
    roundLogCollapsed,
    roundLogFilter,
    roundOutcomeIcon,
    roundOutcomeLabel,
    roundRecord,
    spikeEventIcon,
    roundSeparators,
    route,
    router,
    savePlaybackPosition,
    scoreboardGroups,
    scrollActiveEventIntoView,
    scrollActiveRoundIntoView,
    seekCoachAnnotation,
    seekFirstCoachNote,
    seekNextCoachNote,
    seekPrevCoachNote,
    seekCoachingEvidence,
    seekNextEvent,
    seekPrevEvent,
    seekToEvent,
    seekToRound,
    seekToTime,
    selectedRound,
    shortcutLegend,
    setSidePanelTab,
    sidePanelOpen,
    showInsightsPanel,
    showScoreboard,
    showShortcuts,
    sidebarEl,
    skip,
    sortedTeamSnapshot,
    sortedCoachAnnotations,
    spatialDeathChips,
    spatialEventList,
    spatialHudVisible,
    spatialMapLarge,
    spatialMapVisible,
    spatialModes,
    spatialNotifTimer,
    spatialPreviewAvailable,
    spatialPreviewUsed,
    spatialReplaySync,
    spatialRoundFilter,
    spatialSummary,
    spatialViewMode,
    supplementalCoachingNotes,
    syncOffsetLabel,
    tacticalIntelBrief,
    theaterMode,
    timeline,
    timelineError,
    timelineLoading,
    toggleCoachNotesPanel,
    toggleFullscreen,
    toggleMute,
    togglePlay,
    toggleRoundExpanded,
    toggleSidePanelTab,
    toggleTheaterMode,
    tryInitialGameplaySeek,
    updateVideoFrameSize,
    userTier,
    videoAreaEl,
    videoAreaObserver,
    videoAspect,
    videoBuffering,
    videoEl,
    videoFrameEl,
    videoFrameSize,
    videoFrameStyle,
    videoSeeking,
    videoSrc,
    videoSyncOffsetMs,
    visibleRoundEvents,
  }
}
