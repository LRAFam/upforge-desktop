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
          <span class="font-bold">{{ analysisCompleteToast.score }}</span>/100
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
        'bg-white/[0.02] border-white/[0.05]'
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
        <span v-for="hk in hotkeyHints" :key="hk.label" class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/[0.03] border border-white/[0.05] rounded text-[10px]">
          <kbd class="font-mono font-semibold text-gray-400">{{ hk.key }}</kbd>
          <span class="text-gray-700">{{ hk.label }}</span>
        </span>
      </div>

      <!-- Clip hint (recording) -->
      <div v-if="status.recording && hotkeys['save-clip']" class="flex items-center gap-1.5 flex-shrink-0">
        <kbd class="inline-block px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] font-mono font-semibold text-red-400">{{ hotkeys['save-clip'] }}</kbd>
        <span class="text-[10px] text-red-400/70">save clip</span>
      </div>

      <!-- Stop button -->
      <button v-if="status.recording" :disabled="stopping" class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/[0.12] hover:bg-red-500/[0.2] border border-red-500/20 text-red-400 transition-all disabled:opacity-50" @click="stopRecording">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
        {{ stopping ? 'Stopping…' : 'Stop' }}
      </button>
    </div>

    <!-- 3-column dashboard grid -->
    <div class="flex-1 grid grid-cols-[272px_1fr_296px] gap-4 p-4 pt-3 min-h-0 overflow-hidden">

      <!-- ═══════════ LEFT: Player card ═══════════ -->
      <div class="flex flex-col gap-3 overflow-y-auto" style="scrollbar-width:none">

        <!-- Player hero card -->
        <div v-if="profile" class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div class="px-4 pt-4 pb-3">
            <div class="flex items-start gap-3">
              <!-- Avatar -->
              <div class="relative flex-shrink-0">
                <img v-if="playerCardUrl" :src="playerCardUrl" class="w-14 h-14 rounded-xl object-cover" @error="playerCardUrl = ''" />
                <div v-else class="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center">
                  <span class="text-xl font-black text-red-400">{{ profile.user.name?.charAt(0).toUpperCase() }}</span>
                </div>
                <div v-if="profile.user.tier && profile.user.tier !== 'free'" :class="['absolute -bottom-1 -right-1 px-1.5 py-px rounded text-[9px] font-bold uppercase', getTierBadgeClass(profile.user.tier)]">{{ profile.user.tier.charAt(0) }}</div>
              </div>
              <!-- Identity -->
              <div class="flex-1 min-w-0 pt-0.5">
                <p class="text-sm font-bold truncate leading-tight">{{ profile.user.name }}</p>
                <p class="text-xs text-gray-500 mt-px leading-tight">
                  <span v-if="profile.user.riot_name">{{ profile.user.riot_name }}#{{ profile.user.riot_tag }}</span>
                  <button v-else class="text-red-400/70 hover:text-red-400 transition-colors" @click="openRiotSettings">Link Riot ID →</button>
                </p>
                <div v-if="profile.latest_stats?.current_rank" class="flex items-center gap-2 mt-1.5">
                  <span class="text-sm font-black" :style="{ color: getRankHexColor(profile.latest_stats.current_rank) }">{{ profile.latest_stats.current_rank }}</span>
                  <span v-if="profile.latest_stats.rr != null" class="text-xs text-gray-600">{{ profile.latest_stats.rr }} RR</span>
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
            <div class="grid grid-cols-4 divide-x divide-white/[0.04] border-t border-white/[0.04]">
              <div class="flex flex-col items-center py-3">
                <span class="text-sm font-black tabular-nums">{{ profile.latest_stats.kd_ratio?.toFixed(2) ?? '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-0.5">K/D</span>
              </div>
              <div class="flex flex-col items-center py-3">
                <span class="text-sm font-black tabular-nums">{{ profile.latest_stats.win_rate != null ? Math.round(profile.latest_stats.win_rate) + '%' : '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-0.5">Win</span>
              </div>
              <div class="flex flex-col items-center py-3">
                <span class="text-sm font-black tabular-nums">{{ profile.latest_stats.avg_combat_score ?? '—' }}</span>
                <span class="text-[10px] text-gray-600 mt-0.5">ACS</span>
              </div>
              <div class="flex flex-col items-center py-3">
                <span class="text-sm font-black tabular-nums" :class="currentStreak > 0 ? 'text-green-400' : currentStreak < 0 ? 'text-red-400' : 'text-gray-600'">
                  {{ currentStreak !== 0 ? (currentStreak > 0 ? '+' : '') + currentStreak : '—' }}
                </span>
                <span class="text-[10px] text-gray-600 mt-0.5">Streak</span>
              </div>
            </div>

            <!-- RR trend -->
            <div v-if="rrSparkline" class="border-t border-white/[0.04]">
              <button class="w-full px-4 py-2 flex items-center gap-2 hover:bg-white/[0.02] transition-colors" @click="showRankHistory = !showRankHistory">
                <span class="text-[10px] text-gray-600 shrink-0">RR trend</span>
                <svg :viewBox="`0 0 ${rrSparkline.W} ${rrSparkline.H}`" class="flex-1 h-5" preserveAspectRatio="none">
                  <polyline :points="rrSparkline.points" fill="none" :stroke="rrSparkline.trending ? '#22c55e' : '#ef4444'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
                </svg>
                <span class="text-xs shrink-0" :class="rrSparkline.trending ? 'text-green-500' : 'text-red-400'">{{ rrSparkline.trending ? '↑' : '↓' }}</span>
                <svg class="w-3 h-3 text-gray-600 shrink-0 transition-transform" :class="showRankHistory ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div v-if="showRankHistory && rrHistory.length" class="border-t border-white/[0.04] divide-y divide-white/[0.03] max-h-36 overflow-y-auto">
                <div v-for="(entry, i) in rrHistory.slice().reverse().slice(0, 10)" :key="entry.id" class="px-4 py-1.5 flex items-center gap-2">
                  <span class="text-xs text-gray-600 shrink-0 w-16 truncate">{{ formatEntryDate(entry.date) }}</span>
                  <span class="text-xs font-semibold flex-1 truncate" :style="{ color: getRankHexColor(entry.rank ?? '') }">{{ entry.rank ?? '—' }}</span>
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
          <div v-if="profile.user.analysis_stats" class="px-4 py-2.5 border-t border-white/[0.04] flex items-center gap-3">
            <span class="text-[10px] text-gray-600 shrink-0">Analyses</span>
            <div class="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all" :class="quotaPercent >= 80 ? 'bg-red-500' : quotaPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'" :style="{ width: (100 - quotaPercent) + '%' }" />
            </div>
            <span class="text-xs font-medium tabular-nums shrink-0" :class="(profile.user.analysis_stats.limit - profile.user.analysis_stats.total) <= 0 ? 'text-red-400' : 'text-gray-400'">
              {{ Math.max(0, profile.user.analysis_stats.limit - profile.user.analysis_stats.total) }}/{{ profile.user.analysis_stats.limit }}
            </span>
          </div>
        </div>
        <div v-else-if="profileLoading" class="h-52 bg-white/[0.02] rounded-2xl animate-pulse border border-white/[0.04]" />
        <div v-else class="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
          <p class="text-xs text-gray-600">No profile loaded</p>
        </div>

        <!-- AI score trend chart -->
        <div v-if="scoreChartData" class="bg-white/[0.02] border border-white/[0.06] rounded-2xl px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">AI Score Trend</span>
            <div class="flex items-center gap-2">
              <span v-if="scoreTrend !== null" class="flex items-center gap-0.5 text-xs font-bold" :class="scoreTrend >= 0 ? 'text-green-400' : 'text-red-400'">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" :d="scoreTrend >= 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'"/></svg>
                {{ Math.abs(scoreTrend) }}
              </span>
              <span v-if="avgScore !== null" class="text-[10px] text-gray-600">avg {{ avgScore }}</span>
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
        <div v-if="topAgents.length" class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div class="px-4 py-2.5 border-b border-white/[0.04]">
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
              <span v-if="ag.avgScore != null" class="text-[10px] text-gray-600 tabular-nums shrink-0">{{ ag.avgScore }}</span>
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
              <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-gray-500 hover:bg-white/[0.07] transition-colors border border-white/[0.05]" @click="$router.push('/post-game-preview')">Post-game</button>
              <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-orange-500/[0.08] text-orange-500/70 hover:bg-orange-500/[0.14] transition-colors border border-orange-500/10" @click="$router.push('/training')">Trainer</button>
            </div>
            <p v-if="simStatus" class="text-xs text-yellow-500/50">{{ simStatus }}</p>
          </div>
        </div>

      </div>

      <!-- ═══════════ CENTER: Recent matches ═══════════ -->
      <div class="flex flex-col gap-3 min-h-0 overflow-hidden">

        <!-- Section header -->
        <div class="flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Analyses</h2>
            <span v-if="analyses.length" class="text-[10px] text-gray-700">{{ analyses.length }} sessions</span>
          </div>
          <button v-if="analyses.length > 0" class="text-xs text-gray-600 hover:text-gray-300 transition-colors" @click="router.push('/history')">View all →</button>
        </div>

        <!-- Last-5 performance strip -->
        <div v-if="lastFivePerf" class="flex-shrink-0 flex items-center gap-3 px-3 py-2 bg-white/[0.02] border border-white/[0.05] rounded-xl">
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
            <div class="w-px h-3 bg-white/[0.08]" />
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
            <div class="w-px h-3 bg-white/[0.08]" />
            <span class="text-[10px] text-gray-600">AI</span>
            <span class="text-xs font-bold tabular-nums" :class="lastFivePerf.avgScore >= 70 ? 'text-green-400' : lastFivePerf.avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ lastFivePerf.avgScore }}</span>
          </template>
          <template v-if="lastFivePerf.avgHs != null">
            <div class="w-px h-3 bg-white/[0.08]" />
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
              class="flex items-center gap-3 px-3 py-2.5 bg-blue-500/[0.04] border border-blue-500/[0.12] rounded-xl"
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
            <div class="h-px bg-white/[0.04] my-1" />
          </template>

          <!-- Loading skeleton -->
          <template v-if="analysesLoading">
            <div v-for="i in 6" :key="i" class="h-14 bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.04]" />
          </template>

          <!-- Empty state -->
          <div v-else-if="analyses.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
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
                <div class="flex-1 h-px bg-white/[0.04]" />
              </div>
              <!-- Rows in group -->
              <div
                v-for="a in group.items"
                :key="a.id"
                class="flex items-center gap-2 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.08] rounded-xl transition-all cursor-pointer"
                @click="openAnalysis(a.id)"
              >
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
                    <span class="text-sm font-black tabular-nums" :class="a.overall_score >= 80 ? 'text-green-400' : a.overall_score >= 60 ? 'text-yellow-400' : 'text-red-400'">{{ a.overall_score }}</span>
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

        <!-- Last coaching insight (or empty CTA) -->
        <div v-if="lastInsight" class="relative bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
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
                  <span class="text-2xl font-black tabular-nums leading-none" :class="lastInsight.score >= 80 ? 'text-green-400' : lastInsight.score >= 60 ? 'text-yellow-400' : 'text-red-400'">{{ lastInsight.score }}</span>
                  <span class="text-xs text-gray-600">/100</span>
                  <span class="text-xs font-bold px-1.5 py-0.5 rounded-full ml-1" :class="scoreGradeBadgeClass(lastInsight.score)">{{ scoreGrade(lastInsight.score) }}</span>
                </div>
                <div class="mt-1.5 w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div class="h-full rounded-full" :class="lastInsight.score >= 80 ? 'bg-green-500' : lastInsight.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'" :style="{ width: lastInsight.score + '%' }" />
                </div>
              </div>
            </div>
            <p class="text-xs text-gray-400 leading-relaxed line-clamp-3">
              <span class="text-gray-600 font-semibold uppercase tracking-wider text-[10px]">Focus · </span>{{ lastInsight.text }}
            </p>
            <button :disabled="lastInsightTraining" class="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 text-white/90 hover:text-white" style="background:linear-gradient(135deg,rgba(255,70,85,0.15),rgba(220,38,38,0.15));border:1px solid rgba(255,70,85,0.2)" @click="trainLastInsight">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/></svg>
              {{ lastInsightTraining ? 'Launching…' : 'Train This Weakness' }}
            </button>
          </div>
        </div>

        <!-- Empty coaching insight CTA -->
        <div v-else class="relative bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
          <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ff4655]/30 to-orange-600/30 rounded-l-xl" />
          <div class="pl-5 pr-4 py-5 flex flex-col items-center text-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg class="w-5 h-5 text-red-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-400">No coaching data yet</p>
              <p class="text-[11px] text-gray-600 mt-1 leading-relaxed">Record a game and run Analysis to get personalised coaching insights and a skill score</p>
            </div>
            <button class="w-full py-2 text-xs font-semibold rounded-xl text-white/70 hover:text-white transition-all" style="background:linear-gradient(135deg,rgba(255,70,85,0.1),rgba(220,38,38,0.1));border:1px solid rgba(255,70,85,0.15)" @click="router.push('/settings')">
              Set Up Recording →
            </button>
          </div>
        </div>

        <!-- Correlation insights card -->
        <div v-if="correlationInsights.length" class="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-white/[0.04]">
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

        <!-- Aim training quick-start -->
        <div class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div class="px-4 py-3 flex items-center justify-between border-b border-white/[0.04]">
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
                  <span class="text-lg font-black tabular-nums" :class="trainerLastSession.score >= 80 ? 'text-green-400' : trainerLastSession.score >= 60 ? 'text-yellow-400' : 'text-red-400'">{{ trainerLastSession.score }}</span>
                  <p class="text-[9px] text-gray-700">score</p>
                </div>
              </div>
              <p v-if="trainerSessionCount > 1" class="text-[10px] text-gray-700 text-center">{{ trainerSessionCount }} total sessions</p>
            </template>
            <template v-else>
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center flex-shrink-0">
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
        <div v-if="activityLog.length" class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
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

        <!-- Season stats card -->
        <div v-if="profile?.latest_stats" class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div class="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Season Stats</span>
            <button class="text-[10px] text-gray-600 hover:text-gray-300 transition-colors" @click="router.push('/performance')">Details →</button>
          </div>
          <div class="grid grid-cols-2 divide-x divide-y divide-white/[0.04]">
            <div class="flex flex-col items-center py-3 px-2">
              <span class="text-sm font-black tabular-nums" :style="{ color: getRankHexColor(profile.latest_stats.current_rank ?? '') }">{{ profile.latest_stats.current_rank || '—' }}</span>
              <span class="text-[10px] text-gray-600 mt-0.5">Rank</span>
            </div>
            <div class="flex flex-col items-center py-3 px-2">
              <span class="text-sm font-black tabular-nums">{{ profile.latest_stats.win_rate != null ? Math.round(profile.latest_stats.win_rate) + '%' : '—' }}</span>
              <span class="text-[10px] text-gray-600 mt-0.5">Win Rate</span>
            </div>
            <div class="flex flex-col items-center py-3 px-2">
              <span class="text-sm font-black tabular-nums">{{ profile.latest_stats.kd_ratio?.toFixed(2) ?? '—' }}</span>
              <span class="text-[10px] text-gray-600 mt-0.5">K/D</span>
            </div>
            <div class="flex flex-col items-center py-3 px-2">
              <span class="text-sm font-black tabular-nums">{{ profile.latest_stats.avg_combat_score ?? '—' }}</span>
              <span class="text-[10px] text-gray-600 mt-0.5">Avg ACS</span>
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
import type { ProfileData, AnalysisItem, PendingRecording } from '../env.d.ts'
import { getAgentImage, getAgentRole, getAgentColor, getMapMinimap, getRankHexColor, getRoleColor, getTierBadgeClass, formatGameMode } from '../lib/valorant'
import { pendingTimeline } from '../stores/pendingTimeline'
import { useAchievements } from '../composables/useAchievements'

const router = useRouter()
const achievements = useAchievements()

const profile = ref<ProfileData | null>(null)
const profileLoading = ref(true)
const playerCardUrl = ref('')
const analyses = ref<AnalysisItem[]>([])
const analysesLoading = ref(true)
const pendingRecordings = ref<PendingRecording[]>([])
const analysingIds = ref(new Set<string>())
const status = ref<{ recording: boolean; recordingStarting: boolean; currentGame: string | null; waitingForMatch: boolean; ffmpegOk: boolean; recordedModes: string[] }>({ recording: false, recordingStarting: false, currentGame: null, waitingForMatch: false, ffmpegOk: true, recordedModes: [] })
const isDev = ref(false)
const platform = ref('')
const hotkeys = ref<Record<string, string>>({})

const hotkeyHints = computed(() => [
  { key: hotkeys.value['save-clip'] || 'F9', label: 'save clip' },
  { key: hotkeys.value['toggle-overlay'] || 'F10', label: 'overlay' },
  { key: hotkeys.value['take-screenshot'] || 'F8', label: 'screenshot' },
])
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
    .filter(([, d]) => d.total >= 2)
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
  if (score >= 75) return 'A'
  if (score >= 60) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

function scoreGradeBadgeClass(score: number): string {
  if (score >= 90) return 'bg-yellow-500/20 text-yellow-300'
  if (score >= 75) return 'bg-green-500/20 text-green-300'
  if (score >= 60) return 'bg-blue-500/20 text-blue-300'
  if (score >= 45) return 'bg-orange-500/20 text-orange-300'
  return 'bg-red-500/20 text-red-300'
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
  const modes = status.value.recordedModes
  if (!modes || !modes.length) return 'Recording…'
  const current = modes.map(formatMode).join(' · ')
  return `Recording ${current} matches`
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

onMounted(async () => {
  try {
    const s = await window.api.app.getStatus()
    isDev.value = s.isDev
    platform.value = s.platform ?? ''
    if (!s.authenticated) {
      router.push(s.firstRun ? '/welcome' : '/login')
      return
    }
    status.value = { recording: s.recording, recordingStarting: false, currentGame: s.currentGame, waitingForMatch: s.waitingForMatch ?? false, ffmpegOk: s.ffmpegOk !== false, recordedModes: s.recordedModes ?? [] }
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
  const savedSettings = await window.api.settings.get().catch(() => null) as ({ lastInsight?: typeof lastInsight.value } | null)
  if (savedSettings?.lastInsight) lastInsight.value = savedSettings.lastInsight

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
      status.value = { recording: s.recording, recordingStarting: status.value.recordingStarting, currentGame: s.currentGame, waitingForMatch: s.waitingForMatch ?? false, ffmpegOk: s.ffmpegOk !== false, recordedModes: s.recordedModes ?? [] }
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
  await loadAnalyses()
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
    await window.api.recorder.stop()
    // Optimistically update state — the poll interval will confirm within 5s
    status.value = { ...status.value, recording: false }
    recordingStartedAt.value = null
  } catch {
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
</style>
