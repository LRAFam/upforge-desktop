<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettings } from '../../composables/useSettings'
import SettingsRow from './SettingsRow.vue'
import SettingsSection from './SettingsSection.vue'
import SettingsStatusStrip from './SettingsStatusStrip.vue'
import type { StatusItem } from './SettingsStatusStrip.vue'

const router = useRouter()
const developerOpen = ref(false)

const {
  BADGE_PREVIEW_ITEMS,
  appVersion,
  captureBackendDescription,
  captureBackendOk,
  checkForUpdates,
  debouncedSave,
  getBadgeIconUrl,
  highlightSection,
  installObsProfile,
  installUpdate,
  isDev,
  obsConnect,
  obsConnecting,
  obsDisconnectedHint,
  obsDisconnect,
  obsLaunchAndConnect,
  obsPreflightMessage,
  obsPreflightMessageError,
  obsPreflightRunning,
  obsProcessState,
  obsRepairRunning,
  obsRepairSetup,
  obsRunPreflight,
  obsSetupRunning,
  obsSetupScene,
  obsStatus,
  obsTestRecording,
  obsTestRecordingRunning,
  riotApiResult,
  settings,
  testRiotApi,
  testingRiotApi,
  updatePercent,
  updatePhase,
  updateUpToDate,
  updateVersion,
} = useSettings()

const statusItems = computed<StatusItem[]>(() => [
  {
    id: 'obs',
    label: 'OBS',
    detail: obsStatus.value?.connected
      ? `Connected · v${obsStatus.value.obsVersion ?? '?'}`
      : obsProcessState.value?.processRunning
        ? 'Running, not connected'
        : 'Not connected',
    tone: obsStatus.value?.connected ? 'ok' : 'warn',
  },
  {
    id: 'capture',
    label: 'Capture',
    detail: captureBackendDescription.value,
    tone: captureBackendOk.value ? 'ok' : 'warn',
  },
])

function previewOnboarding(): void {
  void router.push({ path: '/onboarding', query: { preview: '1' } })
}
</script>

<template>
  <div class="space-y-4">
    <SettingsStatusStrip :items="statusItems" />

    <SettingsSection
      id="obs"
      title="OBS recording"
      hint="Connect OBS for match VODs and kill clips"
      :highlight-id="highlightSection"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-white">Connection</p>
          <p class="mt-1 text-xs" :class="obsStatus?.connected ? 'text-green-300/80' : 'text-amber-300/80'">
            <template v-if="obsStatus?.connected">Connected · OBS v{{ obsStatus.obsVersion ?? '?' }}</template>
            <template v-else-if="obsProcessState?.processRunning">OBS is running but not connected (likely stuck after a crash)</template>
            <template v-else>Required: install OBS 28+, enable WebSocket, then connect below</template>
          </p>
        </div>
        <span class="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" :class="obsStatus?.connected ? 'bg-green-500' : 'bg-amber-400'" />
      </div>

      <ol class="list-decimal list-inside space-y-1 text-xs text-gray-400">
        <li>Install <a href="https://obsproject.com/" target="_blank" class="underline hover:text-gray-200" :style="{ color: 'var(--game-accent, #ef4444)' }">OBS Studio 28+</a></li>
        <li>Click <strong class="text-gray-300">Launch OBS + Connect</strong>. We install the UpForge profile and WebSocket defaults</li>
        <li>Default password is <strong class="text-gray-300">upforge</strong> unless you changed it in OBS</li>
        <li>Capture is <strong class="text-gray-300">game window only</strong>. Alt-tab will not record other apps</li>
        <li>Prefer <strong class="text-gray-300">borderless windowed</strong> in Valorant. Exclusive fullscreen makes alt-tab flaky for capture</li>
      </ol>

      <div class="flex flex-wrap items-center gap-2">
        <template v-if="!obsStatus?.connected">
          <button type="button" :disabled="obsConnecting" class="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition-colors hover:border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50" @click="obsLaunchAndConnect">{{ obsConnecting ? 'Starting…' : 'Launch OBS + Connect' }}</button>
          <button type="button" :disabled="obsConnecting" class="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-white/[0.16] hover:text-white disabled:opacity-50" @click="obsConnect">{{ obsConnecting ? 'Connecting…' : 'Connect' }}</button>
          <button type="button" class="rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-white/[0.14] hover:text-white" @click="installObsProfile">Install OBS profile</button>
        </template>
        <template v-else>
          <button type="button" class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="obsDisconnect">Disconnect</button>
          <button type="button" :disabled="obsRepairRunning" class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-50" @click="obsRepairSetup">{{ obsRepairRunning ? 'Repairing…' : 'Repair Setup' }}</button>
          <button type="button" :disabled="obsTestRecordingRunning" class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-50" @click="obsTestRecording">{{ obsTestRecordingRunning ? 'Testing…' : 'Test Recording' }}</button>
          <button type="button" :disabled="obsPreflightRunning" class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-50" @click="obsRunPreflight">{{ obsPreflightRunning ? 'Checking…' : 'Verify Setup' }}</button>
          <button type="button" :disabled="obsSetupRunning" class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-50" @click="obsSetupScene">{{ obsSetupRunning ? 'Setting up…' : 'Recreate UpForge scene' }}</button>
        </template>
      </div>

      <p
        v-if="obsPreflightMessage"
        class="rounded-lg border px-3 py-2 text-xs"
        :class="obsPreflightMessageError ? 'border-red-500/20 bg-red-500/6 text-red-300' : 'border-green-500/20 bg-green-500/6 text-green-300'"
      >
        {{ obsPreflightMessage }}
      </p>
      <p v-if="settings.obsSetupPassedAt" class="text-[11px] text-gray-600">
        Last verified {{ new Date(settings.obsSetupPassedAt).toLocaleString() }}
      </p>

      <div class="grid grid-cols-[1fr_96px] gap-3">
        <div>
          <label class="mb-1 block text-xs text-gray-400">WebSocket host</label>
          <input v-model="settings.obsHost" type="text" class="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none" placeholder="127.0.0.1" @change="debouncedSave()" />
        </div>
        <div>
          <label class="mb-1 block text-xs text-gray-400">Port</label>
          <input v-model.number="settings.obsPort" type="number" class="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-white/20 focus:outline-none" min="1" max="65535" @change="debouncedSave()" />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs text-gray-400">WebSocket password</label>
        <input v-model="settings.obsPassword" type="password" class="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none" placeholder="Default: upforge" @change="debouncedSave()" />
        <p class="mt-1 text-[10px] text-gray-600">Leave blank to use UpForge default after profile install.</p>
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs text-gray-400">Replay buffer (kill clips)</label>
          <span class="text-xs text-gray-500">{{ settings.obsReplayBufferSeconds }}s</span>
        </div>
        <input v-model.number="settings.obsReplayBufferSeconds" type="range" min="10" max="120" step="5" class="w-full" :style="{ accentColor: 'var(--game-accent, #ef4444)' }" @input="debouncedSave()" />
      </div>

      <label class="flex cursor-pointer items-start gap-3">
        <input
          v-model="settings.obsPreserveActiveScene"
          type="checkbox"
          class="mt-0.5 rounded border-white/20 bg-white/5"
          :style="{ accentColor: 'var(--game-accent, #ef4444)' }"
          @change="debouncedSave()"
        />
        <span>
          <span class="text-sm text-white">Keep my active OBS scene when a match starts</span>
          <span class="mt-0.5 block text-[11px] leading-relaxed text-gray-500">
            Turn on if you stream with face cam and overlays. UpForge will still retarget game capture but will not force-switch to the UpForge scene.
          </span>
        </span>
      </label>

      <p class="text-xs text-gray-500">UpForge starts/stops OBS and applies the recording preset on connect and before each match.</p>
      <p v-if="obsDisconnectedHint" class="rounded-lg border border-red-500/20 bg-red-500/6 px-3 py-2 text-xs text-red-300">{{ obsDisconnectedHint }}</p>
    </SettingsSection>

    <SettingsSection
      title="Capture method"
      hint="How UpForge detects and records your game"
    >
      <SettingsRow
        label="Capture backend"
        :hint="captureBackendDescription"
      >
        <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="captureBackendOk ? 'bg-green-500' : 'bg-yellow-400'" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Match detection"
      hint="Test Valorant match detection while in-game"
    >
      <SettingsRow
        label="Valorant detection"
        :hint="riotApiResult === null
          ? 'Open Valorant and start a match, then test detection.'
          : riotApiResult.processRunning && riotApiResult.logGameMode
            ? `In-game · ${riotApiResult.logGameMode} (log)`
            : riotApiResult.processRunning && riotApiResult.gameMode
              ? `In-game · ${riotApiResult.gameMode} (api)`
              : riotApiResult.processRunning
                ? 'In-game process detected · mode unknown'
                : `Not in a match · process=${riotApiResult.processRunning}`"
      >
        <button
          type="button"
          class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white"
          :disabled="testingRiotApi"
          @click="testRiotApi"
        >
          {{ testingRiotApi ? 'Testing…' : 'Test' }}
        </button>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Onboarding"
      hint="Preview the setup flow without resetting your account"
    >
      <SettingsRow
        label="Preview onboarding"
        hint="Walk the unified onboarding flow without resetting your account."
      >
        <button
          type="button"
          class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white"
          @click="previewOnboarding"
        >
          Preview
        </button>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      v-if="!isDev"
      title="Updates"
      :hint="`UpForge Desktop v${appVersion}`"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p v-if="updatePhase === 'idle' || updatePhase === 'checking'" class="text-sm text-gray-200">
            {{ updateUpToDate ? 'You are on the latest version' : 'A newer version may be available' }}
          </p>
          <p v-else-if="updatePhase === 'downloading'" class="text-sm text-amber-300/90">
            Downloading update… {{ updatePercent }}%
          </p>
          <p v-else-if="updatePhase === 'ready'" class="text-sm text-red-300/90">
            v{{ updateVersion }} is ready to install
          </p>
          <p v-else class="text-sm text-gray-400">Checking for updates…</p>
        </div>
        <div class="flex flex-shrink-0 items-center gap-2">
          <button
            v-if="updatePhase === 'idle' || updatePhase === 'checking'"
            type="button"
            class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium transition-colors"
            :class="updatePhase === 'checking' ? 'cursor-default text-gray-500' : 'text-gray-300 hover:border-white/[0.14] hover:text-white'"
            :disabled="updatePhase === 'checking'"
            @click="checkForUpdates"
          >
            {{ updatePhase === 'checking' ? 'Checking…' : updateUpToDate ? 'Check again' : 'Check for updates' }}
          </button>
          <button
            v-else-if="updatePhase === 'ready'"
            type="button"
            class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15"
            @click="installUpdate"
          >
            Restart to update
          </button>
        </div>
      </div>
      <div v-if="updatePhase === 'downloading'" class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          class="h-full rounded-full transition-all"
          :style="{ width: updatePercent + '%', backgroundColor: 'var(--game-accent, #ef4444)' }"
        />
      </div>
    </SettingsSection>

    <SettingsSection
      id="developer"
      title="Developer"
      hint="Diagnostics panel and asset previews"
      :highlight-id="highlightSection"
    >
      <button
        type="button"
        class="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 transition-colors"
        @click="router.push('/dev')"
      >
        Open developer panel
      </button>
      <p class="mt-1.5 text-[11px] text-gray-600">
        Riot / League LCU / OBS / analysis pipeline diagnostics. Also available from the sidebar when you are admin.
      </p>

      <button
        type="button"
        class="mt-3 text-xs font-medium text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
        @click="developerOpen = !developerOpen"
      >
        {{ developerOpen ? 'Hide badge previews' : 'Show badge previews' }}
      </button>

      <div v-if="developerOpen" class="space-y-3">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Badge &amp; rank icons</p>
          <p class="mt-1 text-[11px] text-gray-500">Preview of imported artwork (more ranks coming soon).</p>
          <div class="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            <div
              v-for="item in BADGE_PREVIEW_ITEMS"
              :key="item.slug"
              class="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
            >
              <img :src="getBadgeIconUrl(item.slug)!" :alt="item.label" class="h-16 w-16 object-contain" />
              <span class="text-center text-[9px] leading-tight text-gray-500">{{ item.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  </div>
</template>
