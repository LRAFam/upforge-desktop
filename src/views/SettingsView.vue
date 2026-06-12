<template>
  <div class="flex h-full flex-col overflow-hidden text-white">
    <div class="flex-shrink-0 px-4 pt-4 pb-2 border-b border-white/[0.08]">
      <div class="panel-elevated relative overflow-hidden px-4 py-3.5">
        <div class="absolute -right-8 top-0 h-24 w-24 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div class="relative flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.28em] text-red-400/80">Desktop App</p>
            <h1 class="text-lg font-black tracking-tight text-white">Settings</h1>
            <p class="text-[11px] text-gray-500 mt-0.5">Account, recording, hotkeys, and preferences</p>
          </div>
          <div v-if="user" class="hidden sm:block rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
            <p class="text-[10px] font-semibold text-gray-300 truncate max-w-[140px]">{{ user.name }}</p>
            <span class="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" :class="getTierBadgeClass(user.tier)">
              <img v-if="getSubscriptionIconUrl(user.tier)" :src="getSubscriptionIconUrl(user.tier)!" :alt="getTierBadgeLabel(user.tier)" class="w-3.5 h-3.5 object-contain" />
              {{ getTierBadgeLabel(user.tier) }}
            </span>
          </div>
        </div>
      </div>
    </div>
    <nav class="flex flex-shrink-0 gap-1 overflow-x-auto scrollbar-hide border-b border-white/[0.09] bg-[#161616]/80 px-4 py-2.5">
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

    <div class="flex-1 space-y-4 scroll-col px-4 py-4">
      <section v-show="activeTab === 'general'" class="space-y-4">
        <div class="panel-elevated overflow-hidden p-4">
          <p class="text-sm font-semibold text-white">Your game</p>
          <p class="mt-1 text-xs text-gray-500">Switches dashboard, settings, and web links — same as upforge.gg.</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <button
              v-for="game in PRIMARY_GAMES"
              :key="game.id"
              type="button"
              class="rounded-xl border px-3 py-2.5 text-left transition-all"
              :class="settings.primaryGame === game.id
                ? 'border-white/[0.20] bg-white/[0.08]'
                : 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'"
              @click="selectPrimaryGame(game.id)"
            >
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full flex-shrink-0" :style="{ backgroundColor: game.accent }" />
                <span class="text-xs font-semibold text-gray-200">{{ game.label }}</span>
              </div>
            </button>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.account" class="border-t border-white/[0.09] p-4">
            <div v-if="user" class="rounded-2xl border border-white/[0.10] bg-gradient-to-br from-red-500/12 via-orange-500/6 to-transparent p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1a1a1a] text-sm font-bold text-red-400">{{ accountInitial }}</div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-semibold text-white">{{ user.name }}</p>
                      <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="getTierBadgeClass(user.tier)">
                        <img v-if="getSubscriptionIconUrl(user.tier)" :src="getSubscriptionIconUrl(user.tier)!" :alt="getTierBadgeLabel(user.tier)" class="w-4 h-4 object-contain" />
                        {{ getTierBadgeLabel(user.tier) || 'Free' }}
                      </span>
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
            <div v-else class="h-28 animate-pulse rounded-2xl border border-white/[0.09] bg-white/[0.02]" />

            <div class="mt-4 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Badge &amp; rank icons</p>
              <p class="mt-1 text-[11px] text-gray-500">Preview of imported artwork (more ranks coming soon).</p>
              <div class="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                <div
                  v-for="item in BADGE_PREVIEW_ITEMS"
                  :key="item.slug"
                  class="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                >
                  <img :src="getBadgeIconUrl(item.slug)!" :alt="item.label" class="w-16 h-16 object-contain" />
                  <span class="text-[9px] text-gray-500 text-center leading-tight">{{ item.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="user && user.analyses_used !== undefined" class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.usage" class="border-t border-white/[0.09] p-4 space-y-3">
            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Analyses this month</span>
                <span class="font-medium tabular-nums text-gray-200">
                  {{ Math.max(0, user.analyses_used) }} / {{ user.analyses_limit == null ? '∞' : user.analyses_limit }}
                </span>
              </div>
              <div v-if="user.analyses_limit" class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all" :style="{ width: usagePercent + '%' }" />
              </div>
              <div class="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                <span>Current plan</span>
                <span class="rounded-full bg-white/[0.04] px-2 py-0.5 text-gray-300">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span>
              </div>
            </div>
            <div v-if="usagePercent >= 80 && user.analyses_limit" class="rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
              <p class="text-xs font-medium text-purple-300">{{ usagePercent >= 100 ? 'You have used all analyses for this month.' : 'You are getting close to your monthly analysis limit.' }}</p>
              <p class="mt-1 text-xs text-purple-300/70">Upgrade for more analyses and full history access.</p>
              <button class="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 py-2 text-xs font-semibold text-white transition-all hover:from-purple-500 hover:to-purple-600" @click="openUpgrade">Upgrade plan</button>
            </div>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.behavior" class="divide-y divide-white/[0.05] border-t border-white/[0.09]">
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

            <div v-else class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <p class="text-xs text-gray-500 leading-relaxed">Recording starts when {{ settings.primaryGame === 'deadlock' ? 'Deadlock' : 'your game' }} is detected. Queue filters apply to Valorant only.</p>
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
                <li>Tools → WebSocket Server Settings → enable server (port {{ settings.obsPort }})</li>
                <li>Click <strong class="text-gray-300">Show Connect Info</strong> in OBS and paste the password below (required on OBS 28+)</li>
                <li>Host should be <strong class="text-gray-300">127.0.0.1</strong> if OBS is on this PC — click Connect</li>
                <li>In OBS: Settings → Output → set <strong class="text-gray-300">Output Mode</strong> to <strong class="text-gray-300">Simple</strong> (not Advanced), then restart OBS once</li>
                <li>Capture is <strong class="text-gray-300">game window only</strong> (not your desktop) — alt-tab won&apos;t record other apps</li>
                <li>Recording starts/stops automatically when you enter a match</li>
              </ol>
              <div class="flex flex-wrap items-center gap-2">
                <button v-if="!obsStatus?.connected" :disabled="obsConnecting" class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15 disabled:opacity-50" @click="obsConnect">{{ obsConnecting ? 'Connecting…' : 'Connect OBS' }}</button>
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
                <input v-model="settings.obsPassword" type="password" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-red-500/40 focus:outline-none" placeholder="From OBS Show Connect Info" @change="debouncedSave()" />
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between">
                  <label class="text-xs text-gray-400">Replay buffer (kill clips)</label>
                  <span class="text-xs text-gray-500">{{ settings.obsReplayBufferSeconds }}s</span>
                </div>
                <input v-model.number="settings.obsReplayBufferSeconds" type="range" min="10" max="120" step="5" class="w-full accent-red-500" @input="debouncedSave()" />
              </div>
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
              <div v-if="storageBreakdown.pendingCount > 0 || storageBreakdown.cloudBackedCount > 0" class="mt-3 space-y-2">
                <button
                  v-if="storageBreakdown.pendingCount > 0"
                  type="button"
                  class="w-full rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/15 disabled:opacity-50"
                  :disabled="storageBusy"
                  @click="uploadPendingToCloud"
                >
                  <span v-if="storageUploadProgress">Uploading {{ storageUploadProgress.current }}/{{ storageUploadProgress.total }}…</span>
                  <span v-else>Upload {{ storageBreakdown.pendingCount }} pending to cloud ({{ formatBytes(storageBreakdown.pendingBytes) }})</span>
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
              </div>
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
          </div>
        </div>

      </section>

      <section v-show="activeTab === 'trainer'" class="space-y-4">
        <div class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.mouseTrainer" class="space-y-4 border-t border-white/[0.09] p-4">
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
                  :class="settings.trainerMouse.dpi === preset ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
                  @click="settings.trainerMouse.dpi = preset; debouncedSave()"
                >{{ preset }}</button>
              </div>
              <input type="number" v-model.number="settings.trainerMouse.dpi" min="100" max="32000" step="100" placeholder="Custom DPI" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
            </div>

            <div>
              <label class="mb-1 block text-xs text-gray-400">In-game sensitivity</label>
              <input type="number" v-model.number="settings.trainerMouse.sensitivity" min="0.01" max="20" step="0.01" class="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white focus:border-red-500/30 focus:outline-none" @change="debouncedSave" />
            </div>

            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
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

            <div class="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Raw input</p>
                <p class="mt-1 text-xs text-gray-500">Bypass OS pointer acceleration</p>
              </div>
              <button class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" :class="settings.trainerMouse.rawInput ? 'bg-red-500' : 'bg-white/20'" @click="settings.trainerMouse.rawInput = !settings.trainerMouse.rawInput; debouncedSave()">
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.trainerMouse.rawInput ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>

            <div>
              <label class="mb-2 block text-xs text-gray-400">Movement speed</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="preset in [{ label: 'Walk', value: 4.4 }, { label: 'Run', value: 6.75 }, { label: 'Fast', value: 9.0 }]"
                  :key="preset.value"
                  class="rounded-xl border py-2 text-[11px] font-semibold transition-all"
                  :class="settings.trainerMouse.movementSpeed === preset.value ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.10] bg-white/[0.02] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
                  @click="settings.trainerMouse.movementSpeed = preset.value; debouncedSave()"
                >{{ preset.label }}</button>
              </div>
              <p class="mt-2 text-xs text-gray-600">Walk = Valorant shift-walk. Run = Valorant default. Fast = free aim feel.</p>
            </div>

            <div>
              <div class="mb-2 flex items-center justify-between">
                <label class="text-xs text-gray-400">Trainer volume</label>
                <span class="font-mono text-xs text-gray-400">{{ settings.trainerMouse.trainerVolume }}%</span>
              </div>
              <input
                type="range"
                v-model.number="settings.trainerMouse.trainerVolume"
                min="0" max="100" step="5"
                class="w-full accent-red-500"
                @input="debouncedSave"
              />
              <p class="mt-1 text-xs text-gray-600">Hit and miss sounds in the aim trainer.</p>
            </div>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.crosshair" class="border-t border-white/[0.09] p-4">
            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-3">
              <crosshair-settings-panel v-model="settings.crosshairSettings" @update:model-value="debouncedSave()" />
            </div>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.shortcuts" class="space-y-3 border-t border-white/[0.09] p-4">
            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4 space-y-3">
              <div>
                <p class="text-sm font-semibold text-white">In-game feedback</p>
                <p class="mt-1 text-xs text-gray-500 leading-relaxed">
                  Valorant blocks overlays in Exclusive Fullscreen. Use
                  <span class="text-gray-400">Notifications</span> for reliable clip confirmation, or set Valorant to
                  <span class="text-gray-400"> Windowed Fullscreen</span> if you want the overlay HUD.
                </p>
              </div>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  v-for="opt in inGameFeedbackOptions"
                  :key="opt.value"
                  type="button"
                  class="rounded-xl border px-3 py-2.5 text-left transition-colors"
                  :class="settings.inGameFeedback === opt.value
                    ? 'border-red-500/35 bg-red-500/10'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]'"
                  @click="setInGameFeedback(opt.value)"
                >
                  <p class="text-xs font-semibold" :class="settings.inGameFeedback === opt.value ? 'text-white' : 'text-gray-300'">{{ opt.label }}</p>
                  <p class="mt-0.5 text-[11px] text-gray-600">{{ opt.hint }}</p>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">Open or focus window</p>
                <p class="mt-1 text-xs text-gray-500">Fixed system shortcut</p>
              </div>
              <div class="flex items-center gap-1">
                <kbd v-for="part in ['Ctrl', 'Shift', 'U']" :key="part" class="rounded-md border border-white/[0.12] bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-gray-300">{{ part }}</kbd>
              </div>
            </div>

            <div class="space-y-3 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
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
              <div v-if="conflictResults !== null" class="overflow-hidden rounded-2xl border" :class="conflictResults.found.length > 0 ? 'border-yellow-500/20 bg-yellow-500/6' : 'border-white/[0.10] bg-white/[0.02]'">
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
                <div class="border-t border-white/[0.09] px-4 py-2">
                  <button class="text-xs text-gray-500 transition-colors hover:text-gray-300" @click="conflictResults = null">Dismiss</button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <section v-show="activeTab === 'system'" class="space-y-4">
        <div class="panel-elevated overflow-hidden">
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
          <div v-if="sectionOpen.system" class="space-y-3 border-t border-white/[0.09] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-200">Capture method</p>
                <p class="mt-1 text-xs" :class="captureBackendOk ? 'text-green-400/80' : 'text-yellow-400/80'">{{ captureBackendDescription }}</p>
              </div>
              <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="captureBackendOk ? 'bg-green-500' : 'bg-yellow-400'" />
            </div>

            <div class="rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
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

    <div class="flex-shrink-0 space-y-2 border-t border-white/[0.07] bg-[#161616] px-3 pt-2 pb-3">
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
import { useRouter, useRoute } from 'vue-router'
import type { AppSettings } from '../env.d.ts'
import { PRIMARY_GAMES, type PrimaryGame } from '../lib/games'
import { getTierBadgeClass, getTierBadgeLabel, formatGameMode } from '../lib/valorant'
import { hasProAccess as proAccessForUser } from '../lib/subscription'
import { BADGE_PREVIEW_ITEMS, getBadgeIconUrl, getSubscriptionIconUrl } from '../lib/rank-assets'
import CrosshairSettingsPanel from '../components/CrosshairSettingsPanel.vue'

type UserWithUsage = {
  name: string
  email: string
  tier: string
  riot_name: string | null
  riot_tag: string | null
  analyses_used?: number
  analyses_limit?: number | null
}

const router = useRouter()
const route = useRoute()
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
const freeDiskBytes = ref<number | null>(null)
const storageBreakdown = ref({
  pendingCount: 0,
  pendingBytes: 0,
  cloudBackedCount: 0,
  cloudBackedBytes: 0,
})
const storageBusy = ref(false)
const storageMessage = ref('')
const storageMessageError = ref(false)
const storageUploadProgress = ref<{ current: number; total: number } | null>(null)
const ffmpegOk = ref(true)
const recordingBackend = ref<'obs'>('obs')
const sectionOpen = reactive({
  account: true,
  usage: true,
  behavior: true,
  recordingCapture: true,
  audio: true,
  obs: true,
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

// ── OBS Integration ───────────────────────────────────────────────────────────
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
const obsSetupRunning = ref(false)

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
      const st = await window.api.app.getStatus().catch(() => null)
      if (st?.recordingBackend) recordingBackend.value = st.recordingBackend
      const setup = result.setup
      if (setup?.sceneCreated || setup?.inputCreated) {
        showToast(`Connected to OBS v${result.version ?? '?'} — UpForge scene created`)
      } else {
        showToast(`Connected to OBS v${result.version ?? '?'}`)
      }
    } else {
      showToast(`OBS connection failed: ${result.error ?? 'Unknown error'}`)
    }
  } finally {
    obsConnecting.value = false
  }
}

async function obsSetupScene() {
  obsSetupRunning.value = true
  try {
    const result = await window.api.obs.setupScene()
    if (result.ok) {
      if (result.sceneCreated || result.inputCreated) {
        showToast('UpForge scene created in OBS')
      } else {
        showToast('UpForge scene is already configured')
      }
    } else {
      showToast(`Scene setup failed: ${result.error ?? 'Unknown error'}`)
    }
  } finally {
    obsSetupRunning.value = false
  }
}

async function obsDisconnect() {
  await window.api.obs.disconnect()
  obsStatus.value = await window.api.obs.getStatus()
  const st = await window.api.app.getStatus().catch(() => null)
  if (st?.recordingBackend) recordingBackend.value = st.recordingBackend
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

const cs2Detecting = ref(false)

const settings = reactive<AppSettings>({
  primaryGame: 'valorant',
  recordingPreset: 'coaching',
  recordingQuality: '720p',
  recordingBitrate: 5,
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
  discordRichPresence: true,
  inGameFeedback: 'notifications',
  cachedEncoder: null,
  cachedUseDdagrab: null,
  devModeEnabled: false,
  obsEnabled: true,
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
    movementSpeed: 6.75,
    trainerVolume: 80,
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

const toggles: Array<{ key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound' | 'autoOpenBrowser' | 'discordRichPresence'>; label: string; hint: string | null }> = [
  { key: 'launchOnStartup', label: 'Launch on startup', hint: null },
  { key: 'autoDelete', label: 'Auto-delete after upload', hint: 'Removes the local MP4 once uploaded — review from cloud anytime' },
  { key: 'autoAnalyse', label: 'Auto-analyse after game', hint: 'Automatically upload and analyse once a game ends' },
  { key: 'autoOpenBrowser', label: 'Open results in browser', hint: 'Automatically open your results page when analysis completes' },
  { key: 'notificationSound', label: 'Notification sound', hint: 'Play a sound with system notifications' },
  { key: 'discordRichPresence', label: 'Show status in Discord', hint: 'Friends see when you\'re recording or reviewing coaching — requires Discord desktop and Activity Status enabled' },
]

const inGameFeedbackOptions: Array<{ value: AppSettings['inGameFeedback']; label: string; hint: string }> = [
  { value: 'notifications', label: 'Notifications', hint: 'Toast + beep — works in fullscreen' },
  { value: 'overlay', label: 'Overlay only', hint: 'Needs Windowed Fullscreen' },
  { value: 'all', label: 'Both', hint: 'Overlay + notifications' },
]

async function setInGameFeedback(mode: AppSettings['inGameFeedback']): Promise<void> {
  settings.inGameFeedback = mode
  await window.api.settings.save({ inGameFeedback: mode })
  showSaved()
}

function toggleSection(section: keyof typeof sectionOpen): void {
  sectionOpen[section] = !sectionOpen[section]
}

const accountInitial = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'U')
const accountRiotId = computed(() => {
  if (user.value?.riot_name) return `${user.value.riot_name}#${user.value.riot_tag}`
  return 'No Riot ID linked'
})

const storageSoftLimitBytes = 50 * 1024 * 1024 * 1024
const LOW_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024
const CRITICAL_FREE_DISK_BYTES = 500 * 1024 * 1024
const storageUsagePercent = computed(() => Math.min(100, Math.round((storageBytes.value / storageSoftLimitBytes) * 100)))
const storageSoftLimitLabel = computed(() => `${formatBytes(storageBytes.value)} of ${formatBytes(storageSoftLimitBytes)}`)
const freeDiskLabel = computed(() => {
  if (freeDiskBytes.value == null) return null
  return formatBytes(freeDiskBytes.value)
})
const diskSpaceCritical = computed(() => freeDiskBytes.value != null && freeDiskBytes.value < CRITICAL_FREE_DISK_BYTES)
const diskSpaceLow = computed(() => freeDiskBytes.value != null && freeDiskBytes.value < LOW_FREE_DISK_BYTES)
const storageSummary = computed(() => {
  const local = storageCount.value === 0
    ? 'No recordings saved locally'
    : `${storageCount.value} local file${storageCount.value === 1 ? '' : 's'} · ${formatBytes(storageBytes.value)}`
  if (freeDiskLabel.value == null) return local
  return `${local} · ${freeDiskLabel.value} free on disk`
})

const hasProAccess = computed(() => proAccessForUser(user.value))

function hotkeyParts(accelerator: string): string[] {
  return formatKey(accelerator).split('+')
}

const usagePercent = computed(() => {
  const u = user.value as UserWithUsage | null
  if (!u?.analyses_limit) return 0
  return Math.min(100, Math.round((Math.max(0, u.analyses_used ?? 0) / u.analyses_limit) * 100))
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

const captureBackendOk = computed(() => !!obsStatus.value?.connected)

const captureBackendDescription = computed(() => {
  return obsStatus.value?.connected
    ? `OBS WebSocket · ${obsStatus.value.obsVersion ?? 'connected'}`
    : 'OBS not connected — open Settings → Recording to connect'
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

async function refreshRecordingBackendStatus(): Promise<void> {
  try {
    const st = await window.api.app.getStatus()
    if (st?.recordingBackend) recordingBackend.value = st.recordingBackend
    if (typeof st?.ffmpegOk === 'boolean') ffmpegOk.value = st.ffmpegOk
    const obs = await window.api.obs.getStatus()
    obsStatus.value = obs
  } catch { /* non-critical */ }
}

async function selectPrimaryGame(game: PrimaryGame): Promise<void> {
  if (settings.primaryGame === game) return
  settings.primaryGame = game
  settings.trainerMouse.game = game
  await window.api.settings.save({ primaryGame: game, trainerMouse: { ...toRaw(settings.trainerMouse) } })
  showSaved()
}

async function detectCs2DemoDir(): Promise<void> {
  cs2Detecting.value = true
  try {
    const { dir } = await window.api.cs2.detectDemoDir()
    if (dir) {
      settings.cs2DemoDir = dir
      await window.api.settings.save({ cs2DemoDir: dir })
      showSaved()
    } else {
      showToast('Could not find CS2 demo folder')
    }
  } finally {
    cs2Detecting.value = false
  }
}

async function browseCs2DemoDir(): Promise<void> {
  const dir = await window.api.dialog.openDirectory()
  if (dir) {
    settings.cs2DemoDir = dir
    await window.api.settings.save({ cs2DemoDir: dir })
    showSaved()
  }
}

function openCs2Analyze(): void {
  window.api.cs2.openAnalyze()
}

function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    // toRaw strips Vue Proxy wrappers so arrays/objects serialize cleanly over IPC
    await window.api.settings.save(JSON.parse(JSON.stringify(toRaw(settings))))
    await refreshRecordingBackendStatus()
    showSaved()
  }, 500)
}

function toggleKey(key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound' | 'autoOpenBrowser' | 'discordRichPresence'>): void {
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

function setRecordingPreset(preset: 'coaching' | 'creator'): void {
  if (settings.recordingPreset === preset) return
  if (preset === 'creator' && !hasProAccess.value) {
    showToast('Creator recording requires Pro — upgrade to unlock')
    openUpgrade()
    return
  }
  settings.recordingPreset = preset
  if (preset === 'coaching') {
    settings.recordingQuality = '720p'
    settings.recordingBitrate = 5
    settings.recordingFps = 30
  } else {
    settings.recordingQuality = '1080p'
    settings.recordingBitrate = 10
    settings.recordingFps = 60
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
    const [usage, breakdown] = await Promise.all([
      window.api.storage.getUsage(),
      window.api.storage.getBreakdown(),
    ])
    storageBytes.value = usage.bytes
    storageCount.value = usage.count
    freeDiskBytes.value = usage.freeDiskBytes
    storageBreakdown.value = breakdown
  } catch { /* ignore */ }
}

async function purgeCloudBackedLocals(): Promise<void> {
  if (storageBusy.value || storageBreakdown.value.cloudBackedCount === 0) return
  storageBusy.value = true
  storageMessage.value = ''
  storageMessageError.value = false
  try {
    const result = await window.api.storage.purgeCloudBacked()
    storageMessage.value = result.removed > 0
      ? `Freed ${formatBytes(result.freedBytes)} — ${result.removed} local file${result.removed === 1 ? '' : 's'} removed. VODs still available from cloud.`
      : result.skipped > 0
        ? 'No local files could be removed — cloud copies may be unavailable.'
        : 'Nothing to remove.'
    storageMessageError.value = result.removed === 0
    await loadStorageUsage()
  } catch {
    storageMessage.value = 'Could not remove local files.'
    storageMessageError.value = true
  } finally {
    storageBusy.value = false
  }
}

async function uploadPendingToCloud(): Promise<void> {
  if (storageBusy.value || storageBreakdown.value.pendingCount === 0) return
  storageBusy.value = true
  storageMessage.value = ''
  storageMessageError.value = false
  storageUploadProgress.value = { current: 0, total: storageBreakdown.value.pendingCount }
  try {
    const result = await window.api.storage.uploadPending()
    if (!result.ok) {
      storageMessage.value = result.error
      storageMessageError.value = true
      return
    }
    if (result.stoppedEarly) {
      storageMessage.value = `Uploaded ${result.uploaded} — stopped: ${result.stopReason ?? 'analysis limit reached'}`
      storageMessageError.value = true
    } else if (result.uploaded > 0) {
      storageMessage.value = `Uploaded ${result.uploaded} recording${result.uploaded === 1 ? '' : 's'} to cloud and removed local copies.${result.failed > 0 ? ` ${result.failed} failed.` : ''}`
      storageMessageError.value = result.failed > 0
    } else {
      storageMessage.value = 'No recordings were uploaded.'
      storageMessageError.value = true
    }
    await loadStorageUsage()
  } catch {
    storageMessage.value = 'Upload failed — check your connection and try again.'
    storageMessageError.value = true
  } finally {
    storageBusy.value = false
    storageUploadProgress.value = null
  }
}

function openRecordingsFolder(): void {
  window.api.storage.openFolder()
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

onMounted(async () => {
  const tabQuery = route.query.tab
  if (tabQuery === 'recording' || tabQuery === 'general' || tabQuery === 'trainer' || tabQuery === 'system') {
    activeTab.value = tabQuery
  }
  window.addEventListener('keydown', handleKeydown)
  try {
    const [s, savedSettings] = await Promise.all([
      window.api.app.getStatus(),
      window.api.settings.get()
    ])
    isDev.value = s.isDev
    if (s.version) appVersion.value = s.version
    if (s.ffmpegOk !== undefined) ffmpegOk.value = s.ffmpegOk !== false
    if (s.recordingBackend) recordingBackend.value = s.recordingBackend
    Object.assign(settings, savedSettings)
    devModeActive.value = savedSettings.devModeEnabled ?? false
    // Use getStatus user as base
    if (s.user) user.value = s.user as UserWithUsage | null
    loadStorageUsage()
    loadHotkeyStatus()
    window.api.on('storage:upload-progress', (...args: unknown[]) => {
      const data = args[0] as { current: number; total: number } | null
      storageUploadProgress.value = data
    })
    window.api.on('recordings:updated', () => { void loadStorageUsage() })
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
        analyses_limit: prof.user.analysis_stats?.limit
          ?? (prof.user.is_admin || prof.user.tier === 'admin' ? null : 1)
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
