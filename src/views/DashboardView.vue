<template>
  <div class="h-full flex flex-col overflow-hidden">

    <!-- Warning banner (full-width, conditional) -->
    <Transition name="banner-slide">
      <div
        v-if="paymentPastDue"
        class="flex-shrink-0 mx-4 mt-3 relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/25 overflow-hidden"
      >
        <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-red-400 to-red-600 rounded-l-xl" />
        <div class="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <span class="text-xs text-red-300/90 flex-1 leading-snug">
          Your last payment failed — update your card to keep your subscription active.
        </span>
        <button
          class="flex-shrink-0 text-xs font-semibold text-red-200 hover:text-white transition-colors border border-red-500/30 rounded-lg px-2 py-1 disabled:opacity-60"
          :disabled="billingPortalLoading"
          @click="openBillingPortal"
        >
          {{ billingPortalLoading ? 'Opening…' : 'Fix payment' }}
        </button>
      </div>
    </Transition>

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
        <button v-if="warningAction" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="goWarningAction">{{ warningAction.label }}</button>
        <button v-if="upgradeNeeded" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="openPpa">Buy one</button>
        <button v-if="upgradeNeeded" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="openUpgrade">Upgrade</button>
        <button class="w-5 h-5 flex items-center justify-center text-orange-500/50 hover:text-orange-300/70 transition-colors rounded flex-shrink-0" :class="{ 'ml-auto': !upgradeNeeded && !warningAction }" @click="warning = null; warningAction = null; upgradeNeeded = false">
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

    <!-- macOS preview notice -->
    <Transition name="banner-slide">
      <div
        v-if="showMacPreviewBanner"
        class="flex-shrink-0 mx-4 mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-500/[0.07] border border-blue-500/25"
      >
        <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-blue-200">macOS preview mode</p>
          <p class="text-[11px] text-blue-300/70 mt-0.5">Match recording and game detection require Windows. You can still review analyses, clips, and training on Mac.</p>
        </div>
        <button class="flex-shrink-0 text-[11px] font-medium text-blue-300/80 hover:text-blue-200 transition-colors px-2 py-1 rounded-lg hover:bg-blue-500/10" @click="dismissMacPreviewBanner">Dismiss</button>
      </div>
    </Transition>

    <!-- Unified status + quick stats bar -->
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
          <div v-if="isValorant" class="flex flex-col items-center justify-center py-2 px-3.5 gap-0.5 min-w-[4.25rem]">
            <span class="text-sm font-black tabular-nums" :class="currentStreak > 0 ? 'text-green-400' : currentStreak < 0 ? 'text-red-400' : 'text-white'">{{ currentStreak !== 0 ? (currentStreak > 0 ? '+' : '') + currentStreak : '—' }}</span>
            <span class="text-[8px] text-gray-600 uppercase tracking-wide">Streak</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3-column dashboard grid -->
    <div class="flex-1 min-h-0 px-4 pb-4 pt-3 overflow-hidden">
      <div class="h-full grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px] gap-3 min-h-0 items-start">

      <!-- ═══════════ LEFT: Player card ═══════════ -->
      <div class="flex flex-col gap-3 min-w-0 w-full self-start max-h-full overflow-y-auto scroll-col">

        <!-- Player hero card -->
        <div v-if="profile" class="panel-elevated overflow-hidden flex-shrink-0">
          <div class="px-4 pt-4 pb-3">
            <div class="flex items-start gap-3">
              <!-- Avatar -->
              <div class="relative flex-shrink-0">
                <img v-if="isValorant && playerCardUrl" :src="playerCardUrl" class="w-14 h-14 rounded-xl object-cover" @error="playerCardUrl = ''" />
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
                    :class="['px-1.5 py-px rounded text-[9px] font-bold uppercase flex items-center gap-0.5', getTierBadgeClass(getDisplayTier(profile.user.tier))]"
                  >
                    <img
                      v-if="getSubscriptionIconUrl(getDisplayTier(profile.user.tier))"
                      :src="getSubscriptionIconUrl(getDisplayTier(profile.user.tier))!"
                      :alt="getTierBadgeLabel(getDisplayTier(profile.user.tier))"
                      class="w-3.5 h-3.5 object-contain"
                    />
                    {{ getTierBadgeLabel(getDisplayTier(profile.user.tier)) }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-px leading-tight">
                  <span v-if="isCs2" class="text-orange-300/80">CS2 · demo analysis &amp; VOD coaching</span>
                  <span v-else-if="isDeadlock" class="text-teal-300/80">Deadlock · replay analysis</span>
                  <span v-else-if="profile.user.riot_name">{{ profile.user.riot_name }}#{{ profile.user.riot_tag }}</span>
                  <button v-else class="text-red-400/70 hover:text-red-400 transition-colors" @click="openRiotSettings">Link Riot ID →</button>
                </p>
                <div v-if="isValorant && profile.latest_stats?.current_rank" class="mt-1.5">
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
          <template v-if="isValorant && profile.latest_stats">
            <div class="grid grid-cols-4 divide-x divide-white/[0.04] border-t border-white/[0.07]">
              <div class="flex flex-col items-center py-2.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.kd_ratio != null ? (profile.latest_stats.kd_ratio >= 1.2 ? 'text-green-400' : profile.latest_stats.kd_ratio >= 0.8 ? 'text-white' : 'text-red-400') : 'text-gray-600'">{{ profile.latest_stats.kd_ratio?.toFixed(2) ?? '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-1">K/D</span>
              </div>
              <div class="flex flex-col items-center py-2.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.win_rate != null ? (profile.latest_stats.win_rate >= 52 ? 'text-green-400' : profile.latest_stats.win_rate >= 45 ? 'text-white' : 'text-red-400') : 'text-gray-600'">{{ profile.latest_stats.win_rate != null ? Math.round(profile.latest_stats.win_rate) + '%' : '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-1">Win</span>
              </div>
              <div class="flex flex-col items-center py-2.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.avg_combat_score != null ? (profile.latest_stats.avg_combat_score >= 220 ? 'text-orange-400' : profile.latest_stats.avg_combat_score >= 160 ? 'text-white' : 'text-gray-300') : 'text-gray-600'">{{ profile.latest_stats.avg_combat_score ?? '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-1">ACS</span>
              </div>
              <div class="flex flex-col items-center py-2.5">
                <span class="text-lg font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.headshot_percentage != null ? (profile.latest_stats.headshot_percentage >= 25 ? 'text-orange-400' : profile.latest_stats.headshot_percentage >= 18 ? 'text-white' : 'text-gray-400') : 'text-gray-600'">
                  {{ profile.latest_stats.headshot_percentage != null ? Math.round(profile.latest_stats.headshot_percentage) + '%' : '—' }}
                </span>
                <span class="text-[10px] text-gray-600 mt-1">HS%</span>
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
          <div v-else-if="isValorant" class="px-4 pb-3 pt-1">
            <button class="text-xs text-gray-600 hover:text-gray-400 transition-colors" @click="openRiotSettings">No stats yet — link your Riot ID</button>
          </div>
          <div v-else-if="isCs2" class="px-4 pb-3 pt-1 space-y-1">
            <p class="text-xs text-gray-600 leading-relaxed">
              Link your <button class="text-orange-400/80 hover:text-orange-300 transition-colors" @click="openAccountSetup">FACEIT username</button> on the web, or upload demos for AI coaching.
            </p>
            <p v-if="onboardingTargetRank" class="text-[10px] text-gray-600">
              Goal: <span class="text-orange-300/90 font-semibold">{{ onboardingTargetRank }}</span>
            </p>
          </div>
          <div v-else-if="isDeadlock" class="px-4 pb-3 pt-1 space-y-1">
            <p class="text-xs text-gray-600 leading-relaxed">
              <button class="text-teal-400/80 hover:text-teal-300 transition-colors" @click="openAccountSetup">Link Steam by display name</button> on the web to sync rank &amp; match history.
            </p>
            <p v-if="onboardingTargetRank" class="text-[10px] text-gray-600">
              Goal: <span class="text-teal-300/90 font-semibold">{{ onboardingTargetRank }}</span>
            </p>
          </div>

          <!-- Payment failed -->
          <div v-if="paymentPastDue" class="px-4 py-3 border-t border-white/[0.07]">
            <PaymentFailedAlert @error="showBillingError" />
          </div>

          <!-- Quota -->
          <div v-if="profile.user.analysis_stats" class="px-4 py-2.5 border-t border-white/[0.07] space-y-2">
            <div class="flex items-center gap-3">
              <span class="text-[10px] text-gray-600 shrink-0 w-14">Analyses</span>
              <template v-if="isAdmin">
                <div class="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div class="h-full w-full rounded-full bg-green-500" />
                </div>
                <span class="text-xs font-medium tabular-nums shrink-0 text-gray-400">∞</span>
              </template>
              <template v-else-if="profile.user.analysis_stats.limit != null">
                <div class="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="quotaPercent >= 80 ? 'bg-red-500' : quotaPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'" :style="{ width: (100 - quotaPercent) + '%' }" />
                </div>
                <span class="text-xs font-medium tabular-nums shrink-0" :class="(profile.user.analysis_stats.limit - profile.user.analysis_stats.total) <= 0 ? 'text-red-400' : 'text-gray-400'">
                  {{ Math.max(0, profile.user.analysis_stats.limit - profile.user.analysis_stats.total) }}/{{ profile.user.analysis_stats.limit }}
                </span>
              </template>
            </div>
            <div v-if="profile.user.archive_stats?.limit != null" class="flex items-center gap-3">
              <span class="text-[10px] text-gray-600 shrink-0 w-14">Cloud</span>
              <div class="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all bg-emerald-500/80" :style="{ width: archiveQuotaPercent + '%' }" />
              </div>
              <span class="text-xs font-medium tabular-nums shrink-0 text-gray-400">
                {{ profile.user.archive_stats.remaining ?? 0 }}/{{ profile.user.archive_stats.limit }}
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="profileLoading" class="h-52 bg-white/[0.02] rounded-2xl animate-pulse border border-white/[0.07] flex-shrink-0" />
        <div v-else class="bg-white/[0.02] border border-white/[0.10] rounded-2xl p-4 flex-shrink-0">
          <p class="text-xs text-gray-600">No profile loaded</p>
        </div>

        <PanelCarousel
          v-if="leftInsightPanels.length"
          v-model:index="leftInsightIndex"
          :panels="leftInsightPanels"
        >
          <template #default="{ panel }">
            <template v-if="panel">
            <!-- Mastery -->
            <div v-if="panel.id === 'mastery' && profile?.user.forge_rank" class="pt-0.5">
              <div class="flex items-center gap-2.5">
                <div
                  class="relative flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                  :style="getMasteryIconUrl(profile.user.forge_rank.level) ? undefined : { background: forgeRankGradient(profile.user.forge_rank.tier) }"
                >
                  <img
                    v-if="getMasteryIconUrl(profile.user.forge_rank.level)"
                    :src="getMasteryIconUrl(profile.user.forge_rank.level)!"
                    :alt="profile.user.forge_rank.rank_name"
                    class="w-full h-full object-contain"
                  />
                  <span v-else class="text-sm font-black text-white select-none">{{ forgeRankInitial(profile.user.forge_rank.tier_name) }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-black leading-tight" :style="{ color: forgeRankColor(profile.user.forge_rank.tier) }">{{ profile.user.forge_rank.rank_name }}</p>
                  <p class="text-[9px] text-gray-600">{{ profile.user.forge_rank.xp.toLocaleString() }} XP</p>
                  <div class="mt-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all" :style="{ width: profile.user.forge_rank.progress_pct + '%', background: forgeRankColor(profile.user.forge_rank.tier) }" />
                  </div>
                </div>
                <span v-if="profile.user.forge_rank.prestige_stars > 0" class="text-[10px] font-bold text-yellow-400 tabular-nums">★{{ profile.user.forge_rank.prestige_stars }}</span>
              </div>
              <button
                v-if="profile.user.forge_rank.can_prestige"
                class="mt-2 w-full text-[10px] font-bold text-yellow-400 hover:text-yellow-300 py-1 rounded-lg bg-yellow-400/10"
                @click="triggerPrestige"
              >Prestige available →</button>
            </div>

            <!-- AI score trend -->
            <div v-else-if="panel.id === 'score' && scoreChartData" class="pt-0.5">
              <div class="flex items-center justify-between mb-1.5">
                <span v-if="scoreTrend !== null" class="text-xs font-bold" :class="scoreTrend >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ scoreTrend >= 0 ? '↑' : '↓' }} {{ Math.round(Math.abs(scoreTrend) * 10) }} pts
                </span>
                <span v-if="avgScore !== null" class="text-[10px] text-gray-600 ml-auto">avg {{ avgScore * 10 }}</span>
              </div>
              <svg width="100%" :viewBox="`0 0 ${scoreChartData.W} ${scoreChartData.H}`" preserveAspectRatio="none" class="h-9 block">
                <defs>
                  <linearGradient id="dash-score-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" :stop-color="scoreChartData.up ? '#4ade80' : '#f87171'" stop-opacity="0.35"/>
                    <stop offset="100%" :stop-color="scoreChartData.up ? '#4ade80' : '#f87171'" stop-opacity="0"/>
                  </linearGradient>
                </defs>
                <path :d="scoreChartData.areaPath" fill="url(#dash-score-area-grad)" />
                <path :d="scoreChartData.linePath" fill="none" :stroke="scoreChartData.up ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <!-- Agent win rates -->
            <div v-else-if="panel.id === 'agents'" class="space-y-1.5 pt-0.5">
              <div v-for="ag in topAgents.slice(0, 4)" :key="ag.agent" class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center" :style="{ backgroundColor: getAgentColor(ag.agent) + '22' }">
                  <img v-if="getAgentImage(ag.agent)" :src="getAgentImage(ag.agent)" class="w-5 h-5 object-contain" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold truncate">{{ ag.agent }}</span>
                    <span class="text-[9px] font-bold tabular-nums" :class="ag.hasWinData ? (ag.winRate >= 55 ? 'text-green-400' : ag.winRate >= 45 ? 'text-gray-300' : 'text-red-400') : 'text-gray-600'">
                      {{ ag.hasWinData ? ag.winRate + '%' : '—' }}
                    </span>
                  </div>
                  <div class="h-0.5 bg-white/[0.06] rounded-full overflow-hidden mt-0.5">
                    <div class="h-full rounded-full" :class="ag.hasWinData ? (ag.winRate >= 55 ? 'bg-green-500' : ag.winRate >= 45 ? 'bg-gray-500' : 'bg-red-500') : 'bg-orange-500/60'" :style="{ width: (ag.hasWinData ? ag.winRate : (ag.avgScore ?? 0)) + '%' }" />
                  </div>
                </div>
              </div>
            </div>
            </template>
          </template>
        </PanelCarousel>

        <!-- Dev tools -->
        <div v-if="isDev || (platform && platform !== 'win32')" class="border border-dashed border-yellow-500/20 rounded-xl overflow-hidden flex-shrink-0">
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
      <div class="flex flex-col gap-2 min-h-0 h-full max-h-full self-stretch w-full min-w-0 overflow-hidden">

        <!-- CS2 FACEIT + demos -->
        <CS2StatsPanel v-if="isCs2" class="flex-shrink-0" />
        <CS2SetupPanel v-if="isCs2" class="flex-shrink-0" />

        <!-- Deadlock stats panel (Steam-linked stats) -->
        <DeadlockStatsPanel v-if="isDeadlock" class="flex-shrink-0" />

        <!-- Deadlock demo upload panel -->
        <DeadlockDemoPanel v-if="isDeadlock" class="flex-shrink-0" />

        <!-- Recent analyses panel -->
        <div class="flex-1 min-h-0 flex flex-col panel-elevated overflow-hidden">
          <div class="flex items-center justify-between flex-shrink-0 px-3 pt-2.5 pb-2 border-b border-white/[0.07]">
            <div class="flex items-center gap-2.5 min-w-0">
              <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Analyses</h2>
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

          <!-- In-progress sessions (pending upload, analysing, or clips-only) -->
          <template v-if="pendingRecordings.length > 0">
            <div class="flex items-center gap-2 px-0.5 mb-1">
              <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">In progress</span>
              <span class="text-[10px] text-blue-500/70 bg-blue-500/10 px-1.5 py-px rounded-full">{{ pendingRecordings.length }}</span>
              <button
                v-if="bulkUploadablePending.length > 1"
                type="button"
                class="ml-auto text-[10px] font-medium text-blue-400/80 hover:text-blue-300 transition-colors disabled:opacity-50"
                :disabled="bulkUploading"
                @click="uploadAllPending"
              >{{ bulkUploading ? 'Saving…' : 'Save all to cloud' }}</button>
            </div>
            <div
              v-for="rec in pendingRecordings"
              :key="rec.id"
              class="pending-row relative flex items-center gap-2 sm:gap-3 px-3 py-2.5 bg-blue-500/[0.04] hover:bg-blue-500/[0.06] border border-blue-500/[0.12] hover:border-blue-500/25 rounded-xl transition-all"
            >
              <div v-if="recordingRowStats(rec).won != null" class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" :class="recordingRowStats(rec).won ? 'bg-green-500' : 'bg-red-500'" />
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
                  <span v-if="rec.cloudArchived" class="text-emerald-500/80"> · In cloud</span>
                  <span v-if="isDisplayableGameMode(rec.gameMode)" class="text-gray-700"> · {{ formatMode(rec.gameMode) }}</span>
                  <span v-if="recordingPipelineLabel(rec)" class="text-blue-400/90"> · {{ recordingPipelineLabel(rec) }}</span>
                </p>
              </div>
              <div class="hidden md:flex items-center justify-center gap-3 lg:gap-4 flex-shrink-0 px-1">
                <span v-if="recordingRowStats(rec).won != null" class="text-[10px] font-black px-2 py-0.5 rounded w-7 text-center" :class="recordingRowStats(rec).won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">{{ recordingRowStats(rec).won ? 'W' : 'L' }}</span>
                <span v-else class="text-[10px] text-gray-700 w-7 text-center">—</span>
                <span v-if="recordingRowStats(rec).kills != null" class="w-[4.5rem] text-xs font-mono font-semibold tabular-nums text-center">{{ recordingRowStats(rec).kills }}<span class="text-gray-600">/</span>{{ recordingRowStats(rec).deaths }}<span class="text-gray-600">/</span>{{ recordingRowStats(rec).assists }}</span>
                <span v-else class="w-[4.5rem] text-[10px] text-gray-700 text-center">—</span>
                <span v-if="recordingRowStats(rec).combat_score != null" class="w-10 text-xs font-bold tabular-nums text-gray-300 text-center">{{ recordingRowStats(rec).combat_score }}</span>
                <span v-else class="w-10 text-[10px] text-gray-700 text-center">—</span>
                <span v-if="recordingRowStats(rec).hs_pct != null" class="w-10 text-xs font-bold tabular-nums text-center" :class="recordingRowStats(rec).hs_pct! >= 25 ? 'text-orange-400' : 'text-gray-400'">{{ recordingRowStats(rec).hs_pct }}%</span>
                <span v-else class="w-10 text-[10px] text-gray-700 text-center">—</span>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0 ml-1">
                <button v-if="rec.clipsOnly" class="px-2 py-1 text-[10px] font-medium text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-lg transition-colors" @click="openClipsForSession(rec)">View clips</button>
                <button v-else-if="rec.timeline?.playerKills?.length || rec.timeline?.playerDeaths?.length" class="px-2 py-1 text-[10px] font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors" @click="openRecordingReview(rec)">Review</button>
                <button
                  v-if="!rec.clipsOnly && !rec.cloudArchived && !isRecordingInFlight(rec)"
                  :disabled="savingIds.has(rec.id)"
                  class="px-2 py-1 text-[10px] font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-60 rounded-lg transition-colors"
                  @click="saveRecording(rec.id)"
                >{{ savingIds.has(rec.id) ? '…' : 'Save' }}</button>
                <button
                  v-if="!rec.clipsOnly && !isRecordingInFlight(rec)"
                  :disabled="analysingIds.has(rec.id)"
                  class="px-2 py-1 text-[10px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1"
                  @click="analyseRecording(rec.id)"
                >
                  <svg v-if="analysingIds.has(rec.id)" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  {{ analysingIds.has(rec.id) ? '…' : 'Analyse' }}
                </button>
                <span v-if="isRecordingInFlight(rec)" class="px-2 py-1 text-[10px] font-medium text-blue-300/90 flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  {{ recordingPipelineLabel(rec) || 'Working…' }}
                </span>
                <button class="p-1 text-gray-600 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" title="Dismiss" @click="dismissRecording(rec.id)">
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
          <div v-else-if="dashboardAnalyses.length === 0 && pendingRecordings.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
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
      </div>

      <!-- ═══════════ RIGHT: Coaching + Training + Activity ═══════════ -->
      <div class="flex flex-col gap-2 min-w-0 w-full self-start max-h-full overflow-y-auto scroll-col">

        <div v-if="clipCount === 0" class="relative overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02] px-3 py-2 flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/[0.10] text-orange-300 flex-shrink-0">
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 7.5A2.25 2.25 0 015.25 5.25h2.379a1.5 1.5 0 001.06-.44l.621-.62a1.5 1.5 0 011.06-.44h3.26a1.5 1.5 0 011.06.44l.621.62a1.5 1.5 0 001.06.44h2.379A2.25 2.25 0 0121 7.5v9A2.25 2.25 0 0118.75 18.75H5.25A2.25 2.25 0 013 16.5v-9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12a3 3 0 116 0 3 3 0 01-6 0z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] font-bold text-white">Clip Library</p>
              <p class="text-[10px] text-gray-600 leading-snug">Save clips with your hotkey during matches</p>
            </div>
            <button class="flex-shrink-0 px-2 py-1 text-[10px] font-semibold text-gray-400 hover:text-white border border-white/[0.09] rounded-lg transition-colors" @click="router.push('/settings')">Settings</button>
          </div>
        </div>

        <!-- Last coaching insight (pinned) -->
        <div v-if="isValorant && lastInsight" class="relative panel-elevated overflow-hidden flex-shrink-0">
          <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ff4655] to-orange-600 rounded-l-xl" />
          <div class="pl-4 pr-3 py-2.5 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[9px] font-bold uppercase tracking-widest text-gray-600">Last Coaching</span>
              <span v-if="lastInsight.date" class="text-[9px] text-gray-700">{{ formatRelativeTime(lastInsight.date) }}</span>
            </div>
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center" :style="lastInsight.agent ? { backgroundColor: getAgentColor(lastInsight.agent) + '22' } : { backgroundColor: 'rgba(255,70,85,0.1)' }">
                <img v-if="lastInsight.agent && getAgentImage(lastInsight.agent)" :src="getAgentImage(lastInsight.agent)" class="w-full h-full object-cover object-top" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-1">
                  <span class="text-2xl font-black tabular-nums leading-none" :class="lastInsight.score >= 78 ? 'text-green-400' : lastInsight.score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ lastInsight.score * 10 }}</span>
                  <span class="text-[9px] font-black px-1 py-px rounded-full" :class="scoreGradeBadgeClass(lastInsight.score)">{{ scoreGrade(lastInsight.score) }}</span>
                </div>
              </div>
              <button v-if="lastInsight.analysisId" class="text-[10px] text-gray-600 hover:text-gray-300" @click="openAnalysis(lastInsight.analysisId!)">↗</button>
            </div>
            <p class="text-[11px] text-gray-400 leading-snug line-clamp-2">{{ lastInsight.text }}</p>
            <button :disabled="lastInsightTraining" class="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 text-white cta-train" @click="trainLastInsight">
              {{ lastInsightTraining ? 'Launching…' : 'Train This Weakness' }}
            </button>
          </div>
        </div>

        <div v-else class="relative bg-white/[0.02] border border-white/[0.09] rounded-xl overflow-hidden flex-shrink-0">
          <div class="pl-3 pr-2.5 py-2 flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border" :class="isCs2 ? 'bg-orange-500/10 border-orange-500/20' : isDeadlock ? 'bg-teal-500/10 border-teal-500/20' : 'bg-red-500/10 border-red-500/20'">
              <svg class="w-3.5 h-3.5" :class="isCs2 ? 'text-orange-400/60' : isDeadlock ? 'text-teal-400/60' : 'text-red-400/60'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] font-semibold text-gray-400">{{ emptyCoachingTitle }}</p>
              <p class="text-[10px] text-gray-600 leading-snug">{{ emptyCoachingMessage }}</p>
            </div>
            <button class="flex-shrink-0 px-2 py-1 text-[10px] font-semibold text-gray-400 hover:text-white border border-white/[0.09] rounded-lg transition-colors" @click="openEmptyCoachingAction">{{ emptyCoachingAction }}</button>
          </div>
        </div>

        <!-- Rotating coaching / skills / training panels -->
        <PanelCarousel
          v-if="rightInsightPanels.length"
          v-model:index="rightInsightIndex"
          :panels="rightInsightPanels"
        >
          <template #default="{ panel }">
            <template v-if="panel">
            <!-- Playstyle -->
            <div v-if="panel.id === 'playstyle' && playstyleProfile" class="space-y-2 pt-0.5">
              <div class="flex items-center justify-between">
                <span class="text-[9px] text-gray-600 tabular-nums">{{ playstyleProfile.matches_tracked }} matches</span>
                <button type="button" class="text-[9px] text-gray-600 hover:text-gray-300" @click="openPlaystyleProfile">View →</button>
              </div>
              <ul v-if="playstyleProfile.focus_areas?.length" class="space-y-1.5">
                <li v-for="area in playstyleProfile.focus_areas.slice(0, 2)" :key="area.id" class="flex items-start gap-1.5">
                  <span class="mt-1 w-1 h-1 rounded-full flex-shrink-0" :class="area.severity === 'high' ? 'bg-red-400' : area.severity === 'medium' ? 'bg-yellow-400' : 'bg-gray-500'" />
                  <p class="text-[10px] text-gray-400 leading-snug">{{ area.text }}</p>
                </li>
              </ul>
              <p v-else class="text-[10px] text-gray-500 leading-snug">
                {{ playstyleProfile.matches_tracked < 3 ? `${3 - playstyleProfile.matches_tracked} more games for focus areas` : 'View economy & util trends on web' }}
              </p>
            </div>

            <!-- Skills + coach -->
            <div v-else-if="panel.id === 'skills' && skillProfile" class="space-y-2 pt-0.5">
              <SkillProfileBars :profile="skillProfile" :previous="skillProfilePrevious" :rank-name="playerRankName" compact />
              <CoachMemoryCard :profile="skillProfile" :focus-areas="playstyleProfile?.focus_areas" />
            </div>

            <!-- Goals (CS2 / Deadlock) -->
            <div v-else-if="panel.id === 'goals'" class="space-y-2 pt-0.5">
              <p v-if="onboardingTargetRank" class="text-[11px] text-gray-300 flex items-center gap-2">
                <img v-if="goalsRankIcon" :src="goalsRankIcon" alt="" class="w-5 h-5 object-contain flex-shrink-0" />
                <span>Target: <span class="font-bold" :class="isCs2 ? 'text-orange-300' : 'text-teal-300'">{{ onboardingTargetRank }}</span></span>
              </p>
              <div v-if="onboardingWeaknesses.length" class="flex flex-wrap gap-1">
                <span v-for="w in onboardingWeaknesses.slice(0, 4)" :key="w" class="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] text-gray-500 border border-white/[0.06]">{{ w }}</span>
              </div>
            </div>

            <!-- Correlation insights -->
            <ul v-else-if="panel.id === 'impact'" class="space-y-1.5 pt-0.5">
              <li v-for="(insight, i) in correlationInsights.slice(0, 3)" :key="i" class="flex items-start gap-1.5">
                <span class="mt-1 w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                <p class="text-[10px] text-gray-400 leading-snug line-clamp-2">{{ insight }}</p>
              </li>
            </ul>

            <!-- Aim training -->
            <div v-else-if="panel.id === 'training'" class="space-y-2 pt-0.5">
              <template v-if="trainerLastSession">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 text-orange-400">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/></svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-semibold capitalize">{{ trainerLastSession.scenario }}</p>
                    <p class="text-[9px] text-gray-600">{{ formatRelativeTime(trainerLastSession.date) }}</p>
                  </div>
                  <span class="text-base font-black tabular-nums" :class="trainerLastSession.score >= 78 ? 'text-green-400' : trainerLastSession.score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ trainerLastSession.score }}</span>
                </div>
                <p v-if="trainerSessionCount > 1" class="text-[9px] text-gray-700 text-center">{{ trainerSessionCount }} sessions total</p>
              </template>
              <p v-else class="text-[10px] text-gray-600">No aim sessions yet — warm up before ranked.</p>
              <button class="w-full py-1.5 text-[11px] font-semibold text-white/80 hover:text-white rounded-lg transition-all" style="background:linear-gradient(135deg,rgba(251,146,60,0.15),rgba(234,88,12,0.15));border:1px solid rgba(251,146,60,0.2)" @click="router.push('/training')">
                {{ trainerLastSession ? 'Continue →' : 'Start Training →' }}
              </button>
            </div>
            </template>
          </template>
        </PanelCarousel>

        <!-- Activity log (compact) -->
        <div v-if="activityLog.length" class="bg-white/[0.02] border border-white/[0.10] rounded-xl overflow-hidden flex-shrink-0">
          <div class="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.07]">
            <span class="text-[9px] font-bold uppercase tracking-widest text-gray-600">Activity</span>
            <button class="w-4 h-4 flex items-center justify-center text-gray-700 hover:text-gray-400 transition-colors" @click="clearLog">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="py-1 max-h-24 overflow-y-auto scroll-col">
            <div v-for="entry in [...activityLog].reverse().slice(0, 5)" :key="entry.time" class="flex items-center gap-2 px-3 py-0.5">
              <div :class="['w-1 h-1 rounded-full flex-shrink-0', logEntryColor(entry.message)]" />
              <span class="text-[9px] text-gray-700 tabular-nums flex-shrink-0 font-mono">{{ formatLogTime(entry.time) }}</span>
              <span class="text-[9px] text-gray-500 truncate">{{ entry.message }}</span>
            </div>
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
import { getAgentImage, getAgentRole, getAgentColor, getMapMinimap, getRankHexColor, getRankIconUrl, getRoleColor, getTierBadgeClass, getTierBadgeLabel, getDisplayTier, formatGameMode, isDisplayableGameMode, normalizeCombatScoreToAcs } from '../lib/valorant'
import { getMasteryIconUrl, getSubscriptionIconUrl } from '../lib/rank-assets'
import { hasAnalysisQuotaRemaining, hasArchiveQuotaRemaining, isPlatformAdmin } from '../lib/tier-features'
import { pendingTimeline } from '../stores/pendingTimeline'
import { useAchievements } from '../composables/useAchievements'
import DeadlockDemoPanel from '../components/DeadlockDemoPanel.vue'
import DeadlockStatsPanel from '../components/DeadlockStatsPanel.vue'
import CS2StatsPanel from '../components/CS2StatsPanel.vue'
import CS2SetupPanel from '../components/CS2SetupPanel.vue'
import SkillProfileBars from '../components/SkillProfileBars.vue'
import CoachMemoryCard from '../components/CoachMemoryCard.vue'
import PaymentFailedAlert from '../components/PaymentFailedAlert.vue'
import PanelCarousel, { type CarouselPanel } from '../components/PanelCarousel.vue'
import type { SkillProfileSnapshot } from '../lib/skill-profile'
import { isPaymentPastDue, openBillingPortal as requestBillingPortal } from '../lib/billing'
import { usePrimaryGame } from '../composables/usePrimaryGame'
import { primaryGameWebBase } from '../lib/games'
import { getCs2RankIconUrl, getFaceitLevelIconUrl, type Cs2FaceitConnection } from '../lib/cs2'
import { getDeadlockRankIconUrl } from '../lib/deadlock'
import { mapDeadlockToAnalysisItem } from '../lib/deadlock-analyses'

const router = useRouter()
const achievements = useAchievements()
const { primaryGame, isValorant, isCs2, isDeadlock, loadFromSettings, applyFromSettings } = usePrimaryGame()

const profile = ref<ProfileData | null>(null)
const profileLoading = ref(true)
const onboardingTargetRank = ref<string | null>(null)
const onboardingWeaknesses = ref<string[]>([])
const cs2FaceitConnection = ref<Cs2FaceitConnection | null>(null)
const playerCardUrl = ref('')
const analyses = ref<AnalysisItem[]>([])
const analysesLoading = ref(true)
const coachingSnippets = ref<Record<number, string>>({})
const pendingRecordings = ref<PendingRecording[]>([])
const uploadProgressByRecordingId = ref<Record<string, number>>({})
const analysingIds = ref(new Set<string>())
const savingIds = ref(new Set<string>())
const status = ref<{
  recording: boolean
  recordingStarting: boolean
  currentGame: string | null
  waitingForMatch: boolean
  ffmpegOk: boolean
  obsConnected: boolean
  recordedModes: string[]
  recordingBackend: 'obs'
  currentQueueMode: string | null
}>({
  recording: false,
  recordingStarting: false,
  currentGame: null,
  waitingForMatch: false,
  ffmpegOk: true,
  obsConnected: false,
  recordedModes: [],
  recordingBackend: 'obs',
  currentQueueMode: null,
})
const stopRecordingHint = 'Stop recording and open upload — use if you leave the match early'
const isDev = ref(false)
const platform = ref('')
const macPreviewDismissed = ref(localStorage.getItem('dismissedMacPreviewBanner') === '1')
const showMacPreviewBanner = computed(() =>
  platform.value !== '' && platform.value !== 'win32' && !macPreviewDismissed.value,
)
const hotkeys = ref<Record<string, string>>({})
const clipCount = ref(0)
const isAdmin = computed(() =>
  isPlatformAdmin(profile.value?.user?.tier, profile.value?.user?.is_admin),
)
const paymentPastDue = computed(() =>
  isPaymentPastDue(profile.value?.user?.stripe_subscription_status),
)
const billingPortalLoading = ref(false)

const hotkeyHints = computed(() => [
  { key: hotkeys.value['save-clip'] || 'F9', label: 'save clip' },
  { key: hotkeys.value['toggle-overlay'] || 'F10', label: 'overlay' },
  { key: hotkeys.value['take-screenshot'] || 'F8', label: 'screenshot' },
])
const dashboardHeadline = computed(() => profile.value?.user?.name ? `Welcome back, ${profile.value.user.name}` : 'Your coaching dashboard')
const emptyCoachingTitle = computed(() => {
  if (isCs2.value) return 'Upload a demo for AI coaching'
  if (isDeadlock.value) return 'Upload a replay for AI coaching'
  return 'No coaching data yet'
})
const emptyCoachingMessage = computed(() => {
  if (isCs2.value) return 'Analyse a .dem on the web or let UpForge auto-upload after matches'
  if (isDeadlock.value) return 'Replays auto-upload after matches — or analyze any .dem from the Replays panel'
  if (!status.value.obsConnected) return 'Connect OBS in Settings, then queue a match — UpForge records automatically'
  return 'Queue a Valorant match — your next game will be recorded and coached'
})
const emptyCoachingAction = computed(() => {
  if (isCs2.value || isDeadlock.value) return 'Analyze →'
  if (!status.value.obsConnected) return 'Connect OBS'
  return 'Ready to play'
})
const dashboardCs2RankIcon = computed(() => getCs2RankIconUrl(onboardingTargetRank.value))
const goalsRankIcon = computed(() => {
  if (!onboardingTargetRank.value) return null
  if (isCs2.value) return getCs2RankIconUrl(onboardingTargetRank.value)
  if (isDeadlock.value) return getDeadlockRankIconUrl(onboardingTargetRank.value)
  return null
})
const faceitLevelIconUrl = computed(() => getFaceitLevelIconUrl(cs2FaceitConnection.value?.level))
const dashboardRankLabel = computed(() => {
  if (isCs2.value) {
    if (cs2FaceitConnection.value?.connected) {
      const nick = cs2FaceitConnection.value.nickname
      const lvl = cs2FaceitConnection.value.level
      if (nick && lvl != null) return `${nick} · Lv ${lvl}`
      if (nick) return nick
    }
    return onboardingTargetRank.value || 'CS2'
  }
  if (isDeadlock.value) return onboardingTargetRank.value || 'Deadlock'
  return profile.value?.latest_stats?.current_rank || 'Unranked'
})
const totalSessionsAnalysed = computed(() => {
  const total = profile.value?.user?.analysis_stats?.total
  if (total != null) return Math.max(0, total)
  return analyses.value.filter(a => a.overall_score != null).length
})
const dashboardWinRateLabel = computed(() => profile.value?.latest_stats?.win_rate != null ? `${Math.round(profile.value.latest_stats.win_rate)}%` : '—')
const liveDetectionActive = computed(() => status.value.recording || status.value.waitingForMatch || !!status.value.currentGame)
const activeGameTitle = computed(() => {
  const gameName = isCs2.value ? 'CS2' : isDeadlock.value ? 'Deadlock' : 'Valorant'
  if (!status.value.obsConnected && !status.value.recording) return 'OBS not connected'
  if (!status.value.ffmpegOk) return 'Clip tools unavailable'
  if (status.value.recording) return 'Recording in progress'
  if (status.value.recordingStarting) return 'Starting capture'
  if (status.value.waitingForMatch) return `${status.value.currentGame || gameName} detected`
  if (status.value.currentGame) return `${status.value.currentGame} detected`
  return `Ready for your next ${gameName} match`
})
const activeGameMessage = computed(() => {
  if (!status.value.obsConnected && !status.value.recording) return 'Install OBS 28+, enable WebSocket, and connect in Settings → Recording before your next match.'
  if (!status.value.ffmpegOk) return 'Match recording uses OBS. Clip extraction needs the bundled ffmpeg — reinstall if this persists.'
  if (status.value.recording) {
    return isCs2.value
      ? 'UpForge is recording and will upload your match demo when the game closes.'
      : 'UpForge is actively recording this match. Save clips anytime for faster review.'
  }
  if (status.value.recordingStarting) return 'Stand by while capture hooks into the live match.'
  if (status.value.waitingForMatch) {
    if (isCs2.value) return 'CS2 is running — auto-recording will begin shortly after you load in.'
    if (isDeadlock.value) return 'Deadlock is running — recording starts when you load in (tutorial, bot, or PvP).'
    return 'You are in lobby or agent select. Auto-recording will begin when the match starts.'
  }
  if (status.value.currentGame) return 'Game detected and monitoring. Launch into a match to begin recording.'
  return isCs2.value
    ? 'Launch CS2 — UpForge will record matches and upload demos automatically.'
    : 'Launch a supported game and UpForge will watch for the next recordable session.'
})
const devOpen = ref(false)
const simulating = ref(false)
const simStatus = ref('')
const recordingStartedAt = ref<number | null>(null)
const recordingElapsed = ref('')
const stopping = ref(false)
const obsConnecting = ref(false)

async function connectObs(): Promise<void> {
  obsConnecting.value = true
  try {
    const result = await window.api.obs.connect()
    if (result.ok) {
      status.value = { ...status.value, obsConnected: true }
    } else {
      warning.value = result.error ?? 'Could not connect to OBS'
      setTimeout(() => { warning.value = null }, 12000)
    }
  } finally {
    obsConnecting.value = false
  }
}

async function launchAndConnectObs(): Promise<void> {
  obsConnecting.value = true
  try {
    const result = await window.api.obs.launchAndConnect()
    if (result.ok) {
      status.value = { ...status.value, obsConnected: true }
    } else {
      warning.value = result.error ?? 'Could not launch or connect to OBS'
      setTimeout(() => { warning.value = null }, 12000)
    }
  } finally {
    obsConnecting.value = false
  }
}

const showRankHistory = ref(false)
const warning = ref<string | null>(null)
const warningAction = ref<{ label: string; route: string } | null>(null)
const bulkUploading = ref(false)
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
const playstyleProfile = ref<{
  matches_tracked: number
  last_match_at: string | null
  metrics: Record<string, unknown>
  focus_areas: Array<{ id: string; category: string; text: string; severity: 'low' | 'medium' | 'high' }>
  agent_pool: Record<string, number>
} | null>(null)
const skillProfile = ref<SkillProfileSnapshot | null>(null)
const skillProfilePrevious = ref<SkillProfileSnapshot | null>(null)

const playstyleTopAgents = computed(() => {
  const pool = playstyleProfile.value?.agent_pool ?? {}
  return Object.entries(pool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }))
})

const playerRankName = computed(() => profile.value?.latest_stats?.current_rank ?? null)

const leftInsightIndex = ref(0)
const rightInsightIndex = ref(0)

const leftInsightPanels = computed<CarouselPanel[]>(() => {
  const panels: CarouselPanel[] = []
  if (profile.value?.user.forge_rank) {
    panels.push({ id: 'mastery', label: 'Mastery', accent: 'bg-yellow-500' })
  }
  if (isValorant.value && scoreChartData.value) {
    panels.push({ id: 'score', label: 'AI Score', accent: 'bg-green-500' })
  }
  if (isValorant.value && topAgents.value.length && topAgents.value.some(a => a.hasWinData || a.avgScore != null)) {
    panels.push({ id: 'agents', label: 'Agents', accent: 'bg-red-500' })
  }
  return panels
})

const rightInsightPanels = computed<CarouselPanel[]>(() => {
  const panels: CarouselPanel[] = []
  if (isValorant.value && playstyleProfile.value && playstyleProfile.value.matches_tracked > 0) {
    panels.push({ id: 'playstyle', label: 'Playstyle', accent: 'bg-violet-500' })
  }
  if (isValorant.value && skillProfile.value) {
    panels.push({ id: 'skills', label: 'Skills', accent: 'bg-emerald-500' })
  }
  if ((isCs2.value || isDeadlock.value) && (onboardingTargetRank.value || onboardingWeaknesses.value.length)) {
    panels.push({ id: 'goals', label: 'Goals', accent: isCs2.value ? 'bg-orange-500' : 'bg-teal-500' })
  }
  if (isValorant.value && correlationInsights.value.length) {
    panels.push({ id: 'impact', label: 'Impact', accent: 'bg-red-500' })
  }
  panels.push({ id: 'training', label: 'Aim Training', accent: 'bg-orange-500' })
  return panels
})

async function loadSkillProfileFromSettings() {
  const saved = await window.api.settings.get().catch(() => null) as {
    skillProfile?: SkillProfileSnapshot | null
    skillProfilePrevious?: SkillProfileSnapshot | null
  } | null
  skillProfile.value = saved?.skillProfile ?? null
  skillProfilePrevious.value = saved?.skillProfilePrevious ?? null
}

// Last-5 performance strip above match list
const lastFivePerf = computed(() => {
  const last5 = analyses.value.slice(0, 5)
  if (!last5.length) return null
  const wins = last5.filter(a => a.won === true).length
  const losses = last5.filter(a => a.won === false).length
  const wl = last5.map(a => a.won)
  const acsItems = last5.filter(a => displayAcs(a) != null)
  const scoreItems = last5.filter(a => a.overall_score != null)
  const hsItems = last5.filter(a => a.hs_pct != null)
  return {
    wl,
    wins,
    losses,
    avgAcs: acsItems.length ? Math.round(acsItems.reduce((s, a) => s + (displayAcs(a) ?? 0), 0) / acsItems.length) : null,
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

// Hide API rows that are still shown as in-flight pending sessions (prevents duplicate rows).
const dashboardAnalyses = computed(() => {
  const inFlightJobIds = new Set(
    pendingRecordings.value.map(r => r.jobId).filter((id): id is string => !!id),
  )
  return analyses.value.filter(a => !a.job_id || !inFlightJobIds.has(a.job_id))
})

const bulkUploadablePending = computed(() =>
  pendingRecordings.value.filter(r => !r.clipsOnly && !isRecordingInFlight(r) && !r.cloudArchived),
)

// Analyses grouped by recency for the match list
const groupedAnalyses = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const groups: { label: string; items: AnalysisItem[] }[] = []
  const todayItems = dashboardAnalyses.value.filter(a => new Date(a.created_at) >= today)
  const yestItems = dashboardAnalyses.value.filter(a => { const d = new Date(a.created_at); return d >= yesterday && d < today })
  const weekItems = dashboardAnalyses.value.filter(a => { const d = new Date(a.created_at); return d >= weekAgo && d < yesterday })
  const olderItems = dashboardAnalyses.value.filter(a => new Date(a.created_at) < weekAgo)
  if (todayItems.length) groups.push({ label: 'Today', items: todayItems })
  if (yestItems.length) groups.push({ label: 'Yesterday', items: yestItems })
  if (weekItems.length) groups.push({ label: 'This week', items: weekItems })
  if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems })
  return groups
})

const quotaPercent = computed(() => {
  const stats = profile.value?.user?.analysis_stats
  if (!stats || stats.limit == null || isAdmin.value) return 0
  return Math.min(100, Math.round((stats.total / stats.limit) * 100))
})

const archiveQuotaPercent = computed(() => {
  const stats = profile.value?.user?.archive_stats
  if (!stats?.limit || isAdmin.value) return 0
  return Math.min(100, Math.round((stats.count / stats.limit) * 100))
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
    const backend = 'OBS'
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
      obsConnected: s.obsConnected === true,
      recordedModes: s.recordedModes ?? [],
      recordingBackend: 'obs',
      currentQueueMode: s.currentQueueMode ?? null,
    }
    if (s.recording) { recordingStartedAt.value = s.recordingStartedAt ?? Date.now() }
  } catch {
    router.push('/login')
    return
  }

  const earlySettings = await window.api.settings.get().catch(() => ({ primaryGame: 'valorant' as const }))
  applyFromSettings(earlySettings)

  const [prof, recent, playstyle] = await Promise.all([
    window.api.profile.get().catch(() => null),
    isDeadlock.value
      ? window.api.deadlock.getAnalyses(10).then((items) => items.map(mapDeadlockToAnalysisItem)).catch(() => [] as AnalysisItem[])
      : window.api.analyses.get(10).catch(() => [] as AnalysisItem[]),
    isValorant.value
      ? window.api.progress.playstyleProfile().catch(() => null)
      : Promise.resolve(null),
  ])

  await syncAuthUserFields()

  profile.value = prof
  profileLoading.value = false
  playstyleProfile.value = playstyle

  if (prof?.latest_stats?.player_card_id) {
    playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
  }

  analyses.value = recent
  analysesLoading.value = false
  void loadCoachingSnippets(recent)

  if (isValorant.value) {
    rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
  }
  if (isCs2.value) {
    await loadCs2Faceit()
  }

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

  if (isValorant.value) {
    try {
      const insights = await window.api.trainer.getCorrelation()
      if (Array.isArray(insights)) correlationInsights.value = insights
    } catch { /* optional */ }
  }

  // Load last insight from persisted settings
  const savedSettings = await window.api.settings.get().catch(() => null) as ({
    lastInsight?: typeof lastInsight.value
    trainerMouse?: { game?: string }
    skillProfile?: SkillProfileSnapshot | null
    skillProfilePrevious?: SkillProfileSnapshot | null
  } | null)
  if (savedSettings?.lastInsight) lastInsight.value = savedSettings.lastInsight
  skillProfile.value = savedSettings?.skillProfile ?? null
  skillProfilePrevious.value = savedSettings?.skillProfilePrevious ?? null
  void maybeShowDiskMigrationHint()

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
        obsConnected: s.obsConnected === true,
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
  ipcCleanup.push(window.api.on('settings:changed', (...args: unknown[]) => {
    const s = args[0] as { primaryGame?: string; trainerMouse?: { game?: string } } | undefined
    if (s) applyFromSettings(s)
  }))
  ipcCleanup.push(window.api.on('dashboard:refresh', async () => {
    await refreshProfile()
    await loadSkillProfileFromSettings()
    if (isDeadlock.value) await loadAnalyses()
  }))
  ipcCleanup.push(window.api.on('dashboard:last-insight', (...args: unknown[]) => {
    lastInsight.value = args[0] as typeof lastInsight.value
  }))
  ipcCleanup.push(window.api.on('recordings:updated', loadPendingRecordings))
  ipcCleanup.push(window.api.on('dashboard:upload-progress', (...args: unknown[]) => {
    const data = args[0] as { recordingId: string; progress: number }
    if (!data?.recordingId) return
    uploadProgressByRecordingId.value = {
      ...uploadProgressByRecordingId.value,
      [data.recordingId]: data.progress,
    }
  }))
  ipcCleanup.push(window.api.on('dashboard:analysis-progress', () => {
    void loadPendingRecordings()
  }))
  ipcCleanup.push(window.api.on('post-game:demo-status', (...args: unknown[]) => {
    const payload = args[0] as { status?: string; jobId?: string }
    if (payload?.status === 'complete' && isDeadlock.value) {
      void loadAnalyses()
    }
  }))
  ipcCleanup.push(window.api.on('app:activity-log', (...args: unknown[]) => {
    activityLog.value = args[0] as { time: number; message: string }[]
  }))
  ipcCleanup.push(window.api.on('app:ffmpeg-status', (...args: unknown[]) => {
    const data = args[0] as { ok: boolean }
    status.value = { ...status.value, ffmpegOk: data.ok }
  }))
  ipcCleanup.push(window.api.on('obs:connection-changed', (...args: unknown[]) => {
    const data = args[0] as { connected?: boolean }
    if (typeof data?.connected === 'boolean') {
      status.value = { ...status.value, obsConnected: data.connected }
    }
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
    const data = args[0] as { message: string; actionLabel?: string; actionRoute?: string }
    warning.value = data.message
    warningAction.value = data.actionLabel && data.actionRoute
      ? { label: data.actionLabel, route: data.actionRoute }
      : null
    setTimeout(() => { warning.value = null; warningAction.value = null }, 15000)
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
      const hk = hotkeys.value['save-clip'] || 'F9'
      warning.value = `Clip hotkey (${hk}) failed to register — another app may be using it.`
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
    if (isDeadlock.value) {
      const dl = await window.api.deadlock.getAnalyses(10)
      analyses.value = dl.map(mapDeadlockToAnalysisItem)
    } else {
      analyses.value = await window.api.analyses.get(10)
    }
    void loadCoachingSnippets(analyses.value)
  } catch {
    analyses.value = []
  } finally {
    analysesLoading.value = false
  }
}

async function loadCoachingSnippets(items: AnalysisItem[]) {
  const toFetch = items.filter(a => !isAnalysisProcessing(a) && !coachingSnippets.value[a.id])
  await Promise.all(toFetch.map(async (a) => {
    const detail = await window.api.analyses.getDetail(a.id).catch(() => null)
    const snippet = detail?.top_issue ?? detail?.priority_improvements?.[0] ?? detail?.verdict ?? null
    if (snippet) coachingSnippets.value[a.id] = snippet
  }))
}

async function loadCs2Faceit() {
  try {
    cs2FaceitConnection.value = await window.api.cs2.getFaceitConnection()
  } catch {
    cs2FaceitConnection.value = null
  }
}

async function syncAuthUserFields() {
  const authUser = await window.api.auth.refreshUser().catch(() => null) as {
    onboarding_target_rank?: string | null
    onboarding_weaknesses?: string[]
  } | null
  onboardingTargetRank.value = authUser?.onboarding_target_rank ?? null
  onboardingWeaknesses.value = authUser?.onboarding_weaknesses ?? []
  await loadFromSettings()
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
    if (isValorant.value) {
      playstyleProfile.value = await window.api.progress.playstyleProfile().catch(() => null)
      rrHistory.value = await window.api.stats.rrHistory().catch(() => [])
    }
    if (isCs2.value) {
      await loadCs2Faceit()
    }
    await syncAuthUserFields()
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

function goWarningAction() {
  if (!warningAction.value) return
  router.push(warningAction.value.route)
  warning.value = null
  warningAction.value = null
}

async function uploadAllPending() {
  if (bulkUploading.value || bulkUploadablePending.value.length === 0) return
  const user = profile.value?.user
  if (
    user &&
    !hasAnalysisQuotaRemaining(user.analysis_stats, user.tier, user.is_admin)
  ) {
    warning.value = 'No analyses remaining this month.'
    upgradeNeeded.value = true
    return
  }
  bulkUploading.value = true
  try {
    const result = await window.api.storage.uploadPending()
    if (!result.ok) {
      warning.value = result.error
      setTimeout(() => { warning.value = null }, 12000)
      return
    }
    if (result.stoppedEarly) {
      warning.value = `Uploaded ${result.uploaded} — ${result.stopReason ?? 'analysis limit reached'}`
      upgradeNeeded.value = true
    } else if (result.uploaded > 0) {
      analysisCompleteToast.value = `Uploaded ${result.uploaded} recording${result.uploaded === 1 ? '' : 's'} to cloud — local copies removed`
      setTimeout(() => { analysisCompleteToast.value = null }, 8000)
    }
    await loadPendingRecordings()
    await loadAnalyses()
  } catch {
    warning.value = 'Bulk upload failed — try again from Settings → Recording.'
    setTimeout(() => { warning.value = null }, 12000)
  } finally {
    bulkUploading.value = false
  }
}

async function saveRecording(id: string) {
  if (savingIds.value.has(id)) return
  const user = profile.value?.user
  if (
    user &&
    !hasArchiveQuotaRemaining(user.archive_stats, user.tier, user.is_admin)
  ) {
    warning.value = 'Cloud storage limit reached — upgrade for more archived VODs.'
    upgradeNeeded.value = true
    return
  }

  savingIds.value.add(id)
  savingIds.value = new Set(savingIds.value)
  try {
    const result = await window.api.recordings.saveToCloud(id)
    if (!result.ok) {
      warning.value = result.error ?? 'Could not save to cloud'
      if (/archive.limit|cloud storage/i.test(result.error ?? '')) upgradeNeeded.value = true
      setTimeout(() => { warning.value = null }, 12000)
      return
    }
    await loadPendingRecordings()
  } catch {
    warning.value = 'Save to cloud failed — check your connection'
    setTimeout(() => { warning.value = null }, 12000)
  } finally {
    savingIds.value.delete(id)
    savingIds.value = new Set(savingIds.value)
  }
}

async function analyseRecording(id: string) {
  if (analysingIds.value.has(id)) return

  // Quota gate — prevent upload if user has no analyses remaining (admins bypass)
  const user = profile.value?.user
  if (
    user &&
    !hasAnalysisQuotaRemaining(user.analysis_stats, user.tier, user.is_admin)
  ) {
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
  } catch (e) {
    analysingIds.value.delete(id)
    analysingIds.value = new Set(analysingIds.value)
    const msg = e instanceof Error ? e.message : 'Analysis failed — check your connection and try again.'
    warning.value = msg
    setTimeout(() => { warning.value = null }, 12000)
  }
}

function dismissMacPreviewBanner() {
  macPreviewDismissed.value = true
  localStorage.setItem('dismissedMacPreviewBanner', '1')
}

async function dismissRecording(id: string) {
  const rec = pendingRecordings.value.find(r => r.id === id)
  const msg = rec?.clipsOnly
    ? 'Remove this match from your dashboard? Your clips will stay in the Clips library.'
    : 'Remove this recording from your dashboard and delete the local file?'
  if (rec && !window.confirm(msg)) return
  await window.api.recordings.dismiss(id, { deleteLocal: true }).catch(() => {})
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

async function openAnalysisRow(a: AnalysisItem) {
  if (a.game_mode === 'DEADLOCK' && a.job_id) {
    void window.api.deadlock.openResults(a.job_id)
    return
  }
  timelineLoadingId.value = a.id
  try {
    const data = await window.api.analyses.getTimeline(a.id)
    if (data) {
      pendingTimeline.value = data
      router.push({ path: '/vod-review', query: { timelineId: String(a.id) } })
      return
    }
  } catch {
    // Fall through to web results.
  } finally {
    timelineLoadingId.value = null
  }
  openAnalysis(a.id)
}

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
function openBrowser() { window.open(`${primaryGameWebBase(primaryGame.value)}/history`, '_blank') }
function openPlaystyleProfile() { window.open('https://upforge.gg/valorant/playstyle', '_blank') }

const timelineLoadingId = ref<number | null>(null)

function openRecordingReview(rec: PendingRecording) {
  if (rec.analysisId) {
    void openTimeline(rec.analysisId)
    return
  }
  router.push({ path: '/vod-review', query: { id: rec.id } })
}

async function openTimeline(id: number) {
  timelineLoadingId.value = id
  try {
    const data = await window.api.analyses.getTimeline(id)
    if (!data) {
      warning.value = 'Timeline data not available for this match.'
      setTimeout(() => { warning.value = null }, 10000)
      return
    }
    pendingTimeline.value = data
    router.push({ path: '/vod-review', query: { timelineId: String(id) } })
  } catch {
    warning.value = 'Could not load VOD timeline — try again.'
    setTimeout(() => { warning.value = null }, 10000)
  } finally {
    timelineLoadingId.value = null
  }
}
function openRiotSettings() { window.open('https://upforge.gg/settings/profile', '_blank') }
function openAccountSetup() { window.open('https://upforge.gg/onboarding', '_blank') }

function openEmptyCoachingAction() {
  if (isCs2.value) void window.api.cs2.openAnalyze()
  else if (isDeadlock.value) void window.api.deadlock.openAnalyze()
  else if (!status.value.obsConnected) router.push('/settings?tab=recording')
  else {
    warning.value = 'Launch Valorant — UpForge will auto-record your next match.'
    setTimeout(() => { warning.value = null }, 10000)
  }
}
function openUpgrade() { window.open('https://upforge.gg/pricing', '_blank') }
function openPpa() { window.open('https://upforge.gg/valorant/analyze', '_blank') }

function showBillingError(message: string): void {
  warning.value = message
  setTimeout(() => { warning.value = null }, 12000)
}

async function openBillingPortal(): Promise<void> {
  if (billingPortalLoading.value) return
  billingPortalLoading.value = true
  try {
    const result = await requestBillingPortal()
    if (!result.ok) showBillingError(result.error ?? 'Could not open billing portal.')
  } finally {
    billingPortalLoading.value = false
  }
}

const DISK_MIGRATION_HINT_KEY = 'upforge-disk-hint-v1'
const LOW_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024

async function maybeShowDiskMigrationHint(): Promise<void> {
  try {
    if (localStorage.getItem(DISK_MIGRATION_HINT_KEY)) return
    const [usage, settings] = await Promise.all([
      window.api.storage.getUsage(),
      window.api.settings.get(),
    ])
    if (usage.freeDiskBytes >= LOW_FREE_DISK_BYTES) return
    if (settings.autoDelete && settings.autoAnalyse !== false) return
    localStorage.setItem(DISK_MIGRATION_HINT_KEY, '1')
    warning.value = settings.autoDelete
      ? 'Low disk space — upload pending VODs in Settings → Recording to move them to the cloud and free space.'
      : 'Low disk space — turn on Auto-delete after upload in Settings so cloud VODs replace local files on your drive.'
    warningAction.value = { label: 'Open Settings', route: '/settings?tab=recording' }
  } catch { /* optional */ }
}

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

function isRecordingInFlight(rec: PendingRecording): boolean {
  if (rec.clipsOnly) return false
  return rec.pipelineStatus === 'uploading'
    || rec.pipelineStatus === 'analysing'
    || (!!rec.analysed && rec.analysisId == null)
}

function recordingPipelineLabel(rec: PendingRecording): string | null {
  if (rec.clipsOnly) {
    if (rec.clipOnlyReason === 'clips_only_mode') return 'Highlights only'
    return 'Highlights saved'
  }
  if (rec.pipelineStatus === 'uploading') {
    const pct = uploadProgressByRecordingId.value[rec.id] ?? rec.uploadProgress
    return pct != null ? `Uploading ${pct}%` : 'Uploading…'
  }
  if (rec.pipelineStatus === 'analysing' || (rec.analysed && !rec.analysisId)) {
    return rec.analysisStep?.trim() || 'Analysing…'
  }
  return null
}

function openClipsForSession(rec: PendingRecording) {
  const query: Record<string, string> = {}
  if (rec.agent) query.agent = rec.agent
  if (rec.matchId) query.matchId = rec.matchId
  router.push({ path: '/clips', query })
}

function isAnalysisProcessing(a: AnalysisItem): boolean {
  if (a.game_mode === 'DEADLOCK') {
    return a.status === 'pending' || a.status === 'processing' || a.status === 'uploading'
  }
  return ['queued', 'processing', 'pending'].includes(a.status)
}

function analysisRounds(a: AnalysisItem): number | null {
  if (a.rounds_won != null && a.rounds_lost != null) return a.rounds_won + a.rounds_lost
  return null
}

function displayAcs(a: AnalysisItem): number | null {
  return normalizeCombatScoreToAcs(a.combat_score, analysisRounds(a))
}

interface MatchRowStats {
  won: boolean | null
  kills: number | null
  deaths: number | null
  assists: number | null
  combat_score: number | null
  hs_pct: number | null
}

const EMPTY_ROW_STATS: MatchRowStats = {
  won: null,
  kills: null,
  deaths: null,
  assists: null,
  combat_score: null,
  hs_pct: null,
}

function resolveTimelineWon(timeline: PendingRecording['timeline']): boolean | null {
  if (!timeline) return null
  if (timeline.finalStats?.won != null) return timeline.finalStats.won
  const finalScore = timeline.finalScore
  if (finalScore) {
    if (finalScore.allyScore === finalScore.enemyScore) return null
    return finalScore.allyScore > finalScore.enemyScore
  }
  const rounds = timeline.roundScores
  if (rounds?.length) {
    const last = rounds[rounds.length - 1]
    if (last.allyScore === last.enemyScore) return null
    return last.allyScore > last.enemyScore
  }
  return null
}

function recordingRowStats(rec: PendingRecording): MatchRowStats {
  const fs = rec.timeline?.finalStats
  if (!fs) return EMPTY_ROW_STATS
  const summaryRounds = rec.timeline?.roundSummaries?.length ?? 0
  const scoreRounds = (rec.timeline?.finalScore?.allyScore ?? 0) + (rec.timeline?.finalScore?.enemyScore ?? 0)
  const rounds = summaryRounds > 0 ? summaryRounds : (scoreRounds > 0 ? scoreRounds : null)
  return {
    won: resolveTimelineWon(rec.timeline),
    kills: fs.kills ?? null,
    deaths: fs.deaths ?? null,
    assists: fs.assists ?? null,
    combat_score: normalizeCombatScoreToAcs(fs.score, rounds),
    hs_pct: fs.headshotPct ?? null,
  }
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

.score-bar {
  animation: scoreBarFill 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
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
