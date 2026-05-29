<template>
  <div class="flex h-full flex-col overflow-hidden bg-[#0a0a0a] text-white">
    <nav class="flex flex-shrink-0 gap-1 border-b border-white/[0.05] bg-[#0c0c0c] px-3 pt-3 pb-2.5">
      <button
        v-for="tab in SETTINGS_TABS"
        :key="tab.id"
        :class="[
          'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
          activeTab === tab.id
            ? 'bg-red-500/12 text-red-400 ring-1 ring-red-500/20'
            : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
        ]"
        @click="activeTab = tab.id"
      >
        <svg class="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-html="tab.icon" />
        {{ tab.label }}
      </button>
    </nav>

    <div class="flex-1 space-y-4 overflow-y-auto px-3 py-3">
      <section v-show="activeTab === 'general'" class="space-y-4">
        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('account')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.118a7.5 7.5 0 0115 0A17.933 17.933 0 0112 21.75a17.933 17.933 0 01-7.5-1.632z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Account</p>
                <p class="text-xs text-gray-500">Profile, plan, and connected Riot ID</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.account ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.account" class="border-t border-white/[0.05] p-4">
            <div v-if="user" class="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-red-500/12 via-orange-500/6 to-transparent p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111111] text-sm font-bold text-red-400">{{ accountInitial }}</div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-semibold text-white">{{ user.name }}</p>
                      <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize" :class="getTierBadgeClass(user.tier)">{{ user.tier || 'free' }}</span>
                    </div>
                    <p class="truncate text-xs text-gray-400">{{ user.email }}</p>
                    <p class="mt-1 text-xs" :class="user.riot_name ? 'text-red-300/80' : 'text-gray-500 italic'">{{ accountRiotId }}</p>
                  </div>
                </div>
                <div class="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-300">Desktop</div>
              </div>
              <div class="mt-4 grid grid-cols-2 gap-2">
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openBilling">Manage billing</button>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openSite">Open dashboard</button>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openHelp">Support</button>
                <button class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15" @click="handleLogout">Sign out</button>
              </div>
            </div>
            <div v-else class="h-28 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.02]" />
          </div>
        </div>

        <div v-if="user && user.analyses_used !== undefined" class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('usage')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3.75 3v18m0 0h18M7.5 14.25l3-3 2.25 2.25 4.5-6" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Usage</p>
                <p class="text-xs text-gray-500">Track monthly coaching sessions</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.usage ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.usage" class="border-t border-white/[0.05] p-4 space-y-3">
            <div class="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Analyses this month</span>
                <span class="font-medium tabular-nums text-gray-200">{{ user.analyses_used }} / {{ user.analyses_limit }}</span>
              </div>
              <div v-if="user.analyses_limit" class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all" :style="{ width: usagePercent + '%' }" />
              </div>
              <div class="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                <span>Current plan</span>
                <span class="rounded-full bg-white/[0.04] px-2 py-0.5 capitalize text-gray-300">{{ user.tier || 'free' }}</span>
              </div>
            </div>
            <div v-if="usagePercent >= 80 && user.analyses_limit" class="rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
              <p class="text-xs font-medium text-purple-300">{{ usagePercent >= 100 ? 'You have used all analyses for this month.' : 'You are getting close to your monthly analysis limit.' }}</p>
              <p class="mt-1 text-xs text-purple-300/70">Upgrade for more analyses and full history access.</p>
              <button class="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 py-2 text-xs font-semibold text-white transition-all hover:from-purple-500 hover:to-purple-600" @click="openUpgrade">Upgrade plan</button>
            </div>
          </div>
        </div>

        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('behavior')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.5 6h9m-9 6h9m-9 6h9M4.5 6h.008v.008H4.5V6zm0 6h.008v.008H4.5V12zm0 6h.008v.008H4.5V18z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">General preferences</p>
                <p class="text-xs text-gray-500">Startup, notifications, and automation</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.behavior ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.behavior" class="divide-y divide-white/[0.05] border-t border-white/[0.05]">
            <div v-for="toggle in toggles" :key="toggle.key" class="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">{{ toggle.label }}</p>
                <p v-if="toggle.hint" class="mt-1 text-xs text-gray-500">{{ toggle.hint }}</p>
              </div>
              <button
                class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                :class="settings[toggle.key] ? 'bg-red-500' : 'bg-white/20'"
                @click="toggle.key === 'launchOnStartup' ? toggleLaunchOnStartup() : toggleKey(toggle.key)"
              >
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings[toggle.key] ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-show="activeTab === 'recording'" class="space-y-4">
        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
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
          <div v-if="sectionOpen.recordingCapture" class="space-y-4 border-t border-white/[0.05] p-4">
            <div>
              <label class="mb-2 block text-xs font-medium text-gray-400">Record game modes</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="mode in GAME_MODES"
                  :key="mode.value"
                  class="rounded-xl border px-3 py-2 text-left transition-all"
                  :class="settings.recordedModes.includes(mode.value)
                    ? 'border-red-500/25 bg-red-500/10 text-gray-100'
                    : 'border-white/[0.06] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
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
              <p class="mt-2 text-xs text-gray-600">Games in unselected modes will not be recorded.</p>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-medium text-gray-400">Recording quality</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  class="rounded-xl border px-3 py-2 text-left transition-all"
                  :class="settings.recordingQuality === '720p' ? 'border-red-500/25 bg-red-500/10 text-white' : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-white/[0.12] hover:text-gray-200'"
                  @click="settings.recordingQuality = '720p'; debouncedSave()"
                >
                  <p class="text-xs font-semibold">720p</p>
                  <p class="mt-1 text-[11px] text-gray-500">Balanced for smaller files</p>
                </button>
                <button
                  class="rounded-xl border px-3 py-2 text-left transition-all"
                  :class="settings.recordingQuality === '1080p' ? 'border-red-500/25 bg-red-500/10 text-white' : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-white/[0.12] hover:text-gray-200'"
                  @click="settings.recordingQuality = '1080p'; debouncedSave()"
                >
                  <p class="text-xs font-semibold">1080p</p>
                  <p class="mt-1 text-[11px] text-gray-500">Sharper review footage</p>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-gray-400">Frame rate</label>
                <select v-model.number="settings.recordingFps" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                  <option :value="24">24 FPS</option>
                  <option :value="30">30 FPS</option>
                  <option :value="60">60 FPS</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-400">Capture monitor</label>
                <select v-model="settings.captureMonitor" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                  <option value="auto">Auto-detect</option>
                  <option :value="0">Monitor 1 (primary)</option>
                  <option :value="1">Monitor 2</option>
                  <option :value="2">Monitor 3</option>
                </select>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">Bitrate</label>
              <select v-model.number="settings.recordingBitrate" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                <option :value="4">4 Mbps — ~1.8 GB/hr (720p 30fps)</option>
                <option :value="6">6 Mbps — ~2.7 GB/hr (720p 60fps)</option>
                <option :value="8">8 Mbps — ~3.6 GB/hr (1080p 30fps)</option>
                <option :value="12">12 Mbps — ~5.4 GB/hr (1080p 30fps high)</option>
                <option :value="15">15 Mbps — ~6.8 GB/hr (1080p 60fps)</option>
                <option :value="20">20 Mbps — ~9.0 GB/hr (1080p 60fps high)</option>
              </select>
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">Save location</label>
              <div class="flex gap-2">
                <input :value="settings.savePath" readonly class="min-w-0 flex-1 truncate rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-gray-400" />
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="changeSavePath">Change</button>
              </div>
            </div>

            <div class="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium text-gray-300">Storage usage</p>
                  <p class="mt-1 text-xs text-gray-500">{{ storageSummary }}</p>
                </div>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openRecordingsFolder">Open folder</button>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all" :style="{ width: storageUsagePercent + '%' }" />
              </div>
              <div class="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                <span>Local budget</span>
                <span>{{ storageSoftLimitLabel }}</span>
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
              <p class="mt-1 text-xs text-gray-600">Local-only clips older than this are deleted on startup.</p>
            </div>
          </div>
        </div>

        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('audio')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19.114 5.636a9 9 0 010 12.728M16.286 8.464a5 5 0 010 7.072M8.25 9.75 12 6v12l-3.75-3.75H5.25a.75.75 0 01-.75-.75v-3a.75.75 0 01.75-.75h3z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Audio</p>
                <p class="text-xs text-gray-500">Desktop audio capture and diagnostics</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.audio ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.audio" class="space-y-3 border-t border-white/[0.05] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Record game audio</p>
                <p class="mt-1 text-xs text-gray-500">Capture desktop audio in saved recordings</p>
              </div>
              <button class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" :class="settings.audioEnabled ? 'bg-red-500' : 'bg-white/20'" @click="toggleAudio">
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.audioEnabled ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>
            <div v-if="fixingAudio" class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-gray-400">Detecting audio capture…</div>
            <div v-else-if="audioStatus !== null && audioStatus.winAudioMode === false" class="rounded-2xl border border-amber-500/20 bg-amber-500/6 p-4">
              <p class="flex items-start gap-2 text-xs text-amber-300/90">
                <svg class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>
                  <template v-if="isMac">No virtual audio device found. Install <a href="https://existential.audio/blackhole/" target="_blank" class="underline hover:text-amber-200">BlackHole</a> to capture desktop audio.</template>
                  <template v-else>Desktop audio capture is unavailable right now. UpForge can attempt to auto-fix this for you.</template>
                </span>
              </p>
              <button class="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.1]" @click="fixAudio">{{ isMac ? 'Re-check audio devices' : 'Fix audio automatically' }}</button>
            </div>
            <div v-else-if="audioStatus !== null && audioStatus.winAudioMode === 'desktop-capturer'" class="rounded-xl border border-green-500/20 bg-green-500/6 px-4 py-3 text-xs text-green-300">Built-in audio capture active (system audio via browser engine).</div>
            <div v-else-if="audioStatus !== null && audioStatus.winAudioMode" class="rounded-xl border border-green-500/20 bg-green-500/6 px-4 py-3 text-xs text-green-300">
              Desktop audio capture ready
              <span v-if="audioStatus.winAudioMode?.startsWith('dshow:')" class="text-green-300/70"> (Stereo Mix)</span>
              <span v-else-if="audioStatus.winAudioMode?.startsWith('wasapi')" class="text-green-300/70"> (WASAPI loopback)</span>
              <span v-else-if="audioStatus.winAudioMode?.startsWith('avfoundation:')" class="text-green-300/70"> (virtual loopback)</span>.
            </div>
          </div>
        </div>

        <div v-if="user?.tier === 'pro'" class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('obs')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3.75 15.75V8.25A2.25 2.25 0 016 6h9.75A2.25 2.25 0 0118 8.25v7.5M7.5 18h9M8.25 12h.008v.008H8.25V12zm3.75 0h.008v.008H12V12zm3.75 0h.008v.008H15.75V12z" />
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold text-white">OBS Integration</p>
                  <span class="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">Pro</span>
                </div>
                <p class="text-xs text-gray-500">Replay buffer capture and WebSocket control</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.obs ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.obs" class="space-y-4 border-t border-white/[0.05] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">OBS connection</p>
                <p class="mt-1 text-xs text-gray-500">
                  <template v-if="obsStatus?.connected">OBS v{{ obsStatus.obsVersion ?? '?' }} connected</template>
                  <template v-else>Connect OBS 28+ with the WebSocket server enabled</template>
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full" :class="obsStatus?.connected ? 'bg-green-500' : 'bg-white/20'" />
                <button v-if="!obsStatus?.connected" :disabled="obsConnecting" class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15 disabled:opacity-50" @click="obsConnect">{{ obsConnecting ? 'Connecting…' : 'Connect' }}</button>
                <button v-else class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="obsDisconnect">Disconnect</button>
              </div>
            </div>

            <div class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Use OBS for recording</p>
                <p class="mt-1 text-xs text-gray-500">Requires OBS 28+ with WebSocket enabled</p>
              </div>
              <button class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" :class="settings.obsEnabled ? 'bg-red-500' : 'bg-white/20'" @click="settings.obsEnabled = !settings.obsEnabled; debouncedSave()">
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.obsEnabled ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>

            <div class="grid grid-cols-[1fr_96px] gap-3">
              <div>
                <label class="mb-1 block text-xs text-gray-400">WebSocket host</label>
                <input v-model="settings.obsHost" type="text" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-red-500/40 focus:outline-none" placeholder="localhost" @change="debouncedSave()" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-400">Port</label>
                <input v-model.number="settings.obsPort" type="number" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/40 focus:outline-none" min="1" max="65535" @change="debouncedSave()" />
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">WebSocket password</label>
              <input v-model="settings.obsPassword" type="password" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-red-500/40 focus:outline-none" placeholder="Optional" @change="debouncedSave()" />
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="text-xs text-gray-400">Replay buffer length</label>
                <span class="text-xs text-gray-500">{{ settings.obsReplayBufferSeconds }}s</span>
              </div>
              <input v-model.number="settings.obsReplayBufferSeconds" type="range" min="10" max="120" step="5" class="w-full accent-red-500" @input="debouncedSave()" />
              <p class="mt-1 text-xs text-gray-600">How many seconds of footage to save on each clip trigger.</p>
            </div>

            <p v-if="obsStatus?.lastError" class="rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-3 text-xs text-red-300">{{ obsStatus.lastError }}</p>
          </div>
        </div>

        <div v-else-if="user" class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('obsTeaser')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16.5 10.5V6.75A2.25 2.25 0 0014.25 4.5h-4.5A2.25 2.25 0 007.5 6.75v3.75m9 0v6.75A2.25 2.25 0 0114.25 19.5h-4.5A2.25 2.25 0 017.5 17.25V10.5m9 0h2.25m-13.5 0H3.75" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">OBS Integration</p>
                <p class="text-xs text-gray-500">Replay buffer capture is available on Pro</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.obsTeaser ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.obsTeaser" class="border-t border-white/[0.05] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-500/10 to-orange-500/10 px-4 py-3">
              <div>
                <p class="text-sm text-gray-100">Unlock OBS replay buffers</p>
                <p class="mt-1 text-xs text-gray-500">Use OBS for more flexible capture workflows and replay buffer clips.</p>
              </div>
              <button class="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15" @click="openUpgrade">Upgrade</button>
            </div>
          </div>
        </div>
      </section>

      <section v-show="activeTab === 'trainer'" class="space-y-4">
        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('mouseTrainer')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3.75c-2.485 0-4.5 2.015-4.5 4.5v7.5c0 2.485 2.015 4.5 4.5 4.5s4.5-2.015 4.5-4.5v-7.5c0-2.485-2.015-4.5-4.5-4.5zM12 3.75v5.25" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Mouse & trainer</p>
                <p class="text-xs text-gray-500">Aim calibration and sensitivity setup</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.mouseTrainer ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.mouseTrainer" class="space-y-4 border-t border-white/[0.05] p-4">
            <div>
              <label class="mb-1 block text-xs text-gray-400">Game</label>
              <select v-model="settings.trainerMouse.game" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                <option value="valorant">Valorant</option>
                <option value="cs2">CS2</option>
                <option value="apex">Apex Legends</option>
                <option value="overwatch2">Overwatch 2</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label class="mb-2 block text-xs text-gray-400">Mouse DPI</label>
              <div class="mb-2 grid grid-cols-4 gap-2">
                <button
                  v-for="preset in [400, 800, 1600, 3200]"
                  :key="preset"
                  class="rounded-xl border py-2 text-[11px] font-semibold transition-all"
                  :class="settings.trainerMouse.dpi === preset ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.06] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
                  @click="settings.trainerMouse.dpi = preset; debouncedSave()"
                >{{ preset }}</button>
              </div>
              <input type="number" v-model.number="settings.trainerMouse.dpi" min="100" max="32000" step="100" placeholder="Custom DPI" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">In-game sensitivity</label>
              <input type="number" v-model.number="settings.trainerMouse.sensitivity" min="0.01" max="20" step="0.01" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
            </div>

            <div class="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">eDPI</span>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm font-bold tabular-nums text-gray-100">{{ Math.round(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="eDpiLevelClass(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity)">{{ eDpiLabel(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span>
                </div>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full transition-all duration-300" :class="eDpiBarClass(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity)" :style="{ width: Math.min(100, (settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) / 30) + '%' }" />
              </div>
              <p class="mt-2 text-xs text-gray-600">eDPI = DPI × sensitivity, so the trainer matches your in-game feel.</p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-gray-400">Horizontal FOV</label>
                <input type="number" v-model.number="settings.trainerMouse.fov" min="60" max="120" step="1" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-gray-400">Polling rate</label>
                <select v-model.number="settings.trainerMouse.pollingRate" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave">
                  <option :value="125">125 Hz</option>
                  <option :value="250">250 Hz</option>
                  <option :value="500">500 Hz</option>
                  <option :value="1000">1000 Hz</option>
                  <option :value="2000">2000 Hz</option>
                  <option :value="4000">4000 Hz</option>
                </select>
              </div>
            </div>

            <div class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Raw input</p>
                <p class="mt-1 text-xs text-gray-500">Bypass OS pointer acceleration</p>
              </div>
              <button class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" :class="settings.trainerMouse.rawInput ? 'bg-red-500' : 'bg-white/20'" @click="settings.trainerMouse.rawInput = !settings.trainerMouse.rawInput; debouncedSave()">
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.trainerMouse.rawInput ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>
          </div>
        </div>

        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('crosshair')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.122-2.122M7.757 7.757 5.636 5.636m12.728 0-2.122 2.121M7.757 16.243l-2.121 2.121M12 15a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Crosshair</p>
                <p class="text-xs text-gray-500">Preview and edit your trainer crosshair</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.crosshair ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.crosshair" class="border-t border-white/[0.05] p-4">
            <div class="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <crosshair-settings-panel v-model="settings.crosshairSettings" @update:model-value="debouncedSave()" />
            </div>
          </div>
        </div>

        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('shortcuts')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6.75 7.5h10.5A2.25 2.25 0 0119.5 9.75v4.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 14.25v-4.5A2.25 2.25 0 016.75 7.5zM8.25 12h.008v.008H8.25V12zm3 0h.008v.008h-.008V12zm3 0h.008v.008h-.008V12z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Shortcuts</p>
                <p class="text-xs text-gray-500">Hotkeys for clips, overlay, and screenshots</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.shortcuts ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.shortcuts" class="space-y-3 border-t border-white/[0.05] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Open or focus window</p>
                <p class="mt-1 text-xs text-gray-500">Fixed system shortcut</p>
              </div>
              <div class="flex items-center gap-1">
                <kbd v-for="part in ['Ctrl', 'Shift', 'U']" :key="part" class="rounded-md border border-white/[0.12] bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-gray-300">{{ part }}</kbd>
              </div>
            </div>

            <div class="space-y-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-gray-200">Bookmark clip moment</p>
                  <p class="mt-1 text-xs" :class="hotkeyStatus['save-clip'] === false ? 'text-yellow-400/80' : 'text-gray-500'">{{ hotkeyStatus['save-clip'] === false ? 'Failed to register — key may be in use' : 'Press during a match to save a clip' }}</p>
                  <button v-if="hotkeyStatus['save-clip'] === false" class="mt-2 inline-flex items-center gap-1 text-xs text-yellow-300 transition-colors hover:text-yellow-200" :disabled="conflictScanning" @click="findConflict">
                    <svg v-if="!conflictScanning" class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <svg v-else class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    {{ conflictScanning ? 'Scanning…' : 'Find conflicting app' }}
                  </button>
                </div>
                <button class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'save-clip' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('save-clip')">
                  <span v-if="rebinding === 'save-clip'">Press a key…</span>
                  <span v-else class="flex items-center justify-end gap-1">
                    <kbd v-for="part in hotkeyParts(hotkeys['save-clip'] ?? 'F9')" :key="part" class="rounded-md border border-white/[0.12] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">{{ part }}</kbd>
                  </span>
                </button>
              </div>

              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-gray-200">Toggle overlay</p>
                  <p class="mt-1 text-xs" :class="hotkeyStatus['toggle-overlay'] === false ? 'text-yellow-400/80' : 'text-gray-500'">{{ hotkeyStatus['toggle-overlay'] === false ? 'Failed to register — key may be in use' : 'Show or hide the in-game overlay' }}</p>
                </div>
                <button class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'toggle-overlay' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('toggle-overlay')">
                  <span v-if="rebinding === 'toggle-overlay'">Press a key…</span>
                  <span v-else class="flex items-center justify-end gap-1">
                    <kbd v-for="part in hotkeyParts(hotkeys['toggle-overlay'] ?? 'F10')" :key="part" class="rounded-md border border-white/[0.12] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">{{ part }}</kbd>
                  </span>
                </button>
              </div>

              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-gray-200">Take screenshot</p>
                  <p class="mt-1 text-xs" :class="hotkeyStatus['take-screenshot'] === false ? 'text-yellow-400/80' : 'text-gray-500'">{{ hotkeyStatus['take-screenshot'] === false ? 'Failed to register — key may be in use' : 'Capture a screenshot during a match' }}</p>
                </div>
                <button class="min-w-[132px] rounded-xl border px-3 py-2 text-right font-mono text-xs transition-all" :class="rebinding === 'take-screenshot' ? 'border-red-500/35 bg-red-500/10 text-red-300 animate-pulse' : 'border-white/[0.08] bg-white/[0.04] text-gray-200 hover:border-white/[0.14] hover:text-white'" @click="startRebind('take-screenshot')">
                  <span v-if="rebinding === 'take-screenshot'">Press a key…</span>
                  <span v-else class="flex items-center justify-end gap-1">
                    <kbd v-for="part in hotkeyParts(hotkeys['take-screenshot'] ?? 'F8')" :key="part" class="rounded-md border border-white/[0.12] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">{{ part }}</kbd>
                  </span>
                </button>
              </div>
            </div>

            <p v-if="rebinding" class="px-1 text-xs text-gray-500">Press Escape to cancel. Changes apply immediately.</p>

            <Transition name="result-slide">
              <div v-if="conflictResults !== null" class="overflow-hidden rounded-2xl border" :class="conflictResults.found.length > 0 ? 'border-yellow-500/20 bg-yellow-500/6' : 'border-white/[0.06] bg-white/[0.02]'">
                <div class="space-y-2 px-4 py-3">
                  <template v-if="conflictResults.found.length > 0">
                    <div class="flex items-center gap-2">
                      <svg class="h-3.5 w-3.5 flex-shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">Conflicts detected</p>
                    </div>
                    <div v-for="c in conflictResults.found" :key="c.exe" class="space-y-0.5 border-l border-yellow-500/20 pl-3">
                      <p class="text-xs font-medium text-gray-200">{{ c.name }}</p>
                      <p class="text-xs leading-snug text-gray-500">{{ c.fix }}</p>
                    </div>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-2 text-xs text-gray-400">
                      <svg class="h-3.5 w-3.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                      No known conflicts found. Try rebinding to a different key.
                    </div>
                  </template>
                </div>
                <div class="border-t border-white/[0.05] px-4 py-2">
                  <button class="text-xs text-gray-500 transition-colors hover:text-gray-300" @click="conflictResults = null">Dismiss</button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <section v-show="activeTab === 'system'" class="space-y-4">
        <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('system')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.5 6h3m-7.5 6h12m-9 6h6M4.5 6h.008v.008H4.5V6zm0 6h.008v.008H4.5V12zm0 6h.008v.008H4.5V18z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">System</p>
                <p class="text-xs text-gray-500">Diagnostics, updates, and match detection</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.system ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.system" class="space-y-3 border-t border-white/[0.05] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Recording engine (ffmpeg)</p>
                <p v-if="ffmpegOk" class="mt-1 text-xs text-green-400/80">Ready</p>
                <p v-else class="mt-1 text-xs text-yellow-400/80">Not found — reinstall the app.</p>
              </div>
              <span class="h-2 w-2 rounded-full" :class="ffmpegOk ? 'bg-green-500' : 'bg-yellow-400'" />
            </div>

            <div v-if="settings.cachedEncoder" class="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Video encoder</p>
                <p class="mt-1 text-xs text-green-400/80">{{ encoderLabel }}</p>
              </div>
              <span class="h-2 w-2 rounded-full bg-green-500" />
            </div>

            <div class="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-200">Match detection</p>
                  <p v-if="riotApiResult === null" class="mt-1 text-xs text-gray-500">Open Valorant and start a match, then test detection.</p>
                  <p v-else-if="riotApiResult.processRunning && riotApiResult.logGameMode" class="mt-1 truncate text-xs text-green-400/80">In-game · {{ riotApiResult.logGameMode }} (log)</p>
                  <p v-else-if="riotApiResult.processRunning && riotApiResult.gameMode" class="mt-1 truncate text-xs text-green-400/80">In-game · {{ riotApiResult.gameMode }} (api)</p>
                  <p v-else-if="riotApiResult.processRunning" class="mt-1 text-xs text-yellow-400/80">In-game process detected · mode unknown</p>
                  <p v-else class="mt-1 text-xs text-gray-500">Not in a match · process={{ riotApiResult.processRunning }}</p>
                </div>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" :disabled="testingRiotApi" @click="testRiotApi">{{ testingRiotApi ? 'Testing…' : 'Test' }}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Transition name="toast-slide">
        <div v-if="savedToast" class="fixed right-5 bottom-5 flex items-center gap-2 rounded-xl border border-green-500/20 bg-[#121212] px-4 py-2.5 text-sm text-white shadow-xl pointer-events-none">
          <svg class="h-4 w-4 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          {{ toastMessage || 'Settings saved' }}
        </div>
      </Transition>
    </div>

    <div class="flex-shrink-0 space-y-2 border-t border-white/[0.04] bg-[#0c0c0c] px-3 pt-2 pb-3">
      <div class="flex items-center justify-between px-0.5">
        <p class="cursor-default select-none text-xs text-gray-700" :class="{ 'text-amber-600': devTapCount > 0 && devTapCount < 5 }" @click="handleVersionTap">UpForge Desktop v{{ appVersion }}<span v-if="devTapCount > 0 && devTapCount < 5" class="ml-1 text-amber-600/60">({{ 5 - devTapCount }} more)</span></p>
        <div class="flex items-center gap-3">
          <template v-if="!isDev">
            <button v-if="updatePhase === 'idle' || updatePhase === 'checking'" class="text-xs transition-colors" :class="updatePhase === 'checking' ? 'cursor-default text-gray-500' : 'text-gray-600 hover:text-gray-400'" :disabled="updatePhase === 'checking'" @click="checkForUpdates">{{ updatePhase === 'checking' ? 'Checking...' : updateUpToDate ? 'Up to date' : 'Check for updates' }}</button>
            <span v-else-if="updatePhase === 'downloading'" class="text-xs text-amber-500/80">Downloading {{ updatePercent }}%</span>
            <button v-else-if="updatePhase === 'ready'" class="text-xs text-red-400 transition-colors hover:text-red-300" @click="installUpdate">v{{ updateVersion }} ready · Restart now</button>
          </template>
          <button class="text-xs text-gray-600 transition-colors hover:text-gray-400" @click="openHelp">Get help</button>
          <button class="text-xs text-gray-600 transition-colors hover:text-gray-400" @click="openSite">upforge.gg</button>
        </div>
      </div>
      <div v-if="devModeActive" class="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/6 px-3 py-2">
        <div class="flex items-center gap-2">
          <div class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          <span class="text-xs font-medium text-amber-400/80">Developer mode enabled</span>
        </div>
        <button class="text-xs text-amber-600 transition-colors hover:text-amber-400" @click="disableDevMode">Disable</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import type { AppSettings } from '../env.d.ts'
import { getTierBadgeClass, formatGameMode } from '../lib/valorant'
import CrosshairSettingsPanel from '../components/CrosshairSettingsPanel.vue'

type UserWithUsage = {
  name: string
  email: string
  tier: string
  riot_name: string | null
  riot_tag: string | null
  analyses_used?: number
  analyses_limit?: number
}

const router = useRouter()
const user = ref<UserWithUsage | null>(null)

const SETTINGS_TABS = [
  { id: 'general',   label: 'General',   icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' },
  { id: 'recording', label: 'Recording', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>' },
  { id: 'trainer',   label: 'Trainer',   icon: '<circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/>' },
  { id: 'system',    label: 'System',    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' },
] as const
type SettingsTab = typeof SETTINGS_TABS[number]['id']
const activeTab = ref<SettingsTab>('general')

const appVersion = ref(__APP_VERSION__)
const isDev = ref(false)
const updatePhase = ref('idle')
const updateVersion = ref<string | undefined>(undefined)
const updatePercent = ref(0)
const updateUpToDate = ref(false) // brief "Up to date" flash
let upToDateTimer: ReturnType<typeof setTimeout> | null = null
const savedToast = ref(false)
const storageBytes = ref(0)
const storageCount = ref(0)
const ffmpegOk = ref(true)
const sectionOpen = reactive({
  account: true,
  usage: true,
  behavior: true,
  recordingCapture: true,
  audio: true,
  obs: true,
  obsTeaser: true,
  mouseTrainer: true,
  crosshair: true,
  shortcuts: true,
  system: true,
})
const isMac = ref(navigator.userAgent.toLowerCase().includes('mac'))
const audioStatus = ref<{ winAudioMode: string | false | null; audioEnabled: boolean } | null>(null)
const fixingAudio = ref(false)
const testingRiotApi = ref(false)
const riotApiResult = ref<{ portOpen: boolean; gameMode: string | null; logGameMode: string | null; processRunning: boolean } | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null
const toastMessage = ref('')

// ── Dev mode unlock (tap version 5×) ─────────────────────────────────────────
const devModeActive = ref(false)
const devTapCount = ref(0)
let devTapTimer: ReturnType<typeof setTimeout> | null = null

async function handleVersionTap() {
  if (devModeActive.value) return
  devTapCount.value++
  if (devTapTimer) clearTimeout(devTapTimer)
  if (devTapCount.value >= 5) {
    devTapCount.value = 0
    devModeActive.value = true
    await window.api.settings.save({ devModeEnabled: true })
    showToast('Developer mode enabled — check the nav bar')
  } else {
    devTapTimer = setTimeout(() => { devTapCount.value = 0 }, 3000)
  }
}

async function disableDevMode() {
  devModeActive.value = false
  await window.api.settings.save({ devModeEnabled: false })
  showToast('Developer mode disabled')
}

// ── OBS Integration (Pro tier) ────────────────────────────────────────────────
type OBSStatus = {
  connected: boolean
  recording: boolean
  replayBufferActive: boolean
  outputPath: string | null
  lastError: string | null
  obsVersion: string | null
}
const obsStatus = ref<OBSStatus | null>(null)
const obsConnecting = ref(false)

async function obsConnect() {
  obsConnecting.value = true
  try {
    await window.api.settings.save({
      obsEnabled: settings.obsEnabled,
      obsHost: settings.obsHost,
      obsPort: settings.obsPort,
      obsPassword: settings.obsPassword,
      obsReplayBufferSeconds: settings.obsReplayBufferSeconds,
    })
    const result = await window.api.obs.connect()
    if (result.ok) {
      obsStatus.value = await window.api.obs.getStatus()
      showToast(`Connected to OBS v${result.version ?? '?'}`)
    } else {
      showToast(`OBS connection failed: ${result.error ?? 'Unknown error'}`)
    }
  } finally {
    obsConnecting.value = false
  }
}

async function obsDisconnect() {
  await window.api.obs.disconnect()
  obsStatus.value = await window.api.obs.getStatus()
  showToast('Disconnected from OBS')
}

async function refreshObsStatus() {
  try {
    obsStatus.value = await window.api.obs.getStatus()
  } catch { /* not available */ }
}

// ── Hotkeys ──────────────────────────────────────────────────────────────────
type HotkeyAction = 'save-clip' | 'toggle-overlay' | 'take-screenshot'
const hotkeys = reactive<Record<HotkeyAction, string>>({ 'save-clip': 'F9', 'toggle-overlay': 'F10', 'take-screenshot': 'F8' })
const hotkeyStatus = reactive<Record<HotkeyAction, boolean | null>>({ 'save-clip': null, 'toggle-overlay': null, 'take-screenshot': null })
const rebinding = ref<HotkeyAction | null>(null)
const conflictScanning = ref(false)
const conflictResults = ref<{ found: Array<{ exe: string; name: string; fix: string }> } | null>(null)

async function findConflict(): Promise<void> {
  conflictScanning.value = true
  conflictResults.value = null
  try {
    const result = await window.api.debug.findHotkeyConflict() as { supported: boolean; found: Array<{ exe: string; name: string; fix: string }> }
    conflictResults.value = result
  } finally {
    conflictScanning.value = false
  }
}

function formatKey(accelerator: string): string {
  return accelerator.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl')
}

function electronAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const key = e.key
  // Reject modifier-only presses
  if (['Control', 'Shift', 'Alt', 'Meta', 'Escape'].includes(key)) return null
  // Allow bare function keys; otherwise require at least one modifier
  const isFKey = /^F\d+$/.test(key)
  if (!isFKey && mods.length === 0) return null
  const keyName = key.length === 1 ? key.toUpperCase() : key
  return [...mods, keyName].join('+')
}

function startRebind(action: HotkeyAction): void {
  rebinding.value = action
}

async function handleKeydown(e: KeyboardEvent): Promise<void> {
  if (!rebinding.value) return
  e.preventDefault()
  if (e.key === 'Escape') { rebinding.value = null; return }
  const acc = electronAccelerator(e)
  if (!acc) return
  const action = rebinding.value
  rebinding.value = null
  const result = await window.api.clips.setHotkey(action, acc) as { ok: boolean }
  if (result.ok) {
    hotkeys[action] = acc
    // Re-fetch status to update registration indicator
    loadHotkeyStatus()
    showSaved()
  }
}

async function loadHotkeyStatus(): Promise<void> {
  try {
    const bindings = await window.api.clips.getHotkeys() as Record<HotkeyAction, string>
    Object.assign(hotkeys, bindings)
    const status = await window.api.clips.getHotkeyStatus() as { saveClipRegistered: boolean; toggleOverlayRegistered: boolean; screenshotRegistered: boolean }
    hotkeyStatus['save-clip'] = status.saveClipRegistered
    hotkeyStatus['toggle-overlay'] = status.toggleOverlayRegistered
    hotkeyStatus['take-screenshot'] = status.screenshotRegistered
  } catch { /* non-critical */ }
}

const settings = reactive<AppSettings>({
  recordingQuality: '1080p',
  recordingBitrate: 6,
  recordingFps: 30,
  audioEnabled: true,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true,
  recordedModes: ['COMPETITIVE', 'PREMIER'],
  autoAnalyse: true,
  firstRun: false,
  captureMonitor: 'auto',
  pregameKillList: [],
  clipRetentionDays: 0,
  notificationSound: true,
  cachedEncoder: null,
  cachedUseDdagrab: null,
  devModeEnabled: false,
  obsEnabled: false,
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  obsReplayBufferSeconds: 30,
  trainerMouse: {
    dpi: 800,
    game: 'valorant',
    sensitivity: 0.5,
    fov: 103,
    rawInput: true,
    pollingRate: 1000,
  },
  autoOpenBrowser: true,
  crosshairSettings: {
    colorIndex: 1,
    customColor: '00FF6B',
    dotShow: true,
    dotRadius: 1.5,
    dotOpacity: 1.0,
    innerShow: true,
    innerThickness: 2,
    innerLength: 10,
    innerOffset: 4,
    innerOpacity: 1.0,
    outerShow: false,
    outerThickness: 2,
    outerLength: 5,
    outerOffset: 10,
    outerOpacity: 1.0,
    shadowShow: true,
  },
})

const GAME_MODES = [
  { value: 'COMPETITIVE', label: 'Competitive', hint: 'Ranked' },
  { value: 'PREMIER', label: 'Premier', hint: 'Team queue' },
  { value: 'CLASSIC', label: 'Unrated', hint: 'Casual 5v5' },
  { value: 'SPIKERUSH', label: 'Spike Rush', hint: '' },
  { value: 'SWIFTPLAY', label: 'Swift Play', hint: '' },
  { value: 'DEATHMATCH', label: 'Deathmatch', hint: 'Warm-up & practice' },
  { value: 'TEAMDEATHMATCH', label: 'Team Deathmatch', hint: 'HURM mode' }
]

const toggles: Array<{ key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound' | 'autoOpenBrowser'>; label: string; hint: string | null }> = [
  { key: 'launchOnStartup', label: 'Launch on startup', hint: null },
  { key: 'autoDelete', label: 'Auto-delete after upload', hint: 'Frees disk space once recording is uploaded' },
  { key: 'autoAnalyse', label: 'Auto-analyse after game', hint: 'Automatically upload and analyse once a game ends' },
  { key: 'autoOpenBrowser', label: 'Open results in browser', hint: 'Automatically open your results page when analysis completes' },
  { key: 'notificationSound', label: 'Notification sound', hint: 'Play a sound with system notifications' }
]

function toggleSection(section: keyof typeof sectionOpen): void {
  sectionOpen[section] = !sectionOpen[section]
}

const accountInitial = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'U')
const accountRiotId = computed(() => {
  if (user.value?.riot_name) return `${user.value.riot_name}#${user.value.riot_tag}`
  return 'No Riot ID linked'
})

const storageSoftLimitBytes = 50 * 1024 * 1024 * 1024
const storageUsagePercent = computed(() => Math.min(100, Math.round((storageBytes.value / storageSoftLimitBytes) * 100)))
const storageSoftLimitLabel = computed(() => `${formatBytes(storageBytes.value)} of ${formatBytes(storageSoftLimitBytes)}`)
const storageSummary = computed(() => {
  if (storageCount.value === 0) return 'No recordings saved yet'
  return `${storageCount.value} file${storageCount.value === 1 ? '' : 's'} stored locally · ${formatBytes(storageBytes.value)}`
})

function hotkeyParts(accelerator: string): string[] {
  return formatKey(accelerator).split('+')
}

const usagePercent = computed(() => {
  const u = user.value as UserWithUsage | null
  if (!u?.analyses_used || !u?.analyses_limit) return 0
  return Math.min(100, Math.round((Math.max(0, u.analyses_used) / u.analyses_limit) * 100))
})

const encoderLabel = computed(() => {
  const enc = settings.cachedEncoder
  if (!enc) return null
  if (enc.includes('nvenc')) return `${enc} · NVIDIA hardware`
  if (enc.includes('amf')) return `${enc} · AMD hardware`
  if (enc.includes('qsv')) return `${enc} · Intel QuickSync`
  if (enc.includes('videotoolbox')) return `${enc} · Apple hardware`
  if (enc === 'libx264') return 'libx264 · software encoding'
  return enc
})

// tierClass and formatMode are imported from valorant.ts (shared helpers)

function showSaved(): void {
  toastMessage.value = ''
  savedToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { savedToast.value = false }, 2000)
}

function showToast(msg: string): void {
  toastMessage.value = msg
  savedToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { savedToast.value = false; toastMessage.value = '' }, 2500)
}

function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    // toRaw strips Vue Proxy wrappers so arrays/objects serialize cleanly over IPC
    await window.api.settings.save(JSON.parse(JSON.stringify(toRaw(settings))))
    showSaved()
  }, 500)
}

function toggleKey(key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound' | 'autoOpenBrowser'>): void {
  settings[key] = !settings[key]
  debouncedSave()
}

function toggleMode(value: string): void {
  const idx = settings.recordedModes.indexOf(value)
  if (idx === -1) {
    settings.recordedModes.push(value)
  } else {
    settings.recordedModes.splice(idx, 1)
  }
  debouncedSave()
}

function toggleLaunchOnStartup(): void {
  settings.launchOnStartup = !settings.launchOnStartup
  debouncedSave()
}

function toggleAudio(): void {
  settings.audioEnabled = !settings.audioEnabled
  debouncedSave()
}

async function fixAudio(): Promise<void> {
  fixingAudio.value = true
  try {
    const result = await window.api.recorder.fixAudio()
    if (!audioStatus.value) audioStatus.value = { winAudioMode: result.winAudioMode, audioEnabled: settings.audioEnabled }
    else audioStatus.value.winAudioMode = result.winAudioMode
  } catch { /* non-critical */ }
  finally { fixingAudio.value = false }
}

async function changeSavePath(): Promise<void> {
  const dir = await window.api.dialog.openDirectory()
  if (dir) {
    settings.savePath = dir
    debouncedSave()
  }
}

async function handleLogout(): Promise<void> {
  await window.api.auth.logout()
  router.push('/login')
}

async function checkForUpdates(): Promise<void> {
  updatePhase.value = 'checking'
  updateUpToDate.value = false
  if (upToDateTimer) clearTimeout(upToDateTimer)
  try {
    const result = await window.api.updater.check()
    if (result?.status === 'up-to-date') {
      updatePhase.value = 'idle'
      updateUpToDate.value = true
      upToDateTimer = setTimeout(() => { updateUpToDate.value = false }, 3000)
    }
  } catch {
    updatePhase.value = 'idle'
  }
}

async function installUpdate(): Promise<void> {
  updatePhase.value = 'installing'
  await window.api.updater.install()
}

async function testRiotApi(): Promise<void> {
  testingRiotApi.value = true
  try {
    const result = await window.api.debug.testRiotApi() as { portOpen: boolean; gameMode: string | null; logGameMode: string | null; processRunning: boolean }
    riotApiResult.value = result
  } catch {
    riotApiResult.value = { portOpen: false, gameMode: null, logGameMode: null, processRunning: false }
  } finally {
    testingRiotApi.value = false
  }
}

function openBilling(): void {
  window.open('https://upforge.gg/billing', '_blank')
}

function openUpgrade(): void {
  window.open('https://upforge.gg/pricing', '_blank')
}

function openSite(): void {
  window.open('https://upforge.gg', '_blank')
}

function openHelp(): void {
  window.open('https://upforge.gg/help', '_blank')
}

function eDpiLabel(edpi: number): string {
  if (edpi < 200) return 'Very low'
  if (edpi < 400) return 'Low'
  if (edpi < 700) return 'Medium'
  if (edpi < 1200) return 'High'
  return 'Very high'
}

function eDpiLevelClass(edpi: number): string {
  if (edpi < 400) return 'bg-blue-500/20 text-blue-400'
  if (edpi < 700) return 'bg-green-500/20 text-green-400'
  if (edpi < 1200) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

function eDpiBarClass(edpi: number): string {
  if (edpi < 400) return 'bg-blue-500'
  if (edpi < 700) return 'bg-green-500'
  if (edpi < 1200) return 'bg-yellow-500'
  return 'bg-[#ff4655]'
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function loadStorageUsage(): Promise<void> {
  try {
    const usage = await window.api.storage.getUsage()
    storageBytes.value = usage.bytes
    storageCount.value = usage.count
  } catch { /* ignore */ }
}

function openRecordingsFolder(): void {
  window.api.storage.openFolder()
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  try {
    const [s, savedSettings] = await Promise.all([
      window.api.app.getStatus(),
      window.api.settings.get()
    ])
    isDev.value = s.isDev
    if (s.version) appVersion.value = s.version
    if (s.ffmpegOk !== undefined) ffmpegOk.value = s.ffmpegOk !== false
    Object.assign(settings, savedSettings)
    devModeActive.value = savedSettings.devModeEnabled ?? false
    // Use getStatus user as base
    if (s.user) user.value = s.user as UserWithUsage | null
    loadStorageUsage()
    loadHotkeyStatus()
  } catch (err) {
    console.error('[Settings] Failed to load status:', err)
    try {
      const savedSettings = await window.api.settings.get()
      Object.assign(settings, savedSettings)
    } catch { /* ignore */ }
  }

  // Also load richer profile data (includes usage stats) independently
  try {
    const audioSt = await window.api.recorder.getAudioStatus()
    audioStatus.value = audioSt
    // If detection hasn't run yet (app just started), auto-trigger it so the UI isn't stuck on null
    if (audioSt.winAudioMode === null && (navigator.userAgent.includes('Windows') || isMac.value)) {
      fixAudio()
    }
  } catch { /* non-critical */ }

  try {
    const prof = await window.api.profile.get()
    if (prof?.user) {
      user.value = {
        name: prof.user.name,
        email: prof.user.email,
        tier: prof.user.tier,
        riot_name: prof.user.riot_name,
        riot_tag: prof.user.riot_tag,
        analyses_used: prof.user.analysis_stats?.total ?? 0,
        analyses_limit: prof.user.analysis_stats?.limit ?? 1
      }
    }
  } catch { /* profile load failure is non-critical */ }

  // Load OBS status (non-critical)
  refreshObsStatus()

  // Hydrate update state and listen for live events
  try {
    const us = await window.api.updater.getState()
    updatePhase.value = us.phase
    updateVersion.value = us.version
    updatePercent.value = us.percent ?? 0
  } catch { /* ignore */ }
  const updaterCleanups = [
    window.api.on('updater:checking', () => { updatePhase.value = 'checking' }),
    window.api.on('updater:available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      updatePhase.value = 'available'
      updateVersion.value = info?.version
    }),
    window.api.on('updater:progress', (...args: unknown[]) => {
      updatePhase.value = 'downloading'
      updatePercent.value = typeof args[0] === 'number' ? args[0] : 0
    }),
    window.api.on('updater:downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      updatePhase.value = 'ready'
      updateVersion.value = info?.version
    }),
    window.api.on('updater:not-available', () => { updatePhase.value = 'idle' }),
    window.api.on('updater:error', () => { updatePhase.value = 'idle' }),
  ]
  ;(window as Window & { _settingsUpdaterCleanups?: (() => void)[] })._settingsUpdaterCleanups = updaterCleanups
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.result-slide-enter-active {
  transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.result-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.result-slide-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
.result-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.toast-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
