/**
 * Footage library state + actions: the ONE source of logic for both the old Footage screen
 * (src/views/RecordingsView.vue) and the UI v3 Matches screen (src/views/v3/MatchesV3.vue).
 * Same IPC calls, same confirm texts, same filters for both.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { uiV3 } from '../../../lib/ui-v3'
import { useRoute, useRouter } from 'vue-router'
import type { PendingRecording } from '../../../env.d.ts'
import { mergeFootage, footageUnavailable, type LibraryRecording } from '../../../lib/footage-library'
import { validCloudPage, type CloudFile } from '../../../lib/cloud-storage'
import { openAnalysisVodReview } from '../../../lib/open-vod-review'
import { prefetchAnalysis, prefetchArchive } from '../../../composables/vod/match-prefetch'
import { matchRouteKey, rememberMatchSummary, summaryFromRow } from '../../../composables/vod/match-summary'
import { readCache, writeCache } from '../../../lib/stale-cache'
import { canWatchRawRecording } from '../../../lib/recording-demo-status'
import {
  formatRecordingBytes,
  groupRecordingsByDate,
  matchesRecordingLibraryChip,
  recordingDeleteOptions,
  recordingNeedsAttention,
  type RecordingDateGroup,
  type RecordingLibraryChip,
  visibleGroupItems,
} from '../../../lib/recording-library'
import { recordingStatusBadge } from '../../../lib/recording-status'

const STATUS_CHIPS = new Set<RecordingLibraryChip>(['all', 'action_required', 'ready', 'analysed', 'cloud'])
function routeStatusChip(value: unknown): RecordingLibraryChip {
  return typeof value === 'string' && STATUS_CHIPS.has(value as RecordingLibraryChip) ? value as RecordingLibraryChip : 'all'
}

export const statusFilters: { label: string; value: RecordingLibraryChip }[] = [
  { label: 'All', value: 'all' },
  { label: 'Action required', value: 'action_required' },
  { label: 'Ready', value: 'ready' },
  { label: 'Analysed', value: 'analysed' },
  { label: 'Cloud', value: 'cloud' },
]

export interface FootageLibraryOptions {
  /** Asks the user to confirm a destructive step. Defaults to the native dialog (old UI); v3 passes a UfDialog. */
  confirm?: (message: string) => Promise<boolean>
}

export function useFootageLibrary(options: FootageLibraryOptions = {}) {
  const confirmAction = options.confirm ?? (async (message: string) => window.confirm(message))
  const router = useRouter()
  const route = useRoute()

  const localRecordings = ref<PendingRecording[]>([])
  const cloudFiles = ref<CloudFile[]>([])
  const recordings = computed(() => mergeFootage(localRecordings.value, cloudFiles.value))
  const cloudError = ref('')
  let cloudRequest = 0
  // Registered when the composable is created (during setup), like the original view did,
  // so a sign-out that happens before mount still clears footage.
  const sessionCleanups = ['session:user-changed', 'auth:session-expired'].map(event => window.api.on(event, () => {
    cloudRequest++; cloudFiles.value = []; localRecordings.value = []; cloudError.value = 'Sign in to load cloud footage.'
  }))

  /** UI v3: true only while the first-ever cloud list loads (nothing cached yet) — show row skeletons. */
  const cloudLoading = ref(false)
  const CLOUD_CACHE_KEY = 'matches:cloud-recordings'

  async function loadCloud() {
    const request = ++cloudRequest
    cloudError.value = ''
    if (uiV3.value && !cloudFiles.value.length) {
      // Last known cloud list draws instantly; the fetch below refreshes it quietly.
      const cached = readCache<CloudFile[]>(CLOUD_CACHE_KEY)?.value
      if (Array.isArray(cached)) cloudFiles.value = cached
    }
    cloudLoading.value = uiV3.value && !cloudFiles.value.length
    const files: CloudFile[] = []
    try {
      let page = 1
      let lastPage = 1
      do {
        const result = await window.api.cloudStorage.list({ kind: 'recording', game: 'all', sort: 'newest', page })
        if (request !== cloudRequest) return
        if (!result.ok) throw new Error(result.error)
        if (!validCloudPage(result.data) || result.data.page !== page) throw new Error('Cloud footage could not be verified.')
        files.push(...result.data.items)
        lastPage = result.data.last_page
        page++
      } while (page <= lastPage)
      cloudFiles.value = files
      if (uiV3.value) writeCache(CLOUD_CACHE_KEY, files)
    } catch (error) {
      if (request === cloudRequest) cloudError.value = error instanceof Error ? error.message : 'Cloud footage is unavailable.'
    } finally {
      if (request === cloudRequest) cloudLoading.value = false
    }
  }

  const loading = ref(true)
  const libraryError = ref('')
  const busyId = ref<string | null>(null)
  const message = ref<string | null>(null)
  const gameFilter = ref<string>(route.query.game === 'lol' ? 'lol' : 'all')
  const statusChip = ref<RecordingLibraryChip>(routeStatusChip(route.query.status))
  const obsConnected = ref<boolean | null>(null)
  const recordingsBytes = ref(0)
  const collapsedGroups = ref<Set<string>>(new Set())
  const showAllByGroup = ref<Set<string>>(new Set())
  const selecting = ref(false)
  const selectedIds = ref<Set<string>>(new Set())
  const pendingDelete = ref<{ rec: PendingRecording; variant: 'cloud' } | null>(null)

  async function loadStorage() {
    const usage = await window.api.storage.getUsage().catch(() => null)
    recordingsBytes.value = usage?.recordingsBytes ?? 0
  }

  async function load() {
    loading.value = true
    libraryError.value = ''
    try {
      // v3 lists every linked Riot account (main + alts) with a role per row; the old UI keeps the active account only.
      localRecordings.value = await window.api.recordings.listAll(uiV3.value ? { allAccounts: true } : undefined)
      void loadCloud()
    } catch {
      libraryError.value = 'Could not load footage. Your files have not been removed.'
    } finally {
      loading.value = false
    }
    void loadStorage()
  }

  const gamesPresent = computed(() => Array.from(new Set(recordings.value.map(r => r.game))))
  const accountFilter = ref<'all' | 'main' | 'alt'>('all')
  const hasAltRows = computed(() => recordings.value.some(r => (r as { riotAccountRole?: string | null }).riotAccountRole === 'alt'))
  const filtered = computed(() => recordings.value
    .filter(r => gameFilter.value === 'all' || r.game === gameFilter.value)
    .filter((r) => {
      if (accountFilter.value === 'all') return true
      const role = (r as { riotAccountRole?: string | null }).riotAccountRole
      // Untagged rows (other games, or no Riot ID) belong with the main account.
      return accountFilter.value === 'alt' ? role === 'alt' : role !== 'alt'
    }))
  const chipFiltered = computed(() =>
    filtered.value.filter(r => statusChip.value === 'cloud' ? !!r.archiveId || !!r.cloudUploaded : matchesRecordingLibraryChip(r, statusChip.value)),
  )
  const dateGroups = computed(() => groupRecordingsByDate(chipFiltered.value))

  watch(dateGroups, (groups) => {
    const next = new Set<string>()
    groups.slice(1).forEach(g => next.add(g.label))
    collapsedGroups.value = next
  }, { immediate: true })
  watch(() => route.query.game, game => { gameFilter.value = game === 'lol' ? 'lol' : 'all' })
  watch(() => route.query.status, status => { statusChip.value = routeStatusChip(status) })

  function toggleGroup(label: string) {
    const next = new Set(collapsedGroups.value)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    collapsedGroups.value = next
  }
  const isGroupExpanded = (label: string) => !collapsedGroups.value.has(label)
  function showMoreInGroup(label: string) {
    showAllByGroup.value = new Set(showAllByGroup.value).add(label)
  }
  function groupVisibility(group: RecordingDateGroup) {
    return visibleGroupItems(group.items as LibraryRecording[], showAllByGroup.value.has(group.label))
  }

  function openFolder() { void window.api.storage.openFolder() }

  /** UI v3: hand the match page the row's own facts so its header draws immediately. */
  function rememberRow(rec: LibraryRecording, query: Record<string, string>) {
    if (uiV3.value) rememberMatchSummary(matchRouteKey(query), summaryFromRow(rec))
  }

  /** UI v3: hover / focus on a row warms the match page (read-only GETs). */
  function prefetchRow(rec: LibraryRecording) {
    if (!uiV3.value || footageUnavailable(rec)) return
    if (rec.cloudOnly || (!rec.hasLocalFile && rec.archiveId)) { prefetchArchive(rec.archiveId); return }
    if (rec.analysisId != null) prefetchAnalysis(rec.analysisId)
  }

  function watchRecording(rec: LibraryRecording) {
    if (!rec.hasLocalFile && rec.archiveId) { void openBest(rec); return }
    rememberRow(rec, { id: rec.id })
    void router.push({ path: '/vod-review', query: { id: rec.id } })
  }

  async function openBest(rec: LibraryRecording) {
    if (footageUnavailable(rec)) { message.value = footageUnavailable(rec); return }
    if (rec.cloudOnly || (!rec.hasLocalFile && rec.archiveId)) {
      rememberRow(rec, { archiveId: rec.archiveId! })
      if (uiV3.value) prefetchArchive(rec.archiveId)
      void router.push({ path: '/vod-review', query: { archiveId: rec.archiveId } }); return
    }
    message.value = null
    if (rec.analysisId != null && uiV3.value) {
      // v3: open now; the match page draws its header from the row and loads the rest itself.
      const query = { timelineId: String(rec.analysisId) }
      rememberRow(rec, query)
      prefetchAnalysis(rec.analysisId)
      await router.push({ path: '/vod-review', query })
      void window.api.funnel?.trackReportOpened?.({ analysis_id: rec.analysisId, source: 'desktop_vod_review' })
      return
    }
    if (rec.analysisId != null) {
      busyId.value = rec.id
      try {
        const ok = await openAnalysisVodReview(router, rec.analysisId)
        if (!ok) message.value = 'Timeline data not available for this match.'
      } catch {
        message.value = 'Could not open this recording. Try again.'
      } finally {
        busyId.value = null
      }
      return
    }
    if (canWatchRawRecording(rec)) {
      rememberRow(rec, { id: rec.id })
      void router.push({ path: '/vod-review', query: { id: rec.id } })
      return
    }
    message.value = 'This recording is no longer available locally or in the cloud.'
  }

  function continueInMatches(rec: PendingRecording) {
    void router.push({ path: '/history', query: { recording: rec.id } })
  }

  function attentionHint(rec: PendingRecording): string | null {
    if (!recordingNeedsAttention(rec)) return null
    if (rec.lastAnalysisError) return rec.lastAnalysisError
    if (!canWatchRawRecording(rec) && rec.analysisId == null) return 'File missing'
    if (rec.analysisReadiness?.message) return rec.analysisReadiness.message
    const badge = recordingStatusBadge(rec)
    if (badge.label === 'Failed' || badge.label === 'Syncing') return badge.label
    return null
  }

  function toggleSelectMode() {
    selecting.value = !selecting.value
    selectedIds.value = new Set()
  }
  function toggleSelected(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  const isRecordingInFlight = (rec: PendingRecording) => rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing'

  async function deleteRecording(rec: PendingRecording) {
    const options = recordingDeleteOptions(rec)
    if (isRecordingInFlight(rec) && !(await confirmAction('This recording is still uploading or analysing. Abort and delete it from this PC?'))) return
    if (options.includes('localOnly')) {
      pendingDelete.value = { rec, variant: 'cloud' }
      return
    }
    const hasLocal = Boolean(rec.hasLocalFile || rec.path)
    const label = hasLocal
      ? 'Delete this recording from your library and remove the local file?'
      : 'Remove this recording from your library?'
    if (!(await confirmAction(label))) return
    await runDismiss(rec.id, 'remove')
  }

  async function runDismiss(id: string, mode: 'remove' | 'localOnly') {
    busyId.value = id
    message.value = null
    try {
      const result = await window.api.recordings.dismiss(id, { mode, deleteLocal: true })
      if (!result?.ok) {
        message.value = result?.error ?? 'Could not delete recording.'
        return
      }
      const freed = result.freedBytes ?? 0
      message.value = freed > 0
        ? `Deleted. Freed ${formatRecordingBytes(freed)}.${mode === 'localOnly' ? ' Automatic stats sync paused.' : ''}`
        : (mode === 'localOnly' ? 'Local file removed. Cloud copy kept and automatic stats sync paused.' : 'Removed from library.')
      await load()
    } catch {
      message.value = 'Could not delete recording. Try again.'
    } finally {
      busyId.value = null
      pendingDelete.value = null
    }
  }

  async function deleteSelected() {
    const selected = recordings.value.filter(r => selectedIds.value.has(r.id))
    if (!selected.length) return
    const cloudBackedLocal = selected.filter(r => recordingDeleteOptions(r).includes('localOnly')).length
    const ok = await confirmAction(
      cloudBackedLocal > 0
        ? `Remove ${selected.length} recording(s) from your library? Local files will be deleted. Cloud copies stay (${cloudBackedLocal} cloud-backed).`
        : `Delete ${selected.length} recording(s) from your library and remove local files?`,
    )
    if (!ok) return
    let freed = 0
    let failed = 0
    busyId.value = '__bulk__'
    for (const r of selected) {
      const result = await window.api.recordings.dismiss(r.id, { mode: 'remove', deleteLocal: true }).catch(() => null)
      if (!result?.ok) failed++
      else freed += result.freedBytes ?? 0
    }
    message.value = failed
      ? `Removed ${selected.length - failed}, ${failed} failed.${freed ? ` Freed ${formatRecordingBytes(freed)}.` : ''}`
      : `Deleted ${selected.length}.${freed ? ` Freed ${formatRecordingBytes(freed)}.` : ''}`
    selecting.value = false
    selectedIds.value = new Set()
    busyId.value = null
    await load()
  }

  let cleanup: (() => void) | null = null
  onMounted(async () => {
    cleanup = window.api.on('recordings:updated', () => { void load() })
    const s = await window.api.app.getStatus().catch(() => null)
    obsConnected.value = s?.obsConnected ?? null
    void load()
  })
  onUnmounted(() => { cleanup?.(); cloudRequest++; sessionCleanups.forEach(fn => fn()) })

  return {
    recordings, filtered, chipFiltered, dateGroups, gamesPresent, gameFilter, statusChip, accountFilter, hasAltRows,
    loading, cloudLoading, libraryError, cloudError, message, busyId, obsConnected, recordingsBytes,
    selecting, selectedIds, pendingDelete,
    load, loadCloud, openFolder, toggleGroup, isGroupExpanded, showMoreInGroup, groupVisibility,
    watchRecording, openBest, prefetchRow, continueInMatches, attentionHint, toggleSelectMode, toggleSelected,
    isRecordingInFlight, deleteRecording, runDismiss, deleteSelected,
  }
}
