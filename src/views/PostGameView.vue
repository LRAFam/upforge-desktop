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
                  {{ state === 'preparing' ? 'Getting replay ready' : compressing ? (uploadStatusLabel === 'Converting replay format' ? 'Converting replay' : 'Compressing replay') : 'Sending to coach' }}
                </p>
                <p class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
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
                <p class="text-base font-bold leading-tight text-white">Reviewing your duels</p>
                <p class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
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
            v-if="pendingDuelMoments.length"
            layout="vertical"
            :progress="analysisProgress"
            :step="analysisStep"
            :moment-count="pendingDuelMoments.length"
          />
          <p
            v-if="pendingDuelMoments.length"
            class="text-[10px] text-gray-500 leading-relaxed"
          >
            {{ pendingDuelMoments.length }} duel window{{ pendingDuelMoments.length !== 1 ? 's' : '' }} from your deaths — studying peek timing and crosshair on each clip.
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

      <!-- Ready -->
      <div v-else-if="state === 'ready'" class="w-full space-y-3 transition-all duration-500 ready-state-in">
        <div
          class="flow-hero ready-hero relative overflow-hidden rounded-2xl border border-emerald-500/20 text-left"
          :style="agentAccentColor ? { '--flow-glow': 'rgba(34,197,94,0.25)' } : undefined"
        >
          <PostGameFlowHeroBackdrop :art-url="scoreRevealHeroArt" :map-url="mapSplashUrl" tone="reveal" />
          <PostGameHeroEffects variant="reveal" />

          <div class="relative px-4 pt-4 pb-3.5">
            <div class="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-1 backdrop-blur-sm complete-badge-in">
              <svg class="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
              <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Coaching ready</span>
            </div>

            <div class="flex items-end gap-3">
              <div
                class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center shadow-lg"
                :class="agentImageUrl && !agentImageBroken ? '' : 'border border-emerald-500/25 bg-emerald-500/10'"
                :style="agentImageUrl && !agentImageBroken ? { border: `1px solid ${agentAccentColor}66`, background: agentAccentColor + '28', boxShadow: `0 8px 24px ${agentAccentColor}25` } : undefined"
              >
                <img
                  v-if="agentImageUrl && !agentImageBroken"
                  :src="agentImageUrl"
                  class="h-12 w-12 object-contain"
                  @error="agentImageBroken = true"
                />
                <span v-else-if="gameInfo.agent" class="text-lg font-black text-emerald-300">{{ gameInfo.agent.charAt(0) }}</span>
                <svg v-else class="h-6 w-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1 pb-0.5">
                <p class="text-base font-bold leading-tight text-white">Your debrief is ready</p>
                <p class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
                </p>
              </div>
              <div v-if="result?.overall_score && !spatialSummary?.events?.length" class="text-right pb-0.5 score-reveal">
                <p class="text-2xl font-black tabular-nums leading-none" :class="scoreClass(result.overall_score)">
                  {{ result.overall_score * 10 }}
                </p>
                <p class="text-[10px] text-gray-600">/ 1000</p>
              </div>
            </div>
          </div>
        </div>

        <PostGameFocusHero
          v-if="focusHero"
          :focus="focusHero"
          :match-label="[gameInfo.agent, gameInfo.map].filter(Boolean).join(' · ') || null"
        />

        <!-- Visual-first: Match Intel (map hero) -->
        <PostGameIntelHero
          v-if="spatialSummary?.events?.length"
          ref="intelHeroRef"
          :summary="spatialSummary"
          :map-name="gameInfo.map"
          :game="gameInfo.game"
          :agent-accent="agentAccentColor"
          :overall-score="result?.overall_score ?? null"
          :match-result="result?.match_result ?? null"
          :kills="result?.kills ?? null"
          :deaths="result?.deaths ?? null"
          :primary-insight="primaryInsight"
          :category-scores="categoryScores"
          :active-spatial-index="activeSpatialIndex"
          @update:active-spatial-index="activeSpatialIndex = $event"
          @copy-map="copySpatialMapImage"
        />

        <MatchRecapPanel
          :priority-improvements="improvements"
          :top-issue="topIssue"
          :coaching-tags="result?.coaching_tags"
          :overall-score="result?.overall_score ?? null"
          :spatial-summary="spatialSummary"
          :session-clips="sessionClips"
          :api-highlights="result?.match_highlights ?? null"
          :recording-id="vodRecordingId"
          @seek="seekRecapMoment"
          @open-clip="openRecapClip"
        />

        <DuelMomentCards
          v-if="duelMoments.length"
          :moments="duelMoments"
          compact
          @seek="(ms) => seekRecapMoment(Math.max(0, ms - 3000))"
        />

        <TimingComparisonPanel
          v-if="timingComparisons.length"
          :comparisons="timingComparisons"
          @seek="seekRecapMoment"
        />

        <SkillProfileBars
          v-if="result?.skill_profile"
          :profile="result.skill_profile"
          :compact="true"
        />

        <CategoryPercentilesStrip
          v-if="Object.keys(categoryPercentiles).length"
          :percentiles="categoryPercentiles"
          :tier="percentileTier"
        />

        <CoachMemoryCard
          v-if="result?.skill_profile"
          :profile="result.skill_profile"
        />

        <div v-if="vodRecordingId" class="space-y-2">
          <div class="flex gap-2">
            <button
              v-if="activeDeathSeekMs != null && canSeekFromSpatial"
              type="button"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 transition-colors"
              @click="reviewSelectedDeathInVod"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Review death in VOD
            </button>
            <button
              type="button"
              :class="activeDeathSeekMs != null && canSeekFromSpatial ? 'flex-1' : 'w-full'"
              class="py-2.5 text-xs font-semibold rounded-xl border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
              @click="openVodReview"
            >Open full VOD</button>
          </div>
          <p
            v-if="activeDeathSeekMs != null && !canSeekFromSpatial"
            class="text-[10px] text-center text-gray-500"
          >
            Death heatmap preview is free.
            <button type="button" class="text-amber-400 hover:text-amber-300 font-semibold" @click="openUpgrade">Plus</button>
            unlocks click-to-seek.
          </p>
        </div>

        <!-- No spatial data fallback -->
        <div v-else class="space-y-3">
          <div v-if="result?.overall_score" class="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div class="h-full rounded-full" :class="scoreBarClass(result.overall_score)" :style="{ width: `${result.overall_score}%` }" />
          </div>
        </div>

        <!-- Collapsed text wall — optional deep dive -->
        <button
          v-if="hasDeepDiveContent"
          type="button"
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:bg-white/[0.04] transition-colors"
          @click="showFullDetails = !showFullDetails"
        >
          <span class="text-xs font-semibold text-gray-400">
            {{ showFullDetails ? 'Hide' : 'Read' }} full AI breakdown
          </span>
          <svg class="w-4 h-4 text-gray-500 transition-transform" :class="showFullDetails ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        <div v-if="showFullDetails && hasDeepDiveContent" class="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div v-if="result?.verdict" class="text-[11px] text-gray-400 italic leading-relaxed">{{ result.verdict }}</div>
          <div
            v-if="result?.kills != null && (result.kills > 0 || result.deaths != null)"
            class="grid grid-cols-3 gap-2"
          >
            <div class="rounded-lg border border-green-500/20 bg-green-500/[0.08] px-2 py-2 text-center">
              <p class="text-[9px] uppercase text-green-300/70">K</p>
              <p class="text-lg font-black text-green-400">{{ result.kills }}</p>
            </div>
            <div class="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-2 py-2 text-center">
              <p class="text-[9px] uppercase text-red-300/70">D</p>
              <p class="text-lg font-black text-red-400">{{ result.deaths ?? '?' }}</p>
            </div>
            <div class="rounded-lg border border-blue-500/20 bg-blue-500/[0.08] px-2 py-2 text-center">
              <p class="text-[9px] uppercase text-blue-300/70">A</p>
              <p class="text-lg font-black text-blue-400">{{ result.assists ?? '?' }}</p>
            </div>
          </div>
          <div v-if="improvements.length" class="space-y-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Also focus on</p>
            <p v-for="(imp, i) in improvements.slice(0, 3)" :key="i" class="text-[11px] text-gray-400 leading-relaxed">{{ imp }}</p>
          </div>
          <div v-if="result?.coaching_tags?.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in result.coaching_tags"
              :key="tag"
              class="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400/80 border border-red-500/20 capitalize"
            >{{ tag.replace(/_/g, ' ') }}</span>
          </div>
        </div>

        <!-- Train This Now CTA — maps top weakness to a drill scenario -->
        <button
          v-if="improvements.length || topIssue"
          :disabled="trainerLaunching"
          class="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all disabled:opacity-50 text-white"
          style="background: linear-gradient(135deg, #f97316, #dc2626); box-shadow: 0 4px 14px rgba(249,115,22,0.25);"
          @click="launchTrainer"
        >
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="4" stroke-width="1.5"/>
            <line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/>
            <line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/>
            <line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/>
            <line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/>
          </svg>
          <span>{{ trainerLaunching ? 'Launching trainer…' : `Train Now · ${SCENARIO_LABELS[trainScenario]}` }}</span>
        </button>

        <!-- Match data warning: shown when Riot capture failed -->
        <div
          v-if="matchDataWarning"
          class="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl"
        >
          <svg class="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div class="space-y-0.5">
            <p class="text-xs text-amber-300/90 leading-relaxed">{{ matchDataWarning.message }}</p>
            <p class="text-xs text-gray-500 leading-relaxed">{{ matchDataWarning.tip }}</p>
          </div>
        </div>

        <!-- Coaching feedback -->
        <div
          v-if="result?.analysis_id && feedbackSubmitted"
          class="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/[0.06] px-3 py-2"
        >
          <svg class="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          <p class="text-xs text-green-300/90">Thanks — your feedback helps improve future coaching.</p>
        </div>
        <div
          v-else-if="result?.analysis_id"
          class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 space-y-2"
        >
          <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Was this coaching helpful?</p>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              :class="feedbackRating === 'thumbs_up'
                ? 'border-green-500/40 bg-green-500/15 text-green-200'
                : 'border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-white/[0.14] hover:text-white'"
              :disabled="feedbackSubmitting"
              @click="submitAnalysisFeedback('thumbs_up')"
            >
              {{ feedbackSubmitting && feedbackRating === 'thumbs_up' ? 'Sending…' : 'Yes, helpful' }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              :class="feedbackRating === 'thumbs_down'
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-white/[0.14] hover:text-white'"
              :disabled="feedbackSubmitting"
              @click="feedbackRating = 'thumbs_down'"
            >
              Not quite
            </button>
          </div>
          <div v-if="feedbackRating === 'thumbs_down'" class="space-y-2">
            <textarea
              v-model="feedbackText"
              rows="2"
              maxlength="500"
              placeholder="Anything we missed? (optional)"
              class="w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2 text-xs text-gray-300 placeholder:text-gray-600 focus:border-white/[0.14] focus:outline-none"
            />
            <button
              type="button"
              class="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              :disabled="feedbackSubmitting"
              @click="submitAnalysisFeedback('thumbs_down')"
            >
              {{ feedbackSubmitting ? 'Sending…' : 'Send feedback' }}
            </button>
          </div>
        </div>

        <!-- Ask my coach (roster) -->
        <div
          v-if="result?.analysis_id && liveCoaches.length && !coachReviewSent"
          class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 space-y-2"
        >
          <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ask my coach</p>
          <template v-if="!coachAskExpanded">
            <button
              type="button"
              class="w-full rounded-lg border border-white/[0.12] bg-white/[0.04] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.07] disabled:opacity-50"
              :disabled="coachReviewSubmitting || !selectedCoachId"
              @click="submitCoachReview"
            >
              {{ coachReviewSubmitting ? 'Sending…' : `Send to ${selectedCoachName}` }}
            </button>
            <button
              type="button"
              class="w-full text-[10px] text-gray-500 hover:text-gray-300"
              @click="coachAskExpanded = true; coachSelectedRounds = coachSuggestedRounds.length ? [coachSuggestedRounds[0]!] : []"
            >
              Add focus question or change coach
            </button>
          </template>
          <template v-else>
            <select
              v-if="liveCoaches.length > 1"
              v-model="selectedCoachId"
              class="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2 text-xs text-gray-200 focus:border-white/[0.14] focus:outline-none"
            >
              <option v-for="c in liveCoaches" :key="c.coach_id" :value="c.coach_id">{{ c.display_name }}</option>
            </select>
            <textarea
              v-model="coachQuestion"
              rows="2"
              maxlength="1000"
              placeholder="Optional: what should your coach focus on?"
              class="w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2 text-xs text-gray-300 placeholder:text-gray-600 focus:border-white/[0.14] focus:outline-none"
            />
            <div v-if="coachSuggestedRounds.length" class="space-y-1">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Focus rounds</p>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="round in coachSuggestedRounds"
                  :key="round"
                  type="button"
                  class="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
                  :class="coachSelectedRounds.includes(round) ? 'border-violet-500/50 bg-violet-500/20 text-violet-200' : 'border-white/[0.08] text-gray-500 hover:text-violet-200'"
                  @click="toggleCoachRound(round)"
                >
                  R{{ round }}
                </button>
              </div>
            </div>
            <button
              type="button"
              class="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.09] disabled:opacity-50"
              :disabled="coachReviewSubmitting || !selectedCoachId"
              @click="submitCoachReview"
            >
              {{ coachReviewSubmitting ? 'Sending…' : 'Send review request' }}
            </button>
          </template>
        </div>
        <div
          v-else-if="result?.analysis_id && coachesLoaded && myCoaches.length && !liveCoaches.length && !coachReviewSent"
          class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 space-y-2"
        >
          <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Ask my coach</p>
          <p class="text-xs text-gray-400 leading-relaxed">
            Your coach hasn't opened their community roster yet — book a paid review on the web for priority feedback.
          </p>
        </div>
        <div
          v-else-if="result?.analysis_id && coachesLoaded && !myCoaches.length && !coachReviewSent"
          class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 space-y-2"
        >
          <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Coaching</p>
          <p class="text-xs text-gray-400 leading-relaxed">
            Join a coach's roster on the web to send this match for human feedback.
          </p>
          <button
            type="button"
            class="w-full rounded-lg border border-orange-500/25 py-2 text-xs font-semibold text-orange-200 transition-colors hover:bg-orange-500/10"
            @click="openFindCoaches"
          >
            Find a coach →
          </button>
        </div>
        <div
          v-else-if="result?.analysis_id && coachReviewSent"
          class="rounded-xl border px-3 py-2.5 space-y-1"
          :class="
            coachReviewStatus === 'completed'
              ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
              : coachReviewStatus === 'in_progress'
                ? 'border-violet-500/25 bg-violet-500/[0.06]'
                : 'border-orange-500/25 bg-orange-500/[0.06]'
          "
        >
          <div class="flex items-center gap-2">
            <svg class="h-3.5 w-3.5 flex-shrink-0" :class="coachReviewStatus === 'completed' ? 'text-emerald-400' : coachReviewStatus === 'in_progress' ? 'text-violet-400' : 'text-orange-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            <p class="text-xs" :class="coachReviewStatus === 'completed' ? 'text-emerald-200/90' : coachReviewStatus === 'in_progress' ? 'text-violet-200/90' : 'text-orange-200/90'">
              <template v-if="coachReviewStatus === 'completed'">
                Coach feedback is ready — open VOD Review and check the violet markers on the timeline.
              </template>
              <template v-else-if="coachReviewStatus === 'in_progress'">
                Your coach is reviewing this match — notes will appear on your timeline soon.
              </template>
              <template v-else>
                Review request sent — your coach will annotate this match on the timeline.
              </template>
            </p>
          </div>
          <button
            v-if="coachReviewStatus === 'completed' && result?.analysis_id"
            type="button"
            class="w-full rounded-xl border border-violet-500/30 bg-violet-500/10 py-2.5 text-xs font-bold text-violet-100 transition-colors hover:border-violet-400/40 hover:bg-violet-500/15 disabled:opacity-50"
            :disabled="coachNotesOpening"
            @click="openCoachNotesFromPostGame"
          >
            {{ coachNotesOpening ? 'Opening coach notes…' : 'View coach notes in VOD →' }}
          </button>
        </div>

        <div class="space-y-2 pt-1">
          <div class="flex gap-2">
            <button
              class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all shadow-lg"
              :style="{ background: `linear-gradient(135deg, ${agentAccentColor || '#dc2626'}, ${agentAccentColor ? agentAccentColor + 'cc' : '#ea580c'})`, boxShadow: `0 4px 14px ${agentAccentColor || '#dc2626'}40` }"
              @click="viewFullAnalysis"
            >
              <span>Open full report</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
              </svg>
            </button>
            <button
              v-if="result?.overall_score"
              :title="cardExportDone ? 'Saved!' : 'Save coaching card as PNG'"
              :disabled="cardExporting"
              class="flex-1 flex items-center justify-center gap-2 rounded-xl border border-orange-500/20 bg-gradient-to-r from-red-500/10 to-orange-500/10 px-3 py-2.5 text-xs font-bold text-orange-100 transition-all hover:from-red-500/15 hover:to-orange-500/15 hover:border-orange-400/30 disabled:opacity-50"
              @click="exportAnalysis"
            >
              <svg v-if="cardExporting" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <svg v-else-if="cardExportDone" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              <span>{{ cardExporting ? 'Saving…' : cardExportDone ? 'Saved!' : 'Export Card' }}</span>
            </button>
          </div>
          <div class="flex gap-2">
            <button
              v-if="analysisUrl"
              class="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-gray-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white"
              @click="copyAnalysisLink"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M11.25 5.5h1.75a3 3 0 1 1 0 6h-1.75m-2.5 3H7a3 3 0 1 1 0-6h1.75m-1.5 3h5.5"/>
              </svg>
              <span>Copy Link</span>
            </button>
            <button
              v-if="result?.overall_score"
              title="Copy score to clipboard"
              class="px-3 py-2.5 text-xs text-gray-400 hover:text-gray-200 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-xl transition-colors"
              @click="copyScore"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
            <button
              class="flex-1 px-3 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-xl transition-colors"
              @click="dismiss"
            >Close panel</button>
          </div>

          <div class="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <p class="text-xs font-bold text-white">Queue your next match</p>
            <p class="text-[11px] text-gray-500 mt-1 leading-relaxed">
              UpForge runs in the background — play another game and you&apos;ll get a fresh coaching report automatically.
            </p>
          </div>
        </div>

        <!-- Session clips row -->
        <button
          v-if="sessionClipCount > 0"
          class="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.10] rounded-xl transition-colors text-left"
          @click="openClips"
        >
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
          <span class="text-xs text-gray-400 flex-1">
            <span class="text-white font-semibold">{{ sessionClipCount }} clip{{ sessionClipCount !== 1 ? 's' : '' }}</span> saved from this match
          </span>
          <svg class="w-3 h-3 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>

        <!-- Instant debrief — collapsed by default (text-heavy) -->
        <div v-if="debriefLoading || debriefText || debriefFailed" class="rounded-xl border border-white/10 overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between px-3 py-2.5 bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
            @click="showDebrief = !showDebrief"
          >
            <span class="text-xs font-semibold text-purple-300">Instant debrief</span>
            <svg class="w-4 h-4 text-gray-500" :class="showDebrief ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="showDebrief" class="px-3 py-2.5 border-t border-white/10">
            <div v-if="debriefLoading && !debriefText" class="text-xs text-gray-500">Generating…</div>
            <p v-else-if="debriefFailed" class="text-xs text-gray-500 italic">Debrief unavailable.</p>
            <p v-else class="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">{{ debriefText }}</p>
          </div>
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
            <div class="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-2.5 py-1 backdrop-blur-sm">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span class="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Recording saved</span>
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
                  {{ gameInfo.agent || gameLabel }}
                </p>
                <p v-if="gameInfo.map" class="mt-0.5 text-xs font-medium text-gray-400">
                  {{ gameInfo.map }}
                </p>
                <p v-else class="mt-0.5 text-xs text-gray-500">Match ready for coaching</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 text-center">
          <p class="text-sm font-semibold text-gray-200">What would you like to do?</p>
          <p v-if="!pendingAnalysisReady" class="mt-1 text-[11px] leading-relaxed text-blue-300/80">
            {{ pendingAnalysisMessage }}
          </p>
          <p v-else class="mt-1 text-[11px] leading-relaxed text-gray-500">
            Save to cloud frees disk space. Analyse uses your coaching quota when you are ready.
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-2.5">
          <GamingButton
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
                    {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map" class="text-gray-600"> · {{ gameInfo.map }}</span>
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
        <span v-else-if="demoStatus.status === 'not-found'" class="text-xs text-cyan-700/80">Replay not found</span>
        <span v-else-if="demoStatus.status === 'error'" class="text-xs text-cyan-700/80">Replay upload failed</span>
        </div>
        <div
          v-if="demoStatus.status === 'not-found'"
          class="border-t border-cyan-500/10 px-3 py-2.5 space-y-2"
        >
          <p class="text-[11px] text-gray-400 leading-relaxed">{{ replayNotFoundHint }}</p>
          <ul class="text-[10px] text-gray-500 space-y-1 list-disc pl-4">
            <li v-if="gameInfo.game === 'cs2'">Add <code class="text-cyan-400/80">cl_demo_auto_recording 1</code> to your autoexec and restart CS2</li>
            <li v-if="gameInfo.game === 'deadlock'">Enable replay saving in Deadlock settings, then play another match</li>
            <li>Wait ~1 minute after the match ends before the replay file appears</li>
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
import PostGameIntelHero from '../components/PostGameIntelHero.vue'
import GamingButton from '../components/GamingButton.vue'
import MatchRecapPanel from '../components/MatchRecapPanel.vue'
import TimingComparisonPanel from '../components/TimingComparisonPanel.vue'
import type { TimingComparison } from '../components/TimingComparisonPanel.vue'
import SkillProfileBars from '../components/SkillProfileBars.vue'
import CoachMemoryCard from '../components/CoachMemoryCard.vue'
import CategoryPercentilesStrip from '../components/CategoryPercentilesStrip.vue'
import type { CategoryPercentileEntry } from '../components/CategoryPercentilesStrip.vue'
import PostGameFocusHero from '../components/PostGameFocusHero.vue'
import AnalysisPipelineStages from '../components/analysis/AnalysisPipelineStages.vue'
import PostGameFlowHeroBackdrop from '../components/post-game/PostGameFlowHeroBackdrop.vue'
import PostGameHeroEffects from '../components/post-game/PostGameHeroEffects.vue'
import uploadHeroArt from '../assets/post-game/upload-beam-hero.webp'
import coachHeroArt from '../assets/post-game/coach-synthesis-hero.webp'
import refundHeroArt from '../assets/post-game/refund-hero.webp'
import scoreRevealHeroArt from '../assets/post-game/score-reveal-hero.webp'
import forgePanelTexture from '../assets/post-game/forge-panel-texture.webp'
import DuelMomentCards from '../components/analysis/DuelMomentCards.vue'
import { type DuelMoment, type DuelMomentManifest } from '../lib/duel-moments'
import { buildFocusHeroCopy } from '../lib/skill-profile'
import { pickTrainingScenario, SCENARIO_LABELS } from '../lib/training-drills'
import type { MatchSpatialSummary } from '../lib/spatial-types'
import type { SkillProfileSnapshot } from '../lib/skill-profile'
import type { MatchHighlight } from '../lib/match-highlights'
import type { ClipRecord } from '../env.d.ts'
import { canSpatialVodSeek } from '../lib/tier-features'
import { buildAnalysisErrorPayload, type AnalysisErrorPayload } from '../lib/analysis-failure-messages'
import PostGameDuelDiagnostics from '../components/post-game/PostGameDuelDiagnostics.vue'
import type { CategoryScoreItem } from '../components/PostGameIntelHero.vue'

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
  ['preparing', 'uploading', 'analysing', 'error', 'pending', 'archived'].includes(state.value),
)
let fitHeightTimer: ReturnType<typeof setTimeout> | null = null
let contentResizeObserver: ResizeObserver | null = null

function scheduleFitWindow(): void {
  if (fitHeightTimer) clearTimeout(fitHeightTimer)
  fitHeightTimer = setTimeout(() => {
    void nextTick(() => {
      if (!contentRoot.value || !window.api.window.setContentHeight) return
      if (state.value === 'ready') {
        void window.api.window.setContentHeight(Math.min(680, window.innerHeight))
        return
      }
      if (!isCompactFlowState.value) return
      void window.api.window.setContentHeight(contentRoot.value.scrollHeight)
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
  category_scores?: CategoryScoreItem[]
  match_highlights?: MatchHighlight[] | null
  skill_profile?: SkillProfileSnapshot | null
  timing_comparisons?: TimingComparison[]
  duel_moments?: DuelMoment[] | null
  pipeline?: string | null
} | null>(null)
const sessionClips = ref<ClipRecord[]>([])
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

const timingComparisons = computed((): TimingComparison[] => {
  const raw = result.value?.timing_comparisons
  if (!Array.isArray(raw)) return []
  return raw.filter((x) => x && typeof x.label === 'string')
})
const intelHeroRef = ref<InstanceType<typeof PostGameIntelHero> | null>(null)
const activeSpatialIndex = ref<number | null>(null)
const showFullDetails = ref(false)
const showDebrief = ref(false)
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
  if (pendingAnalysisState.value === 'syncing') return 'Syncing stats…'
  return 'Not ready'
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
let sessionStart = 0
let stuckTimer: ReturnType<typeof setTimeout> | null = null
let reconcileKickTimer: ReturnType<typeof setTimeout> | null = null
let tipTimer: ReturnType<typeof setInterval> | null = null
let elapsedInterval: ReturnType<typeof setInterval> | null = null

const currentTip = computed(() => COACHING_TIPS[tipIndex.value])

const matchDataWarning = computed<{ message: string; tip: string } | null>(() => {
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
    return preparingSyncMessage.value ? 'Syncing match data' : 'Finishing recording'
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

const replayNotFoundHint = computed(() => {
  if (gameInfo.value.game === 'deadlock') {
    return 'No replay found — enable replay saving in Deadlock settings'
  }
  return 'No demo found — add cl_demo_auto_recording 1 to your CS2 autoexec'
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

// --- Training CTA ---
const trainScenario = computed(() =>
  pickTrainingScenario(...improvements.value, topIssue.value),
)
const trainerLaunching = ref(false)
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
    }
  } catch {
    demoStatus.value = { status: 'error', error: 'Scan failed' }
  } finally {
    demoRescanning.value = false
  }
}
let copiedLinkTimer: ReturnType<typeof setTimeout> | null = null

async function launchTrainer() {
  if (trainerLaunching.value) return
  trainerLaunching.value = true
  try {
    await window.api.trainer.launch({
      scenario: trainScenario.value,
      difficulty: 'medium',
      duration: 60,
    })
  } catch (e) {
    console.error('[PostGame] Trainer launch failed:', e)
  } finally {
    trainerLaunching.value = false
  }
}
// --- End Training CTA ---

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

const agentImageUrl = computed(() => gameInfo.value.agent ? getAgentImage(gameInfo.value.agent) : '')
const agentImageBroken = ref(false)
watch(() => gameInfo.value.agent, () => { agentImageBroken.value = false })
const agentAccentColor = computed(() => gameInfo.value.agent ? getAgentColor(gameInfo.value.agent) : '')
const mapSplashUrl = computed(() => gameInfo.value.map ? getMapImage(gameInfo.value.map) : '')
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

const duelMoments = computed((): DuelMoment[] => {
  const fromApi = result.value?.duel_moments
  if (fromApi?.length) return fromApi
  return localDuelManifest.value
})

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

const activeDeathSeekMs = computed((): number | null => {
  const idx = activeSpatialIndex.value
  const events = spatialSummary.value?.events
  if (idx == null || !events?.[idx] || events[idx].type !== 'death') return null
  const offset = events[idx].videoOffsetMs
  if (offset == null || isNaN(offset)) return null
  return Math.max(0, offset - 4000)
})

async function reviewSelectedDeathInVod() {
  const id = vodRecordingId.value
  const seekMs = activeDeathSeekMs.value
  if (!id) return
  await window.api.app.openVodReview(id, seekMs ?? undefined)
  dismiss()
}

async function openVodReview() {
  const id = vodRecordingId.value
  if (!id) return
  await window.api.app.openVodReview(id)
  dismiss()
}

watch(spatialSummary, (summary) => {
  if (activeSpatialIndex.value != null || !summary?.events?.length) return
  const firstDeath = summary.events.findIndex((e) => e.type === 'death')
  if (firstDeath >= 0) activeSpatialIndex.value = firstDeath
})

const categoryScores = computed((): CategoryScoreItem[] => {
  const raw = (result.value as { category_scores?: CategoryScoreItem[] } | null)?.category_scores
  return Array.isArray(raw) ? raw : []
})

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

const primaryInsight = computed((): string | null => focusHero.value?.headline ?? null)

const hasDeepDiveContent = computed(() =>
  Boolean(
    result.value?.verdict
    || improvements.value.length
    || (result.value?.coaching_tags?.length ?? 0) > 0
    || (result.value?.match_highlights?.length ?? 0) > 0
    || timingComparisons.value.length > 0
    || (result.value?.kills != null),
  ),
)

async function copySpatialMapImage() {
  const dataUrl = intelHeroRef.value?.exportPng()
  if (!dataUrl) return
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    flashToast('Map copied — paste into Discord or X')
  } catch {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `upforge-map-${(gameInfo.value.map || 'match').toLowerCase()}.png`
    a.click()
    flashToast('Map saved as PNG')
  }
}
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
    state.value = 'preparing'
    uploadProgress.value = 0
    compressing.value = false
    compressKind.value = null
  }))
  ipcCleanup.push(window.api.on('post-game:prep-step', (...args: unknown[]) => {
    const data = args[0] as { game?: string; map?: string | null; agent?: string | null }
    if (data?.game) {
      gameInfo.value = { game: data.game, map: data.map ?? null, agent: data.agent ?? null }
    }
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
    const r = args[0] as typeof result.value & { session_start?: number; recording_id?: string | null }
    result.value = r
    if (r?.recording_id) sessionRecordingId.value = r.recording_id
    sessionStart = r?.session_start ?? (Date.now() - 2 * 60 * 60 * 1000)
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
      preparingSyncMessage.value = readiness.message
        || (readiness.state === 'syncing'
          ? 'Syncing match stats from Riot…'
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
  ipcCleanup.push(window.api.on('post-game:debrief', (...args: unknown[]) => {
    const data = args[0] as { debrief: string; agent: string | null; map: string | null; discordLinked?: boolean } | null
    if (data?.debrief) {
      debriefText.value = data.debrief
      debriefDiscordLinked.value = data.discordLinked ?? false
    } else if (!data) {
      debriefFailed.value = true
    }
    debriefLoading.value = false
  }))
  // Show loading state immediately so the user knows debrief is coming
  debriefLoading.value = true

  // CS2 demo status listeners
  ipcCleanup.push(window.api.on('post-game:demo-status', (...args: unknown[]) => {
    demoStatus.value = args[0] as typeof demoStatus.value
  }))
  ipcCleanup.push(window.api.on('post-game:demo-progress', (...args: unknown[]) => {
    demoProgress.value = args[0] as number
  }))

  // Dev preview: show a mock ready state
  if (window.location.hash.includes('post-game-preview')) {
    setTimeout(() => {
      gameInfo.value = { game: 'valorant', map: 'Bind', agent: 'Jett' }
      state.value = 'uploading'
      let p = 0
      const iv = setInterval(() => {
        p += 12
        uploadProgress.value = Math.min(p, 100)
        if (p >= 100) { clearInterval(iv); setTimeout(() => { state.value = 'analysing' }, 600) }
      }, 200)
      setTimeout(() => {
        result.value = { overall_score: 72, analysis_id: 999 }
        ;(result.value as Record<string, unknown>).top_issue = 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.'
        state.value = 'ready'
      }, 5000)
    }, 300)
  }
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
  clearStuckTimer()
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
    const session = clips.filter((c) => c.savedAt >= sessionStart)
    sessionClips.value = session
    sessionClipCount.value = session.length
  } catch {
    sessionClips.value = []
    sessionClipCount.value = 0
  }
}

async function seekRecapMoment(seekMs: number) {
  const id = vodRecordingId.value
  if (!id) return
  await window.api.app.openVodReview(id, seekMs)
  dismiss()
}

async function openRecapClip(clipId: string) {
  await window.api.clips.revealFile(clipId).catch(() => {})
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
