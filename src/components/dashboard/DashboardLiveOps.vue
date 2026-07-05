<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'

const {
  status,
  platform,
  recordingElapsed,
  stopping,
  obsConnecting,
  pendingRecordings,
  inFlightUploadCount,
  inFlightAnalysisCount,
  connectObs,
  launchAndConnectObs,
  stopRecording,
  recUploadProgress,
  recInFlight,
} = useDashboard()

const activeUpload = computed(() =>
  pendingRecordings.value.find(r => recInFlight(r) && recUploadProgress(r) != null),
)

const uploadPct = computed(() => {
  const rec = activeUpload.value
  if (!rec) return null
  return recUploadProgress(rec)
})

const analysisPct = computed(() => {
  if (!inFlightAnalysisCount.value) return null
  return Math.min(95, 15 + inFlightAnalysisCount.value * 12)
})

const pipelineSteps = computed(() => [
  {
    id: 'capture',
    label: 'Capture',
    icon: 'camera',
    detail: status.value.recording
      ? `Receiving gameplay · ${recordingElapsed.value || 'live'}`
      : status.value.waitingForMatch
        ? 'Watching for match start'
        : status.value.obsConnected
          ? '1080p · ready'
          : 'Idle — connect OBS',
    active: status.value.recording || status.value.waitingForMatch,
    done: status.value.obsConnected && !status.value.recording && !status.value.waitingForMatch,
    progress: status.value.recording ? 100 : status.value.obsConnected ? 100 : 0,
  },
  {
    id: 'upload',
    label: 'Upload',
    icon: 'cloud',
    detail: uploadPct.value != null
      ? `Uploading to UpForge Cloud · ${uploadPct.value}%`
      : inFlightUploadCount.value
        ? `${inFlightUploadCount.value} in progress`
        : 'Waiting for match file',
    active: uploadPct.value != null || inFlightUploadCount.value > 0,
    done: false,
    progress: uploadPct.value ?? (inFlightUploadCount.value ? 8 : 0),
  },
  {
    id: 'analysis',
    label: 'AI analysis',
    icon: 'brain',
    detail: inFlightAnalysisCount.value
      ? `Analyzing match data · ${inFlightAnalysisCount.value} running`
      : 'Queued after upload',
    active: inFlightAnalysisCount.value > 0,
    done: false,
    progress: analysisPct.value ?? 0,
  },
])
</script>

<template>
  <div class="dash-panel overflow-hidden flex flex-col h-full min-h-0">
    <div class="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-2.5">
        <span class="relative flex h-2.5 w-2.5">
          <span v-if="status.recording" class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-40 animate-ping" />
          <span
            class="relative inline-flex h-2.5 w-2.5 rounded-full"
            :class="status.recording ? 'bg-red-500' : status.obsConnected ? 'bg-emerald-500' : 'bg-amber-400'"
          />
        </span>
        <span class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Live ops</span>
      </div>
      <span v-if="status.recording" class="text-[10px] font-black uppercase tracking-wider text-red-400 rec-pulse px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">REC</span>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-col p-3.5 space-y-2.5 flex flex-col">
      <div class="rounded-xl border border-white/[0.08] bg-black/25 overflow-hidden">
        <div class="px-3.5 py-3 flex items-center justify-between gap-2 border-b border-white/[0.06]">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wide text-gray-600">OBS Studio</p>
            <p class="text-xs font-semibold mt-0.5" :class="status.obsConnected ? 'text-blue-300' : 'text-amber-300'">
              {{ status.obsConnected ? 'Connected' : 'Not connected' }}
            </p>
          </div>
          <span
            class="text-[9px] font-black uppercase px-2 py-1 rounded-md"
            :class="status.obsConnected ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'"
          >{{ status.obsConnected ? 'Live' : 'Offline' }}</span>
        </div>
        <div v-if="!status.obsConnected && platform === 'win32'" class="p-3 flex gap-2">
          <button type="button" class="flex-1 py-2 rounded-lg text-[10px] font-bold border border-amber-500/30 bg-amber-500/10 text-amber-100 disabled:opacity-50" :disabled="obsConnecting" @click="launchAndConnectObs">
            {{ obsConnecting ? '…' : 'Launch OBS' }}
          </button>
          <button type="button" class="flex-1 py-2 rounded-lg text-[10px] font-bold border border-white/[0.10] text-gray-300 disabled:opacity-50" :disabled="obsConnecting" @click="connectObs">Connect</button>
        </div>
      </div>

      <div
        v-if="status.recording"
        class="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3.5 py-3 flex items-center justify-between gap-2"
      >
        <div>
          <p class="text-[10px] font-bold uppercase tracking-wide text-red-400/80">Recording</p>
          <p class="text-xs font-semibold text-red-200 mt-0.5">1080p · 60fps · {{ recordingElapsed || 'live' }}</p>
        </div>
        <button type="button" class="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-600 text-white disabled:opacity-50" :disabled="stopping" @click="stopRecording">
          {{ stopping ? '…' : 'Stop' }}
        </button>
      </div>

      <div class="flex-1 min-h-0 flex flex-col">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600 mb-2">Pipeline</p>
        <div class="flex-1 flex flex-col justify-between min-h-[88px]">
        <div v-for="(step, i) in pipelineSteps" :key="step.id" class="flex gap-3">
          <div class="flex flex-col items-center flex-shrink-0 w-8">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center border"
              :class="step.active ? 'border-red-500/30 bg-red-500/10 text-red-400' : step.done ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.08] bg-white/[0.03] text-gray-600'"
            >
              <svg v-if="step.icon === 'camera'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              <svg v-else-if="step.icon === 'cloud'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <div v-if="i < pipelineSteps.length - 1" class="flex-1 w-px min-h-[8px] bg-gradient-to-b from-white/10 to-white/[0.03]" />
          </div>
          <div class="flex-1 min-w-0 pb-2.5">
            <p class="text-[12px] font-bold text-gray-200">{{ step.label }}</p>
            <p class="text-[10px] text-gray-500 mt-0.5 leading-snug">{{ step.detail }}</p>
            <div v-if="step.id === 'upload' && step.progress" class="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500" :style="{ width: `${step.progress}%` }" />
            </div>
            <div v-else-if="step.id === 'analysis' && step.active" class="mt-2 flex items-center gap-2">
              <div class="relative w-8 h-8">
                <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#ff4655" stroke-width="3" stroke-linecap="round" :stroke-dasharray="`${step.progress * 0.88} 100`" />
                </svg>
                <span class="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-400">{{ step.progress }}%</span>
              </div>
              <span class="text-[10px] text-gray-600">Processing rounds…</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>

    <div class="px-4 py-2 border-t border-white/[0.07] flex items-center justify-between text-[9px] text-gray-600 flex-shrink-0">
      <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Pipeline healthy</span>
      <span v-if="platform === 'win32'">Desktop · Windows</span>
      <span v-else>Preview mode</span>
    </div>
  </div>
</template>

<style scoped>
.rec-pulse { animation: recPulse 1.2s ease-in-out infinite; }
@keyframes recPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
</style>
