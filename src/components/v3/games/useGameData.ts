/**
 * Loads the CS2 / Deadlock / League data the old game panels used, through the same IPC calls,
 * and exposes the same actions. One instance per screen.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { PrimaryGame } from '../../../lib/games'
import type { DeadlockAnalysisItem, DeadlockProfileStats, LolAnalysisItem, LolMatchSummary } from '../../../env.d.ts'
import { cs2Setup, deadlockSetup, lolSetup, type Cs2Faceit, type Cs2Profile, type FileList, type SetupAction, type SetupState } from './game-data'
import { readCache, writeCache } from '../../../lib/stale-cache'
import type { LolRankPayload } from '../../../lib/lol-progress'
import type { Focus } from '../../../lib/focus'
import { lolIdentity } from '../../../lib/lol-display'
import type { LolRecentResult } from '../../../lib/lol-recent'

/** Recent games with Riot's error state; older preloads only have the plain list. */
async function lolRecentResult(fresh: boolean): Promise<LolRecentResult> {
  const withState = window.api.lol.getRecentMatchesResult
  if (withState) return withState(fresh)
  return { matches: await window.api.lol.getRecentMatches(fresh), error: null, errorReason: null, partial: false }
}

/** `lol:get-rank` is added by the lead (see notes-game-league.md); older builds lack it. */
const lolRankApi = () => (window.api.lol as { getRank?: () => Promise<LolRankPayload | null> }).getRank

export interface UploadState { busy: boolean; status: 'idle' | 'uploading' | 'done' | 'error'; pct: number; jobId?: string; error?: string }

type GameSnapshot =
  | { game: 'cs2'; profile: Cs2Profile | null; faceit: Cs2Faceit | null; demos: FileList | null }
  | { game: 'deadlock'; linked: boolean; stats: DeadlockProfileStats | null; replays: FileList | null; analyses?: DeadlockAnalysisItem[] }
  | { game: 'lol'; linked: boolean; riotLabel: string; riotSource?: 'league' | 'valorant' | null; matches: LolMatchSummary[]; analyses: LolAnalysisItem[]; rank?: LolRankPayload | null; focus?: Focus | null; matchesError?: Pick<LolRecentResult, 'error' | 'errorReason' | 'partial'> | null }

export function useGameData(game: Readonly<Ref<PrimaryGame>>) {
  const router = useRouter()
  const loading = ref(false)
  const error = ref(false)
  /** The game whose data finished loading last (so screens don't flash setup steps before data arrives). */
  const loadedFor = ref<PrimaryGame | null>(null)
  const loaded = computed(() => loadedFor.value === game.value)

  const cs2 = reactive({ profile: null as Cs2Profile | null, faceit: null as Cs2Faceit | null, demos: null as FileList | null, detecting: false, detectError: '' })
  const deadlock = reactive({ linked: false, stats: null as DeadlockProfileStats | null, replays: null as FileList | null, analyses: [] as DeadlockAnalysisItem[], uploads: {} as Record<string, UploadState> })
  const lol = reactive({
    linked: false, riotLabel: '', riotSource: null as 'league' | 'valorant' | null, matches: [] as LolMatchSummary[], analyses: [] as LolAnalysisItem[], rank: null as LolRankPayload | null, focus: null as Focus | null,
    /** Riot couldn't list games (or only some): shown instead of "no games". Null = the list is complete. */
    matchesError: null as Pick<LolRecentResult, 'error' | 'errorReason' | 'partial'> | null,
  })

  /** Last good data per game (per-user cache): screens draw it at once and refresh quietly. */
  function snapshot(g: PrimaryGame): GameSnapshot | null {
    if (g === 'cs2') return { game: 'cs2', profile: cs2.profile, faceit: cs2.faceit, demos: cs2.demos }
    if (g === 'deadlock') return { game: 'deadlock', linked: deadlock.linked, stats: deadlock.stats, replays: deadlock.replays, analyses: deadlock.analyses }
    if (g === 'lol') return { game: 'lol', linked: lol.linked, riotLabel: lol.riotLabel, riotSource: lol.riotSource, matches: lol.matches, analyses: lol.analyses, rank: lol.rank, focus: lol.focus, matchesError: lol.matchesError }
    return null
  }
  function hydrate(g: PrimaryGame): boolean {
    const hit = readCache<GameSnapshot>(`game:${g}`)?.value
    if (!hit || hit.game !== g) return false
    if (hit.game === 'cs2') Object.assign(cs2, { profile: hit.profile, faceit: hit.faceit, demos: hit.demos })
    else if (hit.game === 'deadlock') Object.assign(deadlock, { linked: hit.linked, stats: hit.stats, replays: hit.replays, analyses: hit.analyses ?? [] })
    else Object.assign(lol, { linked: hit.linked, riotLabel: hit.riotLabel, riotSource: hit.riotSource ?? null, matches: hit.matches, analyses: hit.analyses, rank: hit.rank ?? null, focus: hit.focus ?? null, matchesError: hit.matchesError ?? null })
    loadedFor.value = g
    return true
  }

  let seq = 0
  async function load(fresh = false) {
    const g = game.value
    if (g === 'valorant') return
    const mine = ++seq
    if (loadedFor.value !== g) hydrate(g)
    loading.value = true
    error.value = false
    try {
      if (g === 'cs2') {
        const [profile, faceit, demos] = await Promise.all([
          window.api.cs2.getProfile().catch(() => { error.value = true; return null }),
          window.api.cs2.getFaceitConnection().catch(() => null),
          window.api.cs2.listDemos().catch(() => null),
        ])
        if (mine !== seq) return
        // A failed refresh keeps the last good values on screen.
        if (profile || !error.value) cs2.profile = profile
        if (faceit) cs2.faceit = faceit
        if (demos) cs2.demos = demos
      } else if (g === 'deadlock') {
        const [res, replays, analyses] = await Promise.all([
          window.api.deadlock.getStats({ fresh }).catch(() => null),
          window.api.deadlock.listReplays().catch(() => null),
          // Replay reviews, shown in-app on Progress (optional: never blocks the screen).
          window.api.deadlock.getAnalyses(6).catch(() => null),
        ])
        if (mine !== seq) return
        error.value = !res || res.error === 'fetch_failed'
        if (!error.value) {
          deadlock.linked = !!res?.linked
          deadlock.stats = res?.stats ?? null
        }
        if (replays) deadlock.replays = replays
        if (Array.isArray(analyses)) deadlock.analyses = analyses
      } else {
        // The profile call can come back empty (it returns null on unexpected usage fields);
        // the signed-in user carries the same Riot ID fields, so use it as the fallback.
        const prof = await window.api.profile.get().catch(() => null)
        const user = prof?.user ?? await window.api.auth.getUser().catch(() => null)
        // League has its own Riot ID (lol_riot_*); fall back to the Valorant one like the API does.
        const id = lolIdentity(user as Parameters<typeof lolIdentity>[0])
        const linked = id.source !== null
        let recent: LolRecentResult = { matches: [], error: null, errorReason: null, partial: false }
        let analyses: LolAnalysisItem[] = []
        let rank: LolRankPayload | null = null
        if (linked) {
          [recent, analyses, rank] = await Promise.all([
            lolRecentResult(fresh),
            window.api.lol.getAnalyses(20),
            lolRankApi()?.().catch(() => null) ?? Promise.resolve(null),
          ])
        }
        // The API checks the focus while loading recent matches, so read it afterwards.
        const focus = linked
          ? await ((window.api.lol as { getFocus?: () => Promise<Focus | null> }).getFocus?.().catch(() => null) ?? Promise.resolve(null))
          : null
        if (mine !== seq) return
        lol.focus = focus
        lol.linked = linked
        lol.riotLabel = id.label
        lol.riotSource = id.source
        // Riot down with nothing listed: keep the last good games on screen and say why.
        const riotFailed = recent.error !== null && !recent.matches.length
        if (!riotFailed || !lol.matches.length) lol.matches = recent.matches
        lol.matchesError = recent.error || recent.partial ? { error: recent.error, errorReason: recent.errorReason, partial: recent.partial } : null
        lol.analyses = analyses
        lol.rank = rank
      }
    } catch {
      if (mine === seq) error.value = true
    } finally {
      if (mine === seq) {
        loading.value = false
        loadedFor.value = g
        const snap = error.value ? null : snapshot(g)
        if (snap) writeCache(`game:${g}`, snap)
      }
    }
  }

  const setup = computed<SetupState | null>(() => {
    if (game.value === 'cs2') return cs2Setup(cs2.profile, cs2.demos)
    if (game.value === 'deadlock') return deadlockSetup(deadlock.linked, deadlock.replays)
    if (game.value === 'lol') return lolSetup(lol.linked)
    return null
  })

  // ── Actions (same as the old panels) ──
  async function detectCs2Folder() {
    cs2.detecting = true
    cs2.detectError = ''
    try {
      const { dir, root } = await window.api.cs2.detectDemoDir()
      const settingsDir = root ?? dir
      if (settingsDir) {
        await window.api.settings.save({ cs2DemoDir: settingsDir })
        await load()
      } else {
        cs2.detectError = 'Could not find CS2. Is Steam installed on this PC?'
      }
    } finally {
      cs2.detecting = false
    }
  }

  function runSetup(action: SetupAction) {
    if (action === 'cs2_steam_name') void router.push({ path: '/settings', query: { tab: 'account', link: 'cs2' } })
    else if (action === 'cs2_detect_folder') void detectCs2Folder()
    else if (action === 'deadlock_link') void window.api.deadlock.openConnectSteam()
    else if (action === 'lol_link') void window.api.lol.openConnectRiot()
  }

  async function analyzeReplay(path: string) {
    const existing = deadlock.uploads[path]
    if (existing?.status === 'done' && existing.jobId) {
      void window.api.deadlock.openResults(existing.jobId)
      return
    }
    deadlock.uploads[path] = { busy: true, status: 'uploading', pct: 0 }
    const res = await window.api.deadlock.uploadDemo(path)
    if (res.ok) {
      deadlock.uploads[path] = { busy: false, status: 'done', pct: 100, jobId: res.jobId }
      void window.api.deadlock.openResults(res.jobId)
    } else {
      deadlock.uploads[path] = { busy: false, status: 'error', pct: 0, error: res.error }
    }
  }

  const actions = {
    cs2OpenFolder: () => void window.api.cs2.openDemosFolder(),
    cs2OpenAnalyze: () => void window.api.cs2.openAnalyze(),
    cs2OpenWeb: () => void window.api.cs2.openDashboard(),
    cs2ConnectFaceit: () => void window.api.cs2.openConnectFaceit(),
    cs2Settings: () => void router.push({ path: '/settings', query: { tab: 'account', link: 'cs2' } }),
    deadlockOpenFolder: () => void window.api.deadlock.openReplaysFolder(),
    deadlockOpenWeb: () => void window.api.deadlock.openDashboard(),
    deadlockConnect: () => void window.api.deadlock.openConnectSteam(),
    lolOpenWeb: () => void window.api.lol.openHistory(),
    lolConnect: () => void window.api.lol.openConnectRiot(),
    lolOpenResults: (id: number) => void window.api.lol.openResults(id),
    lolRecordings: () => void router.push({ path: '/recordings', query: { game: 'lol' } }),
  }

  let offRefresh: (() => void) | null = null
  let offUpload: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    void load()
    offRefresh = window.api.on('dashboard:refresh', (...args: unknown[]) => {
      const payload = args[0] as { fresh?: boolean } | undefined
      void load(game.value === 'lol' ? true : !!payload?.fresh)
    })
    offUpload = window.api.on('deadlock:upload-progress', (...args: unknown[]) => {
      const p = args[0] as { demoPath?: string; pct?: number }
      if (!p?.demoPath) return
      const prev = deadlock.uploads[p.demoPath] ?? { busy: true, status: 'uploading', pct: 0 }
      deadlock.uploads[p.demoPath] = { ...prev, busy: true, status: 'uploading', pct: p.pct ?? 0 }
    })
    // The old Deadlock panel refreshed stats every 3 minutes; keep that, Deadlock only.
    timer = setInterval(() => { if (game.value === 'deadlock') void load(true) }, 3 * 60 * 1000)
  })
  onUnmounted(() => {
    offRefresh?.()
    offUpload?.()
    if (timer) clearInterval(timer)
  })
  watch(game, () => { void load() })

  return { loading, loaded, error, cs2, deadlock, lol, setup, load, runSetup, analyzeReplay, actions }
}

export type GameData = ReturnType<typeof useGameData>
