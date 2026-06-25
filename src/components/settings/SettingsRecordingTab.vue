<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'
import SettingsDeadlockDiagnostics from './SettingsDeadlockDiagnostics.vue'

const {
  GAME_MODES,
  formatGameMode,
  browseCs2DemoDir,
  changeSavePath,
  cs2Detecting,
  debouncedSave,
  detectCs2DemoDir,
  diskSpaceCritical,
  diskSpaceLow,
  formatBytes,
  hasProAccess,
  obsConnect,
  obsConnecting,
  obsDisconnect,
  obsLaunchAndConnect,
  obsSetupRunning,
  obsSetupScene,
  installObsProfile,
  obsStatus,
  openCs2Analyze,
  openRecordingsFolder,
  purgeCloudBackedLocals,
  purgeUntrackedRecordings,
  sectionOpen,
  setRecordingPreset,
  settings,
  storageBreakdown,
  storageBusy,
  storageEstimateLabel,
  storageMessage,
  storageMessageError,
  storageSoftLimitLabel,
  storageSummary,
  storageUploadProgress,
  storageUsagePercent,
  toggleAudio,
  toggleFullMatchRecording,
  toggleMode,
  toggleSection,
  uploadPendingToCloud,
} = useSettings()
</script>

<template>
<section class="space-y-4">
<div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('recordingCapture')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M4.5 7.75A1.75 1.75 0 016.25 6h6.5A1.75 1.75 0 0114.5 7.75v8.5A1.75 1.75 0 0112.75 18h-6.5A1.75 1.75 0 014.5 16.25v-8.5z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Capture</p>
                <p class="text-xs text-gray-500">Recording mode, quality, and storage</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.recordingCapture ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.recordingCapture" class="space-y-4 border-t border-white/[0.09] p-4">
            <div v-if="settings.primaryGame === 'valorant'">
              <label class="mb-2 block text-xs font-medium text-gray-400">Record game modes</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="mode in GAME_MODES"
                  :key="mode.value"
                  class="rounded-xl border px-3 py-2 text-left transition-all"
                  :class="settings.recordedModes.includes(mode.value)
                    ? 'border-red-500/25 bg-red-500/10 text-gray-100'
                    : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
                  @click="toggleMode(mode.value)"
                >
                  <div class="flex items-center gap-2">
                    <div class="flex h-4 w-4 items-center justify-center rounded border" :class="settings.recordedModes.includes(mode.value) ? 'border-red-500 bg-red-500 text-white' : 'border-white/[0.18] bg-transparent text-transparent'">
                      <svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div class="min-w-0">
                      <p class="truncate text-xs font-semibold">{{ formatGameMode(mode.value) }}</p>
                      <p v-if="mode.hint" class="mt-0.5 text-[11px] text-gray-600">{{ mode.hint }}</p>
                    </div>
                  </div>
                </button>
              </div>
              <p class="mt-2 text-xs text-gray-600">Only selected modes are recorded. If none are selected, nothing is recorded.</p>
            </div>

            <div v-else-if="settings.primaryGame === 'cs2'" class="rounded-2xl border border-orange-500/20 bg-orange-500/[0.05] p-4 space-y-3">
              <div>
                <p class="text-sm font-semibold text-white">CS2 demo recording</p>
                <p class="mt-1 text-xs text-gray-500 leading-relaxed">Add <code class="font-mono text-orange-300/90">cl_demo_auto_recording 1</code> to your CS2 autoexec. UpForge uploads the demo when a match ends.</p>
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-400">Demo folder</label>
                <p class="text-[11px] font-mono text-gray-500 truncate mb-2">{{ settings.cs2DemoDir || 'Auto-detect via Steam' }}</p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors" :disabled="cs2Detecting" @click="detectCs2DemoDir">
                    {{ cs2Detecting ? 'Detecting…' : 'Detect folder' }}
                  </button>
                  <button type="button" class="rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors" @click="browseCs2DemoDir">Browse…</button>
                  <button type="button" class="rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition-colors" @click="openCs2Analyze">Open web uploader</button>
                </div>
              </div>
            </div>

            <div v-else-if="settings.primaryGame === 'deadlock'" class="rounded-2xl border border-teal-500/20 bg-teal-500/[0.05] p-4 space-y-3">
              <div>
                <p class="text-sm font-semibold text-white">Deadlock recording</p>
                <p class="mt-1 text-xs text-gray-500 leading-relaxed">
                  UpForge reads <code class="font-mono text-teal-300/90">-condebug</code> console logs to detect matches and builds a timeline from the log (and replay when available). Use borderless windowed mode for OBS capture.
                </p>
              </div>
              <SettingsDeadlockDiagnostics />
            </div>

            <div v-else class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <p class="text-xs text-gray-500 leading-relaxed">Recording starts when your game is detected. Queue filters apply to Valorant only.</p>
            </div>

            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4 space-y-3">
              <div>
                <p class="text-sm font-semibold text-white">Recording format</p>
                <p class="mt-1 text-xs text-gray-500">Choose a preset — applied to OBS automatically when a match starts.</p>
              </div>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-xl border px-3 py-3 text-left transition-all"
                  :class="settings.recordingPreset === 'coaching'
                    ? 'border-red-500/25 bg-red-500/10'
                    : 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.14]'"
                  @click="setRecordingPreset('coaching')"
                >
                  <p class="text-xs font-semibold text-gray-100">Coaching</p>
                  <p class="mt-1 text-[11px] font-medium text-gray-300">720p · 5 Mbps · 30 fps</p>
                  <p class="mt-1.5 text-[11px] text-gray-600">Best for AI analysis and fast uploads (~1.3 GB / match)</p>
                </button>
                <button
                  type="button"
                  class="rounded-xl border px-3 py-3 text-left transition-all"
                  :class="settings.recordingPreset === 'creator'
                    ? 'border-red-500/25 bg-red-500/10'
                    : hasProAccess
                      ? 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.14]'
                      : 'border-white/[0.08] bg-white/[0.01] hover:border-purple-500/20'"
                  @click="setRecordingPreset('creator')"
                >
                  <div class="flex items-center gap-2">
                    <p class="text-xs font-semibold text-gray-100">Creator</p>
                    <span
                      v-if="!hasProAccess"
                      class="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300"
                    >Pro</span>
                  </div>
                  <p class="mt-1 text-[11px] font-medium text-gray-300">1080p · 10 Mbps · 60 fps</p>
                  <p class="mt-1.5 text-[11px] text-gray-600">
                    <template v-if="hasProAccess">Higher quality for streaming/content (~3 GB / match). Uses your OBS video settings.</template>
                    <template v-else>Pro feature — higher quality for streaming and content creation.</template>
                  </p>
                </button>
              </div>
              <p v-if="settings.recordingPreset === 'creator'" class="text-[11px] text-gray-600">
                Coaching uploads are compressed automatically — your local file stays at full quality.
              </p>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium text-gray-300">Record game audio</p>
                  <p class="mt-0.5 text-[11px] text-gray-600">Includes in-game sound via OBS</p>
                </div>
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  :class="settings.audioEnabled ? 'bg-red-500' : 'bg-white/20'"
                  @click="toggleAudio()"
                >
                  <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.audioEnabled ? 'translate-x-4' : 'translate-x-0.5'" />
                </button>
              </div>
            </div>

            <div class="panel-elevated overflow-hidden p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium text-gray-300">Record full match VODs</p>
                  <p class="mt-0.5 text-[11px] text-gray-600">Off = replay-buffer kill clips only (~minimal disk use). No AI match coaching without a VOD.</p>
                </div>
                <button
                  class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors"
                  :class="settings.fullMatchRecording !== false ? 'bg-red-500' : 'bg-white/20'"
                  @click="toggleFullMatchRecording()"
                >
                  <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.fullMatchRecording !== false ? 'translate-x-4' : 'translate-x-0.5'" />
                </button>
              </div>
            </div>

            <div class="rounded-2xl border p-4 space-y-4" :class="obsStatus?.connected ? 'border-green-500/20 bg-green-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.04]'">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-white">OBS recording</p>
                  <p class="mt-1 text-xs" :class="obsStatus?.connected ? 'text-green-300/80' : 'text-amber-300/80'">
                    <template v-if="obsStatus?.connected">Connected — OBS v{{ obsStatus.obsVersion ?? '?' }}</template>
                    <template v-else>Required — install OBS 28+, enable WebSocket, then connect below</template>
                  </p>
                </div>
                <span class="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" :class="obsStatus?.connected ? 'bg-green-500' : 'bg-amber-400'" />
              </div>
              <ol class="list-decimal list-inside space-y-1 text-xs text-gray-400">
                <li>Install <a href="https://obsproject.com/" target="_blank" class="text-red-300 underline hover:text-red-200">OBS Studio 28+</a></li>
                <li>Click <strong class="text-gray-300">Launch OBS + Connect</strong> — we install the UpForge profile and WebSocket defaults</li>
                <li>Default password is <strong class="text-gray-300">upforge</strong> unless you changed it in OBS</li>
                <li>Capture is <strong class="text-gray-300">game window only</strong> — alt-tab won&apos;t record other apps</li>
              </ol>
              <div class="flex flex-wrap items-center gap-2">
                <template v-if="!obsStatus?.connected">
                  <button :disabled="obsConnecting" class="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition-colors hover:border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50" @click="obsLaunchAndConnect">{{ obsConnecting ? 'Starting…' : 'Launch OBS + Connect' }}</button>
                  <button :disabled="obsConnecting" class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15 disabled:opacity-50" @click="obsConnect">{{ obsConnecting ? 'Connecting…' : 'Connect' }}</button>
                  <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-white/[0.14] hover:text-white" @click="installObsProfile">Install OBS profile</button>
                </template>
                <template v-else>
                  <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="obsDisconnect">Disconnect</button>
                  <button :disabled="obsSetupRunning" class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-50" @click="obsSetupScene">{{ obsSetupRunning ? 'Setting up…' : 'Recreate UpForge scene' }}</button>
                </template>
              </div>
              <div class="grid grid-cols-[1fr_96px] gap-3">
                <div>
                  <label class="mb-1 block text-xs text-gray-400">WebSocket host</label>
                  <input v-model="settings.obsHost" type="text" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-red-500/40 focus:outline-none" placeholder="127.0.0.1" @change="debouncedSave()" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-gray-400">Port</label>
                  <input v-model.number="settings.obsPort" type="number" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/40 focus:outline-none" min="1" max="65535" @change="debouncedSave()" />
                </div>
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-400">WebSocket password</label>
                <input v-model="settings.obsPassword" type="password" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-red-500/40 focus:outline-none" placeholder="Default: upforge" @change="debouncedSave()" />
                <p class="mt-1 text-[10px] text-gray-600">Leave blank to use UpForge default after profile install.</p>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between">
                  <label class="text-xs text-gray-400">Replay buffer (kill clips)</label>
                  <span class="text-xs text-gray-500">{{ settings.obsReplayBufferSeconds }}s</span>
                </div>
                <input v-model.number="settings.obsReplayBufferSeconds" type="range" min="10" max="120" step="5" class="w-full accent-red-500" @input="debouncedSave()" />
              </div>
              <label class="flex items-start gap-3 cursor-pointer">
                <input
                  v-model="settings.obsPreserveActiveScene"
                  type="checkbox"
                  class="mt-0.5 rounded border-white/20 bg-white/5 text-red-500 focus:ring-red-500/30"
                  @change="debouncedSave()"
                />
                <span>
                  <span class="text-sm text-white">Keep my active OBS scene when a match starts</span>
                  <span class="mt-0.5 block text-[11px] text-gray-500 leading-relaxed">
                    Turn on if you stream with face cam and overlays — UpForge will still retarget game capture but won&apos;t force-switch to the UpForge scene.
                  </span>
                </span>
              </label>
              <p class="text-xs text-gray-500">UpForge starts/stops OBS and applies the recording preset on connect and before each match.</p>
              <p v-if="obsStatus?.lastError" class="rounded-xl border border-red-500/20 bg-red-500/6 px-3 py-2 text-xs text-red-300">{{ obsStatus.lastError }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">Save location</label>
              <div class="flex gap-2">
                <input :value="settings.effectiveSavePath ?? settings.savePath" readonly class="min-w-0 flex-1 truncate rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-gray-400" />
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="changeSavePath">Change</button>
              </div>
            </div>

            <div class="rounded-2xl border p-4" :class="diskSpaceCritical ? 'border-red-500/30 bg-red-500/[0.06]' : diskSpaceLow ? 'border-orange-500/25 bg-orange-500/[0.05]' : 'border-white/[0.10] bg-black/20'">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium text-gray-300">Storage usage</p>
                  <p class="mt-1 text-xs" :class="diskSpaceCritical ? 'text-red-300/90' : diskSpaceLow ? 'text-orange-300/90' : 'text-gray-500'">{{ storageSummary }}</p>
                  <p v-if="storageEstimateLabel" class="mt-1 text-[11px] text-gray-600">{{ storageEstimateLabel }}</p>
                </div>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openRecordingsFolder">Open folder</button>
              </div>
              <p v-if="diskSpaceLow" class="mt-2 text-[11px] leading-relaxed text-orange-300/80">
                Low disk space can cut recordings short. Upload pending VODs to the cloud, then remove local copies you no longer need.
              </p>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all" :style="{ width: storageUsagePercent + '%' }" />
              </div>
              <div class="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                <span>Local budget</span>
                <span>{{ storageSoftLimitLabel }}</span>
              </div>
              <p class="mt-3 text-[11px] leading-relaxed text-gray-600">
                Uploaded VODs are stored in the cloud and can be reviewed without a local file.
                Turn on <span class="text-gray-400">Auto-delete after upload</span> below to free disk automatically after each match.
                <span class="text-gray-500"> Pro plans include higher analysis limits and extended cloud retention.</span>
              </p>
              <div v-if="storageBreakdown.pendingCount > 0 || storageBreakdown.cloudBackedCount > 0 || storageBreakdown.orphanCount > 0 || storageBreakdown.legacyDuplicateBytes > 0" class="mt-3 space-y-2">
                <button
                  v-if="storageBreakdown.pendingCount > 0"
                  type="button"
                  class="w-full rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/15 disabled:opacity-50"
                  :disabled="storageBusy"
                  @click="uploadPendingToCloud"
                >
                  <span v-if="storageUploadProgress">Uploading {{ storageUploadProgress.current }}/{{ storageUploadProgress.total }}…</span>
                  <span v-else>Save {{ storageBreakdown.pendingCount }} pending to cloud ({{ formatBytes(storageBreakdown.pendingBytes) }})</span>
                </button>
                <button
                  v-if="storageBreakdown.cloudBackedCount > 0"
                  type="button"
                  class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-50"
                  :disabled="storageBusy"
                  @click="purgeCloudBackedLocals"
                >
                  Remove {{ storageBreakdown.cloudBackedCount }} cloud-backed local file{{ storageBreakdown.cloudBackedCount === 1 ? '' : 's' }} ({{ formatBytes(storageBreakdown.cloudBackedBytes) }})
                </button>
                <button
                  v-if="storageBreakdown.orphanCount > 0"
                  type="button"
                  class="w-full rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
                  :disabled="storageBusy"
                  @click="purgeUntrackedRecordings"
                >
                  Remove {{ storageBreakdown.orphanCount }} untracked file{{ storageBreakdown.orphanCount === 1 ? '' : 's' }} ({{ formatBytes(storageBreakdown.orphanBytes) }})
                </button>
              </div>
              <p v-if="storageBreakdown.legacyDuplicateBytes > 0" class="mt-2 text-[11px] text-gray-500">
                Legacy duplicate recordings ({{ formatBytes(storageBreakdown.legacyDuplicateBytes) }}) are removed automatically on launch.
              </p>
              <p v-if="storageMessage" class="mt-2 text-[11px]" :class="storageMessageError ? 'text-red-400' : 'text-green-400'">{{ storageMessage }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">Auto-delete local clips</label>
              <select v-model.number="settings.clipRetentionDays" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                <option :value="0">Never (keep all clips)</option>
                <option :value="7">After 7 days</option>
                <option :value="14">After 14 days</option>
                <option :value="30">After 30 days</option>
                <option :value="60">After 60 days</option>
              </select>
              <p class="mt-1 text-xs text-gray-600">Local-only clips older than this are deleted on startup.</p>
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">Auto-delete local match recordings</label>
              <select v-model.number="settings.recordingRetentionDays" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                <option :value="0">Never (keep until uploaded or removed manually)</option>
                <option :value="7">After 7 days (local-only, not on cloud)</option>
                <option :value="14">After 14 days</option>
                <option :value="30">After 30 days</option>
                <option :value="60">After 60 days</option>
              </select>
              <p class="mt-1 text-xs text-gray-600">Deletes pending local VODs and untracked files in your save folder on startup. Cloud-backed recordings are not affected.</p>
            </div>
          </div>
        </div>
</section>
</template>
