<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { PendingRecording } from '../env.d.ts'
import { useGameTheme } from '../composables/useGameTheme'
import { openAnalysisVodReview } from '../lib/open-vod-review'
import { canOpenTimeline, canWatchRawRecording } from '../lib/recording-demo-status'
import { canRetryRiotMatchStats } from '../lib/match-stats-retry'
import {
  recordingGameTitle,
  recordingMapImage,
  recordingMapLabel,
  recordingPlayerAccent,
  recordingPlayerImage,
  recordingPlayerLabel,
} from '../lib/recording-display'
import { recordingStatusBadge } from '../lib/recording-status'

const router = useRouter()
const { theme, cssVars } = useGameTheme()

const recordings = ref<PendingRecording[]>([])
const loading = ref(true)
const busyId = ref<string | null>(null)
const message = ref<string | null>(null)
const gameFilter = ref<string>('all')
const obsConnected = ref<boolean | null>(null)

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
    if (!rec.analysisReadiness?.ready && canRetryRiotMatchStats(rec)) {
      const sync = await window.api.recordings.retryMatchStats(rec.id)
      await load()
      if (!sync?.ok) {
        message.value = sync?.error
          ?? 'Could not load Riot match stats — open Riot Client / Valorant and try again.'
        return
      }
      message.value = 'Match stats synced — tap Analyse again for coaching.'
      return
    }
    const result = await window.api.recordings.analyse(rec.id)
    if (result?.error) message.value = result.error
    else {
      await window.api.app.refreshDashboard?.()
      router.push('/dashboard')
    }
  } catch {
    message.value = 'Could not start analysis — try again.'
  } finally {
    busyId.value = null
  }
}

const canAnalyse = (rec: PendingRecording) =>
  rec.analysisId == null
  && !rec.pipelineStatus
  && (Boolean(rec.analysisReadiness?.ready) || canRetryRiotMatchStats(rec))

onMounted(async () => {
  const s = await window.api.app.getStatus().catch(() => null)
  obsConnected.value = s?.obsConnected ?? null
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
            <p class="text-[10px] text-gray-600 mt-1">
              Local = on your PC · Cloud = backed up · Analysed = coaching ready
            </p>
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

      <div v-else-if="!filtered.length" class="flex h-56 flex-col items-center justify-center text-center gap-2">
        <p class="text-sm font-semibold text-gray-400">No recordings yet</p>
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
                :class="recordingStatusBadge(rec).class"
              >{{ recordingStatusBadge(rec).label }}</span>
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
              >{{ rec.analysisReadiness?.ready ? 'Analyse' : 'Retry sync' }}</button>
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
