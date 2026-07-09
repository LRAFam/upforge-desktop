<template>
  <div
    ref="contentRoot"
    class="flex flex-col bg-[#111111] relative overflow-hidden"
    :class="isCompactFlowState ? 'h-auto' : 'h-full'"
  >
    <!-- Branded forge texture -->
    <div
      class="absolute inset-0 pointer-events-none opacity-[0.35]"
      :style="{ backgroundImage: `url(${forgePanelTexture})`, backgroundSize: '256px 256px' }"
    />
    <!-- Subtle glow bg — uses agent accent colour when available -->
    <div class="absolute inset-0 pointer-events-none">
      <div
        class="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-28 rounded-full blur-3xl transition-all duration-700 opacity-70"
        :style="glowBgStyle"
      />
    </div>

    <div
      class="relative z-10 overflow-x-hidden"
      :class="isCompactFlowState
        ? 'px-4 py-3'
        : 'flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-5'"
    >
      <div
        v-if="copiedLinkToast"
        class="absolute right-5 top-4 z-20 inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 shadow-[0_12px_30px_rgba(16,185,129,0.18)]"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4.75 10.25 8 13.5l7.25-7.25"/>
        </svg>
        {{ toastMessage }}
      </div>

      <!-- Uploading -->
      <div v-if="state === 'preparing' || state === 'uploading'" class="flow-panel w-full">
        <div
          class="flow-hero relative overflow-hidden rounded-2xl border border-white/[0.10] text-left"
          :style="agentAccentColor ? { '--flow-glow': agentAccentColor + '35' } : undefined"
        >
          <PostGameFlowHeroBackdrop :art-url="uploadHeroArt" :map-url="mapSplashUrl" tone="vivid" />
          <PostGameHeroEffects variant="uplink" />

          <button
            class="absolute top-2.5 right-2.5 z-10 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/[0.08] transition-colors"
            title="Dismiss"
            @click="dismiss"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>

          <div class="relative px-4 pt-4 pb-3.5">
            <div class="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#ff4655]/30 bg-[#ff4655]/12 px-2.5 py-1 backdrop-blur-sm">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff4655] opacity-50" />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-[#ff4655]" />
              </span>
              <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff8a94]">
                {{ state === 'preparing' ? 'Preparing replay' : compressing ? 'Optimising file' : 'Uploading' }}
              </span>
            </div>

            <div class="flex items-end gap-3">
              <div
                class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center shadow-lg"
                :class="agentImageUrl ? '' : 'border border-[#ff4655]/25 bg-[#ff4655]/10'"
                :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}66`, background: agentAccentColor + '28', boxShadow: `0 8px 24px ${agentAccentColor}25` } : undefined"
              >
                <img v-if="agentImageUrl" :src="agentImageUrl" class="h-12 w-12 object-contain" />
                <svg v-else class="h-6 w-6 text-[#ff4655]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1 pb-0.5">
                <p class="text-base font-bold leading-tight text-white">
                  {{ preparingTitle }}
                </p>
                <p class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ matchHeadline }}<span v-if="gameInfo.game === 'valorant' && gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
                </p>
              </div>
              <div class="text-right pb-0.5">
                <p class="text-2xl font-black tabular-nums leading-none text-white upload-stat-in">{{ uploadProgress }}<span class="text-sm text-gray-500">%</span></p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flow-card rounded-xl border border-white/[0.08] px-3.5 py-3 space-y-2.5">
          <p class="text-[11px] leading-relaxed text-gray-500">
            {{ state === 'preparing' ? (preparingSyncMessage || 'Saving your match recording and getting it ready to upload') : compressing ? compressHint : archiveOnlyUpload ? 'Saving your recording to cloud for playback — no analysis quota used' : 'Sending your recording to UpForge for analysis' }}
          </p>
          <div class="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              class="relative h-full overflow-hidden rounded-full upload-bar-fill transition-all duration-300"
              :style="{ width: `${Math.max(uploadProgress, uploadProgress > 0 ? 3 : 6)}%` }"
            >
              <div class="absolute inset-0 upload-bar-shimmer" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 text-[10px]">
            <div class="flex items-center gap-2 font-semibold text-gray-300">
              <svg class="h-3 w-3 animate-spin text-[#ff4655]" fill="none" viewBox="0 0 20 20">
                <circle class="opacity-20" cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2"/>
                <path class="opacity-90" fill="currentColor" d="M10 3a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5V3Z"/>
              </svg>
              <span>{{ uploadStatusLabel }}</span>
            </div>
            <span class="tabular-nums text-gray-500">{{ uploadEta || 'Calculating…' }}</span>
          </div>
        </div>
      </div>

      <!-- Analysing -->
      <div v-else-if="state === 'analysing'" class="flow-panel w-full">
        <div
          class="flow-hero relative overflow-hidden rounded-2xl border border-white/[0.10] text-left"
          :style="agentAccentColor ? { '--flow-glow': agentAccentColor + '35' } : undefined"
        >
          <PostGameFlowHeroBackdrop :art-url="coachHeroArt" :map-url="mapSplashUrl" />
          <PostGameHeroEffects variant="crosshair" />

          <button
            class="absolute top-2.5 right-2.5 z-10 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/[0.08] transition-colors"
            title="Close — analysis continues in background"
            @click="dismiss"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>

          <div class="relative px-4 pt-4 pb-3.5">
            <div class="mb-3 inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/12 px-2.5 py-1 backdrop-blur-sm">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-50" />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
              </span>
              <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">AI coaching</span>
            </div>

            <div class="flex items-end gap-3">
              <div
                class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center shadow-lg"
                :class="agentImageUrl ? '' : 'border border-orange-500/25 bg-orange-500/10'"
                :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}66`, background: agentAccentColor + '28', boxShadow: `0 8px 24px ${agentAccentColor}25` } : undefined"
              >
                <img v-if="agentImageUrl" :src="agentImageUrl" class="h-12 w-12 object-contain" />
                <svg v-else class="h-6 w-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1 pb-0.5">
                <p class="text-base font-bold leading-tight text-white">{{ analysisHeroTitle }}</p>
                <p class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ matchHeadline }}<span v-if="gameInfo.game === 'valorant' && gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
                  <span v-else-if="gameInfo.game === 'cs2' && gameInfo.map" class="text-gray-600"> · {{ cs2MapDisplayName(gameInfo.map) }}</span>
                </p>
              </div>
              <div class="text-right pb-0.5">
                <p class="text-2xl font-black tabular-nums leading-none text-white upload-stat-in">{{ analysisProgress }}<span class="text-sm text-gray-500">%</span></p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flow-card rounded-xl border border-white/[0.08] px-3.5 py-3 space-y-3">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-600">Current step</p>
            <p class="mt-1 text-xs font-medium text-gray-300">{{ analysisStep || 'Running AI analysis on your recording' }}</p>
          </div>
          <div class="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              class="relative h-full overflow-hidden rounded-full transition-all duration-500"
              :class="analysisProgress > 0 ? 'upload-bar-fill' : 'bg-orange-500/30'"
              :style="{ width: `${Math.max(analysisProgress, analysisProgress > 0 ? 3 : 6)}%` }"
            >
              <div v-if="analysisProgress > 0" class="absolute inset-0 upload-bar-shimmer" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 text-[10px]">
            <div class="flex items-center gap-2 font-semibold text-orange-300">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
              <span>{{ analysisStatusLabel }}</span>
            </div>
            <span class="tabular-nums text-gray-500">{{ analysisElapsedDisplay }} elapsed</span>
          </div>

          <AnalysisPipelineStages
            v-if="pendingDuelMoments.length && gameInfo.game === 'valorant'"
            layout="vertical"
            :progress="analysisProgress"
            :step="analysisStep"
            :moment-count="pendingDuelMoments.length"
          />
          <p
            v-if="pendingDuelMoments.length && gameInfo.game === 'valorant'"
            class="text-[10px] text-gray-500 leading-relaxed"
          >
            {{ pendingDuelMoments.length }} duel window{{ pendingDuelMoments.length !== 1 ? 's' : '' }} from your deaths — studying peek timing and crosshair on each clip.
          </p>
          <p
            v-else-if="gameInfo.game === 'cs2'"
            class="text-[10px] text-gray-500 leading-relaxed"
          >
            Matching your demo kills to the VOD and building round-by-round coaching from the recording.
          </p>
        </div>

        <div class="mt-2.5 flow-card flow-card-accent rounded-xl border border-white/[0.07] px-3.5 py-2.5 text-left">
          <div class="mb-1 flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5 text-[#ff4655]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 14c2.5-2 3.5-4 3.5-6.2C11.5 4.5 9.8 3 8 3S4.5 4.5 4.5 7.8C4.5 10 5.5 12 8 14z" stroke="currentColor" stroke-width="1.2" />
            </svg>
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff4655]/80">Coach insight</p>
          </div>
          <p class="text-[11px] text-gray-400 leading-relaxed">{{ currentTip }}</p>
        </div>

        <div
          v-if="analysisLongRunning || analysisDeferredReason"
          class="mt-2.5 flex items-start gap-2 px-3 py-2.5 rounded-xl text-left"
          :class="analysisDeferredReason === 'recording' ? 'bg-amber-500/[0.07] border border-amber-500/20' : analysisDeferredReason === 'server' ? 'bg-amber-500/[0.07] border border-amber-500/20' : 'bg-blue-500/[0.06] border border-blue-500/20'"
        >
          <svg
            class="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
            :class="analysisDeferredReason ? 'text-amber-400' : 'text-blue-400'"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-medium" :class="analysisDeferredReason ? 'text-amber-300' : 'text-blue-300'">
              <template v-if="analysisDeferredReason === 'recording'">Upload paused — match recording</template>
              <template v-else-if="analysisDeferredReason === 'server'">Still processing on our servers</template>
              <template v-else>Taking longer than usual</template>
            </p>
            <p class="text-xs text-gray-500 mt-0.5">
              <template v-if="analysisDeferredReason === 'recording'">
                Your upload will resume automatically when you end the current match. You can close this panel — progress shows on your dashboard.
              </template>
              <template v-else-if="analysisDeferredReason === 'server'">
                Complex matches can run 15+ minutes. Close this panel — we'll notify you when your score is ready.
              </template>
              <template v-else>
                Your job is still at {{ analysisProgress }}% on our pipeline. You can close this window; analysis continues in the background.
              </template>
            </p>
            <button
              class="mt-2 px-2.5 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="checkAnalysisNow"
            >Check for results</button>
            <button
              class="mt-2 ml-2 px-2.5 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="dismiss"
            >Close &amp; continue in background</button>
          </div>
        </div>
        <div v-else-if="analysisStuck" class="mt-2.5 flex items-start gap-2 px-3 py-2.5 bg-white/[0.03] border border-white/[0.10] rounded-xl text-left">
          <svg class="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-gray-400">Complex gameplay can take 10–15 minutes — your match is still processing.</p>
            <p class="text-xs text-gray-600 mt-0.5">Progress updates live from our servers{{ analysisProgress > 0 ? ` (${analysisProgress}% so far)` : '' }}. If this looks stuck, check for results below.</p>
            <button
              class="mt-2 px-2.5 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="checkAnalysisNow"
            >Check for results</button>
          </div>
        </div>
      </div>

      <!-- Ready — compact carousel toast (full report on web) -->
      <div v-else-if="state === 'ready'" class="w-full space-y-2.5 transition-all duration-500 ready-state-in">
        <div
          class="flow-hero ready-hero relative overflow-hidden rounded-xl border border-emerald-500/20 text-left"
          :style="agentAccentColor ? { '--flow-glow': 'rgba(34,197,94,0.25)' } : undefined"
        >
          <PostGameFlowHeroBackdrop :art-url="scoreRevealHeroArt" :map-url="mapSplashUrl" tone="reveal" />
          <div class="relative px-3.5 py-3">
            <div class="flex items-center gap-2.5">
              <div
                class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg flex items-center justify-center"
                :class="agentImageUrl && !agentImageBroken ? '' : 'border border-emerald-500/25 bg-emerald-500/10'"
                :style="agentImageUrl && !agentImageBroken ? { border: `1px solid ${agentAccentColor}66`, background: agentAccentColor + '28' } : undefined"
              >
                <img
                  v-if="agentImageUrl && !agentImageBroken"
                  :src="agentImageUrl"
                  class="h-8 w-8 object-contain"
                  @error="agentImageBroken = true"
                />
                <span v-else-if="gameInfo.agent" class="text-sm font-black text-emerald-300">{{ gameInfo.agent.charAt(0) }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <svg class="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span class="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Analysis ready</span>
                </div>
                <p class="text-sm font-bold text-white leading-tight mt-0.5 truncate">
                  {{ matchHeadline }}<span v-if="gameInfo.game === 'valorant' && gameInfo.map" class="text-gray-500 font-medium"> · {{ gameInfo.map }}</span>
                </p>
              </div>
              <div v-if="result?.overall_score != null" class="text-right flex-shrink-0 pl-2">
                <p class="text-xl font-black tabular-nums leading-none" :class="scoreClass(result.overall_score)">
                  {{ result.overall_score * 10 }}
                </p>
                <p class="text-[9px] font-bold text-gray-500">{{ scoreGrade(result.overall_score) }}</p>
              </div>
            </div>
          </div>
        </div>

        <PostGameDebriefCarousel
          :focus="focusHero"
          :overall-score="result?.overall_score ?? null"
          :kills="result?.kills ?? null"
          :deaths="result?.deaths ?? null"
          :assists="result?.assists ?? null"
          :match-result="hasMatchResult ? (result?.match_result ?? null) : null"
          :ally-score="result?.ally_score ?? null"
          :enemy-score="result?.enemy_score ?? null"
          :top-highlight="topCarouselHighlight"
          :debrief-text="debriefFailed ? null : debriefText"
          :debrief-loading="debriefLoading"
          :debrief-failed="debriefFailed"
          :session-clip-count="sessionClipCount"
          :score-grade="scoreGrade"
          :score-label="scoreLabel"
          @open-clips="openClips"
        />

        <p v-if="carouselPanelsHint" class="text-[9px] text-center text-gray-600 tracking-wide">
          {{ carouselPanelsHint }}
        </p>

        <div
          v-if="matchDataWarning"
          class="flex items-start gap-2 px-2.5 py-2 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg"
        >
          <p class="text-[10px] text-amber-300/90 leading-relaxed">{{ matchDataWarning.message }}</p>
        </div>

        <div class="flex gap-2 pt-0.5">
          <button
            class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-lg"
            :style="{ background: `linear-gradient(135deg, ${agentAccentColor || '#dc2626'}, ${agentAccentColor ? agentAccentColor + 'cc' : '#ea580c'})`, boxShadow: `0 4px 14px ${agentAccentColor || '#dc2626'}40` }"
            @click="viewFullAnalysis"
          >
            <span>Open full report</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
            </svg>
          </button>
          <button
            v-if="vodRecordingId"
            class="px-3 py-2.5 text-xs font-semibold rounded-xl border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
            @click="openVodReview"
          >VOD</button>
          <button
            class="px-3 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-xl transition-colors"
            @click="dismiss"
          >Close</button>
        </div>
      </div>

      <!-- Pending (auto-analyse off) -->
      <div v-else-if="state === 'pending'" class="pending-panel w-full">
        <div
          class="pending-hero relative overflow-hidden rounded-2xl border border-white/[0.10] text-left"
          :style="agentAccentColor ? { '--pending-glow': agentAccentColor + '30' } : undefined"
        >
          <PostGameFlowHeroBackdrop :art-url="coachHeroArt" :map-url="mapSplashUrl" />

          <div class="relative px-4 pt-4 pb-3.5">
            <div class="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-sm"
              :class="isDemoWaitFlow
                ? 'border-blue-500/25 bg-blue-500/12'
                : 'border-emerald-500/25 bg-emerald-500/12'"
            >
              <span class="relative flex h-2 w-2">
                <span
                  class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
                  :class="isDemoWaitFlow ? 'bg-blue-400' : 'bg-emerald-400'"
                />
                <span
                  class="relative inline-flex h-2 w-2 rounded-full"
                  :class="isDemoWaitFlow ? 'bg-blue-400' : 'bg-emerald-400'"
                />
              </span>
              <span
                class="text-[10px] font-bold uppercase tracking-[0.14em]"
                :class="isDemoWaitFlow ? 'text-blue-300' : 'text-emerald-300'"
              >{{ isDemoWaitFlow ? 'Demo on the way' : 'Recording saved' }}</span>
            </div>

            <div class="flex items-end gap-3">
              <div
                class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center shadow-lg"
                :class="agentImageUrl ? '' : 'border border-blue-500/25 bg-blue-500/10'"
                :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}66`, background: agentAccentColor + '28', boxShadow: `0 8px 24px ${agentAccentColor}25` } : undefined"
              >
                <img v-if="agentImageUrl" :src="agentImageUrl" class="h-12 w-12 object-contain" />
                <svg v-else class="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1 pb-0.5">
                <p class="text-base font-bold leading-tight text-white">
                  {{ pendingHeroTitle }}
                </p>
                <p v-if="gameInfo.map" class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ gameInfo.map }}
                </p>
                <p v-else-if="isDemoWaitFlow" class="mt-0.5 text-xs text-gray-500">
                  We’ll notify you when the demo links — play your next game or head back to the dashboard.
                </p>
                <p v-else class="mt-0.5 text-xs text-gray-500">Match ready for coaching</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 text-center">
          <p class="text-sm font-semibold text-gray-200">
            {{ isDemoWaitFlow ? 'You’re all set for now' : 'What would you like to do?' }}
          </p>
          <p v-if="isDemoWaitFlow" class="mt-1 text-[11px] leading-relaxed text-blue-300/80">
            {{ pendingAnalysisMessage }}
          </p>
          <p v-if="isDemoWaitFlow" class="mt-1 text-[10px] leading-relaxed text-gray-500">
            {{ demoSyncExplainerShort(gameInfo.game) }} We'll notify you when the timeline links.
          </p>
          <p v-else-if="!pendingAnalysisReady" class="mt-1 text-[11px] leading-relaxed text-blue-300/80">
            {{ pendingAnalysisMessage }}
          </p>
          <p v-else class="mt-1 text-[11px] leading-relaxed text-gray-500">
            Save to cloud frees disk space. Analyse uses your coaching quota when you are ready.
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-2.5">
          <GamingButton
            v-if="isDemoWaitFlow"
            variant="primary-sm"
            block
            @click="dismissPending"
          >
            Back to dashboard
          </GamingButton>
          <GamingButton
            v-if="isDemoWaitFlow"
            variant="secondary-sm"
            block
            :disabled="analysing || savingToCloud"
            @click="saveToCloudNow"
          >
            <svg v-if="savingToCloud" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            {{ savingToCloud ? 'Saving…' : 'Save to cloud only' }}
          </GamingButton>
          <GamingButton
            v-if="!isDemoWaitFlow"
            variant="primary-sm"
            block
            :disabled="analysing || savingToCloud || !pendingAnalysisReady"
            @click="analyseNow"
          >
            <svg v-if="analysing" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            {{ analysing ? 'Starting…' : (pendingAnalysisReady ? 'Analyse now' : pendingAnalyseButtonLabel) }}
          </GamingButton>
          <GamingButton
            v-if="!isDemoWaitFlow"
            variant="secondary-sm"
            block
            :disabled="analysing || savingToCloud"
            @click="saveToCloudNow"
          >
            <svg v-if="savingToCloud" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            {{ savingToCloud ? 'Saving…' : 'Save to cloud only' }}
          </GamingButton>
          <GamingButton
            v-if="!isDemoWaitFlow"
            variant="secondary-sm"
            block
            @click="dismissPending"
          >Remind me later</GamingButton>
        </div>
      </div>

      <!-- Cloud saved (archive-only success) -->
      <div v-else-if="state === 'archived'" class="w-full space-y-4 text-center">
        <div class="w-11 h-11 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-emerald-300">Saved to cloud</p>
          <p class="text-xs text-gray-400 mt-1">Your VOD is backed up. Run AI coaching anytime from the dashboard — it uses analysis quota, not cloud storage.</p>
        </div>
        <GamingButton variant="secondary-sm" block @click="dismiss">Done</GamingButton>
      </div>

      <!-- Error -->
      <div v-else-if="state === 'error'" class="flow-panel w-full">
        <!-- Quota exceeded -->
        <template v-if="needsUpgrade">
          <div class="flow-hero relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4 text-center">
            <div class="w-11 h-11 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div class="mt-3">
              <p class="text-sm font-semibold text-amber-400">{{ needsArchiveUpgrade ? 'Cloud storage limit reached' : 'Analysis limit reached' }}</p>
              <template v-if="needsArchiveUpgrade">
                <p class="text-xs text-gray-400 mt-1">You have used all your cloud VOD slots. Upgrade for more storage or remove old cloud-backed locals in Settings.</p>
              </template>
              <template v-else-if="userTier === 'free'">
                <p class="text-xs text-gray-400 mt-1">You've used your 3 starter analyses. Upgrade for monthly coaching or pay per analysis on the web.</p>
                <p class="text-xs text-gray-600 mt-1">Plus $14.99/mo · Pro $24.99/mo</p>
              </template>
              <template v-else>
                <p class="text-xs text-gray-400 mt-1">You've used all your {{ userTier }} plan analyses for this month. Resets in {{ daysUntilReset() }} day{{ daysUntilReset() === 1 ? '' : 's' }}.</p>
              </template>
            </div>
          </div>
          <div class="mt-3 flex gap-2">
            <button
              v-if="userTier === 'free'"
              class="flex-1 py-2.5 text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl transition-all shadow-sm shadow-amber-500/20"
              @click="openUpgrade"
            >View Plans →</button>
            <button
              v-if="userTier === 'free'"
              class="flex-1 py-2.5 text-xs font-semibold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 rounded-xl transition-colors"
              @click="openPpa"
            >Pay per analysis</button>
            <button class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-xl transition-colors" @click="dismiss">Dismiss</button>
          </div>
        </template>

        <!-- Generic upload / analysis error -->
        <template v-else>
          <div
            class="flow-hero relative overflow-hidden rounded-2xl border text-left"
            :class="creditRefunded ? 'border-amber-500/20' : 'border-red-500/20'"
            :style="agentAccentColor ? { '--flow-glow': agentAccentColor + '25' } : undefined"
          >
            <PostGameFlowHeroBackdrop
              :art-url="creditRefunded ? refundHeroArt : uploadHeroArt"
              :map-url="mapSplashUrl"
              tone="muted"
            />

            <div class="relative px-4 pt-4 pb-3.5">
              <div
                class="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-sm"
                :class="creditRefunded
                  ? 'border-amber-500/30 bg-amber-500/12'
                  : 'border-red-500/30 bg-red-500/12'"
              >
                <span
                  class="w-2 h-2 rounded-full"
                  :class="creditRefunded ? 'bg-amber-400' : 'bg-red-400'"
                />
                <span
                  class="text-[10px] font-bold uppercase tracking-[0.16em]"
                  :class="creditRefunded ? 'text-amber-300' : 'text-red-300'"
                >
                  {{ creditRefunded ? 'Credit refunded' : 'Analysis failed' }}
                </span>
              </div>

              <div class="flex items-start gap-3">
                <div
                  class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center"
                  :class="agentImageUrl ? '' : (creditRefunded ? 'border border-amber-500/25 bg-amber-500/10' : 'border border-red-500/25 bg-red-500/10')"
                  :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}55`, background: agentAccentColor + '22' } : undefined"
                >
                  <img v-if="agentImageUrl" :src="agentImageUrl" class="h-10 w-10 object-contain opacity-80" />
                  <svg
                    v-else
                    class="w-5 h-5"
                    :class="creditRefunded ? 'text-amber-400' : 'text-red-400'"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold leading-snug" :class="creditRefunded ? 'text-amber-200' : 'text-red-300'">
                    {{ errorTitle }}
                  </p>
                  <p class="mt-1 text-[11px] text-gray-400">
                    {{ matchHeadline }}<span v-if="gameInfo.game === 'valorant' && gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3 flow-card rounded-xl border border-white/[0.08] px-3.5 py-3 text-left space-y-2">
            <p class="text-xs text-gray-400 leading-relaxed">{{ errorMessage }}</p>
            <p v-if="errorHint" class="text-[11px] text-gray-500 leading-relaxed">{{ errorHint }}</p>
          </div>

          <PostGameDuelDiagnostics
            v-if="errorDiagnostics"
            class="mt-3"
            :diagnostics="errorDiagnostics"
            :recording-id="vodRecordingId"
          />

          <div class="mt-3 flex gap-2">
            <button
              v-if="canRetryAnalysis && !clipsOnlyError"
              :disabled="!pendingRecordingId"
              class="flex-1 py-2.5 text-xs font-bold bg-gradient-to-r from-[#ff4655] to-orange-600 hover:from-[#e63e4c] hover:to-orange-700 text-white rounded-xl transition-all shadow-[0_4px_16px_rgba(255,70,85,0.25)] disabled:opacity-40 disabled:cursor-not-allowed"
              @click="retryUpload"
            >{{ creditRefunded ? 'Try again' : 'Retry' }}</button>
            <button
              v-else-if="clipsOnlyError"
              class="flex-1 py-2.5 text-xs font-bold bg-gradient-to-r from-[#ff4655] to-orange-600 text-white rounded-xl transition-all"
              @click="dismiss"
            >View clips in dashboard</button>
            <button class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-xl transition-colors" @click="dismiss">
              {{ canRetryAnalysis && !clipsOnlyError ? 'Dismiss' : 'Close' }}
            </button>
          </div>
        </template>
      </div>

      <!-- CS2 / Deadlock replay status row -->
      <div
        v-if="(gameInfo.game === 'cs2' || gameInfo.game === 'deadlock') && demoStatus"
        class="w-full mt-2 rounded-xl border overflow-hidden"
        :class="demoStatus.status === 'not-found' || demoStatus.status === 'error'
          ? 'bg-cyan-500/[0.04] border-cyan-500/15'
          : 'bg-cyan-500/[0.06] border-cyan-500/20'"
      >
        <div class="flex items-center gap-2 px-3 py-2">
        <!-- uploading spinner -->
        <svg v-if="demoStatus.status === 'uploading'" class="w-3 h-3 text-cyan-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <!-- analysing pulse -->
        <svg v-else-if="demoStatus.status === 'analysing'" class="w-3 h-3 text-cyan-400 flex-shrink-0 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <!-- complete check -->
        <svg v-else-if="demoStatus.status === 'complete'" class="w-3 h-3 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
        </svg>
        <!-- not-found / error info -->
        <svg v-else class="w-3 h-3 text-cyan-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>

        <span v-if="demoStatus.status === 'uploading'" class="text-xs text-cyan-300/80">Replay uploading… {{ demoProgress }}%</span>
        <span v-else-if="demoStatus.status === 'analysing'" class="text-xs text-cyan-300/80">Replay analysing…</span>
        <span v-else-if="demoStatus.status === 'complete'" class="text-xs text-cyan-300/80">Replay analysis ready</span>
        <span v-else-if="demoStatus.status === 'not-found'" class="text-xs text-cyan-700/80">Demo not found yet</span>
        <span v-else-if="demoStatus.status === 'error'" class="text-xs text-cyan-700/80">Replay upload failed</span>
        </div>
        <div
          v-if="demoStatus.status === 'not-found'"
          class="border-t border-cyan-500/10 px-3 py-2.5 space-y-2"
        >
          <p class="text-[11px] text-gray-400 leading-relaxed">{{ replayNotFoundHint }}</p>
          <ul class="text-[10px] text-gray-500 space-y-1 list-disc pl-4">
            <li v-if="gameInfo.game === 'cs2'">GOTV replays usually appear in <strong class="text-gray-400">5–15 minutes</strong> (up to 30 at peak)</li>
            <li v-if="gameInfo.game === 'cs2'">Enable auto-record (<code class="text-cyan-400/80">cl_demo_auto_recording 1</code>) or download the replay in CS2</li>
            <li v-if="gameInfo.game === 'deadlock'">Enable replay saving in Deadlock settings, then play another match</li>
            <li v-if="gameInfo.game === 'cs2'">If still missing after 30 minutes, restart Steam and tap Scan again</li>
          </ul>
          <button
            type="button"
            class="text-[10px] font-semibold text-cyan-300/90 hover:text-cyan-200"
            @click="retryDemoScan"
          >{{ demoRescanning ? 'Scanning…' : 'Scan for replay again' }}</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { openAnalysisVodReview } from '../lib/open-vod-review'
import { getAgentImage, getAgentColor, getMapImage, getMapMinimap } from '../lib/valorant'
import { analysisResultsUrl, isPrimaryGame, normalizePrimaryGame, recordingGameLabel, type PrimaryGame } from '../lib/games'
import { cs2MapDisplayName, getCs2RadarUrl, isCs2Map } from '../lib/cs2-maps'
import PostGameDebriefCarousel from '../components/post-game/PostGameDebriefCarousel.vue'
import GamingButton from '../components/GamingButton.vue'
import AnalysisPipelineStages from '../components/analysis/AnalysisPipelineStages.vue'
import PostGameFlowHeroBackdrop from '../components/post-game/PostGameFlowHeroBackdrop.vue'
import PostGameHeroEffects from '../components/post-game/PostGameHeroEffects.vue'
import uploadHeroArt from '../assets/post-game/upload-beam-hero.webp'
import coachHeroArt from '../assets/post-game/coach-synthesis-hero.webp'
import refundHeroArt from '../assets/post-game/refund-hero.webp'
import scoreRevealHeroArt from '../assets/post-game/score-reveal-hero.webp'
import forgePanelTexture from '../assets/post-game/forge-panel-texture.webp'
import { type DuelMoment, type DuelMomentManifest } from '../lib/duel-moments'
import { buildFocusHeroCopy } from '../lib/skill-profile'
import type { MatchSpatialSummary } from '../lib/spatial-types'
import type { SkillProfileSnapshot } from '../lib/skill-profile'
import type { MatchHighlight } from '../lib/match-highlights'
import { buildMatchHighlights } from '../lib/match-highlights'
import { filterSessionClips } from '../lib/session-clips'
import type { ClipRecord } from '../env.d.ts'
import type { CategoryPercentileEntry } from '../components/CategoryPercentilesStrip.vue'
import { canSpatialVodSeek } from '../lib/tier-features'
import { buildAnalysisErrorPayload, type AnalysisErrorPayload } from '../lib/analysis-failure-messages'
import { usesAsyncDemoSync, demoSyncExplainerShort } from '../lib/recording-demo-status'
import PostGameDuelDiagnostics from '../components/post-game/PostGameDuelDiagnostics.vue'

type State = 'preparing' | 'uploading' | 'analysing' | 'ready' | 'error' | 'pending' | 'archived'

const COACHING_TIPS = [
  'Players who review their gameplay weekly improve 2x faster than those who don\'t.',
  'Crosshair placement accounts for up to 40% of your ability to win gunfights.',
  'Economy management separates Gold from Diamond more than aim does.',
  'The #1 mistake at every rank: pushing aggressively without information.',
  'Positioning decisions happen before the fight starts — map awareness wins rounds.',
  'Pro players spend more time watching replays than playing ranked.',
  'A consistent warm-up routine can reduce your reaction time by 15–20ms.',
]

const state = ref<State>('preparing')
const contentRoot = ref<HTMLElement | null>(null)
const isCompactFlowState = computed(() =>
  ['preparing', 'uploading', 'analysing', 'ready', 'error', 'pending', 'archived'].includes(state.value),
)
let fitHeightTimer: ReturnType<typeof setTimeout> | null = null
let contentResizeObserver: ResizeObserver | null = null

function scheduleFitWindow(): void {
  if (fitHeightTimer) clearTimeout(fitHeightTimer)
  fitHeightTimer = setTimeout(() => {
    void nextTick(() => {
      if (!contentRoot.value || !window.api.window.setContentHeight) return
      if (!isCompactFlowState.value) return
      const height = Math.min(340, contentRoot.value.scrollHeight)
      void window.api.window.setContentHeight(height)
    })
  }, 60)
}
const uploadProgress = ref(0)
const compressing = ref(false)
const compressKind = ref<'remux' | 'transcode' | 'shrink' | null>(null)
const uploadStartedAt = ref(0)
const gameInfo = ref<{ game: string; map: string | null; agent: string | null }>({ game: 'valorant', map: null, agent: null })
const matchDataStatus = ref<'fetched' | 'no_match_id' | 'no_region' | 'no_auth' | 'fetch_failed' | 'pending'>('pending')
const killsCapured = ref(0)
const result = ref<{
  overall_score: number
  analysis_id: number
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  match_result?: 'win' | 'loss' | null
  ally_score?: number | null
  enemy_score?: number | null
  verdict?: string | null
  coaching_tags?: string[]
  top_issue?: string | null
  priority_improvements?: string[]
  spatial_summary?: MatchSpatialSummary | null
  category_scores?: Array<{ category: string; score: number; reasoning?: string }>
  match_highlights?: MatchHighlight[] | null
  skill_profile?: SkillProfileSnapshot | null
  timing_comparisons?: Array<{ label: string }>
  duel_moments?: DuelMoment[] | null
  pipeline?: string | null
} | null>(null)
const sessionClips = ref<ClipRecord[]>([])
const matchId = ref<string | null>(null)
const categoryPercentiles = ref<Record<string, CategoryPercentileEntry>>({})
const percentileTier = ref<string | null>(null)

async function loadCategoryPercentiles(): Promise<void> {
  const id = result.value?.analysis_id
  if (!id) return
  categoryPercentiles.value = {}
  percentileTier.value = null
  try {
    const resp = await window.api.analyses.getPercentiles(id)
    if (resp.success && resp.percentiles && Object.keys(resp.percentiles).length > 0) {
      categoryPercentiles.value = resp.percentiles
      percentileTier.value = resp.tier ?? null
    }
  } catch { /* non-fatal */ }
}

const errorMessage = ref('')
const errorDetails = ref<AnalysisErrorPayload | null>(null)
const clipsOnlyError = ref(false)
const needsUpgrade = ref(false)
const upgradeUrl = ref('https://upforge.gg/pricing')
const ppaUrl = ref('https://upforge.gg/valorant/analyze')
const userTier = ref<string>('free')
const canSeekFromSpatial = computed(() => canSpatialVodSeek(userTier.value))
const subscriptionEndsAt = ref<string | null>(null)

function daysUntilReset(): number {
  if (subscriptionEndsAt.value) {
    const end = new Date(subscriptionEndsAt.value)
    return Math.max(1, Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  }
  const now = new Date()
  const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.ceil((firstOfNext.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
const isTimeoutError = computed(() => errorDetails.value?.kind === 'refunded_timeout' || /timed? ?out/i.test(errorMessage.value))
const errorTitle = computed(() => {
  if (errorDetails.value?.title) return errorDetails.value.title
  if (clipsOnlyError.value) return 'Recording too large'
  if (isTimeoutError.value) return 'Analysis timed out'
  return 'Upload failed'
})
const errorHint = computed(() => errorDetails.value?.hint ?? null)
const errorDiagnostics = computed(() => errorDetails.value?.failureDiagnostics ?? null)
const creditRefunded = computed(() => errorDetails.value?.creditRefunded ?? /refunded/i.test(errorMessage.value))
const canRetryAnalysis = computed(() => errorDetails.value?.canRetry ?? (!clipsOnlyError.value && !needsUpgrade.value))
const pendingRecordingId = ref<string | null>(null)
const pendingAnalysisReady = ref(false)
const pendingAnalysisMessage = ref('Syncing match stats…')
const pendingAnalysisState = ref<string | null>(null)
const preparingSyncMessage = ref<string | null>(null)
const pendingAnalyseButtonLabel = computed(() => {
  if (pendingAnalysisState.value === 'finalizing') return 'Finalizing…'
  if (pendingAnalysisState.value === 'syncing') {
    return gameInfo.value.game === 'cs2' ? 'Waiting for demo…' : 'Syncing stats…'
  }
  return 'Not ready'
})

const analysisHeroTitle = computed(() => {
  if (gameInfo.value.game === 'cs2') return 'Analysing your CS2 match'
  if (gameInfo.value.game === 'deadlock') return 'Analysing your match'
  return 'Reviewing your duels'
})

const isCs2Game = computed(() => gameInfo.value.game === 'cs2')

const isDemoWaitFlow = computed(() =>
  usesAsyncDemoSync(gameInfo.value.game)
  && !pendingAnalysisReady.value
  && (pendingAnalysisState.value === 'syncing' || pendingAnalysisState.value === 'finalizing'),
)

const pendingHeroTitle = computed(() => {
  if (isDemoWaitFlow.value) {
    return gameInfo.value.game === 'cs2'
      ? 'Recording saved — demo on the way'
      : 'Recording saved — replay on the way'
  }
  return matchHeadline.value
})

function applyAnalysisReadiness(readiness: { ready: boolean; state: string; message: string }) {
  pendingAnalysisReady.value = readiness.ready
  pendingAnalysisState.value = readiness.state
  pendingAnalysisMessage.value = readiness.message
    || (readiness.state === 'syncing'
      ? 'Syncing match stats…'
      : readiness.state === 'finalizing'
        ? 'Finalizing recording…'
        : 'Not ready to analyse')
}

type PostGameSessionSnapshot = NonNullable<Awaited<ReturnType<NonNullable<typeof window.api.postGame>['sync']>>>

function applyPostGameSnapshot(snapshot: PostGameSessionSnapshot): void {
  if (snapshot.game) {
    gameInfo.value = {
      game: snapshot.game,
      map: snapshot.map ?? null,
      agent: snapshot.agent ?? null,
    }
  }
  uploadProgress.value = snapshot.uploadProgress
  compressing.value = snapshot.compressing
  compressKind.value = snapshot.compressKind
  archiveOnlyUpload.value = snapshot.archiveOnly
  if (snapshot.recordingId) pendingRecordingId.value = snapshot.recordingId
  if (snapshot.matchDataStatus) {
    matchDataStatus.value = snapshot.matchDataStatus as typeof matchDataStatus.value
  }
  if (snapshot.killsInTimeline > 0) killsCapured.value = snapshot.killsInTimeline
  if (snapshot.preparingSyncMessage) preparingSyncMessage.value = snapshot.preparingSyncMessage
  if (snapshot.analysisReadiness) applyAnalysisReadiness(snapshot.analysisReadiness)
  if (snapshot.debriefLoading) debriefLoading.value = true
  if (snapshot.debriefText) {
    debriefText.value = snapshot.debriefText
    debriefLoading.value = false
  }
  if (snapshot.debriefFailed) {
    debriefFailed.value = true
    debriefLoading.value = false
  }
  if (snapshot.debriefDiscordLinked) debriefDiscordLinked.value = snapshot.debriefDiscordLinked

  const next = snapshot.phase as State
  if (next === 'preparing') {
    state.value = 'preparing'
    startPreparingStuckTimer()
    return
  }
  clearPreparingStuckTimer()
  state.value = next
  if (next === 'uploading' && uploadStartedAt.value === 0) uploadStartedAt.value = Date.now()
  if (next === 'analysing') startStuckTimer()
  if (next === 'pending') {
    pendingAnalysisReady.value = snapshot.pendingAnalysisReady
    pendingAnalysisMessage.value = snapshot.pendingAnalysisMessage ?? pendingAnalysisMessage.value
    pendingAnalysisState.value = snapshot.pendingAnalysisState
    void refreshLocalSpatialSummary()
  }
}

async function syncPostGameSession(): Promise<void> {
  try {
    const snapshot = await window.api.postGame.sync()
    if (snapshot) applyPostGameSnapshot(snapshot)
  } catch { /* non-fatal */ }
}
const sessionRecordingId = ref<string | null>(null)
const analysing = ref(false)
const savingToCloud = ref(false)
const archiveOnlyUpload = ref(false)
const needsArchiveUpgrade = ref(false)
const analysisStuck = ref(false)
const analysisLongRunning = ref(false)
const analysisDeferredReason = ref<'recording' | 'server' | null>(null)
const analysisProgress = ref(0)
const analysisStep = ref<string | null>(null)
const analysisJobStatus = ref<string>('processing')
const tipIndex = ref(Math.floor(Math.random() * COACHING_TIPS.length))
const sessionClipCount = ref(0)
const analysisStartedAt = ref(0)
const analysisElapsedSecs = ref(0)
const feedbackRating = ref<'thumbs_up' | 'thumbs_down' | null>(null)
const feedbackText = ref('')
const feedbackSubmitting = ref(false)
const feedbackSubmitted = ref(false)
const myCoaches = ref<Array<{ coach_id: number; display_name: string; roster_is_live?: boolean; can_request_review?: boolean }>>([])
const coachesLoaded = ref(false)
const selectedCoachId = ref<number | null>(null)
const coachQuestion = ref('')
const coachAskExpanded = ref(false)
const coachReviewSubmitting = ref(false)
const coachReviewSent = ref(false)
const coachReviewStatus = ref<'pending' | 'in_progress' | 'completed' | null>(null)
const coachNotesOpening = ref(false)
const router = useRouter()
const coachSelectedRounds = ref<number[]>([])
const LAST_COACH_KEY = 'upforge_last_roster_coach_id'
const liveCoaches = computed(() =>
  myCoaches.value.filter(c => c.roster_is_live !== false && c.can_request_review !== false),
)
const selectedCoachName = computed(() =>
  myCoaches.value.find(c => c.coach_id === selectedCoachId.value)?.display_name ?? 'coach',
)
let debriefTimeoutTimer: ReturnType<typeof setTimeout> | null = null

function clearDebriefTimeout(): void {
  if (debriefTimeoutTimer) {
    clearTimeout(debriefTimeoutTimer)
    debriefTimeoutTimer = null
  }
}

function startDebriefTimeout(): void {
  clearDebriefTimeout()
  debriefTimeoutTimer = setTimeout(() => {
    if (debriefLoading.value && !debriefText.value) {
      debriefFailed.value = true
      debriefLoading.value = false
    }
  }, 130_000)
}
let sessionStart = 0
let preparingStuckTimer: ReturnType<typeof setTimeout> | null = null
let stuckTimer: ReturnType<typeof setTimeout> | null = null
let reconcileKickTimer: ReturnType<typeof setTimeout> | null = null
let tipTimer: ReturnType<typeof setInterval> | null = null
let elapsedInterval: ReturnType<typeof setInterval> | null = null

const currentTip = computed(() => COACHING_TIPS[tipIndex.value])

const matchDataWarning = computed<{ message: string; tip: string } | null>(() => {
  if (gameInfo.value.game === 'cs2') {
    if (killsCapured.value > 0) return null
    if (pendingAnalysisState.value === 'syncing') {
      return {
        message: 'CS2 demo still syncing — GOTV replays usually land in 5–15 minutes after the match.',
        tip: 'Keep UpForge open. Enable cl_demo_auto_recording or download the replay in CS2. Restart Steam if it takes over 30 minutes.',
      }
    }
    if (pendingAnalysisState.value === 'unavailable') {
      return {
        message: 'No CS2 demo found after the wait window.',
        tip: 'Download the GOTV replay in CS2, confirm the demo folder in Settings → Recording, then tap Scan for replay again.',
      }
    }
    return null
  }
  if (killsCapured.value > 0) return null // Data captured successfully
  const status = matchDataStatus.value
  if (status === 'fetched') return null
  if (status === 'no_auth') return {
    message: 'Riot match data wasn\'t captured — UpForge wasn\'t running when you launched Valorant.',
    tip: 'Launch UpForge first, then start Valorant for full match data next time.',
  }
  if (status === 'no_region') return {
    message: 'Region detection failed — live match stats unavailable for this session.',
    tip: 'Make sure you\'re signed into the Riot Client before launching Valorant.',
  }
  if (status === 'fetch_failed') return {
    message: 'Could not retrieve match details from Riot API — stats may be limited.',
    tip: 'Check your internet connection. The AI still analysed your gameplay from the video.',
  }
  if (status === 'no_match_id') return {
    message: 'Match ID wasn\'t captured — timeline data unavailable for this session.',
    tip: 'Start UpForge before launching Valorant to capture full match statistics.',
  }
  return null
})

const analysisElapsedDisplay = computed(() => {
  const s = analysisElapsedSecs.value
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  return `${m}m ${sec.toString().padStart(2, '0')}s`
})

const uploadStatusLabel = computed(() => {
  if (state.value === 'preparing') {
    return preparingSyncMessage.value || 'Finishing recording'
  }
  if (compressing.value) {
    if (compressKind.value === 'remux') return 'Wrapping replay'
    if (compressKind.value === 'transcode') return 'Converting replay format'
    return 'Compressing replay'
  }
  if (uploadProgress.value < 15) return 'Preparing replay'
  if (uploadProgress.value < 70) return 'Uploading recording'
  if (uploadProgress.value < 100) return 'Finalising upload'
  return 'Handing off to analysis'
})

const compressHint = computed(() => {
  if (compressKind.value === 'remux') {
    return 'OBS saved in a container format we need to wrap for upload — usually under a minute with no re-encoding.'
  }
  if (compressKind.value === 'transcode') {
    return 'OBS saved as MKV or an incompatible codec — converting before upload (one-time, may take a few minutes).'
  }
  return 'OBS recorded a large file — shrinking to upload size (one-time, may take a few minutes on CPU; faster with NVIDIA/AMD GPU).'
})

const analysisStatusLabel = computed(() => {
  const status = analysisJobStatus.value
  if (status === 'queued') return 'Queued'
  if (status === 'processing') return 'Processing'
  return 'Working'
})

const uploadEta = computed(() => {
  const pct = uploadProgress.value
  if (pct <= 0 || pct >= 100 || !uploadStartedAt.value) return null
  const elapsed = (Date.now() - uploadStartedAt.value) / 1000
  const total = elapsed / (pct / 100)
  const remaining = Math.max(0, Math.round(total - elapsed))
  if (remaining < 5) return null
  if (remaining < 60) return `~${remaining}s remaining`
  return `~${Math.ceil(remaining / 60)}m remaining`
})

const roundTimelineCells = computed(() => {
  const ally = Math.max(0, result.value?.ally_score ?? 0)
  const enemy = Math.max(0, result.value?.enemy_score ?? 0)
  if (!ally && !enemy) return [] as Array<{ key: string; type: 'win' | 'loss'; label: number }>

  return [
    ...Array.from({ length: ally }, (_, index) => ({ key: `win-${index}`, type: 'win' as const, label: index + 1 })),
    ...Array.from({ length: enemy }, (_, index) => ({ key: `loss-${index}`, type: 'loss' as const, label: ally + index + 1 })),
  ]
})

function clearPreparingStuckTimer() {
  if (preparingStuckTimer) {
    clearTimeout(preparingStuckTimer)
    preparingStuckTimer = null
  }
}

function startPreparingStuckTimer() {
  clearPreparingStuckTimer()
  preparingStuckTimer = setTimeout(() => {
    if (state.value !== 'preparing') return
    void syncPostGameSession().then(() => {
      if (state.value !== 'preparing') return
      preparingSyncMessage.value = 'Still preparing — if this persists, close and use the dashboard to upload.'
    })
  }, 20_000)
}

function resetAnalysisUi() {
  analysisProgress.value = 0
  analysisStep.value = null
  analysisJobStatus.value = 'processing'
  analysisStuck.value = false
  analysisLongRunning.value = false
  analysisDeferredReason.value = null
}

function checkAnalysisNow() {
  void (async () => {
    try {
      await window.api.analyses.reconcileStuck()
      await window.api.recordings.get()
    } catch { /* ignore */ }
  })()
}

function startStuckTimer() {
  if (stuckTimer) clearTimeout(stuckTimer)
  if (reconcileKickTimer) clearTimeout(reconcileKickTimer)
  resetAnalysisUi()
  analysisStartedAt.value = Date.now()
  analysisElapsedSecs.value = 0
  stuckTimer = setTimeout(() => { analysisStuck.value = true }, 8 * 60 * 1000)
  reconcileKickTimer = setTimeout(checkAnalysisNow, 30_000)
  tipTimer = setInterval(() => {
    tipIndex.value = (tipIndex.value + 1) % COACHING_TIPS.length
  }, 15000)
  elapsedInterval = setInterval(() => {
    if (analysisStartedAt.value) {
      analysisElapsedSecs.value = Math.floor((Date.now() - analysisStartedAt.value) / 1000)
    }
  }, 1000)
}

function clearStuckTimer() {
  if (stuckTimer) { clearTimeout(stuckTimer); stuckTimer = null }
  if (reconcileKickTimer) { clearTimeout(reconcileKickTimer); reconcileKickTimer = null }
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  analysisStuck.value = false
  analysisLongRunning.value = false
  analysisDeferredReason.value = null
}

const gameLabel = computed(() => recordingGameLabel(gameInfo.value.game))

const matchHeadline = computed(() => {
  if (gameInfo.value.game === 'cs2') {
    return gameInfo.value.map ? cs2MapDisplayName(gameInfo.value.map) : 'CS2 match'
  }
  if (gameInfo.value.game === 'deadlock') {
    return gameInfo.value.agent || gameInfo.value.map || 'Deadlock match'
  }
  return gameInfo.value.agent || gameLabel.value
})

const preparingTitle = computed(() => {
  if (state.value !== 'preparing') {
    return compressing.value
      ? (uploadStatusLabel.value === 'Converting replay format' ? 'Converting replay' : 'Compressing replay')
      : 'Sending to coach'
  }
  if (gameInfo.value.game === 'cs2' && preparingSyncMessage.value?.includes('demo')) {
    return 'Waiting for CS2 demo'
  }
  return 'Getting replay ready'
})

const replayNotFoundHint = computed(() => {
  if (gameInfo.value.game === 'deadlock') {
    return 'No replay found — enable replay saving in Deadlock settings'
  }
  return 'No demo yet — GOTV replays usually take 5–15 minutes (download in CS2 or enable auto-record)'
})

const topIssue = computed(() => {
  if (!result.value) return null
  return (result.value as Record<string, unknown>).top_issue as string | null
})

const improvements = computed<string[]>(() => {
  if (!result.value) return []
  const raw = (result.value as Record<string, unknown>).priority_improvements
  if (Array.isArray(raw)) return (raw as string[]).slice(0, 3)
  return []
})

// --- Training CTA removed from compact toast — available in full report ---
const cardExporting = ref(false)
const cardExportDone = ref(false)
const copiedLinkToast = ref(false)
const toastMessage = ref('Copied')
const isReady = ref(false)
const debriefText = ref<string | null>(null)
const debriefLoading = ref(false)
const debriefFailed = ref(false)
const debriefDiscordLinked = ref(true)
const demoStatus = ref<{ status: string; jobId?: string; error?: string } | null>(null)
const demoProgress = ref(0)
const demoRescanning = ref(false)

async function retryDemoScan() {
  if (demoRescanning.value) return
  demoRescanning.value = true
  demoStatus.value = { status: 'uploading' }
  try {
    const res = await window.api.postGame.retryDemoScan()
    if (!res.ok) {
      demoStatus.value = { status: 'not-found' }
    } else if (gameInfo.value.game === 'cs2') {
      demoStatus.value = { status: 'uploading' }
      await syncPostGameSession()
    }
  } catch {
    demoStatus.value = { status: 'error', error: 'Scan failed' }
  } finally {
    demoRescanning.value = false
  }
}
let copiedLinkTimer: ReturnType<typeof setTimeout> | null = null

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

const agentImageUrl = computed(() => {
  if (isCs2Game.value && gameInfo.value.map && isCs2Map(gameInfo.value.map)) {
    return getCs2RadarUrl(gameInfo.value.map)
  }
  return gameInfo.value.agent ? getAgentImage(gameInfo.value.agent) : ''
})
const agentImageBroken = ref(false)
watch(() => gameInfo.value.agent, () => { agentImageBroken.value = false })
watch(() => gameInfo.value.map, () => { agentImageBroken.value = false })
const agentAccentColor = computed(() => {
  if (isCs2Game.value) return '#3b82f6'
  if (gameInfo.value.game === 'deadlock') return '#eab308'
  return gameInfo.value.agent ? getAgentColor(gameInfo.value.agent) : ''
})
const mapSplashUrl = computed(() => {
  if (isCs2Game.value && gameInfo.value.map && isCs2Map(gameInfo.value.map)) {
    return getCs2RadarUrl(gameInfo.value.map)
  }
  return gameInfo.value.map ? getMapImage(gameInfo.value.map) : ''
})
const mapMinimapUrl = computed(() => gameInfo.value.map ? getMapMinimap(gameInfo.value.map) : '')

const localSpatialSummary = ref<MatchSpatialSummary | null>(null)
const localDuelManifest = ref<DuelMomentManifest[]>([])

async function refreshLocalTimelineMeta() {
  const id = vodRecordingId.value
  if (!id) {
    localSpatialSummary.value = null
    localDuelManifest.value = []
    return
  }
  try {
    const tl = await window.api.recordings.getTimeline(id)
    localSpatialSummary.value = tl?.spatialSummary ?? null
    localDuelManifest.value = (tl as { duelMoments?: DuelMomentManifest[] } | null)?.duelMoments ?? []
  } catch {
    localSpatialSummary.value = null
    localDuelManifest.value = []
  }
}

/** @deprecated use refreshLocalTimelineMeta */
async function refreshLocalSpatialSummary() {
  await refreshLocalTimelineMeta()
}

const spatialSummary = computed((): MatchSpatialSummary | null => {
  const api = result.value?.spatial_summary ?? null
  if (api?.events?.length) return api
  if (localSpatialSummary.value?.events?.length) return localSpatialSummary.value
  return api ?? localSpatialSummary.value
})

const pendingDuelMoments = computed(() => localDuelManifest.value)

const coachSuggestedRounds = computed(() => {
  const events = spatialSummary.value?.events ?? []
  const rounds = new Set<number>()
  for (const ev of events) {
    if (ev.type === 'death' && ev.round != null) rounds.add(ev.round + 1)
  }
  return [...rounds].sort((a, b) => a - b).slice(0, 8)
})

function toggleCoachRound(round: number) {
  const idx = coachSelectedRounds.value.indexOf(round)
  if (idx >= 0) {
    coachSelectedRounds.value.splice(idx, 1)
    return
  }
  if (coachSelectedRounds.value.length < 5) {
    coachSelectedRounds.value.push(round)
    coachSelectedRounds.value.sort((a, b) => a - b)
  }
}

const vodRecordingId = computed(() => sessionRecordingId.value ?? pendingRecordingId.value)

async function openVodReview() {
  const id = vodRecordingId.value
  if (!id) return
  await window.api.app.openVodReview(id)
  dismiss()
}

/** One glanceable line — never a paragraph above the fold. */
const focusHero = computed(() =>
  buildFocusHeroCopy({
    topIssue: topIssue.value,
    priorityImprovements: improvements.value,
    verdict: result.value?.verdict ?? null,
    heatmapInsight: spatialSummary.value?.heatmapInsight ?? spatialSummary.value?.patterns?.[0] ?? null,
    highlightReason: result.value?.match_highlights?.[0]?.reason ?? null,
    profile: result.value?.skill_profile ?? null,
  }),
)

const topCarouselHighlight = computed((): MatchHighlight | null => {
  const recap = buildMatchHighlights({
    priorityImprovements: improvements.value,
    topIssue: topIssue.value,
    coachingTags: result.value?.coaching_tags,
    overallScore: result.value?.overall_score ?? null,
    spatialSummary: spatialSummary.value,
    sessionClips: sessionClips.value,
    apiHighlights: result.value?.match_highlights ?? null,
  })
  return recap.featured[0] ?? null
})

const carouselPanelCount = computed(() => {
  let n = 0
  if (focusHero.value?.headline) n++
  if (result.value?.overall_score != null) n++
  if (topCarouselHighlight.value) n++
  if (debriefLoading.value || debriefText.value || debriefFailed.value) n++
  if (sessionClipCount.value > 0) n++
  return n
})

const carouselPanelsHint = computed(() =>
  carouselPanelCount.value > 1 ? 'Insights rotate automatically · hover to pause' : '',
)

/** True when we have a real tracked score (not 0-0 fallback) */
const hasTrackedScore = computed(() =>
  result.value != null &&
  ((result.value.ally_score ?? 0) > 0 || (result.value.enemy_score ?? 0) > 0)
)
/** True when match_result is a real outcome (win/loss) with tracked score */
const hasMatchResult = computed(() =>
  (result.value?.match_result === 'win' || result.value?.match_result === 'loss') && hasTrackedScore.value
)
const glowBgStyle = computed(() => {
  if (agentAccentColor.value) {
    return { background: `radial-gradient(ellipse, ${agentAccentColor.value}28 0%, transparent 70%)` }
  }
  const fallbacks: Record<string, string> = {
    ready: 'rgba(34,197,94,0.10)',
    pending: 'rgba(255,70,85,0.08)',
    error: 'rgba(255,70,85,0.10)',
    uploading: 'rgba(255,70,85,0.08)',
    analysing: 'rgba(255,70,85,0.08)',
  }
  return { background: fallbacks[state.value] ?? 'rgba(255,70,85,0.06)' }
})

watch(
  [state, uploadProgress, analysisProgress, analysisStep, analysisLongRunning, analysisDeferredReason, analysisStuck, errorMessage, pendingAnalysisReady],
  scheduleFitWindow,
)

watch(isReady, (ready) => { if (ready) scheduleFitWindow() })

onMounted(() => {
  window.api.discord.setState('reviewing').catch(() => {})
  window.api.app.getStatus().then(s => { if (s.user?.tier) userTier.value = s.user.tier }).catch(() => {})
  window.api.profile.get().then(p => { subscriptionEndsAt.value = p?.user?.analysis_stats?.subscription_ends_at ?? null }).catch(() => {})
  setTimeout(() => {
    isReady.value = true
  }, 40)
  if (typeof ResizeObserver !== 'undefined') {
    contentResizeObserver = new ResizeObserver(scheduleFitWindow)
    void nextTick(() => {
      if (contentRoot.value) contentResizeObserver?.observe(contentRoot.value)
    })
  }
  scheduleFitWindow()
  const ipcCleanup: (() => void)[] = []
  ipcCleanup.push(window.api.on('post-game:preparing', (...args: unknown[]) => {
    const data = args[0] as { game: string; map: string | null; agent: string | null }
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (state.value === 'uploading' || state.value === 'analysing') return
    preparingSyncMessage.value = null
    state.value = 'preparing'
    uploadProgress.value = 0
    compressing.value = false
    compressKind.value = null
    startPreparingStuckTimer()
  }))
  ipcCleanup.push(window.api.on('post-game:prep-step', (...args: unknown[]) => {
    const data = args[0] as { game?: string; map?: string | null; agent?: string | null }
    if (data?.game) {
      gameInfo.value = { game: data.game, map: data.map ?? null, agent: data.agent ?? null }
    }
    clearPreparingStuckTimer()
    state.value = 'uploading'
    compressing.value = false
    compressKind.value = null
    uploadProgress.value = 0
    uploadStartedAt.value = Date.now()
  }))
  ipcCleanup.push(window.api.on('post-game:compress-start', (...args: unknown[]) => {
    const data = args[0] as { sizeGB?: string }
    state.value = 'uploading'
    compressing.value = true
    uploadProgress.value = 0
    if (data?.sizeGB === 'remux') compressKind.value = 'remux'
    else if (data?.sizeGB === 'transcode') compressKind.value = 'transcode'
    else if (data?.sizeGB) compressKind.value = 'shrink'
    else compressKind.value = 'shrink'
    if (data?.sizeGB && data.sizeGB !== 'transcode' && data.sizeGB !== 'remux') {
      errorMessage.value = ''
    }
  }))
  ipcCleanup.push(window.api.on('post-game:upload-start', (...args: unknown[]) => {
    state.value = 'uploading'
    compressing.value = false
    compressKind.value = null
    uploadProgress.value = 0
    const data = args[0] as { game: string; map: string | null; agent: string | null; matchDetailsStatus?: typeof matchDataStatus.value; killsInTimeline?: number; archiveOnly?: boolean }
    archiveOnlyUpload.value = !!data.archiveOnly
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (data.matchDetailsStatus) matchDataStatus.value = data.matchDetailsStatus
    killsCapured.value = data.killsInTimeline ?? 0
    uploadStartedAt.value = Date.now()
  }))
  ipcCleanup.push(window.api.on('post-game:upload-progress', (...args: unknown[]) => { uploadProgress.value = args[0] as number }))
  ipcCleanup.push(window.api.on('post-game:upload-complete', (...args: unknown[]) => {
    const data = args[0] as { archiveOnly?: boolean } | undefined
    if (data?.archiveOnly) {
      archiveOnlyUpload.value = false
      savingToCloud.value = false
      state.value = 'archived'
      return
    }
    state.value = 'analysing'
    void refreshLocalTimelineMeta()
    startStuckTimer()
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-progress', (...args: unknown[]) => {
    const data = args[0] as {
      progress?: number
      current_step?: string | null
      status?: string
      elapsed_ms?: number
    }
    if (typeof data.progress === 'number') {
      analysisProgress.value = Math.min(100, Math.max(0, Math.round(data.progress)))
    }
    if (data.current_step) analysisStep.value = data.current_step
    if (data.status) analysisJobStatus.value = data.status
    if (data.elapsed_ms && data.elapsed_ms > 0 && analysisStartedAt.value) {
      const serverElapsed = Math.floor(data.elapsed_ms / 1000)
      if (serverElapsed > analysisElapsedSecs.value) {
        analysisElapsedSecs.value = serverElapsed
      }
    }
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-long-running', () => {
    analysisLongRunning.value = true
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-deferred', (...args: unknown[]) => {
    const data = args[0] as { reason?: 'recording' | 'server' }
    analysisDeferredReason.value = data?.reason ?? 'server'
    analysisLongRunning.value = true
  }))
  ipcCleanup.push(window.api.on('post-game:upload-deferred', (...args: unknown[]) => {
    const data = args[0] as { reason?: 'recording' | 'server' }
    analysisDeferredReason.value = data?.reason ?? 'recording'
    analysisLongRunning.value = true
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-ready', (...args: unknown[]) => {
    clearStuckTimer()
    const r = args[0] as typeof result.value & { session_start?: number; recording_id?: string | null; match_id?: string | null }
    result.value = r
    if (r?.recording_id) sessionRecordingId.value = r.recording_id
    matchId.value = r?.match_id ?? null
    sessionStart = r?.session_start ?? 0
    state.value = 'ready'
    loadSessionClips()
    void refreshLocalSpatialSummary()
    void loadMyCoaches()
    void loadCategoryPercentiles()

    // Browser launch is handled by the main process (index.ts) so it fires
    // even if this window was closed before analysis completed.
  }))
  ipcCleanup.push(window.api.on('clips:new', () => {
    if (state.value === 'ready') void loadSessionClips()
  }))
  ipcCleanup.push(window.api.on('spatial:population-updated', (...args: unknown[]) => {
    const summary = args[0] as MatchSpatialSummary
    if (summary?.events?.length) localSpatialSummary.value = summary
  }))
  ipcCleanup.push(window.api.on('post-game:pending', (...args: unknown[]) => {
    const data = args[0] as {
      recordingId: string
      game: string
      map: string | null
      agent: string | null
      analysisReadiness?: { ready: boolean; state: string; message: string }
    }
    pendingRecordingId.value = data.recordingId
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (data.analysisReadiness) {
      applyAnalysisReadiness(data.analysisReadiness)
    } else {
      void refreshPendingReadiness()
    }
    state.value = 'pending'
    void refreshLocalSpatialSummary()
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-readiness', (...args: unknown[]) => {
    const readiness = args[0] as { ready: boolean; state: string; message: string }
    if (state.value === 'preparing' || state.value === 'uploading') {
      const cs2DemoWait = gameInfo.value.game === 'cs2' && readiness.state === 'syncing'
      preparingSyncMessage.value = readiness.message
        || (cs2DemoWait
        ? 'Waiting for CS2 demo — GOTV replays usually take 5–15 minutes'
          : readiness.state === 'syncing'
            ? 'Syncing match stats…'
            : readiness.state === 'finalizing'
              ? 'Finalizing recording…'
              : 'Preparing your match for analysis')
    }
    if (state.value === 'pending') {
      applyAnalysisReadiness(readiness)
    }
  }))
  ipcCleanup.push(window.api.on('recordings:updated', () => {
    if (state.value === 'pending') void refreshPendingReadiness()
  }))
  ipcCleanup.push(window.api.on('post-game:upload-error', (...args: unknown[]) => {
    const payload = args[0] as string | AnalysisErrorPayload & { needsUpgrade?: boolean; upgradeUrl?: string; ppaUrl?: string; clipsOnly?: boolean; recordingId?: string }
    needsUpgrade.value = false
    needsArchiveUpgrade.value = false
    clipsOnlyError.value = false
    savingToCloud.value = false
    archiveOnlyUpload.value = false
    if (typeof payload === 'string') {
      errorDetails.value = buildAnalysisErrorPayload(payload)
      errorMessage.value = errorDetails.value.message
    } else {
      errorDetails.value = buildAnalysisErrorPayload(payload.message, payload)
      errorMessage.value = payload.message
      if (payload.recordingId) pendingRecordingId.value = payload.recordingId
      if (payload.clipsOnly) clipsOnlyError.value = true
      if (payload.needsUpgrade) {
        needsUpgrade.value = true
        needsArchiveUpgrade.value = /archive.limit|cloud storage/i.test(payload.message)
        upgradeUrl.value = payload.upgradeUrl || 'https://upforge.gg/pricing'
        ppaUrl.value = payload.ppaUrl || 'https://upforge.gg/valorant/analyze'
      }
    }
    state.value = 'error'
  }))
  ;(window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup = ipcCleanup

  // Debrief arrives asynchronously — show it when ready
  ipcCleanup.push(window.api.on('post-game:debrief-loading', () => {
    debriefLoading.value = true
    debriefFailed.value = false
    startDebriefTimeout()
  }))
  ipcCleanup.push(window.api.on('post-game:debrief', (...args: unknown[]) => {
    const data = args[0] as { debrief: string; agent: string | null; map: string | null; discordLinked?: boolean } | null
    clearDebriefTimeout()
    if (data?.debrief) {
      debriefText.value = data.debrief
      debriefDiscordLinked.value = data.discordLinked ?? false
    } else if (!data) {
      debriefFailed.value = true
    }
    debriefLoading.value = false
  }))

  // CS2 demo status listeners
  ipcCleanup.push(window.api.on('post-game:demo-status', (...args: unknown[]) => {
    demoStatus.value = args[0] as typeof demoStatus.value
  }))
  ipcCleanup.push(window.api.on('post-game:demo-progress', (...args: unknown[]) => {
    demoProgress.value = args[0] as number
  }))

  void syncPostGameSession().then(() => {
    if (debriefLoading.value) startDebriefTimeout()
  })

  // Dev preview: rich mock ready state (skip upload wait)
  if (window.location.hash.includes('post-game-preview') || window.location.pathname.includes('post-game-preview')) {
    const previewSessionStart = Date.now() - 35 * 60 * 1000
    sessionStart = previewSessionStart
    matchId.value = 'preview-match-id'
    gameInfo.value = { game: 'valorant', map: 'Bind', agent: 'Jett' }
    debriefText.value = 'You won key duels on A site but gave up map control after losing mid. Next game: default B until you have info on rotate timing.'
    debriefLoading.value = false
    result.value = {
      overall_score: 72,
      analysis_id: 999,
      kills: 18,
      deaths: 14,
      assists: 6,
      match_result: 'win',
      ally_score: 13,
      enemy_score: 11,
      top_issue: 'Positioning during post-plant — caught in the open on 4 of 6 clutch attempts.',
      priority_improvements: [
        'Hold off-angles after plant instead of wide peeking.',
        'Pre-aim head height on B site entries.',
        'Avoid force-buying after pistol loss.',
      ],
      verdict: 'Solid fragging with fixable post-plant habits.',
      coaching_tags: ['positioning', 'post_plant'],
      match_highlights: [{
        id: 'preview-h1',
        kind: 'mistake',
        title: 'Wide swing after plant',
        reason: 'You peeked A main alone with 20s left — traded 1 for 1 but lost the round win condition.',
        round: 11,
        videoOffsetMs: 312000,
        clipId: null,
        rank: 90,
      }],
    }
    sessionClipCount.value = 3
    state.value = 'ready'
    scheduleFitWindow()
  }
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
  clearDebriefTimeout()
  clearStuckTimer()
  clearPreparingStuckTimer()
  if (copiedLinkTimer) clearTimeout(copiedLinkTimer)
  if (fitHeightTimer) clearTimeout(fitHeightTimer)
  contentResizeObserver?.disconnect()
  contentResizeObserver = null
  const cleanup = (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
  cleanup?.forEach(fn => fn())
  delete (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
})

async function saveToCloudNow() {
  if (!pendingRecordingId.value || savingToCloud.value || analysing.value) return
  savingToCloud.value = true
  state.value = 'uploading'
  uploadProgress.value = 0
  archiveOnlyUpload.value = true
  try {
    const result = await window.api.recordings.saveToCloud(pendingRecordingId.value)
    if (result.alreadySaved) {
      state.value = 'archived'
      return
    }
    if (!result.ok) {
      state.value = 'error'
      errorMessage.value = result.error ?? 'Could not save to cloud'
      if (/archive.limit|cloud storage/i.test(result.error ?? '')) {
        needsUpgrade.value = true
        needsArchiveUpgrade.value = true
      }
    }
  } catch {
    state.value = 'error'
    errorMessage.value = 'Could not save to cloud. Try again from the dashboard.'
  } finally {
    savingToCloud.value = false
  }
}

async function refreshPendingReadiness() {
  if (!pendingRecordingId.value) return
  const list = await window.api.recordings.get().catch(() => [])
  const rec = list.find((r) => r.id === pendingRecordingId.value)
  if (rec?.analysisReadiness) {
    applyAnalysisReadiness(rec.analysisReadiness)
  }
}

async function analyseNow() {
  if (!pendingRecordingId.value || analysing.value) return
  if (!pendingAnalysisReady.value) {
    errorMessage.value = pendingAnalysisMessage.value
    return
  }
  analysing.value = true
  state.value = 'uploading'
  uploadProgress.value = 0
  try {
    await window.api.recordings.analyse(pendingRecordingId.value)
    // The analysis events (upload-start, progress, etc.) will be received via IPC
  } catch {
    state.value = 'error'
    errorMessage.value = 'Could not start analysis. Please try from the dashboard.'
  } finally {
    analysing.value = false
  }
}

async function dismissPending() {
  if (pendingRecordingId.value) {
    // Don't remove from store — user can still analyse later from the dashboard
  }
  window.close()
}

function retryUpload() {
  // Reset to uploading state — the main process will re-emit the upload events
  // if there's still a pending recording; otherwise prompt the user to use the dashboard
  if (pendingRecordingId.value) {
    state.value = 'uploading'
    uploadProgress.value = 0
    window.api.recordings.analyse(pendingRecordingId.value).catch(() => {
      state.value = 'error'
      errorMessage.value = 'Retry failed. Try analysing from the dashboard.'
    })
  } else {
    errorMessage.value = 'Recording no longer available. Open the dashboard to retry.'
  }
}

async function loadSessionClips() {
  try {
    const clips = await window.api.clips.get({ game: gameInfo.value.game })
    const session = filterSessionClips(clips, {
      matchId: matchId.value,
      agent: gameInfo.value.agent,
      sessionStart,
    })
    sessionClips.value = session
    sessionClipCount.value = session.length
  } catch {
    sessionClips.value = []
    sessionClipCount.value = 0
  }
}

async function openClips() {
  // Don't close the post-game window — user may want to come back and analyse the VOD
  await window.api.app.showClips().catch(() => {})
}

const analysisUrl = computed(() => {
  if (!result.value?.analysis_id) return ''
  const game = isPrimaryGame(gameInfo.value.game) ? gameInfo.value.game : normalizePrimaryGame(gameInfo.value.game)
  return analysisResultsUrl(game as PrimaryGame, result.value.analysis_id)
})

function viewFullAnalysis() {
  if (analysisUrl.value) {
    window.open(analysisUrl.value, '_blank')
  }
  dismiss()
}

async function submitAnalysisFeedback(rating: 'thumbs_up' | 'thumbs_down') {
  const analysisId = result.value?.analysis_id
  if (!analysisId || feedbackSubmitting.value || feedbackSubmitted.value) return
  feedbackRating.value = rating
  feedbackSubmitting.value = true
  try {
    const res = await window.api.analyses.submitFeedback({
      analysisId,
      rating,
      feedbackText: rating === 'thumbs_down' ? feedbackText.value.trim() : undefined,
    })
    if (res.ok) {
      feedbackSubmitted.value = true
    }
  } finally {
    feedbackSubmitting.value = false
  }
}

async function loadMyCoaches() {
  coachesLoaded.value = false
  try {
    const coaches = await window.api.coach.getMyCoaches()
    myCoaches.value = coaches
    const eligible = coaches.filter(c => c.roster_is_live !== false && c.can_request_review !== false)
    const storedId = Number(localStorage.getItem(LAST_COACH_KEY))
    const storedCoach = eligible.find(c => c.coach_id === storedId)
    if (storedCoach) {
      selectedCoachId.value = storedCoach.coach_id
    } else if (eligible.length === 1) {
      selectedCoachId.value = eligible[0].coach_id
    } else if (eligible.length > 1) {
      selectedCoachId.value = eligible[0].coach_id
    } else {
      selectedCoachId.value = null
    }
    const analysisId = result.value?.analysis_id
    if (analysisId && coaches.length) {
      const existing = await window.api.coach.getAnalysisReview(analysisId).catch(() => null)
      if (existing?.source === 'roster' && ['pending', 'in_progress', 'completed'].includes(existing.status)) {
        coachReviewSent.value = true
        coachReviewStatus.value = existing.status as 'pending' | 'in_progress' | 'completed'
      } else {
        coachReviewStatus.value = null
      }
    }
  } catch {
    myCoaches.value = []
    flashToast('Could not load your coaches — try again from My Coaches on the web')
  } finally {
    coachesLoaded.value = true
  }
}

async function submitCoachReview() {
  const analysisId = result.value?.analysis_id
  const coachId = selectedCoachId.value
  if (!analysisId || !coachId || coachReviewSubmitting.value || coachReviewSent.value) return
  coachReviewSubmitting.value = true
  try {
    const res = await window.api.coach.requestRosterReview({
      analysisId,
      coachId,
      question: coachQuestion.value.trim() || undefined,
      roundNumbers: coachSelectedRounds.value.length ? coachSelectedRounds.value : undefined,
    })
    if (res.ok) {
      coachReviewSent.value = true
      coachReviewStatus.value = 'pending'
      localStorage.setItem(LAST_COACH_KEY, String(coachId))
      flashToast(`Sent to ${selectedCoachName.value}`)
    } else {
      flashToast(res.error || 'Could not send review request')
    }
  } catch {
    flashToast('Could not send review request')
  } finally {
    coachReviewSubmitting.value = false
  }
}

function openFindCoaches() {
  window.open('https://upforge.gg/coaches', '_blank')
}

function dismiss() { window.close() }

async function openCoachNotesFromPostGame() {
  const analysisId = result.value?.analysis_id
  if (!analysisId || coachNotesOpening.value) return
  coachNotesOpening.value = true
  try {
    const ok = await openAnalysisVodReview(router, analysisId, { coachNotes: true })
    if (ok) dismiss()
    else flashToast('Could not open coach notes — try from the dashboard')
  } catch {
    flashToast('Could not open coach notes — try again')
  } finally {
    coachNotesOpening.value = false
  }
}
function openUpgrade() { window.open(upgradeUrl.value, '_blank') }
function openPpa() { window.open(ppaUrl.value, '_blank') }

async function copyAnalysisLink() {
  if (!analysisUrl.value) return
  await navigator.clipboard.writeText(analysisUrl.value).catch(() => {})
  toastMessage.value = 'Copied analysis link'
  copiedLinkToast.value = true
  if (copiedLinkTimer) clearTimeout(copiedLinkTimer)
  copiedLinkTimer = setTimeout(() => {
    copiedLinkToast.value = false
    copiedLinkTimer = null
  }, 2000)
}

function flashToast(message: string) {
  toastMessage.value = message
  copiedLinkToast.value = true
  if (copiedLinkTimer) clearTimeout(copiedLinkTimer)
  copiedLinkTimer = setTimeout(() => {
    copiedLinkToast.value = false
    copiedLinkTimer = null
  }, 2200)
}

async function copyScore() {
  if (!result.value?.overall_score) return
  const text = `UpForge Score: ${result.value.overall_score * 10}/1000 (${scoreGrade(result.value.overall_score)} — ${scoreLabel(result.value.overall_score)})`
  await navigator.clipboard.writeText(text).catch(() => {})
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const words = text.split(' ')
  let line = ''
  let cy = y
  for (const word of words) {
    const test = line + word + ' '
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, cy)
      line = word + ' '
      cy += lineH
    } else {
      line = test
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), x, cy)
  return cy
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
    setTimeout(() => resolve(null), 3000)
  })
}

async function exportAnalysis() {
  if (cardExporting.value || !result.value) return
  cardExporting.value = true
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const ctx = canvas.getContext('2d')!

    const score = result.value.overall_score ?? 0
    const scoreColor = score >= 78 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171'

    // Background
    ctx.fillStyle = '#0a0a0c'
    ctx.fillRect(0, 0, 1200, 630)

    // Grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'
    ctx.lineWidth = 1
    for (let x = 0; x <= 1200; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke()
    }
    for (let y = 0; y <= 630; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke()
    }

    // Top accent bar
    const accentGrad = ctx.createLinearGradient(0, 0, 1200, 0)
    accentGrad.addColorStop(0, '#ff4655')
    accentGrad.addColorStop(1, '#c4323e')
    ctx.fillStyle = accentGrad
    ctx.fillRect(0, 0, 1200, 5)

    // --- Left panel ---
    // "UPFORGE"
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 52px system-ui, -apple-system, sans-serif'
    ctx.fillText('UPFORGE', 60, 80)

    // "AI COACHING REPORT"
    ctx.fillStyle = '#ff4655'
    ctx.font = '14px system-ui, -apple-system, sans-serif'
    ctx.fillText('AI COACHING REPORT', 60, 105)

    // Divider line
    ctx.strokeStyle = '#ff4655'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(60, 120); ctx.lineTo(460, 120); ctx.stroke()

    // Agent · Map · Game label
    const agentName = gameInfo.value.agent || ''
    const mapName = gameInfo.value.map || ''
    const gameName = gameInfo.value.game === 'cs2' ? 'CS2' : 'VALORANT'
    const labelParts = [agentName, mapName, gameName].filter(Boolean)
    ctx.fillStyle = '#6b7280'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText(labelParts.join(' · '), 60, 148)

    // Score number (×10 = 0-1000 display)
    ctx.fillStyle = scoreColor
    ctx.font = 'bold 110px system-ui, -apple-system, sans-serif'
    const scoreStr = String(score * 10)
    const scoreW = ctx.measureText(scoreStr).width
    ctx.fillText(scoreStr, 60, 285)

    // "/1000"
    ctx.fillStyle = '#4b5563'
    ctx.font = '22px system-ui, -apple-system, sans-serif'
    ctx.fillText('/1000', 60 + scoreW + 8, 263)

    // Grade badge
    const grade = scoreGrade(score)
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
    const gradeW = ctx.measureText(grade).width
    const badgeX = 60
    const badgeY = 298
    const badgeW = gradeW + 24
    const badgeH = 36
    ctx.fillStyle = scoreColor + '22'
    roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 8)
    ctx.fill()
    ctx.strokeStyle = scoreColor + '55'
    ctx.lineWidth = 1
    roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 8)
    ctx.stroke()
    ctx.fillStyle = scoreColor
    ctx.fillText(grade, badgeX + 12, badgeY + 27)

    // Score bar
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    roundRectPath(ctx, 60, 345, 400, 8, 4)
    ctx.fill()
    ctx.fillStyle = scoreColor
    roundRectPath(ctx, 60, 345, Math.round(400 * score / 100), 8, 4)
    ctx.fill()

    const percentileEntries = Object.entries(categoryPercentiles.value)
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.percentile - b.percentile)
      .slice(0, 3)

    let kdaY = 375
    if (percentileEntries.length) {
      ctx.fillStyle = '#374151'
      ctx.font = 'bold 10px system-ui, sans-serif'
      ctx.fillText(`VS ${(percentileTier.value || 'YOUR RANK').toUpperCase()}`, 60, 368)
      let py = 388
      for (const item of percentileEntries) {
        const label = (item.label || item.key).replace(/_/g, ' ')
        const pctColor =
          item.percentile >= 75 ? '#4ade80'
            : item.percentile >= 50 ? '#60a5fa'
              : item.percentile >= 25 ? '#fbbf24'
                : '#f87171'
        ctx.fillStyle = '#9ca3af'
        ctx.font = '12px system-ui, sans-serif'
        const labelText = label.length > 22 ? `${label.slice(0, 21)}…` : label
        ctx.fillText(labelText, 60, py)
        ctx.fillStyle = pctColor
        ctx.font = 'bold 12px system-ui, sans-serif'
        ctx.fillText(`${item.percentile}th`, 420, py)
        py += 6
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        roundRectPath(ctx, 60, py, 360, 5, 2)
        ctx.fill()
        ctx.fillStyle = pctColor
        roundRectPath(ctx, 60, py, Math.max(8, Math.round(360 * item.percentile / 100)), 5, 2)
        ctx.fill()
        py += 20
      }
      kdaY = py + 4
    }

    // K/D/A row
    const kills = result.value.kills
    const deaths = result.value.deaths
    const assists = result.value.assists
    if (kills != null) {
      ctx.fillStyle = '#6b7280'
      ctx.font = '15px system-ui, -apple-system, sans-serif'
      const kdaStr = `${kills} / ${deaths ?? '?'} / ${assists ?? '?'}  K/D/A`
      ctx.fillText(kdaStr, 60, kdaY)
    }

    // Match result badge
    const matchResult = result.value.match_result
    if (matchResult) {
      const isWin = matchResult === 'win'
      const badgeText = isWin ? 'WIN' : 'LOSS'
      const badgeBg = isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'
      const badgeStroke = isWin ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'
      const badgeTextColor = isWin ? '#4ade80' : '#f87171'
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
      const bw = ctx.measureText(badgeText).width + 16
      const bx = kills != null ? 60 + ctx.measureText(`${kills} / ${deaths ?? '?'} / ${assists ?? '?'}  K/D/A`).width + 12 : 60
      ctx.fillStyle = badgeBg
      roundRectPath(ctx, bx, kdaY - 12, bw, 18, 4)
      ctx.fill()
      ctx.strokeStyle = badgeStroke
      ctx.lineWidth = 1
      roundRectPath(ctx, bx, kdaY - 12, bw, 18, 4)
      ctx.stroke()
      ctx.fillStyle = badgeTextColor
      ctx.fillText(badgeText, bx + 8, kdaY)
    }

    // --- Right panel ---
    const hero = focusHero.value
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
    ctx.fillText('AI COACHING FOCUS', 560, 80)

    if (hero?.recurrence) {
      ctx.fillStyle = '#fbbf24'
      ctx.font = '10px system-ui, -apple-system, sans-serif'
      ctx.fillText(hero.recurrence, 560, 98)
    }

    const coachingPoints: string[] = []
    if (hero?.headline) coachingPoints.push(hero.headline)
    if (hero?.subline) coachingPoints.push(hero.subline)
    for (const imp of improvements.value) {
      if (coachingPoints.length >= 3) break
      if (!coachingPoints.some((p) => p.includes(imp.slice(0, 24)))) coachingPoints.push(imp)
    }
    if (!coachingPoints.length && topIssue.value) coachingPoints.push(topIssue.value)

    let pointY = hero?.recurrence ? 125 : 115
    coachingPoints.forEach((point, idx) => {
      // Red bullet
      ctx.fillStyle = '#ff4655'
      ctx.beginPath()
      ctx.arc(568, pointY - 5, 4, 0, Math.PI * 2)
      ctx.fill()

      // Point text
      ctx.fillStyle = idx === 0 ? '#e5e7eb' : '#9ca3af'
      ctx.font = idx === 0 ? '17px system-ui, -apple-system, sans-serif' : '15px system-ui, -apple-system, sans-serif'
      const finalY = wrapText(ctx, point, 585, pointY, 540, idx === 0 ? 24 : 22)
      pointY = finalY + 50
    })

    // Spatial minimap on social card
    const spatial = spatialSummary.value
    const mapUrl = gameInfo.value.map ? getMapMinimap(gameInfo.value.map) : ''
    if (spatial?.events?.length && mapUrl) {
      const mapImg = await loadImage(mapUrl)
      if (mapImg) {
        const mx = 560
        const my = 400
        const ms = 220
        ctx.drawImage(mapImg, mx, my, ms, ms)
        for (const ev of spatial.events) {
          if (!ev.norm || typeof ev.norm.x !== 'number' || typeof ev.norm.y !== 'number') continue
          const px = mx + ev.norm.x * ms
          const py = my + ev.norm.y * ms
          ctx.beginPath()
          ctx.arc(px, py, ev.type === 'death' ? 6 : 5, 0, Math.PI * 2)
          ctx.fillStyle = ev.type === 'death' ? '#ef4444' : '#22c55e'
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(mx, my + ms - 22, ms, 22)
        ctx.fillStyle = '#fff'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText('Deaths · Kills (Riot positions)', mx + 8, my + ms - 8)
      }
    }

    // Agent portrait image
    const agentImgUrl = agentImageUrl.value
    if (agentImgUrl) {
      const agentImg = await loadImage(agentImgUrl)
      if (agentImg) {
        // Glow background
        ctx.fillStyle = 'rgba(255,70,85,0.08)'
        ctx.fillRect(958, 288, 184, 244)
        ctx.drawImage(agentImg, 960, 290, 180, 240)
      }
    }

    // --- Bottom bar ---
    // Separator line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, 580); ctx.lineTo(1200, 580); ctx.stroke()

    // "upforge.gg"
    ctx.fillStyle = '#4b5563'
    ctx.font = '14px system-ui, -apple-system, sans-serif'
    ctx.fillText('upforge.gg', 60, 605)

    // Right-aligned tagline
    ctx.fillStyle = '#374151'
    const tagline = 'Powered by AI · Improve your aim, faster'
    const tagW = ctx.measureText(tagline).width
    ctx.fillText(tagline, 1140 - tagW, 605)

    // Save
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const agent = gameInfo.value.agent || 'game'
    a.download = `upforge-${score}-${agent.toLowerCase().replace(/\s+/g, '-')}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    cardExportDone.value = true
    setTimeout(() => { cardExportDone.value = false }, 2500)
  } catch (e) {
    console.error('[PostGame] Export failed:', e)
  } finally {
    cardExporting.value = false
  }
}

function scoreClass(score: number): string {
  return score >= 78 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
}
function scoreBarClass(score: number): string {
  return score >= 78 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
}
</script>

<style scoped>
@keyframes scoreReveal {
  0%   { transform: scale(0.5); opacity: 0; }
  80%  { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1.0); opacity: 1; }
}

@keyframes heroBounceIn {
  0%   { transform: scale(0.8) translateY(6px); opacity: 0; }
  100% { transform: scale(1.0) translateY(0); opacity: 1; }
}

@keyframes badgeFadeDown {
  0%   { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes readyFadeIn {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes scoreGradeIn {
  0%   { opacity: 0; transform: scale(0.6); }
  100% { opacity: 1; transform: scale(1.0); }
}

@keyframes statLiftIn {
  0% {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes uploadShimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.stat-panel-in {
  animation: statLiftIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.stat-chip-in {
  animation: statLiftIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.upload-stat-in {
  animation: statLiftIn 0.45s ease-out both;
}

.match-banner {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.match-banner-win {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(249, 115, 22, 0.1));
  border-color: rgba(34, 197, 94, 0.24);
  box-shadow: 0 18px 48px rgba(34, 197, 94, 0.08);
}

.match-banner-loss {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(249, 115, 22, 0.1));
  border-color: rgba(239, 68, 68, 0.24);
  box-shadow: 0 18px 48px rgba(239, 68, 68, 0.08);
}

.match-banner-neutral {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(249, 115, 22, 0.08));
  border-color: rgba(255, 255, 255, 0.1);
}

.pending-panel {
  animation: readyFadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pending-hero {
  background: #141414;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 40px var(--pending-glow, rgba(255, 70, 85, 0.08));
}

.match-result-badge {
  text-shadow: 0 0 14px rgba(255, 255, 255, 0.16);
}

.match-badge-win {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.28);
  color: #86efac;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
}

.match-badge-loss {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.28);
  color: #fca5a5;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
}

.match-result-glow {
  text-shadow: 0 0 18px rgba(255, 255, 255, 0.08), 0 0 28px rgba(239, 68, 68, 0.1);
}

.upload-bar-track {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
}

.upload-bar-fill {
  background: linear-gradient(90deg, rgba(255, 70, 85, 0.95), rgba(249, 115, 22, 0.95));
  box-shadow: 0 0 18px rgba(255, 70, 85, 0.35);
}

.flow-panel {
  animation: readyFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.flow-hero {
  background: #111111;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 36px var(--flow-glow, rgba(255, 70, 85, 0.1));
}

.flow-card {
  background-color: rgba(255, 255, 255, 0.02);
  background-image: url('../assets/post-game/forge-panel-texture.webp');
  background-size: 256px 256px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.flow-card-accent {
  background-image:
    linear-gradient(135deg, rgba(255, 70, 85, 0.06), transparent 55%),
    url('../assets/post-game/forge-panel-texture.webp');
}

.ready-hero {
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(34, 197, 94, 0.12) inset,
    0 0 40px var(--flow-glow, rgba(34, 197, 94, 0.12));
}

.upload-bar-shimmer {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.38), transparent);
  animation: uploadShimmer 1.6s linear infinite;
}

.agent-map-chip {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.score-reveal {
  animation: scoreReveal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.hero-animate-in {
  animation: heroBounceIn 0.5s ease forwards;
}

.complete-badge-in {
  animation: badgeFadeDown 0.5s ease 0.1s both;
}

.score-grade-in {
  animation: scoreGradeIn 0.4s ease 0.3s both;
}

.ready-state-in {
  animation: readyFadeIn 0.5s ease forwards;
}
</style>
