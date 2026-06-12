<template>
  <div class="flex flex-col h-full bg-[#161616] relative overflow-hidden">
    <!-- Subtle glow bg — uses agent accent colour when available -->
    <div class="absolute inset-0 pointer-events-none">
      <div
        class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full blur-3xl transition-all duration-700 opacity-60"
        :style="glowBgStyle"
      />
    </div>

    <div class="flex-1 flex flex-col items-center justify-center px-6 py-5 relative z-10">
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
      <div v-if="state === 'preparing' || state === 'uploading'" class="w-full space-y-3 text-center">
        <!-- Dismiss during upload -->
        <button
          class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
          title="Dismiss"
          @click="dismiss"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div class="space-y-3">
          <div class="flex items-center justify-center">
            <div class="inline-flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 shadow-[0_0_30px_rgba(239,68,68,0.08)]">
              <div
                class="w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center transition-all flex-shrink-0"
                :class="agentImageUrl ? '' : 'bg-red-500/10 border border-red-500/20'"
                :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
              >
                <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
                <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              </div>
              <div class="text-left">
                <p class="text-sm font-bold text-white">{{ state === 'preparing' ? 'Getting replay ready' : compressing ? (uploadStatusLabel === 'Converting replay format' ? 'Converting replay' : 'Compressing replay') : 'Uploading replay' }}</p>
                <div class="mt-1 flex items-center gap-2 text-[11px]">
                  <span class="font-semibold text-gray-200">{{ gameInfo.agent || gameLabel }}</span>
                  <span v-if="gameInfo.map" class="text-gray-500">{{ gameInfo.map }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="w-full space-y-2.5">
            <div class="flex items-end justify-between gap-3">
              <div class="text-left">
                <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-600">{{ state === 'preparing' ? 'Preparing' : compressing ? 'Compression' : 'Upload progress' }}</p>
                <p class="mt-1 text-xs text-gray-500">{{ state === 'preparing' ? 'Saving your match recording and getting it ready to upload' : compressing ? (uploadStatusLabel === 'Converting replay format' ? 'OBS saved as MKV — converting to a playable format before upload (one-time, may take a few minutes)' : 'OBS recorded a large file — shrinking to upload size (one-time, may take a few minutes)') : archiveOnlyUpload ? 'Saving your recording to cloud for playback — no analysis quota used' : 'Sending your recording to UpForge for analysis' }}</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black tabular-nums text-white upload-stat-in">{{ uploadProgress }}%</p>
                <p class="text-[10px] text-gray-600">Complete</p>
              </div>
            </div>
            <div class="relative h-3 w-full overflow-hidden rounded-full border border-white/[0.07] bg-white/[0.05]">
              <div class="absolute inset-0 upload-bar-track" />
              <div
                class="relative h-full overflow-hidden rounded-full upload-bar-fill transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              >
                <div class="absolute inset-0 upload-bar-shimmer" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-left">
                <p class="text-[10px] uppercase tracking-[0.2em] text-gray-600">Status</p>
                <div class="mt-1 flex items-center gap-2 text-xs font-semibold text-gray-300">
                  <svg class="h-3.5 w-3.5 animate-spin text-red-400" fill="none" viewBox="0 0 20 20">
                    <circle class="opacity-20" cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2"/>
                    <path class="opacity-90" fill="currentColor" d="M10 3a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5V3Z"/>
                  </svg>
                  <span>{{ uploadStatusLabel }}</span>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-right">
                <p class="text-[10px] uppercase tracking-[0.2em] text-gray-600">ETA</p>
                <p class="mt-1 text-xs font-semibold text-gray-300">{{ uploadEta || 'Calculating…' }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Analysing -->
      <div v-else-if="state === 'analysing'" class="w-full space-y-3 text-center">
        <button
          class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
          title="Close — analysis continues in background"
          @click="dismiss"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div class="space-y-3">
          <div class="flex items-center justify-center">
            <div class="inline-flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 shadow-[0_0_30px_rgba(249,115,22,0.08)]">
              <div
                class="w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0"
                :class="agentImageUrl ? '' : 'bg-orange-500/10 border border-orange-500/20'"
                :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
              >
                <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
                <svg v-else class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <div class="text-left">
                <p class="text-sm font-bold text-white">Analysing gameplay</p>
                <div class="mt-1 flex items-center gap-2 text-[11px]">
                  <span class="font-semibold text-gray-200">{{ gameInfo.agent || gameLabel }}</span>
                  <span v-if="gameInfo.map" class="text-gray-500">{{ gameInfo.map }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="w-full space-y-2.5">
            <div class="flex items-end justify-between gap-3">
              <div class="text-left">
                <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-600">Pipeline progress</p>
                <p class="mt-1 text-xs text-gray-500">{{ analysisStep || 'Running AI analysis on your recording' }}</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black tabular-nums text-white upload-stat-in">{{ analysisProgress }}%</p>
                <p class="text-[10px] text-gray-600">Complete</p>
              </div>
            </div>
            <div class="relative h-3 w-full overflow-hidden rounded-full border border-white/[0.07] bg-white/[0.05]">
              <div class="absolute inset-0 upload-bar-track" />
              <div
                class="relative h-full overflow-hidden rounded-full transition-all duration-500"
                :class="analysisProgress > 0 ? 'upload-bar-fill' : 'bg-orange-500/30'"
                :style="{ width: `${Math.max(analysisProgress, analysisProgress > 0 ? 4 : 8)}%` }"
              >
                <div v-if="analysisProgress > 0" class="absolute inset-0 upload-bar-shimmer" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-left">
                <p class="text-[10px] uppercase tracking-[0.2em] text-gray-600">Status</p>
                <div class="mt-1 flex items-center gap-2 text-xs font-semibold text-orange-300">
                  <span class="relative flex h-2 w-2">
                    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                    <span class="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                  <span>{{ analysisStatusLabel }}</span>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-right">
                <p class="text-[10px] uppercase tracking-[0.2em] text-gray-600">Elapsed</p>
                <p class="mt-1 text-xs font-semibold text-gray-300 tabular-nums">{{ analysisElapsedDisplay }}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.09] rounded-xl text-left">
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">Did you know?</p>
          <p class="text-xs text-gray-400 leading-relaxed">{{ currentTip }}</p>
        </div>
        <div
          v-if="analysisLongRunning || analysisDeferred"
          class="flex items-start gap-2 px-3 py-2.5 rounded-xl text-left"
          :class="analysisDeferred ? 'bg-amber-500/[0.07] border border-amber-500/20' : 'bg-blue-500/[0.06] border border-blue-500/20'"
        >
          <svg
            class="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
            :class="analysisDeferred ? 'text-amber-400' : 'text-blue-400'"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-medium" :class="analysisDeferred ? 'text-amber-300' : 'text-blue-300'">
              {{ analysisDeferred ? 'Still processing on our servers' : 'Taking longer than usual' }}
            </p>
            <p class="text-xs text-gray-500 mt-0.5">
              <template v-if="analysisDeferred">
                Complex matches can run 15+ minutes. Close this panel — we'll notify you when your score is ready.
              </template>
              <template v-else>
                Your job is still at {{ analysisProgress }}% on our pipeline. You can close this window; analysis continues in the background.
              </template>
            </p>
            <button
              class="mt-2 px-2.5 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="dismiss"
            >Close &amp; continue in background</button>
          </div>
        </div>
        <div v-else-if="analysisStuck" class="flex items-start gap-2 px-3 py-2.5 bg-white/[0.03] border border-white/[0.10] rounded-xl text-left">
          <svg class="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-gray-400">Complex gameplay can take 10–15 minutes — your match is still processing.</p>
            <p class="text-xs text-gray-600 mt-0.5">Progress updates live from our servers{{ analysisProgress > 0 ? ` (${analysisProgress}% so far)` : '' }}.</p>
          </div>
        </div>
      </div>

      <!-- Ready -->
      <div v-else-if="state === 'ready'" class="w-full space-y-3 transition-all duration-500 ready-state-in">

        <!-- ✓ Analysis Complete badge -->
        <div class="flex justify-center">
          <div class="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full complete-badge-in">
            <svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="text-xs font-semibold text-green-400">Analysis Complete</span>
          </div>
        </div>

        <!-- Compact match header -->
        <div class="flex items-center gap-3 px-1">
          <div
            class="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0"
            :style="agentAccentColor ? { border: `1px solid ${agentAccentColor}45` } : { border: '1px solid rgba(255,255,255,0.1)' }"
          >
            <img v-if="agentImageUrl" :src="agentImageUrl" class="w-full h-full object-cover object-top" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-black text-white">Your debrief is ready</p>
            <p class="text-[11px] text-gray-500">{{ [gameInfo.agent, gameInfo.map].filter(Boolean).join(' · ') }}</p>
          </div>
          <span
            v-if="result?.overall_score && !spatialSummary?.events?.length"
            class="text-xl font-black tabular-nums"
            :class="scoreClass(result.overall_score)"
          >{{ result.overall_score * 10 }}</span>
        </div>

        <!-- Visual-first: Match Intel (map hero) -->
        <PostGameIntelHero
          v-if="spatialSummary?.events?.length"
          ref="intelHeroRef"
          :summary="spatialSummary"
          :map-name="gameInfo.map"
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
          <div
            v-if="primaryInsight"
            class="rounded-xl border border-red-500/25 bg-gradient-to-r from-red-500/10 to-transparent px-4 py-3"
          >
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-1">Fix this first</p>
            <p class="text-sm font-bold text-white leading-snug">{{ primaryInsight }}</p>
          </div>
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

        <div class="space-y-2 pt-1">
          <div class="flex gap-2">
            <button
              class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all shadow-lg"
              :style="{ background: `linear-gradient(135deg, ${agentAccentColor || '#dc2626'}, ${agentAccentColor ? agentAccentColor + 'cc' : '#ea580c'})`, boxShadow: `0 4px 14px ${agentAccentColor || '#dc2626'}40` }"
              @click="viewFullAnalysis"
            >
              <span>View Full Analysis</span>
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
          <div v-if="mapSplashUrl" class="absolute inset-0 pointer-events-none">
            <img :src="mapSplashUrl" alt="" class="h-full w-full object-cover opacity-40 scale-105" />
            <div class="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/88 to-[#141414]/55" />
          </div>
          <div
            v-else
            class="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.04] to-transparent"
          />

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
          <p class="mt-1 text-[11px] leading-relaxed text-gray-500">
            Save to cloud frees disk space. Analyse uses your coaching quota when you are ready.
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-2.5">
          <GamingButton
            variant="primary-sm"
            block
            :disabled="analysing || savingToCloud"
            @click="analyseNow"
          >
            <svg v-if="analysing" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            {{ analysing ? 'Starting…' : 'Analyse now' }}
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
      <div v-else-if="state === 'error'" class="w-full space-y-3 text-center">
        <!-- Quota exceeded -->
        <template v-if="needsUpgrade">
          <div class="w-11 h-11 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
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
          <div class="flex gap-2 pt-1">
            <button
              v-if="userTier === 'free'"
              class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg transition-all shadow-sm shadow-amber-500/20"
              @click="openUpgrade"
            >View Plans →</button>
            <button
              v-if="userTier === 'free'"
              class="flex-1 py-2 text-xs font-semibold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 rounded-lg transition-colors"
              @click="openPpa"
            >Pay per analysis</button>
            <button class="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-lg transition-colors" @click="dismiss">Dismiss</button>
          </div>
        </template>

        <!-- Generic upload error -->
        <template v-else>
          <div class="w-11 h-11 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg
              v-if="isTimeoutError"
              class="w-5 h-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <svg
              v-else
              class="w-5 h-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-red-400">
              {{ isTimeoutError ? 'Analysis timed out' : clipsOnlyError ? 'Recording too large' : 'Upload failed' }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              <template v-if="isTimeoutError">
                The server reported a timeout for this job. Your recording was saved — try Analyse again from the dashboard.
              </template>
              <template v-else>{{ errorMessage }}</template>
            </p>
          </div>
          <div class="flex gap-2 pt-1">
            <button
              v-if="!clipsOnlyError"
              :disabled="!pendingRecordingId"
              class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-lg transition-all shadow-sm shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              @click="retryUpload"
            >Retry</button>
            <button
              v-else
              class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-lg transition-all shadow-sm shadow-red-500/20"
              @click="dismiss"
            >View clips in dashboard</button>
            <button class="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] rounded-lg transition-colors" @click="dismiss">Dismiss</button>
          </div>
        </template>
      </div>

      <!-- CS2 Demo status row -->
      <div
        v-if="gameInfo.game === 'cs2' && demoStatus"
        class="w-full mt-2 flex items-center gap-2 px-3 py-2 bg-cyan-500/[0.06] border border-cyan-500/20 rounded-xl"
      >
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

        <span v-if="demoStatus.status === 'uploading'" class="text-xs text-cyan-300/80">Demo uploading… {{ demoProgress }}%</span>
        <span v-else-if="demoStatus.status === 'analysing'" class="text-xs text-cyan-300/80">Demo analysing…</span>
        <span v-else-if="demoStatus.status === 'complete'" class="text-xs text-cyan-300/80">Demo analysis ready</span>
        <span v-else-if="demoStatus.status === 'not-found'" class="text-xs text-cyan-700/80">No demo found — add <code class="font-mono">cl_demo_auto_recording 1</code> to your CS2 autoexec</span>
        <span v-else-if="demoStatus.status === 'error'" class="text-xs text-cyan-700/80">Demo upload failed</span>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { getAgentImage, getAgentColor, getMapImage, getMapMinimap } from '../lib/valorant'
import PostGameIntelHero from '../components/PostGameIntelHero.vue'
import GamingButton from '../components/GamingButton.vue'
import type { MatchSpatialSummary } from '../lib/spatial-types'
import { canSpatialVodSeek } from '../lib/tier-features'
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
const uploadProgress = ref(0)
const compressing = ref(false)
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
} | null>(null)
const intelHeroRef = ref<InstanceType<typeof PostGameIntelHero> | null>(null)
const activeSpatialIndex = ref<number | null>(null)
const showFullDetails = ref(false)
const showDebrief = ref(false)
const errorMessage = ref('')
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
const isTimeoutError = computed(() => /timed? ?out/i.test(errorMessage.value))
const pendingRecordingId = ref<string | null>(null)
const sessionRecordingId = ref<string | null>(null)
const analysing = ref(false)
const savingToCloud = ref(false)
const archiveOnlyUpload = ref(false)
const needsArchiveUpgrade = ref(false)
const analysisStuck = ref(false)
const analysisLongRunning = ref(false)
const analysisDeferred = ref(false)
const analysisProgress = ref(0)
const analysisStep = ref<string | null>(null)
const analysisJobStatus = ref<string>('processing')
const tipIndex = ref(Math.floor(Math.random() * COACHING_TIPS.length))
const sessionClipCount = ref(0)
const analysisStartedAt = ref(0)
const analysisElapsedSecs = ref(0)
let sessionStart = 0
let stuckTimer: ReturnType<typeof setTimeout> | null = null
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
  if (state.value === 'preparing') return 'Finishing recording'
  if (compressing.value) return 'Converting replay format'
  if (uploadProgress.value < 15) return 'Preparing replay'
  if (uploadProgress.value < 70) return 'Uploading recording'
  if (uploadProgress.value < 100) return 'Finalising upload'
  return 'Handing off to analysis'
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
  analysisDeferred.value = false
}

function startStuckTimer() {
  if (stuckTimer) clearTimeout(stuckTimer)
  resetAnalysisUi()
  analysisStartedAt.value = Date.now()
  analysisElapsedSecs.value = 0
  stuckTimer = setTimeout(() => { analysisStuck.value = true }, 8 * 60 * 1000)
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
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  analysisStuck.value = false
  analysisLongRunning.value = false
  analysisDeferred.value = false
}

const gameLabel = computed(() => gameInfo.value.game === 'cs2' ? 'CS2' : 'Valorant')

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
const WEAKNESS_TO_SCENARIO: Record<string, string> = {
  flick: 'flick', 'one tap': 'flick', reflex: 'flick', headshot: 'flick',
  accuracy: 'flick', 'first shot': 'flick', aim: 'flick', click: 'flick',
  track: 'tracking', moving: 'tracking', movement: 'tracking', smooth: 'tracking',
  spray: 'microadjust', recoil: 'microadjust', control: 'microadjust',
  precision: 'microadjust', micro: 'microadjust', burst: 'microadjust',
  crosshair: 'switching', placement: 'switching', switching: 'switching',
  rotate: 'switching', retake: 'switching', multi: 'switching',
}
const SCENARIO_LABELS: Record<string, string> = {
  flick: 'Flick Training',
  tracking: 'Tracking',
  microadjust: 'Micro-Adjust',
  switching: 'Target Switching',
}

function pickScenario(imps: string[], issue: string | null): string {
  const text = [...imps, issue ?? ''].join(' ').toLowerCase()
  for (const [keyword, scenario] of Object.entries(WEAKNESS_TO_SCENARIO)) {
    if (text.includes(keyword)) return scenario
  }
  return 'flick'
}

const trainScenario = computed(() => pickScenario(improvements.value, topIssue.value))
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
const agentAccentColor = computed(() => gameInfo.value.agent ? getAgentColor(gameInfo.value.agent) : '')
const mapSplashUrl = computed(() => gameInfo.value.map ? getMapImage(gameInfo.value.map) : '')
const mapMinimapUrl = computed(() => gameInfo.value.map ? getMapMinimap(gameInfo.value.map) : '')

const spatialSummary = computed((): MatchSpatialSummary | null => {
  if (!result.value) return null
  return (result.value as { spatial_summary?: MatchSpatialSummary | null }).spatial_summary ?? null
})

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
const primaryInsight = computed((): string | null => {
  const heat = spatialSummary.value?.heatmapInsight
  if (heat) return heat
  const pattern = spatialSummary.value?.patterns?.[0]
  if (pattern) return pattern
  const issue = topIssue.value
  if (issue) {
    const first = issue.split(/[.!?]/)[0]?.trim()
    return first && first.length < 140 ? first : issue.slice(0, 120) + (issue.length > 120 ? '…' : '')
  }
  const imp = improvements.value[0]
  if (imp) return imp.split(/[.!?]/)[0]?.trim() || imp.slice(0, 120)
  return result.value?.verdict?.slice(0, 120) ?? null
})

const hasDeepDiveContent = computed(() =>
  Boolean(
    result.value?.verdict
    || improvements.value.length
    || (result.value?.coaching_tags?.length ?? 0) > 0
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
    return { background: `radial-gradient(ellipse, ${agentAccentColor.value}25 0%, transparent 70%)` }
  }
  const fallbacks: Record<string, string> = {
    ready: 'rgba(34,197,94,0.10)',
    pending: 'rgba(59,130,246,0.10)',
    error: 'rgba(239,68,68,0.10)',
    uploading: 'rgba(239,68,68,0.07)',
    analysing: 'rgba(239,68,68,0.07)',
  }
  return { background: fallbacks[state.value] ?? 'transparent' }
})

onMounted(() => {
  window.api.discord.setState('reviewing').catch(() => {})
  window.api.app.getStatus().then(s => { if (s.user?.tier) userTier.value = s.user.tier }).catch(() => {})
  window.api.profile.get().then(p => { subscriptionEndsAt.value = p?.user?.analysis_stats?.subscription_ends_at ?? null }).catch(() => {})
  setTimeout(() => {
    isReady.value = true
  }, 40)
  const ipcCleanup: (() => void)[] = []
  ipcCleanup.push(window.api.on('post-game:preparing', (...args: unknown[]) => {
    const data = args[0] as { game: string; map: string | null; agent: string | null }
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (state.value === 'uploading' || state.value === 'analysing') return
    state.value = 'preparing'
    uploadProgress.value = 0
    compressing.value = false
  }))
  ipcCleanup.push(window.api.on('post-game:prep-step', (...args: unknown[]) => {
    const data = args[0] as { game?: string; map?: string | null; agent?: string | null }
    if (data?.game) {
      gameInfo.value = { game: data.game, map: data.map ?? null, agent: data.agent ?? null }
    }
    state.value = 'uploading'
    compressing.value = false
    uploadProgress.value = 0
    uploadStartedAt.value = Date.now()
  }))
  ipcCleanup.push(window.api.on('post-game:compress-start', (...args: unknown[]) => {
    const data = args[0] as { sizeGB?: string }
    state.value = 'uploading'
    compressing.value = true
    uploadProgress.value = 0
    if (data?.sizeGB && data.sizeGB !== 'transcode') {
      errorMessage.value = ''
    }
  }))
  ipcCleanup.push(window.api.on('post-game:upload-start', (...args: unknown[]) => {
    state.value = 'uploading'
    compressing.value = false
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
  ipcCleanup.push(window.api.on('post-game:analysis-deferred', () => {
    analysisDeferred.value = true
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

    // Browser launch is handled by the main process (index.ts) so it fires
    // even if this window was closed before analysis completed.
  }))
  ipcCleanup.push(window.api.on('post-game:pending', (...args: unknown[]) => {
    const data = args[0] as { recordingId: string; game: string; map: string | null; agent: string | null }
    pendingRecordingId.value = data.recordingId
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    state.value = 'pending'
  }))
  ipcCleanup.push(window.api.on('post-game:upload-error', (...args: unknown[]) => {
    const payload = args[0] as string | { message: string; recordingId?: string; needsUpgrade?: boolean; upgradeUrl?: string; ppaUrl?: string; clipsOnly?: boolean }
    needsUpgrade.value = false
    needsArchiveUpgrade.value = false
    clipsOnlyError.value = false
    savingToCloud.value = false
    archiveOnlyUpload.value = false
    if (typeof payload === 'string') {
      errorMessage.value = payload
    } else {
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

async function analyseNow() {
  if (!pendingRecordingId.value || analysing.value) return
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
    const clips = await window.api.clips.get()
    sessionClipCount.value = clips.filter((c) => c.savedAt >= sessionStart).length
  } catch {
    sessionClipCount.value = 0
  }
}

async function openClips() {
  // Don't close the post-game window — user may want to come back and analyse the VOD
  await window.api.app.showClips().catch(() => {})
}

const analysisUrl = computed(() => result.value?.analysis_id ? `https://upforge.gg/valorant/results/${result.value.analysis_id}` : '')

function viewFullAnalysis() {
  if (analysisUrl.value) {
    window.open(analysisUrl.value, '_blank')
  }
  dismiss()
}

function dismiss() { window.close() }
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

    // K/D/A row
    const kills = result.value.kills
    const deaths = result.value.deaths
    const assists = result.value.assists
    if (kills != null) {
      ctx.fillStyle = '#6b7280'
      ctx.font = '15px system-ui, -apple-system, sans-serif'
      const kdaStr = `${kills} / ${deaths ?? '?'} / ${assists ?? '?'}  K/D/A`
      ctx.fillText(kdaStr, 60, 375)
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
      roundRectPath(ctx, bx, 363, bw, 18, 4)
      ctx.fill()
      ctx.strokeStyle = badgeStroke
      ctx.lineWidth = 1
      roundRectPath(ctx, bx, 363, bw, 18, 4)
      ctx.stroke()
      ctx.fillStyle = badgeTextColor
      ctx.fillText(badgeText, bx + 8, 375)
    }

    // --- Right panel ---
    // "AI COACHING FOCUS" header
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
    ctx.fillText('AI COACHING FOCUS', 560, 80)

    // Coaching points
    const coachingPoints: string[] = []
    if (topIssue.value) coachingPoints.push(topIssue.value)
    for (const imp of improvements.value) {
      if (coachingPoints.length >= 3) break
      coachingPoints.push(imp)
    }

    let pointY = 115
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
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.95), rgba(249, 115, 22, 0.95));
  box-shadow: 0 0 18px rgba(239, 68, 68, 0.35);
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
