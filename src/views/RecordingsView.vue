<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PendingRecording } from '../env.d.ts'
import { useGameTheme } from '../composables/useGameTheme'
import { openAnalysisVodReview } from '../lib/open-vod-review'
import { canOpenTimeline, canWatchRawRecording } from '../lib/recording-demo-status'
import {
  recordingGameTitle,
  recordingMapImage,
  recordingMapLabel,
  recordingPlayerAccent,
  recordingPlayerImage,
  recordingPlayerLabel,
} from '../lib/recording-display'
import {
  formatRecordingBytes,
  groupRecordingsByDate,
  matchesRecordingLibraryChip,
  recordingDeleteOptions,
  recordingNeedsAttention,
  type RecordingDateGroup,
  type RecordingLibraryChip,
  visibleGroupItems,
} from '../lib/recording-library'
import { recordingStatusBadge } from '../lib/recording-status'

const router = useRouter()
const route = useRoute()
const { theme, cssVars } = useGameTheme()

const recordings = ref<PendingRecording[]>([])
const loading = ref(true)
const busyId = ref<string | null>(null)
const message = ref<string | null>(null)
const gameFilter = ref<string>('all')
const obsConnected = ref<boolean | null>(null)
const RECORDING_LIBRARY_CHIPS = new Set<RecordingLibraryChip>(['all', 'action_required', 'ready', 'analysed', 'cloud'])
function routeStatusChip(value: unknown): RecordingLibraryChip {
  return typeof value === 'string' && RECORDING_LIBRARY_CHIPS.has(value as RecordingLibraryChip)
    ? value as RecordingLibraryChip
    : 'all'
}
const statusChip = ref<RecordingLibraryChip>(routeStatusChip(route.query.status))
const recordingsBytes = ref(0)
const collapsedGroups = ref<Set<string>>(new Set())
const showAllByGroup = ref<Set<string>>(new Set())
const selecting = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const pendingDelete = ref<{ rec: PendingRecording; variant: 'cloud' } | null>(null)

const statusChips: { label: string; value: RecordingLibraryChip }[] = [
  { label: 'All', value: 'all' },
  { label: 'Action required', value: 'action_required' },
  { label: 'Ready', value: 'ready' },
  { label: 'Analysed', value: 'analysed' },
  { label: 'Cloud', value: 'cloud' },
]

let cleanup: (() => void) | null = null

async function loadStorage() {
  const usage = await window.api.storage.getUsage().catch(() => null)
  recordingsBytes.value = usage?.recordingsBytes ?? 0
}

async function load() {
  loading.value = true
  try {
    recordings.value = await window.api.recordings.listAll().catch(() => [] as PendingRecording[])
  } finally {
    loading.value = false
  }
  void loadStorage()
}

const gamesPresent = computed(() => {
  const seen = new Set<string>()
  for (const r of recordings.value) seen.add(r.game)
  return Array.from(seen)
})

const filtered = computed(() => {
  if (gameFilter.value === 'all') return recordings.value
  return recordings.value.filter(r => r.game === gameFilter.value)
})

const chipFiltered = computed(() =>
  filtered.value.filter(r => matchesRecordingLibraryChip(r, statusChip.value)),
)

const dateGroups = computed(() => groupRecordingsByDate(chipFiltered.value))

watch(dateGroups, (groups) => {
  const next = new Set<string>()
  groups.slice(1).forEach(g => next.add(g.label))
  collapsedGroups.value = next
}, { immediate: true })

watch(() => route.query.status, (status) => {
  statusChip.value = routeStatusChip(status)
})

function toggleGroup(label: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(label)) next.delete(label)
  else next.add(label)
  collapsedGroups.value = next
}

function isGroupExpanded(label: string): boolean {
  return !collapsedGroups.value.has(label)
}

function showMoreInGroup(label: string) {
  const next = new Set(showAllByGroup.value)
  next.add(label)
  showAllByGroup.value = next
}

function groupVisibility(group: RecordingDateGroup) {
  return visibleGroupItems(group.items, showAllByGroup.value.has(group.label))
}

function openFolder() {
  void window.api.storage.openFolder()
}

function relativeDate(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

async function openBest(rec: PendingRecording) {
  message.value = null
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
    router.push({ path: '/vod-review', query: { id: rec.id } })
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

function isRecordingInFlight(rec: PendingRecording): boolean {
  return rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing'
}

const inFlightAbortMessage = 'This recording is still uploading or analysing. Abort and delete it from this PC?'

async function deleteRecording(rec: PendingRecording) {
  const options = recordingDeleteOptions(rec)

  if (isRecordingInFlight(rec) && !window.confirm(inFlightAbortMessage)) return

  if (options.includes('localOnly')) {
    pendingDelete.value = { rec, variant: 'cloud' }
    return
  }

  const hasLocal = Boolean(rec.hasLocalFile || rec.path)
  const label = hasLocal
    ? 'Delete this recording from your library and remove the local file?'
    : 'Remove this recording from your library?'
  if (!window.confirm(label)) return
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
  const ok = window.confirm(
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

onMounted(async () => {
  cleanup = window.api.on('recordings:updated', () => { void load() })
  const s = await window.api.app.getStatus().catch(() => null)
  obsConnected.value = s?.obsConnected ?? null
  void load()
})

onUnmounted(() => { cleanup?.() })
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden text-white" :style="cssVars">
    <div class="flex-shrink-0 px-4 pt-4 pb-2 border-b border-white/[0.08]">
      <div class="panel-elevated relative overflow-hidden px-4 py-3.5">
        <div class="absolute -right-8 top-0 h-24 w-24 rounded-full blur-3xl pointer-events-none" :class="theme.accentBg" />
        <div class="relative flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.28em]" :class="theme.accentMuted">Storage</p>
            <h1 class="text-lg font-black tracking-tight text-white">Footage</h1>
            <p class="text-[11px] text-gray-500 mt-0.5">Watch and manage the local or cloud video attached to your matches.</p>
            <p class="text-[10px] text-gray-600 mt-1">Use Matches to track coaching status and run analysis.</p>
          </div>
          <span class="hidden sm:inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-gray-300">
            {{ chipFiltered.length }} {{ chipFiltered.length === 1 ? 'recording' : 'recordings' }}
          </span>
        </div>
      </div>
    </div>

    <nav v-if="gamesPresent.length > 1" class="flex flex-shrink-0 gap-1 overflow-x-auto scrollbar-hide border-b border-white/[0.09] bg-[#161616]/80 px-4 py-2.5">
      <button
        class="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
        :class="gameFilter === 'all' ? `${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}` : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'"
        @click="gameFilter = 'all'"
      >All games</button>
      <button
        v-for="g in gamesPresent"
        :key="g"
        class="rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-colors"
        :class="gameFilter === g ? `${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}` : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'"
        @click="gameFilter = g"
      >{{ recordingGameTitle({ game: g }) }}</button>
    </nav>

    <div
      v-if="filtered.length > 0"
      class="panel-elevated mx-4 mt-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-3 px-3 py-2.5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="chip in statusChips"
          :key="chip.value"
          class="rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150"
          :class="statusChip === chip.value
            ? `${theme.accentBorder} ${theme.accentBg} ${theme.accentText}`
            : 'border-white/[0.10] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
          @click="statusChip = chip.value"
        >
          {{ chip.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <span>{{ chipFiltered.length }} {{ chipFiltered.length === 1 ? 'recording' : 'recordings' }}</span>
        <span class="text-gray-800">·</span>
        <span>{{ formatRecordingBytes(recordingsBytes) }} local</span>
        <button
          type="button"
          class="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-gray-400 transition-colors hover:border-white/[0.14] hover:text-gray-200"
          @click="openFolder"
        >
          Open folder
        </button>
        <button
          type="button"
          class="rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors"
          :class="selecting
            ? 'border-red-500/30 bg-red-500/15 text-red-400'
            : 'border-white/[0.08] text-gray-400 hover:border-white/[0.14] hover:text-gray-200'"
          @click="toggleSelectMode"
        >
          {{ selecting ? 'Cancel' : 'Select' }}
        </button>
      </div>
    </div>

    <div class="flex-1 scroll-col px-4 py-4">
      <p v-if="message" class="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">{{ message }}</p>

      <div v-if="loading" class="flex h-40 items-center justify-center text-sm text-gray-500">Loading footage…</div>

      <div v-else-if="!filtered.length" class="flex h-56 flex-col items-center justify-center text-center gap-2">
        <p class="text-sm font-semibold text-gray-400">No footage yet</p>
        <p class="text-xs text-gray-600 max-w-sm">
          {{ obsConnected === false
            ? 'OBS is not connected. Set up recording so match VODs appear here.'
            : 'Play a match to capture a VOD.' }}
        </p>
        <button
          v-if="obsConnected === false"
          type="button"
          class="mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-gray-200 bg-white/[0.06] hover:bg-white/[0.1]"
          @click="router.push('/settings?tab=recording')"
        >
          Open recording settings
        </button>
      </div>

      <div v-else-if="!chipFiltered.length" class="flex h-40 flex-col items-center justify-center text-center gap-1">
        <p class="text-sm font-semibold text-gray-400">No footage matches this filter</p>
        <p class="text-xs text-gray-600">Try another status chip or clear the game filter.</p>
      </div>

      <div v-else class="space-y-4">
        <section v-for="group in dateGroups" :key="group.label">
          <div
            class="mb-2 flex cursor-pointer items-center gap-2 px-1"
            @click="toggleGroup(group.label)"
          >
            <svg
              class="h-3 w-3 flex-shrink-0 text-gray-600 transition-transform"
              :class="isGroupExpanded(group.label) ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{{ group.label }}</span>
            <div class="hidden h-px flex-1 bg-white/[0.05] sm:block" />
            <span class="text-[10px] text-gray-700">{{ group.items.length }}</span>
          </div>

          <template v-if="isGroupExpanded(group.label)">
            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="rec in groupVisibility(group).shown"
                :key="rec.id"
                class="group relative overflow-hidden rounded-xl border bg-white/[0.02] transition-colors"
                :class="selecting && selectedIds.has(rec.id)
                  ? 'border-red-500/40 ring-1 ring-red-500/20'
                  : 'border-white/[0.08] hover:border-white/[0.16]'"
                @click="selecting ? toggleSelected(rec.id) : undefined"
              >
                <div
                  v-if="selecting"
                  class="absolute left-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded border"
                  :class="selectedIds.has(rec.id) ? 'border-red-500 bg-red-500' : 'border-white/30 bg-black/50'"
                >
                  <svg v-if="selectedIds.has(rec.id)" class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="relative h-24 overflow-hidden bg-black/40">
                  <img
                    v-if="recordingMapImage(rec)"
                    :src="recordingMapImage(rec)"
                    :alt="recordingMapLabel(rec)"
                    class="absolute inset-0 h-full w-full object-cover opacity-40"
                  />
                  <div class="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/40 to-transparent" />
                  <div class="absolute left-3 top-3 flex items-center gap-2">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1"
                      :class="recordingStatusBadge(rec).class"
                    >{{ recordingStatusBadge(rec).label }}</span>
                    <span
                      v-if="rec.productionFixture"
                      class="rounded-md border border-amber-500/30 bg-black/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300"
                    >Production fixture</span>
                  </div>
                  <div class="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-gray-300 capitalize">
                    {{ recordingGameTitle(rec) }}
                  </div>
                  <div class="absolute bottom-2 left-3 right-3 flex items-end gap-2">
                    <div
                      v-if="recordingPlayerImage(rec)"
                      class="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10"
                      :style="{ backgroundColor: recordingPlayerAccent(rec) }"
                    >
                      <img :src="recordingPlayerImage(rec)" :alt="recordingPlayerLabel(rec)" class="h-full w-full object-cover" />
                    </div>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-bold text-white">{{ recordingPlayerLabel(rec) }}</p>
                      <p class="truncate text-[11px] text-gray-400">{{ recordingMapLabel(rec) }}</p>
                    </div>
                  </div>
                </div>

                <div class="px-3 py-2.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <span class="text-[11px] text-gray-500">{{ relativeDate(rec.recordedAt) }}</span>
                      <p
                        v-if="attentionHint(rec)"
                        class="mt-0.5 truncate text-[10px] text-amber-400/90"
                        :title="attentionHint(rec) ?? undefined"
                      >
                        {{ attentionHint(rec) }}
                      </p>
                    </div>
                    <div v-if="!selecting" class="flex flex-shrink-0 items-center gap-1.5">
                      <button
                        v-if="recordingNeedsAttention(rec)"
                        class="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-gray-200 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
                        :disabled="busyId === rec.id"
                        @click.stop="continueInMatches(rec)"
                      >Continue in Matches</button>
                      <button
                        class="rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50"
                        :class="`${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}`"
                        :disabled="busyId === rec.id || (!canWatchRawRecording(rec) && rec.analysisId == null)"
                        @click.stop="openBest(rec)"
                      >{{ rec.analysisId != null || canOpenTimeline(rec) ? 'Review' : 'Watch' }}</button>
                      <button
                        type="button"
                        class="rounded-lg border border-white/[0.08] p-1.5 text-gray-500 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        title="Delete recording"
                        :disabled="busyId === rec.id"
                        @click.stop="deleteRecording(rec)"
                      >
                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              v-if="groupVisibility(group).hiddenCount > 0"
              type="button"
              class="mt-2 w-full rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-gray-500 transition-colors hover:border-white/[0.14] hover:text-gray-300"
              @click="showMoreInGroup(group.label)"
            >
              Show more ({{ groupVisibility(group).hiddenCount }})
            </button>
          </template>
        </section>
      </div>
    </div>

    <div
      v-if="selecting && selectedIds.size > 0"
      class="flex flex-shrink-0 items-center justify-center gap-3 border-t border-white/[0.08] bg-[#121212]/95 px-4 py-3 backdrop-blur-sm"
    >
      <span class="text-xs font-medium text-gray-300">{{ selectedIds.size }} selected</span>
      <span class="text-gray-700">·</span>
      <button
        type="button"
        class="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
        :disabled="busyId === '__bulk__'"
        @click="deleteSelected"
      >
        Delete
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/[0.14] hover:text-gray-200"
        @click="toggleSelectMode"
      >
        Cancel
      </button>
    </div>

    <div
      v-if="pendingDelete?.variant === 'cloud'"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="pendingDelete = null"
    >
      <div class="panel-elevated w-full max-w-sm rounded-xl border border-white/[0.08] p-4">
        <h2 class="text-sm font-bold text-white">Delete recording</h2>
        <p class="mt-1.5 text-xs text-gray-400">
          <template v-if="isRecordingInFlight(pendingDelete.rec)">
            This recording is still uploading or analysing. Deleting will abort the current process.
          </template>
          <template v-else>
            This recording is backed up to the cloud. Deleting the local copy also pauses automatic stats sync; Retry sync can restart it later.
          </template>
        </p>
        <div class="mt-4 flex flex-col gap-2">
          <button
            type="button"
            class="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
            :disabled="busyId === pendingDelete.rec.id"
            @click="runDismiss(pendingDelete.rec.id, 'localOnly')"
          >
            Delete local only
          </button>
          <button
            type="button"
            class="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
            :disabled="busyId === pendingDelete.rec.id"
            @click="runDismiss(pendingDelete.rec.id, 'remove')"
          >
            Remove from library
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-300"
            :disabled="busyId === pendingDelete.rec.id"
            @click="pendingDelete = null"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
