<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSettings } from '../../composables/useSettings'
import SettingsDeadlockDiagnostics from './SettingsDeadlockDiagnostics.vue'
import SettingsRow from './SettingsRow.vue'
import SettingsSection from './SettingsSection.vue'
import SettingsStatusStrip from './SettingsStatusStrip.vue'
import SettingsToggle from './SettingsToggle.vue'
import type { StatusItem } from './SettingsStatusStrip.vue'

const router = useRouter()

const {
  GAME_MODES,
  activeRecordedModes,
  browseCs2DemoDir,
  changeSavePath,
  cs2Detecting,
  debouncedSave,
  detectCs2DemoDir,
  diskSpaceCritical,
  diskSpaceLow,
  formatBytes,
  hasProAccess,
  highlightSection,
  obsStatus,
  openCs2Analyze,
  openRecordingsFolder,
  purgeCloudBackedLocals,
  purgeUntrackedRecordings,
  setRecordingPreset,
  setCreatorQuality,
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
  toggleClipCapture,
  toggleFullMatchRecording,
  toggleMode,
  uploadPendingToCloud,
} = useSettings()

const modeHint = computed(() => {
  if (settings.primaryGame === 'lol') {
    return "Only selected modes are recorded. Summoner's Rift covers ranked and normals (Live Client cannot split them)."
  }
  return 'Only selected modes are recorded. If none are selected, nothing is recorded.'
})

const clipCaptureOptions = [
  { key: 'singleKills', label: 'Single kills', hint: 'Routine 1-kill highlights from each round' },
  { key: 'multiKills', label: 'Multi-kills (3K / 4K)', hint: 'Triple and quadra kill rounds' },
  { key: 'aces', label: 'Aces (5K)', hint: 'Full-team wipe rounds' },
  { key: 'clutches', label: 'Clutches', hint: '1vX rounds you won' },
] as const

const statusItems = computed<StatusItem[]>(() => {
  const items: StatusItem[] = []
  items.push({
    id: 'obs',
    label: 'OBS',
    detail: obsStatus.value?.connected
      ? `Connected · v${obsStatus.value.obsVersion ?? '?'}`
      : 'Not connected',
    tone: obsStatus.value?.connected ? 'ok' : 'warn',
  })
  items.push({
    id: 'disk',
    label: 'Disk',
    detail: diskSpaceCritical.value ? 'Critical' : diskSpaceLow.value ? 'Low' : storageSummary.value,
    tone: diskSpaceCritical.value ? 'bad' : diskSpaceLow.value ? 'warn' : 'ok',
  })
  return items
})
</script>

<template>
  <div class="space-y-4">
    <SettingsStatusStrip :items="statusItems" />

    <div class="-mt-1">
      <button
        type="button"
        class="text-xs font-medium text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
        @click="router.push({ path: '/settings', query: { tab: 'advanced', section: 'obs' } })"
      >
        OBS &amp; capture setup
      </button>
    </div>

    <SettingsSection
      id="capture"
      title="Capture"
      hint="Recording mode, quality, and format"
      :highlight-id="highlightSection"
    >
      <div>
        <label class="mb-2 block text-xs font-medium text-gray-400">Record game modes</label>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="mode in GAME_MODES"
            :key="mode.value"
            type="button"
            class="rounded-xl border px-3 py-2 text-left transition-all"
            :class="activeRecordedModes.includes(mode.value)
              ? 'border-red-500/25 bg-red-500/10 text-gray-100'
              : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
            @click="toggleMode(mode.value)"
          >
            <div class="flex items-center gap-2">
              <div class="flex h-4 w-4 items-center justify-center rounded border" :class="activeRecordedModes.includes(mode.value) ? 'border-red-500 bg-red-500 text-white' : 'border-white/[0.18] bg-transparent text-transparent'">
                <svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold">{{ mode.label }}</p>
                <p v-if="mode.hint" class="mt-0.5 text-[11px] text-gray-600">{{ mode.hint }}</p>
              </div>
            </div>
          </button>
        </div>
        <p class="mt-2 text-xs text-gray-600">{{ modeHint }}</p>
      </div>

      <div v-if="settings.primaryGame === 'cs2'" class="rounded-2xl border border-orange-500/20 bg-orange-500/[0.05] p-4 space-y-3">
        <div>
          <p class="text-sm font-semibold text-white">CS2 demo recording</p>
          <p class="mt-1 text-xs text-gray-500 leading-relaxed">UpForge auto-installs demo recording when CS2 launches. Restart CS2 once after first setup. Highlight clips (3K/ace/clutch) are cut from your VOD using the demo.</p>
        </div>
        <div>
          <label class="mb-1 block text-xs text-gray-400">Steam / in-game name (for clip matching)</label>
          <input
            v-model="settings.cs2SteamName"
            type="text"
            placeholder="Auto-detect from Steam"
            class="w-full rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-orange-500/40 focus:outline-none"
            @change="debouncedSave()"
          />
          <p class="mt-1 text-[11px] text-gray-600">Only needed if clips miss your kills — must match your CS2 name.</p>
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
            UpForge watches Steam&apos;s local cache for match data and downloads replays from Valve when available. Use borderless windowed mode for OBS capture.
          </p>
        </div>
        <SettingsDeadlockDiagnostics />
      </div>

      <div class="space-y-3 border-t border-white/[0.06] pt-4">
        <div>
          <p class="text-sm font-semibold text-white">Recording format</p>
          <p class="mt-1 text-xs text-gray-500">Preset applied to OBS when a match starts.</p>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            class="rounded-lg border px-3 py-3 text-left transition-colors"
            :class="settings.recordingPreset === 'coaching'
              ? 'border-white/[0.20] bg-white/[0.06]'
              : 'border-white/[0.08] bg-transparent hover:border-white/[0.12]'"
            @click="setRecordingPreset('coaching')"
          >
            <p class="text-xs font-semibold text-gray-100">Coaching</p>
            <p class="mt-1 text-[11px] font-medium text-gray-300">720p · 5 Mbps · 30 fps</p>
            <p class="mt-1.5 text-[11px] text-gray-600">Best for AI analysis and fast uploads (~1.3 GB / match)</p>
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-3 text-left transition-colors"
            :class="settings.recordingPreset === 'creator'
              ? 'border-white/[0.20] bg-white/[0.06]'
              : 'border-white/[0.08] bg-transparent hover:border-white/[0.12]'"
            @click="setRecordingPreset('creator')"
          >
            <div class="flex items-center gap-2">
              <p class="text-xs font-semibold text-gray-100">Creator</p>
              <span v-if="!hasProAccess" class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Pro</span>
            </div>
            <p class="mt-1 text-[11px] font-medium text-gray-300">
              {{ settings.recordingPreset === 'creator' && settings.recordingQuality === '720p'
                ? '720p · 5 Mbps · 30 fps'
                : '1080p · 10 Mbps · 60 fps' }}
            </p>
            <p class="mt-1.5 text-[11px] text-gray-600">
              <template v-if="hasProAccess">Higher quality local VODs. Resolution syncs to OBS.</template>
              <template v-else>Pro feature. Higher quality for streaming and content creation.</template>
            </p>
          </button>
        </div>
        <div
          v-if="hasProAccess && settings.recordingPreset === 'creator'"
          class="grid grid-cols-2 gap-2"
        >
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-left transition-colors"
            :class="settings.recordingQuality === '720p'
              ? 'border-white/[0.20] bg-white/[0.06]'
              : 'border-white/[0.08] bg-transparent hover:border-white/[0.12]'"
            @click="setCreatorQuality('720p')"
          >
            <p class="text-xs font-semibold text-gray-100">720p</p>
            <p class="mt-0.5 text-[11px] text-gray-500">5 Mbps · 30 fps</p>
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-left transition-colors"
            :class="settings.recordingQuality !== '720p'
              ? 'border-white/[0.20] bg-white/[0.06]'
              : 'border-white/[0.08] bg-transparent hover:border-white/[0.12]'"
            @click="setCreatorQuality('1080p')"
          >
            <p class="text-xs font-semibold text-gray-100">1080p</p>
            <p class="mt-0.5 text-[11px] text-gray-500">10 Mbps · 60 fps · ~3 GB / match</p>
          </button>
        </div>
        <p v-if="settings.recordingPreset === 'creator'" class="text-[11px] text-gray-600">
          Coaching uploads are compressed automatically. Your local file stays at full quality.
        </p>
        <SettingsRow
          label="Record game audio"
          hint="Includes in-game sound via OBS"
        >
          <SettingsToggle :on="!!settings.audioEnabled" @click="toggleAudio()" />
        </SettingsRow>
        <SettingsRow
          label="Record full match VODs"
          hint="Off = replay-buffer kill clips only. No AI match coaching without a VOD."
        >
          <SettingsToggle :on="settings.fullMatchRecording !== false" @click="toggleFullMatchRecording()" />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection
      id="storage"
      title="Storage &amp; clips"
      hint="Save location, disk usage, highlights, and cleanup"
      :highlight-id="highlightSection"
    >
      <div>
        <label class="mb-1 block text-xs text-gray-400">Save location</label>
        <div class="flex gap-2">
          <input :value="settings.effectiveSavePath ?? settings.savePath" readonly class="min-w-0 flex-1 truncate rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-gray-400" />
          <button type="button" class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="changeSavePath">Change</button>
        </div>
      </div>

      <div
        class="space-y-3 rounded-lg border p-3"
        :class="diskSpaceCritical
          ? 'border-red-500/25 bg-red-500/[0.04]'
          : diskSpaceLow
            ? 'border-orange-500/20 bg-orange-500/[0.04]'
            : 'border-white/[0.08] bg-transparent'"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-medium text-gray-300">Storage usage</p>
            <p class="mt-1 text-xs" :class="diskSpaceCritical ? 'text-red-300/90' : diskSpaceLow ? 'text-orange-300/90' : 'text-gray-500'">{{ storageSummary }}</p>
            <p v-if="storageEstimateLabel" class="mt-1 text-[11px] text-gray-600">{{ storageEstimateLabel }}</p>
          </div>
          <button type="button" class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openRecordingsFolder">Open folder</button>
        </div>
        <p v-if="diskSpaceLow" class="text-[11px] leading-relaxed text-orange-300/80">
          Low disk space can cut recordings short. Upload pending VODs to the cloud, then remove local copies you no longer need.
        </p>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full transition-all"
            :style="{ width: storageUsagePercent + '%', backgroundColor: 'var(--game-accent, #ef4444)' }"
          />
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
        <label class="mb-1 block text-xs text-gray-400">Highlight clips to capture</label>
        <p class="mb-2 text-[11px] text-gray-600">Choose which moments UpForge auto-saves after each match. Manual hotkey clips ({{ '\u2318' }}/F9) are always saved.</p>
        <div class="space-y-1.5">
          <button
            v-for="opt in clipCaptureOptions"
            :key="opt.key"
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-white/[0.16]"
            @click="toggleClipCapture(opt.key)"
          >
            <span class="min-w-0">
              <span class="block text-xs font-medium text-gray-200">{{ opt.label }}</span>
              <span class="block text-[11px] text-gray-600">{{ opt.hint }}</span>
            </span>
            <SettingsToggle :on="!!settings.clipCapture?.[opt.key]" @click.stop="toggleClipCapture(opt.key)" />
          </button>
        </div>
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
        <p class="mt-1 text-xs text-gray-600">Local-only clips older than this are deleted on startup. Favorites are kept.</p>
      </div>

      <div>
        <label class="mb-1 block text-xs text-gray-400">Auto-delete routine kill clips</label>
        <select v-model.number="settings.clipKillRetentionDays" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
          <option :value="0">Never</option>
          <option :value="7">After 7 days</option>
          <option :value="14">After 14 days</option>
          <option :value="30">After 30 days</option>
        </select>
        <p class="mt-1 text-xs text-gray-600">Removes old 1K kill clips only. Clutches, aces, multikills, bookmarks, and favorites are kept.</p>
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
    </SettingsSection>
  </div>
</template>
