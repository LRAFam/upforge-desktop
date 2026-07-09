<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PendingRecording } from '../../env.d.ts'
import { useDashboard } from '../../composables/useDashboard'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { MOCK_NEEDS_YOU_RECORDINGS } from '../../lib/dashboard-needs-you-mock'
import {
  formatRelativeTime,
  formatFileSize,
  recordingRowStats,
} from '../../lib/dashboard-match-row'
import {
  recordingMapImage,
  recordingMapLabel,
  recordingPlayerAccent,
  recordingPlayerImage,
  recordingPlayerLabel,
} from '../../lib/recording-display'
import { isDisplayableGameMode } from '../../lib/valorant'
import {
  canOpenTimeline,
  canWatchRawRecording,
  recordingDemoBadge,
  recordingDemoPending,
  demoPendingSectionHint,
  demoPendingSectionTitle,
} from '../../lib/recording-demo-status'

const props = defineProps<{ preview?: boolean }>()

const { primaryGame } = usePrimaryGame()
const {
  pendingRecordings,
  analysingIds,
  savingIds,
  bulkAnalysablePending,
  analyseOldestPending,
  analyseRecording,
  saveRecording,
  openRecordingReview,
  recAnalysisReady,
  recInFlight,
  recIsDeferred,
  recAnalysisBlockedLabel,
  recAnalysisStatusShort,
  recUploadProgress,
  recPipelineLabel,
  formatMode,
} = useDashboard()

const showDemoMatches = ref(!!props.preview)

const rows = computed(() => {
  const source = showDemoMatches.value ? MOCK_NEEDS_YOU_RECORDINGS : pendingRecordings.value
  return source.filter((rec) => rec.game === primaryGame.value)
})

const readyNowRows = computed(() => rows.value.filter((rec) => !recordingDemoPending(rec)))
const demoPendingRows = computed(() => rows.value.filter((rec) => recordingDemoPending(rec)))

const sectionedRows = computed(() => {
  const sections: Array<{ key: string; title: string; hint?: string; tone: string; rows: PendingRecording[] }> = []
  if (readyNowRows.value.length) {
    sections.push({
      key: 'ready',
      title: 'Ready now',
      tone: 'text-emerald-400/90',
      rows: readyNowRows.value.slice(0, 2),
    })
  }
  if (demoPendingRows.value.length) {
    sections.push({
      key: 'demo',
      title: demoPendingSectionTitle(primaryGame.value),
      hint: demoPendingSectionHint(primaryGame.value),
      tone: 'text-blue-300/90',
      rows: demoPendingRows.value.slice(0, 2),
    })
  }
  return sections
})

function scoreLine(rec: PendingRecording): string {
  const ally = rec.timeline?.finalScore?.allyScore
  const enemy = rec.timeline?.finalScore?.enemyScore
  if (ally != null && enemy != null) return `${ally} – ${enemy}`
  return '—'
}

function canReviewVod(rec: PendingRecording): boolean {
  return canWatchRawRecording(rec)
}

function onWatchRecording(rec: PendingRecording) {
  if (props.preview) return
  openRecordingReview(rec, 'raw')
}

function onOpenTimeline(rec: PendingRecording) {
  if (props.preview) return
  openRecordingReview(rec, 'timeline')
}

function showSaveToCloud(rec: PendingRecording): boolean {
  return !rec.clipsOnly && !rec.cloudArchived && !rec.jobId && !recInFlight(rec)
}

function statusLabel(rec: PendingRecording): string {
  if (recInFlight(rec) || recIsDeferred(rec)) return recPipelineLabel(rec) || 'Working…'
  if (rec.lastAnalysisError) return 'Analysis failed — retry or review VOD'
  if (recAnalysisReady(rec)) return 'Ready for AI coaching'
  if (recordingDemoPending(rec)) return recAnalysisStatusShort(rec)
  return recAnalysisStatusShort(rec)
}

function statusTone(rec: PendingRecording): string {
  if (recInFlight(rec)) return 'text-blue-300/90'
  if (rec.lastAnalysisError) return 'text-amber-300/90'
  if (recAnalysisReady(rec)) return 'text-emerald-300/90'
  if (rec.analysisReadiness?.state === 'syncing' || rec.analysisReadiness?.state === 'finalizing') {
    return 'text-blue-300/90'
  }
  return 'text-gray-400'
}

function onAnalyse(rec: PendingRecording) {
  if (props.preview) return
  void analyseRecording(rec.id)
}

function onSave(rec: PendingRecording) {
  if (props.preview) return
  void saveRecording(rec.id)
}

function toggleDemoMatches() {
  showDemoMatches.value = !showDemoMatches.value
}
</script>

<template>
  <div class="dash-panel overflow-hidden flex-shrink-0 border border-amber-500/15">
    <div class="px-4 py-3 border-b border-white/[0.07] flex items-start justify-between gap-3 bg-amber-500/[0.04]">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-black">!</span>
          <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Needs you</p>
        </div>
        <p class="text-[11px] text-gray-500 mt-1 leading-snug max-w-xl">
          Matches waiting on your desk.
          <span class="text-gray-400">Watch the recording anytime</span> — open the kill timeline once stats link.
        </p>
      </div>
      <span class="text-[10px] text-gray-500 flex-shrink-0 pt-0.5">{{ rows.length }} pending</span>
    </div>

    <div v-if="rows.length === 0" class="px-4 py-5 text-[11px] text-gray-500 border-t border-white/[0.05]">
      No matches need action right now. Your next recorded match will appear here with
      <span class="text-gray-400">Watch recording</span>, <span class="text-gray-400">Open timeline</span>, and
      <span class="text-gray-400">Run AI analysis</span>.
      <div class="mt-3">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-amber-500/[0.12] text-amber-300 border border-amber-500/25 hover:bg-amber-500/[0.18] transition-colors"
          @click="toggleDemoMatches"
        >Show demo matches</button>
      </div>
    </div>

    <template v-else>
      <div v-for="section in sectionedRows" :key="section.key">
        <div class="px-4 pt-3 pb-1">
          <p class="text-[9px] font-bold uppercase tracking-[0.14em]" :class="section.tone">{{ section.title }}</p>
          <p v-if="section.hint" class="text-[10px] text-gray-600 mt-1 leading-snug max-w-xl">{{ section.hint }}</p>
        </div>
        <ul class="divide-y divide-white/[0.05] p-3 pt-2 space-y-3">
          <li
            v-for="rec in section.rows"
            :key="rec.id"
            class="needs-you-card relative overflow-hidden rounded-2xl border border-white/[0.09]"
          >
        <img
          v-if="recordingMapImage(rec)"
          :src="recordingMapImage(rec)"
          alt=""
          class="absolute inset-0 w-full h-full object-cover object-center scale-105"
        />
        <div
          class="absolute inset-0 opacity-40"
          :style="recordingPlayerAccent(rec) ? { background: `radial-gradient(ellipse at 72% 38%, ${recordingPlayerAccent(rec)}55, transparent 58%)` } : undefined"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/96 via-[#0a0a0a]/82 to-[#0a0a0a]/55" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/50 via-transparent to-[#0a0a0a]/94" />

        <div class="relative z-10 p-4 flex flex-col gap-3">
          <div class="flex-1 min-w-0 flex flex-col">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">
                  {{ recordingMapLabel(rec) }}
                  <span v-if="isDisplayableGameMode(rec.gameMode)" class="text-gray-600"> · {{ formatMode(rec.gameMode) }}</span>
                </p>
                <p class="text-3xl font-black text-white tabular-nums leading-none mt-1">{{ scoreLine(rec) }}</p>
              </div>
              <span
                v-if="recordingRowStats(rec).won != null"
                class="text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wide flex-shrink-0"
                :class="recordingRowStats(rec).won ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'"
              >{{ recordingRowStats(rec).won ? 'Win' : 'Loss' }}</span>
            </div>

            <div class="flex items-end gap-3 mt-3">
              <img
                v-if="recordingPlayerImage(rec)"
                :src="recordingPlayerImage(rec)"
                alt=""
                class="w-[72px] h-[80px] object-cover object-top drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)] flex-shrink-0"
              />
              <div class="min-w-0 pb-1">
                <p class="text-base font-black text-white truncate">{{ recordingPlayerLabel(rec) }}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">
                  {{ formatRelativeTime(new Date(rec.recordedAt).toISOString()) }}
                  <span v-if="rec.fileSizeBytes" class="text-gray-600"> · {{ formatFileSize(rec.fileSizeBytes) }}</span>
                  <span v-if="rec.hasLocalFile" class="text-sky-400/80"> · Local file</span>
                </p>
                <div class="flex flex-wrap items-center gap-2 mt-2">
                  <span
                    v-if="recordingDemoBadge(rec)"
                    class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                    :class="recordingDemoPending(rec)
                      ? 'text-blue-300/90 border-blue-500/25 bg-blue-500/10'
                      : 'text-emerald-300/90 border-emerald-500/25 bg-emerald-500/10'"
                  >{{ recordingDemoBadge(rec) }}</span>
                  <span v-if="recordingRowStats(rec).kills != null" class="text-[11px] font-mono font-bold tabular-nums text-gray-200">
                    {{ recordingRowStats(rec).kills }}<span class="text-gray-600 font-semibold">/</span>{{ recordingRowStats(rec).deaths }}<span class="text-gray-600 font-semibold">/</span>{{ recordingRowStats(rec).assists }}
                    <span class="text-[9px] font-bold text-gray-600 ml-1 uppercase">K/D/A</span>
                  </span>
                  <span
                    v-if="recordingRowStats(rec).hs_pct != null"
                    class="text-[10px] font-bold tabular-nums"
                    :class="recordingRowStats(rec).hs_pct! >= 25 ? 'text-orange-400' : 'text-gray-400'"
                  >{{ recordingRowStats(rec).hs_pct }}% HS</span>
                </div>
              </div>
            </div>

            <p class="text-[11px] mt-3 leading-snug" :class="statusTone(rec)">
              <svg
                v-if="recInFlight(rec) || rec.analysisReadiness?.state === 'syncing' || rec.analysisReadiness?.state === 'finalizing'"
                class="inline w-3 h-3 mr-1 -mt-px animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              ><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ statusLabel(rec) }}
            </p>
            <div
              v-if="recUploadProgress(rec) != null"
              class="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.06]"
            >
              <div
                class="h-full rounded-full bg-blue-500/80 transition-all duration-300"
                :style="{ width: recUploadProgress(rec)! + '%' }"
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-2 rounded-xl border border-white/12 bg-black/28 backdrop-blur-sm p-2">
            <button
              v-if="canReviewVod(rec)"
              type="button"
              class="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-[11px] font-semibold text-white bg-[#1b1d22] hover:bg-[#252831] border border-white/20 transition-colors text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              :disabled="preview"
              @click="onWatchRecording(rec)"
            >
              <span class="block">Watch recording</span>
              <span class="block text-[9px] font-medium text-gray-300/85 mt-0.5">Video only</span>
            </button>

            <button
              v-if="canReviewVod(rec)"
              type="button"
              class="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              :class="canOpenTimeline(rec)
                ? 'text-white bg-[#1b1d22] hover:bg-[#252831] border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'text-gray-400 bg-[#14161a] border border-white/10'"
              :disabled="preview || !canOpenTimeline(rec)"
              :title="canOpenTimeline(rec) ? 'Kill timeline + map intel' : recAnalysisBlockedLabel(rec)"
              @click="onOpenTimeline(rec)"
            >
              <span class="block">Open timeline</span>
              <span class="block text-[9px] font-medium mt-0.5" :class="canOpenTimeline(rec) ? 'text-gray-300/85' : 'text-gray-600'">
                {{ canOpenTimeline(rec) ? 'Kills + rounds' : 'Needs demo' }}
              </span>
            </button>

            <button
              v-if="!rec.clipsOnly"
              type="button"
              class="flex-1 min-w-[140px] px-3 py-2 rounded-lg text-[11px] font-bold text-white transition-colors text-left disabled:opacity-65"
              :class="recAnalysisReady(rec) && !recInFlight(rec)
                ? 'bg-gradient-to-r from-[#ff4d55] to-[#ff6a3d] hover:from-[#ff5d65] hover:to-[#ff7b4f] border border-white/20 shadow-[0_8px_18px_rgba(255,85,85,0.35)]'
                : 'bg-[#1c1f25] border border-white/15 text-gray-300/70 cursor-not-allowed'"
              :disabled="preview || analysingIds.has(rec.id) || recInFlight(rec) || (!recAnalysisReady(rec) && !rec.lastAnalysisError)"
              :title="!recAnalysisReady(rec) ? recAnalysisBlockedLabel(rec) : 'Upload + AI coaching report'"
              @click="onAnalyse(rec)"
            >
              <span class="flex items-center gap-1.5">
                <svg v-if="analysingIds.has(rec.id)" class="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                {{ analysingIds.has(rec.id) ? 'Starting…' : 'Run AI analysis' }}
              </span>
              <span class="block text-[9px] font-medium mt-0.5" :class="recAnalysisReady(rec) ? 'text-white/70' : 'text-gray-600'">
                {{ recAnalysisReady(rec) ? 'Full coaching report' : recAnalysisStatusShort(rec) }}
              </span>
            </button>

            <button
              v-if="showSaveToCloud(rec)"
              type="button"
              class="flex-1 min-w-[140px] px-3 py-2 rounded-lg text-[11px] font-semibold text-emerald-100 bg-gradient-to-r from-emerald-700/50 to-teal-700/45 hover:from-emerald-600/60 hover:to-teal-600/55 border border-emerald-300/30 transition-colors text-left disabled:opacity-65"
              :disabled="preview || savingIds.has(rec.id)"
              @click="onSave(rec)"
            >
              <span class="block">{{ savingIds.has(rec.id) ? 'Saving…' : 'Save to cloud' }}</span>
              <span class="block text-[9px] font-medium text-emerald-100/70 mt-0.5">Backup only — no AI</span>
            </button>
          </div>
        </div>
      </li>
        </ul>
      </div>
    </template>

    <div v-if="showDemoMatches" class="px-3 pb-3">
      <button
        type="button"
        class="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        @click="toggleDemoMatches"
      >Hide demo matches</button>
    </div>

    <button
      v-if="!preview && !showDemoMatches && bulkAnalysablePending.length > 1"
      type="button"
      class="w-full py-2.5 text-[10px] font-semibold text-red-400/90 border-t border-white/[0.06] hover:bg-white/[0.02]"
      @click="analyseOldestPending"
    >Analyse next in queue</button>
  </div>
</template>

<style scoped>
.needs-you-card {
  min-height: 152px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
</style>
