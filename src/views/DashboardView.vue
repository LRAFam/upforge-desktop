<template>
  <div class="h-full flex flex-col overflow-hidden">

    <!-- Warning banner (full-width, conditional) -->
    <Transition name="banner-slide">
      <div
        v-if="warning"
        class="flex-shrink-0 mx-4 mt-3 relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl bg-orange-500/[0.07] border border-orange-500/20 overflow-hidden"
      >
        <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-orange-400 to-orange-600 rounded-l-xl" />
        <div class="w-5 h-5 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-3 h-3 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </div>
        <span class="text-xs text-orange-300/90 flex-1 leading-snug">{{ warning }}</span>
        <button v-if="upgradeNeeded" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="openUpgrade">Upgrade →</button>
        <button class="w-5 h-5 flex items-center justify-center text-orange-500/50 hover:text-orange-300/70 transition-colors rounded flex-shrink-0" :class="{ 'ml-auto': !upgradeNeeded }" @click="warning = null; upgradeNeeded = false">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <!-- Analysis complete toast -->
    <Transition name="banner-slide">
      <div
        v-if="analysisCompleteToast"
        class="flex-shrink-0 mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-500/[0.08] border border-green-500/25 overflow-hidden"
      >
        <div class="w-5 h-5 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
          <span class="text-xs text-green-300/90 flex-1">
          Analysis complete — scored
          <span class="font-bold">{{ analysisCompleteToast.score * 10 }}</span>
          <span class="font-bold px-1.5 py-px rounded-full text-[10px] ml-1" :class="scoreGradeBadgeClass(analysisCompleteToast.score)">{{ scoreGrade(analysisCompleteToast.score) }}</span>
          <span v-if="analysisCompleteToast.agent"> · {{ analysisCompleteToast.agent }}</span>
        </span>
        <button class="w-5 h-5 flex items-center justify-center text-green-600/50 hover:text-green-400 transition-colors rounded" @click="analysisCompleteToast = null">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <!-- Status card -->
    <div
      :class="[
        'flex-shrink-0 flex items-center gap-3 mx-4 mt-3 px-3 py-2 rounded-xl border text-xs transition-all',
        !status.ffmpegOk ? 'bg-yellow-500/[0.07] border-yellow-500/25' :
        status.recording ? 'bg-red-500/[0.08] border-red-500/25' :
        status.recordingStarting ? 'bg-yellow-500/[0.07] border-yellow-500/20' :
        status.currentGame ? 'bg-orange-500/[0.07] border-orange-500/20' :
        'bg-white/[0.02] border-white/[0.09]'
      ]"
    >
      <!-- Status dot -->
      <div class="relative flex-shrink-0">
        <div :class="['w-2 h-2 rounded-full', !status.ffmpegOk ? 'bg-yellow-400' : status.recording ? 'bg-red-500' : status.recordingStarting ? 'bg-yellow-400' : status.currentGame ? 'bg-orange-400' : 'bg-gray-600']" />
        <div v-if="status.recording" class="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-70" />
        <div v-else-if="status.recordingStarting" class="absolute inset-0 w-2 h-2 rounded-full bg-yellow-400 animate-ping opacity-50" />
        <div v-else-if="status.waitingForMatch" class="absolute inset-0 w-2 h-2 rounded-full bg-orange-400 animate-ping opacity-50" />
        <div v-else-if="!status.currentGame && status.ffmpegOk && !(platform && platform !== 'win32')" class="absolute rounded-full border border-gray-600/50 idle-breathe" style="width:14px;height:14px;top:-3px;left:-3px;" />
      </div>

      <!-- Status text (single line) -->
      <div class="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <template v-if="!status.ffmpegOk">
          <span class="font-semibold text-yellow-400">Recording unavailable</span>
          <span class="text-yellow-600 hidden sm:inline">Reinstall the app to restore</span>
        </template>
        <template v-else-if="status.recording">
          <span class="font-black tracking-widest uppercase text-red-400 rec-pulse flex-shrink-0">● REC</span>
          <span class="font-semibold capitalize flex-shrink-0">{{ status.currentGame || 'Valorant' }}</span>
          <span v-if="recordingElapsed" class="font-mono tabular-nums text-red-400/80 flex-shrink-0">{{ recordingElapsed }}</span>
          <span class="text-gray-600 truncate">{{ recordingModeLabel }}</span>
        </template>
        <template v-else-if="status.recordingStarting">
          <span class="font-semibold text-yellow-300">Starting recorder…</span>
        </template>
        <template v-else-if="status.waitingForMatch">
          <span class="font-semibold text-orange-300 flex-shrink-0">{{ status.currentGame || 'Valorant' }} running</span>
          <span class="text-orange-500/70">In lobby — watching for match…</span>
        </template>
        <template v-else-if="status.currentGame">
          <span class="font-semibold text-orange-300">{{ status.currentGame }} detected</span>
        </template>
        <template v-else-if="platform && platform !== 'win32'">
          <span class="text-gray-500">macOS — preview mode</span>
        </template>
        <template v-else>
          <span class="font-semibold text-gray-300 flex-shrink-0">Ready to record</span>
          <span v-if="status.recordedModes && status.recordedModes.length" class="text-gray-600 truncate">{{ status.recordedModes.map(formatMode).join(' · ') }}</span>
          <span v-else class="text-amber-600/80">No modes selected — check Settings</span>
        </template>
      </div>

      <!-- Hotkey hints (idle) -->
      <div v-if="status.ffmpegOk && !status.recording && !status.recordingStarting && !(platform && platform !== 'win32') && hotkeys['save-clip']" class="flex items-center gap-1.5 flex-shrink-0">
        <span class="text-[10px] text-gray-700 mr-0.5">Hotkeys</span>
        <span v-for="hk in hotkeyHints" :key="hk.label" class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/[0.03] border border-white/[0.09] rounded text-[10px]">
          <kbd class="font-mono font-semibold text-gray-400">{{ hk.key }}</kbd>
          <span class="text-gray-700">{{ hk.label }}</span>
        </span>
      </div>

      <!-- Clip hint (recording) -->
      <div v-if="status.recording && hotkeys['save-clip']" class="flex items-center gap-1.5 flex-shrink-0">
        <kbd class="inline-block px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] font-mono font-semibold text-red-400">{{ hotkeys['save-clip'] }}</kbd>
        <span class="text-[10px] text-red-400/70">save clip</span>
      </div>

      <!-- Stop button — ends match and opens upload/post-game -->
      <button v-if="status.recording" :disabled="stopping" class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/[0.12] hover:bg-red-500/[0.2] border border-red-500/20 text-red-400 transition-all disabled:opacity-50" :title="stopRecordingHint" @click="stopRecording">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
        {{ stopping ? 'Ending match…' : 'End match' }}
      </button>
    </div>

    <!-- Hero header -->
    <div class="flex-shrink-0 mx-4 mt-3 space-y-3">
      <div class="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div class="relative overflow-hidden rounded-3xl border border-white/[0.10] bg-gradient-to-br from-white/[0.04] via-white/[0.025] to-red-500/[0.06] px-5 pt-4 pb-5">
          <div class="absolute -right-12 top-0 h-36 w-36 rounded-full bg-red-500/10 blur-3xl" />
          <div class="absolute left-10 top-10 h-24 w-24 rounded-full bg-orange-500/10 blur-3xl" />
          <!-- Hero agents artwork -->
          <img src="../assets/hero-agents.webp" alt="" class="pointer-events-none absolute right-0 top-0 h-full w-[42%] object-cover object-left opacity-[0.14] select-none" />
          <div class="pointer-events-none absolute inset-y-0" style="right:28%;width:10rem;background:linear-gradient(to right,#111111,transparent)" />
          <div class="relative space-y-2">
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2.5">
                  <span class="text-[10px] font-black uppercase tracking-[0.32em] text-red-400/80">Command Center</span>
                  <div v-if="status.recording" class="inline-flex items-center gap-2.5 rounded-full border border-red-500/25 bg-red-500/[0.14] px-3 py-1.5 shadow-[0_0_24px_rgba(239,68,68,0.12)]">
                    <span class="relative flex h-3 w-3">
                      <span class="absolute inline-flex h-full w-full rounded-full bg-red-500/60 animate-ping" />
                      <span class="relative inline-flex h-3 w-3 rounded-full bg-red-400 animate-pulse" />
                    </span>
                    <span class="text-[11px] font-black uppercase tracking-[0.24em] text-red-200">Recording live</span>
                  </div>
                </div>
                <h1 class="text-3xl font-black tracking-tight text-white leading-[1.02]">{{ dashboardHeadline }}</h1>
              </div>
              <div v-if="status.recording && recordingElapsed" class="rounded-2xl border border-red-500/20 bg-black/20 px-3.5 py-2.5 text-right shadow-[0_0_18px_rgba(239,68,68,0.1)]">
                <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-red-300/70">Live timer</p>
                <p class="mt-1 text-2xl font-black tabular-nums text-red-300">{{ recordingElapsed }}</p>
              </div>
            </div>
            <div class="grid grid-cols-4 gap-2 max-w-4xl">
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-300 flex-shrink-0">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15.75 10.5l4.72-2.36A.75.75 0 0121.5 8.81v6.38a.75.75 0 01-1.03.67l-4.72-2.36m0 0V10.5m0 3H4.875A1.875 1.875 0 013 11.625v-3.75C3 6.839 3.84 6 4.875 6H15.75c1.035 0 1.875.84 1.875 1.875v8.25A1.875 1.875 0 0115.75 18H6" />
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <p class="text-base font-black tabular-nums text-white">{{ clipCount }}</p>
                    <p class="text-[9px] font-semibold uppercase tracking-[0.24em] text-gray-600">Clips</p>
                  </div>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10 text-orange-300 flex-shrink-0">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 13.125C3 12.503 3.504 12 4.125 12h3.75c.621 0 1.125.503 1.125 1.125v6.75C9 20.497 8.496 21 7.875 21h-3.75A1.125 1.125 0 013 19.875v-6.75zm6-4.5C9 8.003 9.504 7.5 10.125 7.5h3.75c.621 0 1.125.503 1.125 1.125v11.25c0 .622-.504 1.125-1.125 1.125h-3.75A1.125 1.125 0 019 19.875V8.625zm6-3.375c0-.622.504-1.125 1.125-1.125h3.75C20.496 4.125 21 4.628 21 5.25v14.625c0 .622-.504 1.125-1.125 1.125h-3.75A1.125 1.125 0 0115 19.875V5.25z" />
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <p class="text-base font-black tabular-nums text-white">{{ totalSessionsAnalysed }}</p>
                    <p class="text-[9px] font-semibold uppercase tracking-[0.24em] text-gray-600">Analyses</p>
                  </div>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] flex-shrink-0">
                    <img v-if="getRankIconUrl(profile?.latest_stats?.current_rank)" :src="getRankIconUrl(profile?.latest_stats?.current_rank)!" :alt="profile?.latest_stats?.current_rank ?? ''" class="w-7 h-7 object-contain drop-shadow-lg" />
                    <svg v-else class="h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <p class="text-base font-black text-white truncate">{{ dashboardRankLabel }}</p>
                    <p class="text-[9px] font-semibold uppercase tracking-[0.24em] text-gray-600">Rank</p>
                  </div>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 flex-shrink-0">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 13.5l5.25-5.25L12 12l8.25-8.25" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16.5 3.75H21v4.5" />
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <p class="text-base font-black tabular-nums" :class="currentStreak > 0 ? 'text-green-400' : currentStreak < 0 ? 'text-red-400' : 'text-white'">{{ currentStreak !== 0 ? (currentStreak > 0 ? '+' : '') + currentStreak : '—' }}</p>
                    <p class="text-[9px] font-semibold uppercase tracking-[0.24em] text-gray-600">Streak</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          class="relative overflow-hidden rounded-3xl border px-4 py-4"
          :class="!status.ffmpegOk || status.recordingStarting ? 'border-yellow-500/20 bg-gradient-to-br from-yellow-500/[0.1] to-white/[0.02]' : liveDetectionActive ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-emerald-500/[0.04] to-white/[0.02]' : 'border-white/[0.10] bg-white/[0.02]'"
        >
          <div v-if="liveDetectionActive" class="absolute inset-y-4 left-0 w-[3px] rounded-full bg-gradient-to-b from-emerald-300 via-emerald-400 to-emerald-500" />
          <div v-if="liveDetectionActive" class="absolute -right-8 top-6 h-24 w-24 rounded-full bg-emerald-400/10 blur-3xl" />
          <div class="relative flex items-start gap-3 pl-1">
            <div
              class="flex h-11 w-11 items-center justify-center rounded-2xl border"
              :class="!status.ffmpegOk || status.recordingStarting ? 'border-yellow-500/25 bg-yellow-500/[0.12] text-yellow-300' : liveDetectionActive ? 'border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-300' : 'border-white/[0.08] bg-white/[0.03] text-gray-300'"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 12h18M3 7.5h18M3 16.5h18" />
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[10px] font-bold uppercase tracking-[0.28em] text-gray-600">Active Game Detection</p>
                <span v-if="liveDetectionActive" class="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.12] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Live
                </span>
              </div>
              <h2 class="mt-3 text-xl font-black tracking-tight text-white">{{ activeGameTitle }}</h2>
              <p class="mt-2 text-sm leading-relaxed text-gray-400">{{ activeGameMessage }}</p>
              <div class="mt-4 flex flex-wrap items-center gap-2">
                <span v-if="status.recording && hotkeys['save-clip']" class="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/[0.12] px-2.5 py-1 text-[10px] font-semibold text-red-300">
                  <span class="text-red-400">Clip</span>
                  <kbd class="font-mono text-red-200">{{ hotkeys['save-clip'] }}</kbd>
                </span>
                <span v-else-if="status.recordedModes?.length" class="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-gray-300">
                  {{ status.recordedModes.map(formatMode).join(' · ') }}
                </span>
                <span v-else class="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-gray-400">
                  Configure modes in Settings
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>

    <!-- 3-column dashboard grid -->
    <div class="flex-1 grid grid-cols-[360px_1fr_360px] gap-4 p-4 pt-3 min-h-0 overflow-hidden">

      <!-- ═══════════ LEFT: Player card ═══════════ -->
      <div class="flex flex-col gap-3 overflow-y-auto" style="scrollbar-width:none">

        <!-- Player hero card -->
        <div v-if="profile" class="bg-white/[0.02] border border-white/[0.10] rounded-2xl overflow-hidden">
          <div class="px-4 pt-4 pb-3">
            <div class="flex items-start gap-3">
              <!-- Avatar -->
              <div class="relative flex-shrink-0">
                <img v-if="playerCardUrl" :src="playerCardUrl" class="w-14 h-14 rounded-xl object-cover" @error="playerCardUrl = ''" />
                <div v-else class="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center">
                  <span class="text-xl font-black text-red-400">{{ profile.user.name?.charAt(0).toUpperCase() }}</span>
                </div>
              </div>
              <!-- Identity -->
              <div class="flex-1 min-w-0 pt-0.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <p class="text-sm font-bold truncate leading-tight">{{ profile.user.name }}</p>
                  <span
                    v-if="isAdmin"
                    :class="['px-1.5 py-px rounded text-[9px] font-bold uppercase flex items-center gap-0.5', getTierBadgeClass('admin')]"
                  >
                    <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clip-rule="evenodd" /></svg>
                    Admin
                  </span>
                  <span
                    v-else
                    :class="['px-1.5 py-px rounded text-[9px] font-bold uppercase', getTierBadgeClass(profile.user.tier && profile.user.tier !== 'free' ? profile.user.tier : 'pro')]"
                  >{{ getTierBadgeLabel(profile.user.tier && profile.user.tier !== 'free' ? profile.user.tier : 'pro') }}</span>
                </div>
                <p class="text-xs text-gray-500 mt-px leading-tight">
                  <span v-if="profile.user.riot_name">{{ profile.user.riot_name }}#{{ profile.user.riot_tag }}</span>
                  <button v-else class="text-red-400/70 hover:text-red-400 transition-colors" @click="openRiotSettings">Link Riot ID →</button>
                </p>
                <div v-if="profile.latest_stats?.current_rank" class="mt-1.5">
                  <div class="flex items-center gap-1.5 flex-nowrap">
                    <img v-if="getRankIconUrl(profile.latest_stats.current_rank)" :src="getRankIconUrl(profile.latest_stats.current_rank)!" :alt="profile.latest_stats.current_rank" class="w-6 h-6 object-contain drop-shadow-lg flex-shrink-0" />
                    <span class="text-lg font-black leading-none whitespace-nowrap" :style="{ color: getRankHexColor(profile.latest_stats.current_rank), textShadow: `0 0 20px ${getRankHexColor(profile.latest_stats.current_rank)}55` }">{{ profile.latest_stats.current_rank }}</span>
                    <span v-if="profile.latest_stats.leaderboard_rank" class="text-[10px] font-black bg-yellow-400/15 text-yellow-300 border border-yellow-400/25 px-1.5 py-0.5 rounded-full tabular-nums whitespace-nowrap">#{{ profile.latest_stats.leaderboard_rank }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span v-if="profile.latest_stats.rr != null" class="text-xs font-semibold text-gray-500">{{ profile.latest_stats.rr }} <span class="text-gray-700">RR</span></span>
                    <span v-if="profile.latest_stats.last_rr_change != null" class="text-xs font-black tabular-nums px-1.5 py-0.5 rounded-md" :class="profile.latest_stats.last_rr_change > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'">{{ profile.latest_stats.last_rr_change > 0 ? '+' : '' }}{{ profile.latest_stats.last_rr_change }}</span>
                  </div>
                </div>
              </div>
              <!-- Actions -->
              <div class="flex gap-0.5 flex-shrink-0">
                <button class="p-1.5 text-gray-700 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" @click="refreshProfile">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                </button>
                <button class="p-1.5 text-gray-700 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" @click="openBrowser">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- 4-stat grid -->
          <template v-if="profile.latest_stats">
            <div class="grid grid-cols-4 divide-x divide-white/[0.04] border-t border-white/[0.07]">
              <div class="flex flex-col items-center py-3.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.kd_ratio != null ? (profile.latest_stats.kd_ratio >= 1.2 ? 'text-green-400' : profile.latest_stats.kd_ratio >= 0.8 ? 'text-white' : 'text-red-400') : 'text-gray-600'">{{ profile.latest_stats.kd_ratio?.toFixed(2) ?? '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-1">K/D</span>
              </div>
              <div class="flex flex-col items-center py-3.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.win_rate != null ? (profile.latest_stats.win_rate >= 52 ? 'text-green-400' : profile.latest_stats.win_rate >= 45 ? 'text-white' : 'text-red-400') : 'text-gray-600'">{{ profile.latest_stats.win_rate != null ? Math.round(profile.latest_stats.win_rate) + '%' : '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-1">Win</span>
              </div>
              <div class="flex flex-col items-center py-3.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.avg_combat_score != null ? (profile.latest_stats.avg_combat_score >= 220 ? 'text-orange-400' : profile.latest_stats.avg_combat_score >= 160 ? 'text-white' : 'text-gray-300') : 'text-gray-600'">{{ profile.latest_stats.avg_combat_score ?? '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-1">ACS</span>
              </div>
              <div class="flex flex-col items-center py-3.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="currentStreak > 0 ? 'text-green-400' : currentStreak < 0 ? 'text-red-400' : 'text-gray-600'">
                  {{ currentStreak !== 0 ? (currentStreak > 0 ? '+' : '') + currentStreak : '—' }}
                </span>
                <span class="text-[10px] text-gray-600 mt-1">Streak</span>
              </div>
            </div>

            <!-- RR trend -->
            <div v-if="rrSparkline" class="border-t border-white/[0.07]">
              <button class="w-full px-4 py-2 flex items-center gap-2 hover:bg-white/[0.04] transition-all cursor-pointer" @click="showRankHistory = !showRankHistory">
                <span class="text-[10px] text-gray-600 shrink-0">RR trend</span>
                <svg :viewBox="`0 0 ${rrSparkline.W} ${rrSparkline.H}`" class="flex-1 h-5" preserveAspectRatio="none">
                  <polyline :points="rrSparkline.points" fill="none" :stroke="rrSparkline.trending ? '#22c55e' : '#ef4444'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
                </svg>
                <span class="text-xs shrink-0" :class="rrSparkline.trending ? 'text-green-500' : 'text-red-400'">{{ rrSparkline.trending ? '↑' : '↓' }}</span>
                <svg class="w-3 h-3 text-gray-600 shrink-0 transition-transform" :class="showRankHistory ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div v-if="showRankHistory && rrHistory.length" class="border-t border-white/[0.07] divide-y divide-white/[0.03] max-h-36 overflow-y-auto">
                <div v-for="(entry, i) in rrHistory.slice().reverse().slice(0, 10)" :key="entry.id" class="px-4 py-1.5 flex items-center gap-2">
                  <span class="text-xs text-gray-600 shrink-0 w-16 truncate">{{ formatEntryDate(entry.date) }}</span>
                  <span class="text-xs font-semibold flex-1 truncate flex items-center gap-1.5" :style="{ color: getRankHexColor(entry.rank ?? '') }">
                    <img v-if="getRankIconUrl(entry.rank)" :src="getRankIconUrl(entry.rank)!" :alt="entry.rank ?? ''" class="w-4 h-4 object-contain flex-shrink-0" />
                    {{ entry.rank ?? '—' }}
                  </span>
                  <span class="text-xs font-mono tabular-nums" :class="entry.rr >= 50 ? 'text-white' : 'text-gray-400'">{{ entry.rr }} RR</span>
                  <span v-if="i < rrHistory.length - 1" class="text-xs font-bold tabular-nums shrink-0 w-10 text-right" :class="rrDelta(i) > 0 ? 'text-green-400' : rrDelta(i) < 0 ? 'text-red-400' : 'text-gray-600'">{{ rrDelta(i) > 0 ? '+' : '' }}{{ rrDelta(i) !== 0 ? rrDelta(i) : '—' }}</span>
                  <span v-else class="w-10" />
                </div>
              </div>
            </div>
          </template>
          <div v-else class="px-4 pb-3 pt-1">
            <button class="text-xs text-gray-600 hover:text-gray-400 transition-colors" @click="openRiotSettings">No stats yet — link your Riot ID</button>
          </div>

          <!-- Quota -->
          <div v-if="profile.user.analysis_stats" class="px-4 py-2.5 border-t border-white/[0.07] flex items-center gap-3">
            <span class="text-[10px] text-gray-600 shrink-0">Analyses</span>
            <template v-if="isAdmin">
              <div class="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div class="h-full w-full rounded-full bg-green-500" />
              </div>
              <span class="text-xs font-medium tabular-nums shrink-0 text-gray-400">∞</span>
            </template>
            <template v-else>
              <div class="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all" :class="quotaPercent >= 80 ? 'bg-red-500' : quotaPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'" :style="{ width: (100 - quotaPercent) + '%' }" />
              </div>
              <span class="text-xs font-medium tabular-nums shrink-0" :class="(profile.user.analysis_stats.limit - profile.user.analysis_stats.total) <= 0 ? 'text-red-400' : 'text-gray-400'">
                {{ Math.max(0, profile.user.analysis_stats.limit - profile.user.analysis_stats.total) }}/{{ profile.user.analysis_stats.limit }}
              </span>
            </template>
          </div>
        </div>
        <div v-else-if="profileLoading" class="h-52 bg-white/[0.02] rounded-2xl animate-pulse border border-white/[0.07]" />
        <div v-else class="bg-white/[0.02] border border-white/[0.10] rounded-2xl p-4">
          <p class="text-xs text-gray-600">No profile loaded</p>
        </div>

        <!-- ─── Mastery card ─── -->
        <div v-if="profile?.user.forge_rank" class="bg-white/[0.02] border border-white/[0.10] rounded-2xl overflow-hidden">
          <div class="px-4 pt-3 pb-2">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Mastery</span>
              <span v-if="profile.user.forge_rank.prestige_stars > 0" class="flex items-center gap-0.5 text-yellow-400">
                <svg
                  v-for="n in Math.min(profile.user.forge_rank.prestige_stars, 5)"
                  :key="n"
                  class="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <span v-if="profile.user.forge_rank.prestige_stars > 5" class="text-[10px] font-semibold ml-0.5">+{{ profile.user.forge_rank.prestige_stars - 5 }}</span>
              </span>
            </div>
            <div class="flex items-center gap-3">
              <!-- Rank icon / badge -->
              <div class="relative flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" :style="{ background: forgeRankGradient(profile.user.forge_rank.tier) }">
                <span class="text-lg font-black text-white select-none">{{ forgeRankInitial(profile.user.forge_rank.tier_name) }}</span>
              </div>
              <!-- Rank name + progress -->
              <div class="flex-1 min-w-0">
                <p class="text-base font-black leading-tight" :style="{ color: forgeRankColor(profile.user.forge_rank.tier) }">{{ profile.user.forge_rank.rank_name }}</p>
                <p class="text-[10px] text-gray-600 mt-px">{{ profile.user.forge_rank.xp.toLocaleString() }} XP total</p>
                <!-- XP bar -->
                <div class="mt-1.5 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :style="{ width: profile.user.forge_rank.progress_pct + '%', background: forgeRankColor(profile.user.forge_rank.tier) }"
                  />
                </div>
                <div class="flex items-center justify-between mt-0.5">
                  <span class="text-[9px] text-gray-700">{{ profile.user.forge_rank.xp_progress.toLocaleString() }} XP</span>
                  <span v-if="profile.user.forge_rank.xp_needed" class="text-[9px] text-gray-700">{{ profile.user.forge_rank.xp_needed.toLocaleString() }} to next</span>
                  <span v-else class="text-[9px] text-yellow-400 font-bold">Max Rank</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Prestige available -->
          <div v-if="profile.user.forge_rank.can_prestige" class="px-4 py-2 border-t border-white/[0.07] flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
            <span class="text-[10px] text-yellow-400 font-semibold flex-1">Prestige available — you've completed the journey!</span>
            <button class="text-[10px] font-bold text-yellow-400 hover:text-yellow-300 transition-colors px-2 py-0.5 rounded bg-yellow-400/10 hover:bg-yellow-400/20" @click="triggerPrestige">Prestige →</button>
          </div>
        </div>

        <!-- AI score trend chart -->
        <div v-if="scoreChartData" class="bg-white/[0.02] border border-white/[0.10] rounded-2xl px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">AI Score Trend</span>
            <div class="flex items-center gap-2">
              <span v-if="scoreTrend !== null" class="flex items-center gap-0.5 text-xs font-bold" :class="scoreTrend >= 0 ? 'text-green-400' : 'text-red-400'">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" :d="scoreTrend >= 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'"/></svg>
                {{ Math.round(Math.abs(scoreTrend) * 10) }}
              </span>
              <span v-if="avgScore !== null" class="text-[10px] text-gray-600">avg {{ avgScore * 10 }}</span>
            </div>
          </div>
          <svg width="100%" :viewBox="`0 0 ${scoreChartData.W} ${scoreChartData.H}`" preserveAspectRatio="none" style="height:36px;display:block">
            <defs>
              <linearGradient id="score-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="scoreChartData.up ? '#4ade80' : '#f87171'" stop-opacity="0.35"/>
                <stop offset="100%" :stop-color="scoreChartData.up ? '#4ade80' : '#f87171'" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path :d="scoreChartData.areaPath" fill="url(#score-area-grad)" />
            <path :d="scoreChartData.linePath" fill="none" :stroke="scoreChartData.up ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>

        <!-- Agent performance mini-table -->
        <div v-if="topAgents.length && topAgents.some(a => a.hasWinData || a.avgScore != null)" class="bg-white/[0.02] border border-white/[0.10] rounded-2xl overflow-hidden">
          <div class="px-4 py-2.5 border-b border-white/[0.07]">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Agent Win Rates</span>
          </div>
          <div class="divide-y divide-white/[0.03]">
            <div v-for="ag in topAgents" :key="ag.agent" class="flex items-center gap-2.5 px-3 py-2">
              <div class="w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center" :style="{ backgroundColor: getAgentColor(ag.agent) + '22' }">
                <img v-if="getAgentImage(ag.agent)" :src="getAgentImage(ag.agent)" class="w-6 h-6 object-contain" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="text-xs font-semibold truncate">{{ ag.agent }}</span>
                  <span class="text-[10px] font-bold tabular-nums" :class="ag.hasWinData ? (ag.winRate >= 55 ? 'text-green-400' : ag.winRate >= 45 ? 'text-gray-300' : 'text-red-400') : 'text-gray-600'">
                    {{ ag.hasWinData ? ag.winRate + '%' : '—' }}
                  </span>
                </div>
                <div v-if="ag.hasWinData" class="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="ag.winRate >= 55 ? 'bg-green-500' : ag.winRate >= 45 ? 'bg-gray-500' : 'bg-red-500'" :style="{ width: ag.winRate + '%' }" />
                </div>
                <div v-else-if="ag.avgScore != null" class="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div class="h-full rounded-full bg-orange-500/60" :style="{ width: ag.avgScore + '%' }" />
                </div>
              </div>
              <span v-if="ag.avgScore != null" class="text-[10px] text-gray-600 tabular-nums shrink-0">{{ ag.avgScore * 10 }}</span>
              <span class="text-[10px] text-gray-700 shrink-0">{{ ag.total }}g</span>
            </div>
          </div>
        </div>

        <!-- Dev tools -->
        <div v-if="isDev || (platform && platform !== 'win32')" class="border border-dashed border-yellow-500/20 rounded-xl overflow-hidden">
          <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-yellow-600/60 hover:text-yellow-500/70 transition-colors" @click="devOpen = !devOpen">
            <span class="font-semibold uppercase tracking-wider">Dev Tools</span>
            <svg class="w-3 h-3 transition-transform" :class="devOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div v-if="devOpen" class="px-3 pb-3 space-y-2">
            <div class="flex gap-2">
              <button class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/[0.08] text-yellow-500/70 hover:bg-yellow-500/[0.14] transition-colors border border-yellow-500/10" :disabled="simulating" @click="simulateGame('valorant', 8000)">{{ simulating ? 'Simulating...' : 'Simulate Valorant (8s)' }}</button>
              <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-gray-500 hover:bg-white/[0.07] transition-colors border border-white/[0.09]" @click="$router.push('/post-game-preview')">Post-game</button>
              <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-orange-500/[0.08] text-orange-500/70 hover:bg-orange-500/[0.14] transition-colors border border-orange-500/10" @click="$router.push('/training')">Trainer</button>
            </div>
            <p v-if="simStatus" class="text-xs text-yellow-500/50">{{ simStatus }}</p>
          </div>
        </div>

      </div>

      <!-- ═══════════ CENTER: Recent matches ═══════════ -->
      <div class="flex flex-col gap-3 min-h-0 overflow-hidden">

        <!-- Deadlock stats panel (Steam-linked stats) -->
        <DeadlockStatsPanel v-if="isDeadlockUser" class="flex-shrink-0" />

        <!-- Deadlock demo upload panel (Deadlock users only) -->
        <DeadlockDemoPanel v-if="isDeadlockUser" class="flex-shrink-0" />

        <!-- Emotional highlights strip -->
        <Transition name="banner-slide">
          <div
            v-if="emotionalHighlights.length"
            class="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl overflow-hidden highlights-bar"
          >
            <svg class="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z"/></svg>
            <div class="flex items-center gap-3 overflow-x-auto" style="scrollbar-width:none">
              <span
                v-for="(h, i) in emotionalHighlights"
                :key="i"
                class="flex-shrink-0 text-[11px] font-semibold"
                :class="h.accent === 'green' ? 'text-green-400' : h.accent === 'orange' ? 'text-orange-300' : h.accent === 'yellow' ? 'text-yellow-300' : 'text-gray-300'"
              >{{ h.text }}</span>
            </div>
          </div>
        </Transition>

        <div class="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent my-1" />

        <!-- Section header -->
        <div class="flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Analyses</h2>
            <span v-if="analyses.length" class="text-[10px] text-gray-700">{{ analyses.length }} sessions</span>
          </div>
          <button v-if="analyses.length > 0" class="text-xs text-gray-600 hover:text-gray-300 transition-colors" @click="router.push('/history')">View all →</button>
        </div>

        <!-- Last-5 performance strip -->
        <div v-if="lastFivePerf" class="flex-shrink-0 flex items-center gap-3 px-3 py-2 bg-white/[0.02] border border-white/[0.09] rounded-xl">
          <!-- W/L dots — only shown when won data exists -->
          <template v-if="lastFivePerf.wins > 0 || lastFivePerf.losses > 0">
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-gray-700 mr-0.5 uppercase tracking-wider">Last {{ lastFivePerf.wl.length }}</span>
              <span
                v-for="(won, i) in lastFivePerf.wl"
                :key="i"
                class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black"
                :class="won === true ? 'bg-green-500/20 text-green-400' : won === false ? 'bg-red-500/20 text-red-400' : 'bg-white/[0.05] text-gray-700'"
              >{{ won === true ? 'W' : won === false ? 'L' : '·' }}</span>
            </div>
            <div class="w-px h-4 bg-gradient-to-b from-transparent via-white/[0.14] to-transparent" />
            <span class="text-xs tabular-nums"><span class="text-green-400 font-bold">{{ lastFivePerf.wins }}W</span><span class="text-gray-600 mx-0.5">·</span><span class="text-red-400 font-bold">{{ lastFivePerf.losses }}L</span></span>
          </template>
          <template v-else>
            <span class="text-[10px] text-gray-600">Last {{ lastFivePerf.wl.length }} games</span>
          </template>
          <div class="flex-1" />
          <!-- Avg stats -->
          <template v-if="lastFivePerf.avgAcs != null">
            <span class="text-[10px] text-gray-600">ACS</span>
            <span class="text-xs font-bold tabular-nums text-gray-200">{{ lastFivePerf.avgAcs }}</span>
          </template>
          <template v-if="lastFivePerf.avgScore != null">
            <div class="w-px h-4 bg-gradient-to-b from-transparent via-white/[0.14] to-transparent" />
            <span class="text-[10px] text-gray-600">AI</span>
            <span class="text-xs font-bold tabular-nums" :class="lastFivePerf.avgScore >= 70 ? 'text-green-400' : lastFivePerf.avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ lastFivePerf.avgScore * 10 }}</span>
          </template>
          <template v-if="lastFivePerf.avgHs != null">
            <div class="w-px h-4 bg-gradient-to-b from-transparent via-white/[0.14] to-transparent" />
            <span class="text-[10px] text-gray-600">HS%</span>
            <span class="text-xs font-bold tabular-nums text-gray-200">{{ lastFivePerf.avgHs }}%</span>
          </template>
        </div>

        <!-- Scrollable match list -->
        <div class="flex-1 overflow-y-auto space-y-1.5" style="scrollbar-width:none">

          <!-- Pending recordings (above analyses) -->
          <template v-if="pendingRecordings.length > 0">
            <div class="flex items-center gap-2 px-0.5 mb-1">
              <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Pending Analysis</span>
              <span class="text-[10px] text-blue-500/70 bg-blue-500/10 px-1.5 py-px rounded-full">{{ pendingRecordings.length }}</span>
            </div>
            <div
              v-for="rec in pendingRecordings"
              :key="rec.id"
              class="flex items-center gap-3 px-3 py-2.5 bg-blue-500/[0.04] hover:bg-blue-500/[0.06] border border-blue-500/[0.12] hover:border-blue-500/25 rounded-xl transition-all"
            >
              <div class="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center relative" :style="rec.agent ? { backgroundColor: getAgentColor(rec.agent) + '22' } : { backgroundColor: 'rgba(59,130,246,0.1)' }">
                <img v-if="rec.map && getMapMinimap(rec.map)" :src="getMapMinimap(rec.map)" class="absolute inset-0 w-full h-full object-cover opacity-20" />
                <img v-if="rec.agent && getAgentImage(rec.agent)" :src="getAgentImage(rec.agent)" class="relative w-8 h-8 object-contain" />
                <svg v-else class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <p class="text-xs font-medium text-gray-200 truncate">{{ rec.agent || 'Unknown' }}<span v-if="rec.map" class="text-gray-600"> · {{ rec.map }}</span></p>
                  <span v-if="rec.agent" class="flex-shrink-0 text-[8px] font-semibold px-1 py-px rounded" :style="{ color: getRoleColor(getAgentRole(rec.agent)), backgroundColor: getRoleColor(getAgentRole(rec.agent)) + '20' }">{{ getAgentRole(rec.agent) }}</span>
                </div>
                <p class="text-[10px] text-gray-600 mt-0.5">{{ formatRelativeTime(new Date(rec.recordedAt).toISOString()) }} · {{ formatMode(rec.gameMode) }}<span v-if="rec.fileSizeBytes"> · {{ formatFileSize(rec.fileSizeBytes) }}</span></p>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0">
                <button v-if="rec.timeline?.playerKills?.length" class="px-2 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors" @click="$router.push({ path: '/vod-review', query: { id: rec.id } })">Review</button>
                <button :disabled="analysingIds.has(rec.id)" class="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1" @click="analyseRecording(rec.id)">
                  <svg v-if="analysingIds.has(rec.id)" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  {{ analysingIds.has(rec.id) ? 'Uploading…' : 'Analyse' }}
                </button>
                <button class="p-1.5 text-gray-600 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" @click="dismissRecording(rec.id)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div class="my-1 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
          </template>

          <!-- Loading skeleton -->
          <template v-if="analysesLoading">
            <div v-for="i in 6" :key="i" class="h-14 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.07]" />
          </template>

          <!-- Empty state -->
          <div v-else-if="analyses.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.09] flex items-center justify-center mb-3">
              <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            </div>
            <p class="text-xs text-gray-500">No analyses yet</p>
            <p class="text-xs text-gray-700 mt-1 mb-4">{{ status.recordedModes?.length ? 'Play a game — UpForge will record automatically' : 'Enable game modes in Settings to start recording' }}</p>
            <button v-if="!status.recordedModes?.length" class="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-gray-400 hover:text-gray-200 transition-all" @click="router.push('/settings')">Open Settings →</button>
          </div>

          <!-- Analysis rows grouped by date -->
          <template v-else>
            <template v-for="group in groupedAnalyses" :key="group.label">
              <!-- Group header -->
              <div class="flex items-center gap-2 px-0.5 pt-1 pb-0.5">
                <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{{ group.label }}</span>
                <div class="flex-1 h-px bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent" />
              </div>
              <!-- Rows in group -->
              <div
                v-for="a in group.items"
                :key="a.id"
                class="relative flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.09] bg-white/[0.02] cursor-pointer transition-all hover:border-white/[0.14] hover:bg-white/[0.04] hover:shadow-[0_12px_28px_rgba(0,0,0,0.16)]"
                @click="openAnalysis(a.id)"
              >
                <!-- W/L left accent bar -->
                <div v-if="a.won != null" class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" :class="a.won ? 'bg-green-500' : 'bg-red-500'" />
                <!-- Agent portrait -->
                <div class="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center relative" :style="a.agent ? { backgroundColor: getAgentColor(a.agent) + '22' } : {}">
                  <img v-if="a.map && getMapMinimap(a.map)" :src="getMapMinimap(a.map)" class="absolute inset-0 w-full h-full object-cover opacity-20" />
                  <img v-if="a.agent && getAgentImage(a.agent)" :src="getAgentImage(a.agent)" class="relative w-8 h-8 object-contain" />
                  <template v-else>
                    <svg v-if="a.job_id" class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>
                    <svg v-else class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </template>
                </div>

                <!-- Agent + map + date — wider when no stats available -->
                <div :class="['flex-shrink-0 min-w-0', (a.kills == null && a.kda == null && a.combat_score == null) ? 'flex-1' : 'w-32']">
                  <div class="flex items-center gap-1">
                    <span class="text-xs font-semibold truncate">{{ a.agent || 'Unknown' }}</span>
                    <span v-if="a.agent" class="flex-shrink-0 text-[8px] font-bold px-1 py-px rounded" :style="{ color: getRoleColor(getAgentRole(a.agent)), backgroundColor: getRoleColor(getAgentRole(a.agent)) + '20' }">{{ getAgentRole(a.agent) }}</span>
                  </div>
                  <p class="text-[10px] text-gray-600 mt-0.5 truncate">
                    {{ a.map || '—' }} · {{ formatDate(a.created_at) }}
                    <span v-if="a.rounds_won != null && a.rounds_lost != null" class="text-gray-700"> · {{ a.rounds_won }}–{{ a.rounds_lost }} rds</span>
                  </p>
                </div>

                <!-- W/L -->
                <span v-if="a.won != null" class="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded" :class="a.won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">{{ a.won ? 'W' : 'L' }}</span>
                <span v-else class="flex-shrink-0 w-7" />

                <!-- K/D/A -->
                <div v-if="a.kills != null" class="w-20 flex-shrink-0 text-center">
                  <span class="text-xs font-mono font-semibold tabular-nums">{{ a.kills }}<span class="text-gray-600">/</span>{{ a.deaths }}<span class="text-gray-600">/</span>{{ a.assists }}</span>
                  <p class="text-[9px] text-gray-700 mt-0.5">K/D/A</p>
                </div>
                <div v-else-if="a.kda != null" class="w-20 flex-shrink-0 text-center">
                  <span class="text-xs font-semibold tabular-nums">{{ a.kda.toFixed(2) }}</span>
                  <p class="text-[9px] text-gray-700 mt-0.5">KDA</p>
                </div>
                <div v-else class="w-20 flex-shrink-0" />

                <!-- ACS -->
                <div v-if="a.combat_score" class="w-14 flex-shrink-0 text-center">
                  <span class="text-xs font-bold tabular-nums text-gray-300">{{ a.combat_score }}</span>
                  <p class="text-[9px] text-gray-700 mt-0.5">ACS</p>
                </div>
                <div v-else class="w-14 flex-shrink-0" />

                <!-- HS% -->
                <div v-if="a.hs_pct != null" class="w-12 flex-shrink-0 text-center">
                  <span class="text-xs font-bold tabular-nums" :class="a.hs_pct >= 25 ? 'text-orange-400' : 'text-gray-400'">{{ a.hs_pct }}%</span>
                  <p class="text-[9px] text-gray-700 mt-0.5">HS</p>
                </div>
                <div v-else class="w-12 flex-shrink-0" />

                <!-- AI Score -->
                <div class="flex-1 flex items-center justify-end gap-1.5">
                  <template v-if="a.overall_score != null">
                    <span class="text-sm font-black tabular-nums" :class="a.overall_score >= 78 ? 'text-green-400' : a.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ a.overall_score * 10 }}</span>
                    <span class="text-[8px] font-bold px-1.5 py-px rounded-full" :class="scoreGradeBadgeClass(a.overall_score)">{{ scoreGrade(a.overall_score) }}</span>
                  </template>
                </div>

                <!-- Timeline button -->
                <button
                  v-if="a.kills != null && a.kills > 0"
                  :disabled="timelineLoadingId === a.id"
                  class="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-gray-400 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors disabled:opacity-50"
                  @click.stop="openTimeline(a.id)"
                >
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                  {{ timelineLoadingId === a.id ? '…' : 'Timeline' }}
                </button>

                <!-- Arrow -->
                <svg class="w-3.5 h-3.5 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              </div>
            </template>
          </template>

        </div>
      </div>

      <!-- ═══════════ RIGHT: Coaching + Training + Activity ═══════════ -->
      <div class="flex flex-col gap-3 overflow-y-auto" style="scrollbar-width:none">

        <div v-if="clipCount === 0" class="relative overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02] px-3 py-3">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/[0.10] text-orange-300 flex-shrink-0">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 7.5A2.25 2.25 0 015.25 5.25h2.379a1.5 1.5 0 001.06-.44l.621-.62a1.5 1.5 0 011.06-.44h3.26a1.5 1.5 0 011.06.44l.621.62a1.5 1.5 0 001.06.44h2.379A2.25 2.25 0 0121 7.5v9A2.25 2.25 0 0118.75 18.75H5.25A2.25 2.25 0 013 16.5v-9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12a3 3 0 116 0 3 3 0 01-6 0z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-white">Clip Library</p>
              <p class="text-[11px] text-gray-600 truncate">Use your save-clip hotkey during a match to build highlights</p>
            </div>
            <button class="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-white border border-white/[0.09] hover:border-white/[0.14] rounded-lg transition-colors" @click="router.push('/settings')">Settings</button>
          </div>
        </div>

        <div class="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent my-1" />

        <!-- Last coaching insight (or empty CTA) -->
        <div v-if="lastInsight" class="relative bg-white/[0.02] border border-white/[0.09] rounded-2xl overflow-hidden">
          <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ff4655] to-orange-600 rounded-l-xl" />
          <div class="pl-5 pr-4 pt-4 pb-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Last Coaching Result</span>
              <div class="flex items-center gap-2">
                <span v-if="lastInsight.date" class="text-[10px] text-gray-700">{{ formatRelativeTime(lastInsight.date) }}</span>
                <button v-if="lastInsight.analysisId" class="text-xs text-gray-600 hover:text-gray-300 transition-colors" @click="openAnalysis(lastInsight.analysisId!)">↗</button>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center" :style="lastInsight.agent ? { backgroundColor: getAgentColor(lastInsight.agent) + '22', border: `1px solid ${getAgentColor(lastInsight.agent)}40` } : { backgroundColor: 'rgba(255,70,85,0.1)', border: '1px solid rgba(255,70,85,0.2)' }">
                <img v-if="lastInsight.agent && getAgentImage(lastInsight.agent)" :src="getAgentImage(lastInsight.agent)" class="w-full h-full object-cover object-top" />
                <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              </div>
                <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-1.5">
                  <span class="text-4xl font-black tabular-nums leading-none score-glow" :class="lastInsight.score >= 78 ? 'text-green-400' : lastInsight.score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ lastInsight.score * 10 }}</span>
                  <span class="text-xs font-black px-1.5 py-0.5 rounded-full ml-1" :class="scoreGradeBadgeClass(lastInsight.score)">{{ scoreGrade(lastInsight.score) }}</span>
                  <span class="text-[10px] text-gray-600 font-semibold">{{ scoreLabel(lastInsight.score) }}</span>
                </div>
                <div class="mt-2 w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div class="h-full rounded-full score-bar" :class="lastInsight.score >= 78 ? 'bg-green-500' : lastInsight.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'" :style="{ width: lastInsight.score + '%' }" />
                </div>
              </div>
            </div>
            <p class="text-xs text-gray-400 leading-relaxed line-clamp-3">
              <span class="text-gray-600 font-semibold uppercase tracking-wider text-[10px]">Focus · </span>{{ lastInsight.text }}
            </p>
            <button :disabled="lastInsightTraining" class="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all disabled:opacity-50 text-white hover:brightness-110 cta-train" @click="trainLastInsight">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/></svg>
              {{ lastInsightTraining ? 'Launching…' : 'Train This Weakness' }}
            </button>
          </div>
        </div>

        <!-- Empty coaching insight CTA -->
        <div v-else class="relative bg-white/[0.02] border border-white/[0.09] rounded-xl overflow-hidden">
          <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ff4655]/30 to-orange-600/30 rounded-l-xl" />
          <div class="pl-4 pr-3 py-3 flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-red-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-gray-400">No coaching data yet</p>
              <p class="text-[11px] text-gray-600 truncate">Run an Analysis after a game to get personalised insights</p>
            </div>
            <button class="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-white border border-white/[0.09] hover:border-white/[0.14] rounded-lg transition-colors" @click="router.push('/settings')">Setup</button>
          </div>
        </div>

        <div class="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent my-1" />

        <!-- Correlation insights card -->
        <div v-if="correlationInsights.length" class="bg-white/[0.02] border border-white/[0.09] rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-white/[0.07]">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Impact on Game</span>
          </div>
          <ul class="px-4 py-3 space-y-2">
            <li v-for="(insight, i) in correlationInsights.slice(0, 3)" :key="i" class="flex items-start gap-2">
              <span class="mt-0.5 w-4 h-4 rounded-full bg-[#ff4655]/15 flex items-center justify-center flex-shrink-0">
                <svg class="w-2.5 h-2.5 text-[#ff4655]" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clip-rule="evenodd"/></svg>
              </span>
              <p class="text-[11px] text-gray-400 leading-relaxed">{{ insight }}</p>
            </li>
          </ul>
        </div>

        <div class="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent my-1" />

        <!-- Aim training quick-start -->
        <div class="bg-white/[0.02] border border-white/[0.10] rounded-2xl overflow-hidden">
          <div class="px-4 py-3 flex items-center justify-between border-b border-white/[0.07]">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Aim Training</span>
            <button class="text-[10px] text-gray-600 hover:text-gray-300 transition-colors" @click="router.push('/training')">Open →</button>
          </div>
          <div class="px-4 py-3 space-y-2.5">
            <template v-if="trainerLastSession">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold capitalize">{{ trainerLastSession.scenario }} drill</p>
                  <p class="text-[10px] text-gray-600 mt-0.5">{{ formatRelativeTime(trainerLastSession.date) }}</p>
                </div>
                <div class="text-right flex-shrink-0">
                  <span class="text-lg font-black tabular-nums" :class="trainerLastSession.score >= 78 ? 'text-green-400' : trainerLastSession.score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ trainerLastSession.score }}</span>
                  <p class="text-[9px] text-gray-700">score</p>
                </div>
              </div>
              <p v-if="trainerSessionCount > 1" class="text-[10px] text-gray-700 text-center">{{ trainerSessionCount }} total sessions</p>
            </template>
            <template v-else>
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.09] flex items-center justify-center flex-shrink-0">
                  <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/></svg>
                </div>
                <div>
                  <p class="text-xs text-gray-500">No sessions yet</p>
                  <p class="text-[10px] text-gray-700 mt-0.5">Start your first aim training drill</p>
                </div>
              </div>
            </template>
            <button class="w-full py-2 text-xs font-semibold text-white/80 hover:text-white rounded-xl transition-all" style="background:linear-gradient(135deg,rgba(251,146,60,0.15),rgba(234,88,12,0.15));border:1px solid rgba(251,146,60,0.2)" @click="router.push('/training')">
              {{ trainerLastSession ? 'Continue Training →' : 'Start Training →' }}
            </button>
          </div>
        </div>

        <!-- Activity log -->
        <div v-if="activityLog.length" class="bg-white/[0.02] border border-white/[0.10] rounded-2xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.07]">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Activity</span>
            <button class="w-4 h-4 flex items-center justify-center text-gray-700 hover:text-gray-400 transition-colors" @click="clearLog">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="py-1.5 max-h-40 overflow-y-auto">
            <div v-for="entry in [...activityLog].reverse().slice(0, 8)" :key="entry.time" class="flex items-center gap-2.5 px-4 py-1">
              <div :class="['w-1.5 h-1.5 rounded-full flex-shrink-0', logEntryColor(entry.message)]" />
              <span class="text-[10px] text-gray-700 tabular-nums flex-shrink-0 font-mono">{{ formatLogTime(entry.time) }}</span>
              <span class="text-[10px] text-gray-400 leading-snug">{{ entry.message }}</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ProfileData, AnalysisItem, PendingRecording, ClipRecord } from '../env.d.ts'
import { getAgentImage, getAgentRole, getAgentColor, getMapMinimap, getRankHexColor, getRankIconUrl, getRoleColor, getTierBadgeClass, getTierBadgeLabel, formatGameMode } from '../lib/valorant'
import { pendingTimeline } from '../stores/pendingTimeline'
import { useAchievements } from '../composables/useAchievements'
import DeadlockDemoPanel from '../components/DeadlockDemoPanel.vue'
import DeadlockStatsPanel from '../components/DeadlockStatsPanel.vue'

const router = useRouter()
const achievements = useAchievements()

const profile = ref<ProfileData | null>(null)
const profileLoading = ref(true)
const playerCardUrl = ref('')
const analyses = ref<AnalysisItem[]>([])
const analysesLoading = ref(true)
const pendingRecordings = ref<PendingRecording[]>([])
const analysingIds = ref(new Set<string>())
const status = ref<{
  recording: boolean
  recordingStarting: boolean
  currentGame: string | null
  waitingForMatch: boolean
  ffmpegOk: boolean
  recordedModes: string[]
  recordingBackend: 'obs' | 'ffmpeg' | 'desktop'
  currentQueueMode: string | null
}>({
  recording: false,
  recordingStarting: false,
  currentGame: null,
  waitingForMatch: false,
  ffmpegOk: true,
  recordedModes: [],
  recordingBackend: 'desktop',
  currentQueueMode: null,
})
const stopRecordingHint = 'Stop recording and open upload — use if you leave the match early'
const isDev = ref(false)
const platform = ref('')
const hotkeys = ref<Record<string, string>>({})
const clipCount = ref(0)
const userPrimaryGame = ref<string>('valorant')

const isAdmin = computed(() => !!profile.value?.user?.is_admin)
const isDeadlockUser = computed(() => userPrimaryGame.value === 'deadlock')

const hotkeyHints = computed(() => [
  { key: hotkeys.value['save-clip'] || 'F9', label: 'save clip' },
  { key: hotkeys.value['toggle-overlay'] || 'F10', label: 'overlay' },
  { key: hotkeys.value['take-screenshot'] || 'F8', label: 'screenshot' },
])
const dashboardHeadline = computed(() => profile.value?.user?.name ? `Welcome back, ${profile.value.user.name}` : 'Your coaching dashboard')
const dashboardRankLabel = computed(() => profile.value?.latest_stats?.current_rank || 'Unranked')
const totalSessionsAnalysed = computed(() => {
  const total = profile.value?.user?.analysis_stats?.total
  if (total != null) return Math.max(0, total)
  return analyses.value.filter(a => a.overall_score != null).length
})
const dashboardWinRateLabel = computed(() => profile.value?.latest_stats?.win_rate != null ? `${Math.round(profile.value.latest_stats.win_rate)}%` : '—')
const liveDetectionActive = computed(() => status.value.recording || status.value.waitingForMatch || !!status.value.currentGame)
const activeGameTitle = computed(() => {
  if (!status.value.ffmpegOk) return 'Recorder unavailable'
  if (status.value.recording) return 'Recording in progress'
  if (status.value.recordingStarting) return 'Starting capture'
  if (status.value.waitingForMatch) return `${status.value.currentGame || 'Valorant'} detected`
  if (status.value.currentGame) return `${status.value.currentGame} detected`
  return 'Ready for next match'
})
const activeGameMessage = computed(() => {
  if (!status.value.ffmpegOk) return 'Reinstall the desktop recorder to restore automated capture.'
  if (status.value.recording) return 'UpForge is actively recording this match. Save clips anytime for faster review.'
  if (status.value.recordingStarting) return 'Stand by while capture hooks into the live match.'
  if (status.value.waitingForMatch) return 'You are in lobby or agent select. Auto-recording will begin when the match starts.'
  if (status.value.currentGame) return 'Game detected and monitoring. Launch into a supported mode to begin recording.'
  return 'Launch a supported game and UpForge will watch for the next recordable session.'
})
const devOpen = ref(false)
const simulating = ref(false)
const simStatus = ref('')
const recordingStartedAt = ref<number | null>(null)
const recordingElapsed = ref('')
const stopping = ref(false)
const showRankHistory = ref(false)
const warning = ref<string | null>(null)
const rrHistory = ref<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>>([])

const rrSparkline = computed(() => {
  const data = rrHistory.value
  if (data.length < 2) return null
  const eloValues = data.map(d => d.elo)
  const minElo = Math.min(...eloValues)
  const maxElo = Math.max(...eloValues)
  const range = maxElo - minElo || 1
  const W = 120, H = 24, pad = 2
  const points = eloValues.map((elo, i) => {
    const x = pad + (i / (eloValues.length - 1)) * (W - pad * 2)
    const y = H - pad - ((elo - minElo) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const lastElo = eloValues[eloValues.length - 1]
  const firstElo = eloValues[0]
  const trending = lastElo >= firstElo
  return { points: points.join(' '), trending, W, H }
})
const upgradeNeeded = ref(false)
const activityLog = ref<{ time: number; message: string }[]>([])
const lastInsight = ref<{ text: string; score: number; agent: string | null; analysisId: number | null; date: string } | null>(null)
const lastInsightTraining = ref(false)
const trainerLastSession = ref<{ score: number; scenario: string; date: string } | null>(null)
const trainerSessionCount = ref(0)
const analysisCompleteToast = ref<{ score: number; agent: string | null } | null>(null)
let analysisToastTimer: ReturnType<typeof setTimeout> | null = null
const correlationInsights = ref<string[]>([])

// Emotional highlights — shown above the match list to give the user a sense of momentum
const emotionalHighlights = computed(() => {
  const highlights: { text: string; accent: 'green' | 'orange' | 'yellow' | 'white' }[] = []
  const last5 = analyses.value.slice(0, 5)

  // Win streak
  if (currentStreak.value >= 3) highlights.push({ text: `${currentStreak.value} game win streak`, accent: 'green' })
  else if (currentStreak.value === 2) highlights.push({ text: '2 game win streak', accent: 'green' })

  // AI score on the rise
  const scored = analyses.value.filter(a => a.overall_score != null)
  if (scored.length >= 3) {
    const recent = scored.slice(0, 3).map(a => a.overall_score as number)
    const older  = scored.slice(3, 6).map(a => a.overall_score as number)
    if (older.length > 0) {
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length
      const olderAvg  = older.reduce((s, v) => s + v, 0) / older.length
      const diff = Math.round(recentAvg - olderAvg)
      if (diff >= 8) highlights.push({ text: `AI score up ${diff} pts this week`, accent: 'orange' })
    }
  }

  // Personal best AI score
  if (scored.length >= 2) {
    const best = scored[0].overall_score as number
    const prevBest = scored.slice(1).reduce((m, a) => Math.max(m, a.overall_score ?? 0), 0)
    if (best > prevBest && best >= 70) highlights.push({ text: `New best score: ${best}`, accent: 'yellow' })
  }

  // Solid win rate on last 5
  const wonCount = last5.filter(a => a.won === true).length
  if (last5.length >= 5 && wonCount >= 4) highlights.push({ text: `${wonCount}/5 wins recently`, accent: 'green' })

  // Agent mastery
  const topAgent = topAgents.value.find(a => a.hasWinData && a.winRate >= 65 && a.total >= 3)
  if (topAgent) highlights.push({ text: `${topAgent.winRate}% WR on ${topAgent.agent}`, accent: 'orange' })

  return highlights
})

// Last-5 performance strip above match list
const lastFivePerf = computed(() => {
  const last5 = analyses.value.slice(0, 5)
  if (!last5.length) return null
  const wins = last5.filter(a => a.won === true).length
  const losses = last5.filter(a => a.won === false).length
  const wl = last5.map(a => a.won)
  const acsItems = last5.filter(a => a.combat_score != null)
  const scoreItems = last5.filter(a => a.overall_score != null)
  const hsItems = last5.filter(a => a.hs_pct != null)
  return {
    wl,
    wins,
    losses,
    avgAcs: acsItems.length ? Math.round(acsItems.reduce((s, a) => s + (a.combat_score ?? 0), 0) / acsItems.length) : null,
    avgScore: scoreItems.length ? Math.round(scoreItems.reduce((s, a) => s + (a.overall_score ?? 0), 0) / scoreItems.length) : null,
    avgHs: hsItems.length ? Math.round(hsItems.reduce((s, a) => s + (a.hs_pct ?? 0), 0) / hsItems.length) : null,
  }
})

// Top agents by match count → win rate + avg score
const topAgents = computed(() => {
  const map: Record<string, { wins: number; total: number; wonTracked: number; scores: number[] }> = {}
  for (const a of analyses.value) {
    if (!a.agent) continue
    if (!map[a.agent]) map[a.agent] = { wins: 0, total: 0, wonTracked: 0, scores: [] }
    map[a.agent].total++
    if (a.won === true) { map[a.agent].wins++; map[a.agent].wonTracked++ }
    else if (a.won === false) map[a.agent].wonTracked++
    if (a.overall_score != null) map[a.agent].scores.push(a.overall_score)
  }
  return Object.entries(map)
    .filter(([, d]) => d.total >= 2 && (d.wonTracked > 0 || d.scores.length > 0))
    .map(([agent, d]) => ({
      agent,
      total: d.total,
      hasWinData: d.wonTracked > 0,
      winRate: d.wonTracked > 0 ? Math.round((d.wins / d.wonTracked) * 100) : 0,
      avgScore: d.scores.length ? Math.round(d.scores.reduce((s, v) => s + v, 0) / d.scores.length) : null,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
})

// Analyses grouped by recency for the match list
const groupedAnalyses = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const groups: { label: string; items: AnalysisItem[] }[] = []
  const todayItems = analyses.value.filter(a => new Date(a.created_at) >= today)
  const yestItems = analyses.value.filter(a => { const d = new Date(a.created_at); return d >= yesterday && d < today })
  const weekItems = analyses.value.filter(a => { const d = new Date(a.created_at); return d >= weekAgo && d < yesterday })
  const olderItems = analyses.value.filter(a => new Date(a.created_at) < weekAgo)
  if (todayItems.length) groups.push({ label: 'Today', items: todayItems })
  if (yestItems.length) groups.push({ label: 'Yesterday', items: yestItems })
  if (weekItems.length) groups.push({ label: 'This week', items: weekItems })
  if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems })
  return groups
})

const quotaPercent = computed(() => {
  const stats = profile.value?.user?.analysis_stats
  if (!stats || !stats.limit) return 0
  return Math.min(100, Math.round((stats.total / stats.limit) * 100))
})

const avgScore = computed<number | null>(() => {
  const scored = analyses.value.filter(a => a.overall_score != null)
  if (!scored.length) return null
  return Math.round(scored.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / scored.length)
})

const scoreTrend = computed<number | null>(() => {
  const scored = analyses.value.filter(a => a.overall_score != null)
  if (scored.length < 2) return null
  const recent = scored.slice(0, Math.ceil(scored.length / 2))
  const older = scored.slice(Math.ceil(scored.length / 2))
  const recentAvg = recent.reduce((s, a) => s + (a.overall_score ?? 0), 0) / recent.length
  const olderAvg = older.reduce((s, a) => s + (a.overall_score ?? 0), 0) / older.length
  const diff = Math.round(recentAvg - olderAvg)
  return diff === 0 ? null : diff
})

const scoreChartData = computed(() => {
  const scored = [...analyses.value].filter(a => a.overall_score != null).reverse().slice(0, 20)
  if (scored.length < 2) return null
  const scores = scored.map(a => a.overall_score!)
  const W = 100, H = 32, pad = 2
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2)
    const y = H - pad - (s / 100) * (H - pad * 2)
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const areaPath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ') +
    ` L ${(pad + (W - pad * 2)).toFixed(1)} ${H} L ${pad} ${H} Z`
  const linePath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ')
  const last = scores[scores.length - 1]
  const up = last >= scores[0]
  return { areaPath, linePath, W, H, up, last }
})

const currentStreak = computed<number>(() => {
  const withResult = analyses.value.filter(a => a.won != null)
  if (!withResult.length) return 0
  const first = withResult[0].won
  let streak = 0
  for (const a of withResult) {
    if (a.won === first) streak++
    else break
  }
  return first ? streak : -streak
})

function scoreGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 78) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'E'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Outstanding'
  if (score >= 78) return 'Strong Game'
  if (score >= 65) return 'Solid'
  if (score >= 50) return 'Room to Improve'
  if (score >= 35) return 'Below Average'
  return 'Lots to Work On'
}

function scoreGradeBadgeClass(score: number): string {
  if (score >= 90) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
  if (score >= 78) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
  if (score >= 65) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
  if (score >= 35) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

function formatEntryDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return dateStr.slice(0, 10)
  }
}

function rrDelta(reversedIndex: number): number {
  const reversed = rrHistory.value.slice().reverse()
  if (reversedIndex >= reversed.length - 1) return 0
  return reversed[reversedIndex].elo - reversed[reversedIndex + 1].elo
}

const recordingModeLabel = computed(() => {
  if (status.value.recording) {
    const queue = status.value.currentQueueMode
    const backend = status.value.recordingBackend === 'ffmpeg' ? 'FFmpeg'
      : status.value.recordingBackend === 'obs' ? 'OBS' : 'Desktop'
    if (queue) return `${formatMode(queue)} · ${backend}`
    return `Recording · ${backend}`
  }
  const modes = status.value.recordedModes
  if (!modes || !modes.length) return 'No modes selected'
  return modes.map(formatMode).join(' · ')
})

let pollInterval: ReturnType<typeof setInterval>
let durationInterval: ReturnType<typeof setInterval>

function updateRecordingElapsed() {
  if (!recordingStartedAt.value) { recordingElapsed.value = ''; return }
  const secs = Math.floor((Date.now() - recordingStartedAt.value) / 1000)
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  recordingElapsed.value = `${m}:${s}`
}

function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function logEntryColor(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('error') || m.includes('fail') || m.includes('crash')) return 'bg-red-500'
  if (m.includes('warn') || m.includes('low') || m.includes('retry')) return 'bg-yellow-500'
  if (m.includes('record') || m.includes('start')) return 'bg-red-400'
  if (m.includes('stop') || m.includes('finish') || m.includes('complet')) return 'bg-green-500'
  if (m.includes('upload') || m.includes('analys')) return 'bg-blue-400'
  if (m.includes('clip') || m.includes('bookmark')) return 'bg-purple-400'
  return 'bg-gray-600'
}

function clearLog() {
  activityLog.value = []
}

async function loadClipCount() {
  clipCount.value = (await window.api.clips.get().catch(() => [] as ClipRecord[])).length
}

onMounted(async () => {
  try {
    const s = await window.api.app.getStatus()
    isDev.value = s.isDev
    platform.value = s.platform ?? ''
    if (!s.authenticated) {
      router.push(s.firstRun ? '/welcome' : '/login')
      return
    }
    status.value = {
      recording: s.recording,
      recordingStarting: false,
      currentGame: s.currentGame,
      waitingForMatch: s.waitingForMatch ?? false,
      ffmpegOk: s.ffmpegOk !== false,
      recordedModes: s.recordedModes ?? [],
      recordingBackend: s.recordingBackend ?? 'desktop',
      currentQueueMode: s.currentQueueMode ?? null,
    }
    if (s.recording) { recordingStartedAt.value = s.recordingStartedAt ?? Date.now() }
  } catch {
    router.push('/login')
    return
  }

  const [prof, recent] = await Promise.all([
    window.api.profile.get().catch(() => null),
    window.api.analyses.get(10).catch(() => [] as AnalysisItem[])
  ])

  profile.value = prof
  profileLoading.value = false

  if (prof?.latest_stats?.player_card_id) {
    playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
  }

  analyses.value = recent
  analysesLoading.value = false

  // Load RR history for sparkline
  rrHistory.value = await window.api.stats.rrHistory().catch(() => [])

  // Load pending (unanalysed) recordings
  pendingRecordings.value = await window.api.recordings.get().catch(() => [])

  // Load activity log history
  activityLog.value = await window.api.app.getActivityLog().catch(() => [])

  // Load hotkey bindings for UI hints
  const hkBindings = await window.api.clips.getHotkeys().catch(() => null) as Record<string, string> | null
  if (hkBindings) hotkeys.value = hkBindings
  await loadClipCount()

  // Load trainer history for quick-start card
  try {
    const hist = await window.api.trainer.getHistory()
    if (hist && hist.sessions.length > 0) {
      const last = hist.sessions[hist.sessions.length - 1]
      trainerLastSession.value = { score: last.score, scenario: last.scenario, date: last.completed_at }
      trainerSessionCount.value = hist.total
    }
  } catch { /* trainer history is optional */ }

  // Load correlation insights (VOD weakness analysis)
  try {
    const insights = await window.api.trainer.getCorrelation()
    if (Array.isArray(insights)) correlationInsights.value = insights
  } catch { /* optional */ }

  // Load last insight from persisted settings
  const savedSettings = await window.api.settings.get().catch(() => null) as ({ lastInsight?: typeof lastInsight.value; trainerMouse?: { game?: string } } | null)
  if (savedSettings?.lastInsight) lastInsight.value = savedSettings.lastInsight
  if (savedSettings?.trainerMouse?.game) userPrimaryGame.value = savedSettings.trainerMouse.game

  // Achievement: first-analysis
  await achievements.load()
  if (savedSettings?.lastInsight?.score) {
    const newAchs = await achievements.check({ hasAnalysis: true })
    if (newAchs.length) window.__ufAchievementUnlocked?.(newAchs)
  }

  pollInterval = setInterval(async () => {
    if (document.hidden) return // skip while Valorant is fullscreen
    try {
      const s = await window.api.app.getStatus()
      const wasRecording = status.value.recording
      status.value = {
        recording: s.recording,
        recordingStarting: status.value.recordingStarting,
        currentGame: s.currentGame,
        waitingForMatch: s.waitingForMatch ?? false,
        ffmpegOk: s.ffmpegOk !== false,
        recordedModes: s.recordedModes ?? [],
        recordingBackend: s.recordingBackend ?? status.value.recordingBackend,
        currentQueueMode: s.currentQueueMode ?? null,
      }
      if (s.recording && !wasRecording) recordingStartedAt.value = Date.now()
      if (!s.recording) { recordingStartedAt.value = null; stopping.value = false }
    } catch { /* ignore */ }
  }, 5000)

  durationInterval = setInterval(updateRecordingElapsed, 1000)

  const ipcCleanup: (() => void)[] = []
  ipcCleanup.push(window.api.on('dashboard:refresh', refreshProfile))
  ipcCleanup.push(window.api.on('dashboard:last-insight', (...args: unknown[]) => {
    lastInsight.value = args[0] as typeof lastInsight.value
  }))
  ipcCleanup.push(window.api.on('recordings:updated', loadPendingRecordings))
  ipcCleanup.push(window.api.on('app:activity-log', (...args: unknown[]) => {
    activityLog.value = args[0] as { time: number; message: string }[]
  }))
  ipcCleanup.push(window.api.on('app:ffmpeg-status', (...args: unknown[]) => {
    const data = args[0] as { ok: boolean }
    status.value = { ...status.value, ffmpegOk: data.ok }
  }))
  ipcCleanup.push(window.api.on('recording:status-changed', (...args: unknown[]) => {
    const data = args[0] as { recording: boolean; error: string | null }
    const wasRecording = status.value.recording
    status.value = { ...status.value, recording: data.recording, recordingStarting: false }
    if (data.recording && !wasRecording) recordingStartedAt.value = Date.now()
    if (!data.recording) { recordingStartedAt.value = null; stopping.value = false }
    if (!data.recording && data.error) {
      console.error('[Dashboard] Recording stopped with error:', data.error)
      warning.value = `Recording stopped: ${data.error}`
      setTimeout(() => { warning.value = null }, 15000)
    }
  }))
  ipcCleanup.push(window.api.on('recording:starting', (...args: unknown[]) => {
    const data = args[0] as { starting: boolean }
    status.value = { ...status.value, recordingStarting: data.starting }
  }))
  ipcCleanup.push(window.api.on('app:warning', (...args: unknown[]) => {
    const data = args[0] as { message: string }
    warning.value = data.message
    setTimeout(() => { warning.value = null }, 12000)
  }))
  ipcCleanup.push(window.api.on('analysis:timeout', () => {
    warning.value = 'Clip analysis timed out — please try re-submitting from the Clips tab.'
    setTimeout(() => { warning.value = null }, 12000)
  }))
  ipcCleanup.push(window.api.on('recording:waiting-for-match', (...args: unknown[]) => {
    const data = args[0] as { waiting: boolean }
    status.value = { ...status.value, waitingForMatch: data.waiting }
  }))
  ipcCleanup.push(window.api.on('auth:session-expired', () => {
    router.push('/login')
  }))
  ipcCleanup.push(window.api.on('app:hotkey-status', (...args: unknown[]) => {
    const data = args[0] as { saveClipRegistered: boolean }
    if (!data.saveClipRegistered) {
      warning.value = 'Clip hotkey (F9) failed to register — another app may be using it.'
      setTimeout(() => { warning.value = null }, 15000)
    }
  }))
  ;(window as Window & { _dashboardIpcCleanup?: (() => void)[] })._dashboardIpcCleanup = ipcCleanup
})

onUnmounted(() => {
  clearInterval(pollInterval)
  clearInterval(durationInterval)
  recordingStartedAt.value = null
  recordingElapsed.value = ''
  const cleanup = (window as Window & { _dashboardIpcCleanup?: (() => void)[] })._dashboardIpcCleanup
  cleanup?.forEach(fn => fn())
  delete (window as Window & { _dashboardIpcCleanup?: (() => void)[] })._dashboardIpcCleanup
})

async function loadAnalyses() {
  analysesLoading.value = true
  try {
    analyses.value = await window.api.analyses.get(10)
  } catch {
    analyses.value = []
  } finally {
    analysesLoading.value = false
  }
}

async function refreshProfile() {
  const prevCount = analyses.value.length
  profileLoading.value = true
  try {
    const prof = await window.api.profile.get()
    profile.value = prof
    if (prof?.latest_stats?.player_card_id) {
      playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
    }
  } catch { /* ignore */ } finally {
    profileLoading.value = false
  }
  await Promise.all([loadAnalyses(), loadClipCount()])
  // Show toast if a new scored analysis appeared
  if (analyses.value.length > prevCount) {
    const newest = analyses.value[0]
    if (newest?.overall_score != null) {
      if (analysisToastTimer) clearTimeout(analysisToastTimer)
      analysisCompleteToast.value = { score: newest.overall_score, agent: newest.agent ?? null }
      analysisToastTimer = setTimeout(() => { analysisCompleteToast.value = null }, 5000)
    }
  }
}

// ─── Forge Rank helpers ───────────────────────────────────────────────────────

const FORGE_RANK_COLORS: Record<number, string> = {
  1: '#9ca3af', // Unforged  — grey
  2: '#f97316', // Kindled   — orange
  3: '#3b82f6', // Tempered  — blue
  4: '#8b5cf6', // Craftsman — purple
  5: '#ec4899', // Artisan   — pink
  6: '#06b6d4', // Ascended  — cyan
  7: '#ef4444', // UpForged  — red
  8: '#eab308', // Legendary — gold
}

const FORGE_RANK_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg,#374151,#1f2937)',
  2: 'linear-gradient(135deg,#c2410c,#92400e)',
  3: 'linear-gradient(135deg,#1d4ed8,#1e3a8a)',
  4: 'linear-gradient(135deg,#7c3aed,#4c1d95)',
  5: 'linear-gradient(135deg,#db2777,#9d174d)',
  6: 'linear-gradient(135deg,#0891b2,#164e63)',
  7: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
  8: 'linear-gradient(135deg,#d97706,#78350f)',
}

function forgeRankColor(tier: number): string {
  return FORGE_RANK_COLORS[tier] ?? '#9ca3af'
}

function forgeRankGradient(tier: number): string {
  return FORGE_RANK_GRADIENTS[tier] ?? FORGE_RANK_GRADIENTS[1]
}

function forgeRankInitial(tierName: string): string {
  return tierName.charAt(0).toUpperCase()
}

async function triggerPrestige() {
  try {
    await window.api.forgeRank.prestige()
    await refreshProfile()
  } catch {
    // ignore
  }
}

async function loadPendingRecordings() {
  pendingRecordings.value = await window.api.recordings.get().catch(() => [])
}

async function analyseRecording(id: string) {
  if (analysingIds.value.has(id)) return

  // Quota gate — prevent upload if user has no analyses remaining
  const stats = profile.value?.user?.analysis_stats
  if (stats && (stats.limit - stats.total) <= 0) {
    warning.value = 'No analyses remaining this month.'
    upgradeNeeded.value = true
    // Sticky — user must dismiss manually, and they can upgrade
    return
  }

  analysingIds.value.add(id)
  analysingIds.value = new Set(analysingIds.value) // trigger reactivity
  try {
    await window.api.recordings.analyse(id)
    // Remove from pending list — will come back as an analysis via dashboard:refresh
    pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
  } catch {
    analysingIds.value.delete(id)
    analysingIds.value = new Set(analysingIds.value)
  }
}

async function dismissRecording(id: string) {
  await window.api.recordings.dismiss(id).catch(() => {})
  pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
}

// formatMode is an alias of the shared formatGameMode from valorant.ts
const formatMode = formatGameMode

async function stopRecording() {
  if (stopping.value) return
  stopping.value = true
  try {
    const result = await window.api.recorder.stop()
    if (!result.ok) {
      const msg = result.reason === 'not_recording'
        ? 'Nothing is recording right now.'
        : result.reason === 'already_handled'
          ? 'This match was already finished.'
          : `Could not end match: ${result.reason ?? 'unknown error'}`
      warning.value = msg
      setTimeout(() => { warning.value = null }, 12000)
      stopping.value = false
      return
    }
    status.value = { ...status.value, recording: false, recordingStarting: false, currentQueueMode: null }
    recordingStartedAt.value = null
  } catch {
    warning.value = 'Could not end the match — try again or finish the game normally.'
    setTimeout(() => { warning.value = null }, 12000)
    stopping.value = false
  }
}

function simulateGame(game: string, durationMs: number) {
  simulating.value = true
  simStatus.value = `Simulating ${game} for ${durationMs / 1000}s...`
  window.api.dev.simulateGame(game, durationMs)
  setTimeout(() => { simulating.value = false; simStatus.value = 'Done' }, durationMs + 500)
}

function openAnalysis(id: number) { window.open(`https://upforge.gg/valorant/results/${id}`, '_blank') }

const WEAKNESS_TO_SCENARIO_DASH: Record<string, string> = {
  flick: 'flick', 'one tap': 'flick', reflex: 'flick', headshot: 'flick',
  accuracy: 'flick', 'first shot': 'flick', aim: 'flick', click: 'flick',
  track: 'tracking', moving: 'tracking', movement: 'tracking', smooth: 'tracking',
  spray: 'microadjust', recoil: 'microadjust', control: 'microadjust',
  crosshair: 'switching', placement: 'switching', switching: 'switching',
  rotate: 'switching', retake: 'switching',
}

async function trainLastInsight() {
  if (!lastInsight.value || lastInsightTraining.value) return
  lastInsightTraining.value = true
  try {
    const text = lastInsight.value.text.toLowerCase()
    let scenario = 'flick'
    for (const [keyword, s] of Object.entries(WEAKNESS_TO_SCENARIO_DASH)) {
      if (text.includes(keyword)) { scenario = s; break }
    }
    await window.api.trainer.launch({ scenario, difficulty: 'medium', duration: 60 })
  } catch (e) {
    console.error('[Dashboard] Trainer launch failed:', e)
  } finally {
    lastInsightTraining.value = false
  }
}
function openBrowser() { window.open('https://upforge.gg/valorant/history', '_blank') }

const timelineLoadingId = ref<number | null>(null)

async function openTimeline(id: number) {
  timelineLoadingId.value = id
  try {
    const data = await window.api.analyses.getTimeline(id)
    if (!data) return
    pendingTimeline.value = data
    router.push({ path: '/vod-review', query: { timelineId: id } })
  } finally {
    timelineLoadingId.value = null
  }
}
function openRiotSettings() { window.open('https://upforge.gg/settings/profile', '_blank') }
function openUpgrade() { window.open('https://upforge.gg/pricing', '_blank') }

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}
</script>

<style scoped>
.banner-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.banner-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.banner-slide-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.banner-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes idleBreathe {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50%       { opacity: 0.7; transform: scale(1.4); }
}

.idle-breathe {
  animation: idleBreathe 2.5s ease-in-out infinite;
}

@keyframes recPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}

.rec-pulse {
  animation: recPulse 1.2s ease-in-out infinite;
}

/* Stat numbers slide up on mount */
@keyframes statEnter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stat-number {
  animation: statEnter 0.4s ease-out both;
}

/* Score glows in coaching panel */
@keyframes scoreGlow {
  0%, 100% { filter: brightness(1); }
  50%       { filter: brightness(1.15); }
}
.score-glow {
  animation: scoreGlow 3s ease-in-out infinite;
}

/* Score bar fills on mount */
@keyframes scoreBarFill {
  from { width: 0; }
}
.score-bar {
  animation: scoreBarFill 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Highlights bar */
.highlights-bar {
  background: linear-gradient(135deg, rgba(249,115,22,0.07), rgba(255,70,85,0.05));
  border: 1px solid rgba(249,115,22,0.18);
}

/* Train CTA button */
.cta-train {
  background: linear-gradient(135deg, rgba(255,70,85,0.25), rgba(220,38,38,0.2));
  border: 1px solid rgba(255,70,85,0.35);
  box-shadow: 0 0 16px rgba(255,70,85,0.1);
  transition: all 0.2s ease;
}
.cta-train:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(255,70,85,0.35), rgba(220,38,38,0.3));
  box-shadow: 0 0 22px rgba(255,70,85,0.22);
  border-color: rgba(255,70,85,0.5);
}
</style>
