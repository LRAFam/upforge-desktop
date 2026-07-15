<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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

const router = useRouter()
const { theme, cssVars } = useGameTheme()

const recordings = ref<PendingRecording[]>([])
const loading = ref(true)
const busyId = ref<string | null>(null)
const message = ref<string | null>(null)
const gameFilter = ref<string>('all')

let cleanup: (() => void) | null = null

async function load() {
  loading.value = true
  try {
    recordings.value = await window.api.recordings.listAll().catch(() => [] as PendingRecording[])
  } finally {
    loading.value = false
  }
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

interface StatusBadge { label: string; class: string }

function statusBadge(rec: PendingRecording): StatusBadge {
  if (rec.analysisId != null) return { label: 'Analysed', class: 'bg-green-500/15 text-green-300 ring-green-500/25' }
  if (rec.pipelineStatus === 'analysing') return { label: 'Analysing', class: 'bg-blue-500/15 text-blue-300 ring-blue-500/25' }
  if (rec.pipelineStatus === 'uploading') return { label: 'Uploading', class: 'bg-blue-500/15 text-blue-300 ring-blue-500/25' }
  if (rec.lastAnalysisError) return { label: 'Failed', class: 'bg-red-500/15 text-red-300 ring-red-500/25' }
  const state = rec.analysisReadiness?.state
  if (state === 'syncing' || state === 'finalizing') return { label: 'Syncing', class: 'bg-amber-500/15 text-amber-300 ring-amber-500/25' }
  if (rec.cloudUploaded && !rec.hasLocalFile) return { label: 'In cloud', class: 'bg-white/10 text-gray-300 ring-white/15' }
  if (rec.hasLocalFile) return { label: 'On disk', class: 'bg-white/10 text-gray-300 ring-white/15' }
  return { label: 'Recording', class: 'bg-white/10 text-gray-300 ring-white/15' }
}

async function openBest(rec: PendingRecording) {
  message.value = null
  if (rec.analysisId != null) {
    busyId.value = rec.id
    try {
      const ok = await openAnalysisVodReview(router, rec.analysisId)
      if (!ok) message.value = 'Timeline data not available for this match.'
    } catch {
      message.value = 'Could not open this recording — try again.'
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

async function analyse(rec: PendingRecording) {
  busyId.value = rec.id
  message.value = null
  try {
    const result = await window.api.recordings.analyse(rec.id)
    if (result?.error) message.value = result.error
    else router.push('/dashboard')
  } catch {
    message.value = 'Could not start analysis — try again.'
  } finally {
    busyId.value = null
  }
}

const canAnalyse = (rec: PendingRecording) =>
  rec.analysisId == null
  && !rec.pipelineStatus
  && Boolean(rec.analysisReadiness?.ready)

onMounted(() => {
  load()
  cleanup = window.api.on('recordings:updated', () => { void load() })
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
            <p class="text-[10px] font-black uppercase tracking-[0.28em]" :class="theme.accentMuted">Library</p>
            <h1 class="text-lg font-black tracking-tight text-white">Recordings</h1>
            <p class="text-[11px] text-gray-500 mt-0.5">Every VOD you've captured — watch, review, or analyse</p>
          </div>
          <span class="hidden sm:inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-gray-300">
            {{ filtered.length }} {{ filtered.length === 1 ? 'recording' : 'recordings' }}
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

    <div class="flex-1 scroll-col px-4 py-4">
      <p v-if="message" class="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">{{ message }}</p>

      <div v-if="loading" class="flex h-40 items-center justify-center text-sm text-gray-500">Loading recordings…</div>

      <div v-else-if="!filtered.length" class="flex h-56 flex-col items-center justify-center text-center">
        <svg class="h-10 w-10 text-gray-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
        <p class="text-sm font-semibold text-gray-400">No recordings yet</p>
        <p class="text-xs text-gray-600 mt-1">Play a match with UpForge running and your VODs will appear here.</p>
      </div>

      <div v-else class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="rec in filtered"
          :key="rec.id"
          class="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/[0.16]"
        >
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
                :class="statusBadge(rec).class"
              >{{ statusBadge(rec).label }}</span>
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

          <div class="flex items-center justify-between gap-2 px-3 py-2.5">
            <span class="text-[11px] text-gray-500">{{ relativeDate(rec.recordedAt) }}</span>
            <div class="flex items-center gap-1.5">
              <button
                v-if="canAnalyse(rec)"
                class="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-gray-200 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
                :disabled="busyId === rec.id"
                @click="analyse(rec)"
              >Analyse</button>
              <button
                class="rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50"
                :class="`${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}`"
                :disabled="busyId === rec.id || (!canWatchRawRecording(rec) && rec.analysisId == null)"
                @click="openBest(rec)"
              >{{ rec.analysisId != null || canOpenTimeline(rec) ? 'Review' : 'Watch' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
