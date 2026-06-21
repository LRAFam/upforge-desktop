<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard'
import { useGameTheme } from '../../composables/useGameTheme'

const {
  status,
  platform,
  recordingElapsed,
  stopping,
  obsConnecting,
  dashboardHeadline,
  clipCount,
  totalSessionsAnalysed,
  dashboardRankLabel,
  currentStreak,
  formatMode,
  connectObs,
  launchAndConnectObs,
  stopRecording,
} = useDashboard()

const { features } = useGameTheme()
</script>

<template>
  <div
    :class="[
      'flex-shrink-0 mx-4 mt-3 panel-elevated overflow-hidden text-xs transition-all',
      !status.obsConnected && !status.recording ? 'ring-1 ring-amber-500/15' :
      !status.ffmpegOk ? 'ring-1 ring-yellow-500/15' :
      status.recording ? 'ring-1 ring-red-500/20' : ''
    ]"
  >
    <div class="flex flex-col lg:flex-row lg:items-stretch divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07]">
      <div class="flex-1 min-w-0 flex flex-col justify-center gap-1.5 px-3 py-2.5">
        <div class="flex items-center gap-2 min-w-0">
          <div class="relative flex-shrink-0">
            <div :class="['w-2 h-2 rounded-full', !status.obsConnected && !status.recording ? 'bg-amber-400' : !status.ffmpegOk ? 'bg-yellow-400' : status.recording ? 'bg-red-500' : status.recordingStarting ? 'bg-yellow-400' : status.currentGame ? 'bg-orange-400' : 'bg-gray-600']" />
            <div v-if="status.recording" class="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-70" />
            <div v-else-if="status.recordingStarting" class="absolute inset-0 w-2 h-2 rounded-full bg-yellow-400 animate-ping opacity-50" />
            <div v-else-if="status.waitingForMatch" class="absolute inset-0 w-2 h-2 rounded-full bg-orange-400 animate-ping opacity-50" />
          </div>
          <div class="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
            <template v-if="!status.obsConnected && !status.recording && !status.recordingStarting">
              <span class="font-semibold text-amber-300 flex-shrink-0">OBS not connected</span>
              <span class="text-amber-600/80 hidden md:inline truncate">Settings → Recording</span>
            </template>
            <template v-else-if="!status.ffmpegOk">
              <span class="font-semibold text-yellow-400 flex-shrink-0">Clip tools unavailable</span>
            </template>
            <template v-else-if="status.recording">
              <span class="font-black tracking-widest uppercase text-red-400 rec-pulse flex-shrink-0">● REC</span>
              <span class="font-semibold capitalize flex-shrink-0">{{ status.currentGame || 'Valorant' }}</span>
              <span v-if="recordingElapsed" class="font-mono tabular-nums text-red-400/80 flex-shrink-0">{{ recordingElapsed }}</span>
            </template>
            <template v-else-if="status.recordingStarting">
              <span class="font-semibold text-yellow-300">Starting recorder…</span>
            </template>
            <template v-else-if="status.waitingForMatch">
              <span class="font-semibold text-orange-300 flex-shrink-0">{{ status.currentGame || 'Valorant' }}</span>
              <span class="text-orange-500/70 truncate">Watching for match…</span>
            </template>
            <template v-else-if="status.currentGame">
              <span class="font-semibold text-orange-300">{{ status.currentGame }} detected</span>
            </template>
            <template v-else-if="platform && platform !== 'win32'">
              <span class="text-gray-500">macOS preview mode</span>
            </template>
            <template v-else>
              <span class="font-semibold text-gray-300 flex-shrink-0">Ready</span>
              <span v-if="status.recordedModes?.length" class="text-gray-600 truncate">{{ status.recordedModes.map(formatMode).join(' · ') }}</span>
            </template>
          </div>
          <div
            v-if="!status.obsConnected && !status.recording && !status.recordingStarting && platform === 'win32'"
            class="flex items-center gap-1 flex-shrink-0"
          >
            <button type="button" class="px-2 py-1 rounded-lg text-[10px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50" :disabled="obsConnecting" @click="launchAndConnectObs">{{ obsConnecting ? '…' : 'Launch OBS' }}</button>
            <button type="button" class="px-2 py-1 rounded-lg text-[10px] font-medium border border-white/[0.10] bg-white/[0.04] text-gray-300 hover:text-white disabled:opacity-50" :disabled="obsConnecting" @click="connectObs">Connect</button>
          </div>
          <button v-if="status.recording" :disabled="stopping" class="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-red-500/[0.12] hover:bg-red-500/[0.2] border border-red-500/20 text-red-400 transition-all disabled:opacity-50" @click="stopRecording">
            {{ stopping ? 'Ending…' : 'End match' }}
          </button>
        </div>
        <p class="text-sm font-bold text-white leading-snug">{{ dashboardHeadline }}</p>
      </div>
      <div class="flex flex-shrink-0 divide-x divide-white/[0.07] bg-white/[0.015]">
        <div class="flex flex-col items-center justify-center py-2 px-3.5 gap-0.5 min-w-[4.25rem]">
          <span class="text-sm font-black tabular-nums text-white">{{ clipCount }}</span>
          <span class="text-[8px] text-gray-600 uppercase tracking-wide">Clips</span>
        </div>
        <div class="flex flex-col items-center justify-center py-2 px-3.5 gap-0.5 min-w-[4.25rem]">
          <span class="text-sm font-black tabular-nums text-white">{{ totalSessionsAnalysed }}</span>
          <span class="text-[8px] text-gray-600 uppercase tracking-wide">Analyses</span>
        </div>
        <div class="flex flex-col items-center justify-center py-2 px-2.5 gap-0.5 min-w-[5rem] max-w-[6.5rem]">
          <span class="text-[11px] font-black text-white text-center leading-tight line-clamp-2">{{ dashboardRankLabel }}</span>
          <span class="text-[8px] text-gray-600 uppercase tracking-wide">Rank</span>
        </div>
        <div v-if="features.rankStreak" class="flex flex-col items-center justify-center py-2 px-3.5 gap-0.5 min-w-[4.25rem]">
          <span class="text-sm font-black tabular-nums" :class="currentStreak > 0 ? 'text-green-400' : currentStreak < 0 ? 'text-red-400' : 'text-white'">{{ currentStreak !== 0 ? (currentStreak > 0 ? '+' : '') + currentStreak : '—' }}</span>
          <span class="text-[8px] text-gray-600 uppercase tracking-wide">Streak</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes recPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}
.rec-pulse {
  animation: recPulse 1.2s ease-in-out infinite;
}
</style>
