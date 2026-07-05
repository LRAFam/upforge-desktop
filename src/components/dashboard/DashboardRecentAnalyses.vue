<script setup lang="ts">
import { ref } from 'vue'
import type { PendingRecording } from '../../env.d.ts'
import { useDashboard } from '../../composables/useDashboard'
import {
  getAgentImage,
  getAgentRole,
  getAgentColor,
  getMapMinimap,
  getRoleColor,
  isDisplayableGameMode,
} from '../../lib/valorant'
import {
  formatRelativeTime,
  formatDate,
  formatFileSize,
} from '../../lib/dashboard-match-row'
import { scoreGrade, scoreLabel } from '../../lib/analysis-scoring'
import { formatAnalysisFailureMessage } from '../../lib/analysis-failure-messages'
import PostGameDuelDiagnostics from '../post-game/PostGameDuelDiagnostics.vue'
import { parseDuelFailureDiagnostics } from '../../lib/duel-diagnostics'

const {
  router,
  analyses,
  analysesLoading,
  coachingSnippets,
  coachReviewByAnalysisId,
  pendingRecordings,
  analysingIds,
  savingIds,
  status,
  lastFivePerf,
  dashboardAnalyses,
  bulkUploadablePending,
  bulkAnalysablePending,
  groupedAnalyses,
  bulkUploading,
  timelineLoadingId,
  formatMode,
  uploadAllPending,
  analyseOldestPending,
  saveRecording,
  analyseRecording,
  retryRecording,
  dismissRecording,
  abortInFlightRecording,
  openAnalysisRow,
  openCoachNotesVod,
  openClipsForSession,
  openRecordingReview,
  recInFlight,
  recIsDeferred,
  recAnalysisReady,
  recAnalysisBlockedLabel,
  recAnalysisStatusShort,
  recUploadProgress,
  recPipelineLabel,
  recRowStats,
  displayAcs,
  isAnalysisProcessing,
} = useDashboard()

function failureHint(rec: PendingRecording): string | null {
  if (rec.lastAnalysisErrorHint) return rec.lastAnalysisErrorHint
  const message = rec.lastAnalysisError
  if (!message) return null
  if (/late|unclear|sync/i.test(message)) return 'Tip: UpForge will enable Analyse once Riot stats finish syncing.'
  if (/timed out/i.test(message)) return 'Tip: try again — off-peak hours are usually faster.'
  if (/throttled|slow down/i.test(message)) return 'Tip: wait a minute, then tap Retry.'
  if (/incomplete|moov|finished saving/i.test(message)) return 'Tip: let OBS finish writing after the match ends.'
  if (rec.lastAnalysisCreditRefunded) return 'Your coaching credit was refunded — you can try again.'
  return null
}

function displayAnalysisError(rec: PendingRecording): string {
  if (!rec.lastAnalysisError) return ''
  return formatAnalysisFailureMessage(rec.lastAnalysisError)
}

function pendingRowClass(rec: PendingRecording): string {
  if (recIsDeferred(rec)) return 'pending-row-deferred'
  if (rec.pipelineArchiveOnly && rec.pipelineStatus === 'uploading') return 'pending-row-archive'
  if (rec.pipelineStatus === 'analysing' || (rec.analysed && !rec.analysisId)) return 'pending-row-analyse'
  return 'pending-row-default'
}

const footageDebugId = ref<string | null>(null)

function footageDiagnostics(rec: PendingRecording) {
  return parseDuelFailureDiagnostics(rec.lastAnalysisFailureDiagnostics)
}

function toggleFootageDebug(rec: PendingRecording) {
  footageDebugId.value = footageDebugId.value === rec.id ? null : rec.id
}
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col panel-elevated overflow-hidden">
    <div class="flex items-center justify-between flex-shrink-0 px-3 pt-2.5 pb-2 border-b border-white/[0.07]">
      <div class="flex items-center gap-2.5 min-w-0">
        <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent matches</h2>
        <span v-if="analyses.length || pendingRecordings.length" class="text-[10px] text-gray-700">{{ analyses.length + pendingRecordings.length }} sessions</span>
      </div>
      <button v-if="analyses.length > 0" class="text-xs text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0" @click="router.push('/history')">View all →</button>
    </div>

    <div
      v-if="lastFivePerf"
      class="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 border-b border-white/[0.06] bg-white/[0.015] text-xs"
    >
      <template v-if="lastFivePerf.wins > 0 || lastFivePerf.losses > 0">
        <div class="flex items-center gap-1">
          <span
            v-for="(won, i) in lastFivePerf.wl"
            :key="i"
            class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
            :class="won === true ? 'bg-green-500/20 text-green-400' : won === false ? 'bg-red-500/20 text-red-400' : 'bg-white/[0.05] text-gray-700'"
          >{{ won === true ? 'W' : won === false ? 'L' : '·' }}</span>
        </div>
        <span class="text-[10px] tabular-nums text-gray-500"><span class="text-green-400 font-bold">{{ lastFivePerf.wins }}W</span> · <span class="text-red-400 font-bold">{{ lastFivePerf.losses }}L</span></span>
      </template>
      <div class="flex-1" />
      <template v-if="lastFivePerf.avgAcs != null">
        <span class="text-[10px] text-gray-600">ACS <span class="font-bold text-gray-300">{{ lastFivePerf.avgAcs }}</span></span>
      </template>
      <template v-if="lastFivePerf.avgScore != null">
        <span class="text-[10px] text-gray-600">AI <span class="font-bold" :class="lastFivePerf.avgScore >= 70 ? 'text-green-400' : lastFivePerf.avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ lastFivePerf.avgScore * 10 }}</span></span>
      </template>
      <template v-if="lastFivePerf.avgHs != null">
        <span class="text-[10px] text-gray-600">HS <span class="font-bold text-gray-300">{{ lastFivePerf.avgHs }}%</span></span>
      </template>
    </div>

    <div
      v-if="(dashboardAnalyses.length > 0 || pendingRecordings.length > 0) && !analysesLoading"
      class="match-list-grid match-list-header hidden md:grid flex-shrink-0 px-3 py-2 border-b border-white/[0.07] text-[9px] font-bold uppercase tracking-[0.18em] text-gray-600"
    >
      <span class="match-list-cell-icon" />
      <span class="match-list-col-match">Match</span>
      <div class="match-list-stats">
        <span>W/L</span>
        <span>K/D/A</span>
        <span>ACS</span>
        <span>HS</span>
        <span>AI</span>
      </div>
      <span class="match-list-actions" />
    </div>

    <div class="flex-1 min-h-0 scroll-col overflow-y-auto p-2 space-y-1.5">
      <template v-if="pendingRecordings.length > 0">
        <div class="flex items-center gap-2 px-0.5 mb-1">
          <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">In progress</span>
          <span class="text-[10px] text-blue-500/70 bg-blue-500/10 px-1.5 py-px rounded-full">{{ pendingRecordings.length }}</span>
          <button
            v-if="bulkAnalysablePending.length > 1"
            type="button"
            class="text-[10px] font-medium text-red-400/80 hover:text-red-300 transition-colors disabled:opacity-50"
            :disabled="analysingIds.size > 0"
            @click="analyseOldestPending"
          >Analyse next</button>
          <button
            v-if="bulkUploadablePending.length > 1"
            type="button"
            class="ml-auto text-[10px] font-medium text-blue-400/80 hover:text-blue-300 transition-colors disabled:opacity-50"
            :disabled="bulkUploading"
            @click="uploadAllPending"
          >{{ bulkUploading ? 'Saving…' : 'Save all to cloud' }}</button>
        </div>
        <template v-for="rec in pendingRecordings" :key="rec.id">
        <div
          class="pending-row relative flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl transition-all"
          :class="pendingRowClass(rec)"
        >
          <div v-if="recRowStats(rec).won != null" class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" :class="recRowStats(rec).won ? 'bg-green-500' : 'bg-red-500'" />
          <div class="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center relative" :style="rec.agent ? { backgroundColor: getAgentColor(rec.agent) + '22' } : { backgroundColor: 'rgba(59,130,246,0.1)' }">
            <img v-if="rec.map && getMapMinimap(rec.map)" :src="getMapMinimap(rec.map)" class="absolute inset-0 w-full h-full object-cover opacity-20" />
            <img v-if="rec.agent && getAgentImage(rec.agent)" :src="getAgentImage(rec.agent)" class="relative w-8 h-8 object-contain" />
            <svg v-else class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1">
              <span class="text-xs font-semibold truncate text-gray-200">{{ rec.agent || 'Unknown' }}</span>
              <span v-if="rec.agent" class="flex-shrink-0 text-[8px] font-bold px-1 py-px rounded" :style="{ color: getRoleColor(getAgentRole(rec.agent)), backgroundColor: getRoleColor(getAgentRole(rec.agent)) + '20' }">{{ getAgentRole(rec.agent) }}</span>
            </div>
            <p class="text-[10px] text-gray-600 mt-0.5 truncate">
              {{ rec.map || '—' }} · {{ formatRelativeTime(new Date(rec.recordedAt).toISOString()) }}
              <span v-if="rec.clipsOnly && rec.clipCount != null" class="text-orange-400/80"> · {{ rec.clipCount }} clip{{ rec.clipCount === 1 ? '' : 's' }}</span>
              <span v-else-if="rec.fileSizeBytes" class="text-gray-700"> · {{ formatFileSize(rec.fileSizeBytes) }}</span>
              <span v-if="rec.cloudArchived || rec.jobId || rec.analysisId" class="text-emerald-500/80"> · Cloud</span>
              <span v-if="rec.hasLocalFile" class="text-sky-400/80"> · Local</span>
              <span v-else-if="(rec.cloudArchived || rec.jobId || rec.analysisId) && !rec.clipsOnly" class="text-gray-600"> · Cloud only</span>
              <span v-if="isDisplayableGameMode(rec.gameMode)" class="text-gray-700"> · {{ formatMode(rec.gameMode) }}</span>
              <span v-if="recPipelineLabel(rec)" class="text-blue-400/90"> · {{ recPipelineLabel(rec) }}</span>
            </p>
            <p
              v-if="rec.lastAnalysisError && !recInFlight(rec) && !recIsDeferred(rec)"
              class="text-[10px] text-amber-400/85 mt-1 leading-snug max-h-20 overflow-y-auto scroll-col pr-1"
            >
              {{ displayAnalysisError(rec) }}
              <span v-if="rec.lastAnalysisCreditRefunded" class="text-emerald-500/80"> · Credit refunded</span>
            </p>
            <p
              v-if="rec.lastAnalysisError && !recInFlight(rec) && failureHint(rec)"
              class="text-[10px] text-gray-600 mt-0.5 leading-snug"
            >
              {{ failureHint(rec) }}
            </p>
            <button
              v-if="footageDiagnostics(rec) && !recInFlight(rec)"
              type="button"
              class="mt-1 text-[10px] font-semibold text-amber-400/90 hover:text-amber-300 transition-colors"
              @click="toggleFootageDebug(rec)"
            >
              {{ footageDebugId === rec.id ? 'Hide fight footage debug' : 'Show fight footage debug' }}
            </button>
            <div
              v-if="recUploadProgress(rec) != null"
              class="mt-1.5 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-white/[0.06]"
            >
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="rec.pipelineArchiveOnly ? 'bg-emerald-500/80' : 'bg-blue-500/80'"
                :style="{ width: recUploadProgress(rec)! + '%' }"
              />
            </div>
          </div>
          <div class="hidden md:flex items-center justify-center gap-3 lg:gap-4 flex-shrink-0 px-1">
            <span v-if="recRowStats(rec).won != null" class="text-[10px] font-black px-2 py-0.5 rounded w-7 text-center" :class="recRowStats(rec).won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">{{ recRowStats(rec).won ? 'W' : 'L' }}</span>
            <span v-else class="text-[10px] text-gray-700 w-7 text-center">—</span>
            <span v-if="recRowStats(rec).kills != null" class="w-[4.5rem] text-xs font-mono font-semibold tabular-nums text-center">{{ recRowStats(rec).kills }}<span class="text-gray-600">/</span>{{ recRowStats(rec).deaths }}<span class="text-gray-600">/</span>{{ recRowStats(rec).assists }}</span>
            <span v-else class="w-[4.5rem] text-[10px] text-gray-700 text-center">—</span>
            <span v-if="recRowStats(rec).combat_score != null" class="w-10 text-xs font-bold tabular-nums text-gray-300 text-center">{{ recRowStats(rec).combat_score }}</span>
            <span v-else class="w-10 text-[10px] text-gray-700 text-center">—</span>
            <span v-if="recRowStats(rec).hs_pct != null" class="w-10 text-xs font-bold tabular-nums text-center" :class="recRowStats(rec).hs_pct! >= 25 ? 'text-orange-400' : 'text-gray-400'">{{ recRowStats(rec).hs_pct }}%</span>
            <span v-else class="w-10 text-[10px] text-gray-700 text-center">—</span>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0 ml-1">
            <button v-if="rec.clipsOnly" class="px-2 py-1 text-[10px] font-medium text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-lg transition-colors" @click="openClipsForSession(rec)">View clips</button>
            <button v-else-if="rec.timeline?.playerKills?.length || rec.timeline?.playerDeaths?.length || rec.jobId || rec.analysisId || rec.archiveId || rec.cloudUploaded" class="px-2 py-1 text-[10px] font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors" @click="openRecordingReview(rec)">Review</button>
            <button
              v-if="!rec.clipsOnly && !rec.cloudArchived && !rec.jobId && !recInFlight(rec)"
              :disabled="savingIds.has(rec.id)"
              class="px-2 py-1 text-[10px] font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-60 rounded-lg transition-colors"
              @click="saveRecording(rec.id)"
            >{{ savingIds.has(rec.id) ? '…' : 'Save' }}</button>
            <button
              v-if="rec.lastAnalysisError && !rec.clipsOnly && !recInFlight(rec)"
              :disabled="analysingIds.has(rec.id)"
              class="px-2 py-1 text-[10px] font-medium text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1"
              @click="retryRecording(rec.id)"
            >
              <svg v-if="analysingIds.has(rec.id)" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ analysingIds.has(rec.id) ? '…' : 'Retry' }}
            </button>
            <button
              v-else-if="!rec.clipsOnly && !recInFlight(rec) && !rec.lastAnalysisError && recAnalysisReady(rec)"
              :disabled="analysingIds.has(rec.id)"
              class="px-2 py-1 text-[10px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1"
              @click="analyseRecording(rec.id)"
            >
              <svg v-if="analysingIds.has(rec.id)" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ analysingIds.has(rec.id) ? '…' : 'Analyse' }}
            </button>
            <span
              v-else-if="!rec.clipsOnly && !recInFlight(rec) && !rec.lastAnalysisError && !recAnalysisReady(rec)"
              class="px-2 py-1 text-[10px] font-medium text-blue-300/90 flex items-center gap-1 max-w-[9rem] truncate"
              :title="recAnalysisBlockedLabel(rec)"
            >
              <svg
                v-if="rec.analysisReadiness?.state === 'syncing' || rec.analysisReadiness?.state === 'finalizing'"
                class="w-3 h-3 animate-spin flex-shrink-0 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
              ><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ recAnalysisStatusShort(rec) }}
            </span>
            <button
              v-if="recInFlight(rec) && !recIsDeferred(rec)"
              class="px-2 py-1 text-[10px] font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              title="Stop waiting locally — your cloud recording stays safe"
              @click="abortInFlightRecording(rec.id)"
            >Stop waiting</button>
            <span v-if="recInFlight(rec) || recIsDeferred(rec)" class="px-2 py-1 text-[10px] font-medium flex items-center gap-1" :class="recIsDeferred(rec) ? 'text-amber-300/90' : rec.pipelineArchiveOnly ? 'text-emerald-300/90' : 'text-blue-300/90'">
              <svg v-if="!recIsDeferred(rec)" class="w-3 h-3 animate-spin" :class="rec.pipelineArchiveOnly ? 'text-emerald-400' : 'text-blue-400'" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              <svg v-else class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {{ recPipelineLabel(rec) || 'Working…' }}
            </span>
            <button class="p-1 text-gray-600 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" title="Dismiss" @click="dismissRecording(rec.id)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <PostGameDuelDiagnostics
          v-if="footageDebugId === rec.id && footageDiagnostics(rec)"
          class="mb-2 mx-1"
          :diagnostics="footageDiagnostics(rec)!"
          :recording-id="rec.id"
        />
        <div class="my-1 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
        </template>
      </template>

      <template v-if="analysesLoading">
        <div v-for="i in 6" :key="i" class="h-14 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.07]" />
      </template>

      <div v-else-if="dashboardAnalyses.length === 0 && pendingRecordings.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.09] flex items-center justify-center mb-3">
          <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
        </div>
        <p class="text-xs text-gray-500">No analyses yet</p>
        <p class="text-xs text-gray-700 mt-1 mb-4">{{ status.recordedModes?.length ? 'Play a game — UpForge will record automatically' : 'Enable game modes in Settings to start recording' }}</p>
        <button v-if="!status.recordedModes?.length" class="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-gray-400 hover:text-gray-200 transition-all" @click="router.push('/settings')">Open Settings →</button>
      </div>

      <template v-else>
        <template v-for="group in groupedAnalyses" :key="group.label">
          <div class="flex items-center gap-2 px-0.5 pt-1 pb-0.5">
            <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{{ group.label }}</span>
            <div class="flex-1 h-px bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent" />
          </div>
          <div
            v-for="a in group.items"
            :key="a.id"
            class="match-list-grid analysis-row relative px-3 py-2 rounded-xl border border-white/[0.09] bg-white/[0.02] cursor-pointer row-interactive"
            :class="a.won === true ? 'analysis-row--won' : a.won === false ? 'analysis-row--lost' : ''"
            :title="coachingSnippets[a.id] || undefined"
            @click="openAnalysisRow(a)"
          >
            <div class="match-list-cell-icon w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center relative flex-shrink-0" :style="a.agent ? { backgroundColor: getAgentColor(a.agent) + '22' } : {}">
              <img v-if="a.map && getMapMinimap(a.map)" :src="getMapMinimap(a.map)" class="absolute inset-0 w-full h-full object-cover opacity-20" />
              <img v-if="a.agent && getAgentImage(a.agent)" :src="getAgentImage(a.agent)" class="relative w-8 h-8 object-contain" />
              <template v-else>
                <svg v-if="a.job_id" class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>
                <svg v-else class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </template>
            </div>
            <div class="min-w-0 match-list-col-match">
              <div class="flex items-center gap-1 min-w-0">
                <span class="text-xs font-semibold truncate">{{ a.agent || 'Unknown' }}</span>
                <span v-if="a.agent" class="flex-shrink-0 text-[8px] font-bold px-1 py-px rounded" :style="{ color: getRoleColor(getAgentRole(a.agent)), backgroundColor: getRoleColor(getAgentRole(a.agent)) + '20' }">{{ getAgentRole(a.agent) }}</span>
                <span
                  v-if="isDisplayableGameMode(a.game_mode)"
                  class="flex-shrink-0 rounded-full border border-white/[0.10] bg-white/[0.05] px-1.5 py-px text-[8px] font-semibold text-gray-600"
                >{{ formatMode(a.game_mode) }}</span>
              </div>
              <p class="text-[10px] text-gray-600 mt-0.5 truncate">
                {{ a.map || '—' }} · {{ formatDate(a.created_at) }}
                <span v-if="a.rank" class="text-gray-700"> · {{ a.rank }}</span>
                <span v-if="a.rounds_won != null && a.rounds_lost != null" class="text-gray-700"> · {{ a.rounds_won }}–{{ a.rounds_lost }}</span>
              </p>
              <button
                v-if="coachReviewByAnalysisId[a.id]?.status === 'completed'"
                type="button"
                class="mt-1 inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200/90 transition-colors hover:border-violet-400/45 hover:bg-violet-500/15"
                :disabled="timelineLoadingId === a.id"
                @click.stop="openCoachNotesVod(a.id)"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-violet-400" />
                {{ timelineLoadingId === a.id ? 'Opening…' : 'Coach notes' }}
                <span v-if="coachReviewByAnalysisId[a.id]?.annotationCount" class="text-violet-300/70 tabular-nums">
                  · {{ coachReviewByAnalysisId[a.id].annotationCount }}
                </span>
              </button>
              <span
                v-else-if="coachReviewByAnalysisId[a.id]?.status === 'in_progress'"
                class="mt-1 inline-flex items-center gap-1 text-[9px] font-medium text-amber-300/80"
              >
                Coach reviewing…
              </span>
            </div>
            <div class="match-list-stats" :class="isAnalysisProcessing(a) ? 'match-list-stats--processing' : ''">
              <template v-if="isAnalysisProcessing(a)">
                <span class="match-list-stats-processing">
                  <svg class="w-3.5 h-3.5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Analysing…
                </span>
              </template>
              <template v-else>
                <span v-if="a.won != null" class="text-[10px] font-black px-2 py-0.5 rounded" :class="a.won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">{{ a.won ? 'W' : 'L' }}</span>
                <span v-else class="text-[10px] text-gray-700">—</span>
                <span v-if="a.kills != null" class="text-xs font-mono font-semibold tabular-nums">{{ a.kills }}<span class="text-gray-600">/</span>{{ a.deaths }}<span class="text-gray-600">/</span>{{ a.assists }}</span>
                <span v-else-if="a.kda != null" class="text-xs font-semibold tabular-nums text-gray-400" title="K/D ratio">{{ a.kda.toFixed(2) }}<span class="text-[8px] text-gray-700 ml-px">kd</span></span>
                <span v-else class="text-[10px] text-gray-700">—</span>
                <span v-if="displayAcs(a) != null" class="text-xs font-bold tabular-nums text-gray-300">{{ displayAcs(a) }}</span>
                <span v-else class="text-[10px] text-gray-700">—</span>
                <span v-if="a.hs_pct != null" class="text-xs font-bold tabular-nums" :class="a.hs_pct >= 25 ? 'text-orange-400' : 'text-gray-400'">{{ a.hs_pct }}%</span>
                <span v-else class="text-[10px] text-gray-700">—</span>
                <span
                  v-if="a.overall_score != null"
                  class="text-sm font-black tabular-nums"
                  :class="a.overall_score >= 78 ? 'text-green-400' : a.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                  :title="`${scoreGrade(a.overall_score)} — ${scoreLabel(a.overall_score)}`"
                >{{ a.overall_score * 10 }}</span>
                <span v-else class="text-[10px] text-gray-700">—</span>
              </template>
            </div>
            <div class="match-list-actions">
              <svg class="w-3.5 h-3.5 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.match-list-grid {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto 16px;
  column-gap: 10px;
  align-items: center;
}
.match-list-grid.analysis-row {
  align-items: center;
}
.match-list-cell-icon {
  grid-column: 1;
}
.match-list-col-match {
  grid-column: 2;
  min-width: 0;
}
.match-list-stats {
  grid-column: 3;
  display: grid;
  grid-template-columns: 34px 72px 46px 40px 48px;
  gap: 10px;
  align-items: center;
  justify-items: center;
  text-align: center;
}
.match-list-stats--processing {
  grid-template-columns: 1fr;
}
.match-list-stats-processing {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  font-size: 10px;
  color: rgb(107 114 128);
  white-space: nowrap;
}
.match-list-actions {
  grid-column: 4;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.analysis-row--won::before,
.analysis-row--lost::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
}
.analysis-row--won::before {
  background: #22c55e;
}
.analysis-row--lost::before {
  background: #ef4444;
}
.pending-row-default {
  background: rgba(59, 130, 246, 0.04);
  border: 1px solid rgba(59, 130, 246, 0.12);
}
.pending-row-default:hover {
  background: rgba(59, 130, 246, 0.06);
  border-color: rgba(59, 130, 246, 0.25);
}
.pending-row-archive {
  background: rgba(16, 185, 129, 0.04);
  border: 1px solid rgba(16, 185, 129, 0.14);
}
.pending-row-analyse {
  background: rgba(239, 68, 68, 0.04);
  border: 1px solid rgba(239, 68, 68, 0.12);
}
.pending-row-deferred {
  background: rgba(245, 158, 11, 0.05);
  border: 1px solid rgba(245, 158, 11, 0.18);
}
.pending-row {
  min-width: 0;
}
.match-list-header {
  row-gap: 0;
}
.match-list-header .match-list-stats {
  gap: 18px;
}
.analysis-row:hover {
  transform: translateY(-1px);
}
.analysis-row:active {
  transform: translateY(0);
}
</style>
