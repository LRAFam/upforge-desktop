<template>
  <div class="flex flex-col h-full bg-[#0c0c0c] relative overflow-hidden">
    <!-- Subtle glow bg — uses agent accent colour when available -->
    <div class="absolute inset-0 pointer-events-none">
      <div
        class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full blur-3xl transition-all duration-700 opacity-60"
        :style="glowBgStyle"
      />
    </div>

    <div class="flex-1 flex flex-col items-center justify-center px-5 py-4 relative z-10">

      <!-- Uploading -->
      <div v-if="state === 'uploading'" class="w-full space-y-4 text-center">
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
        <div
          class="w-11 h-11 mx-auto rounded-full overflow-hidden flex items-center justify-center transition-all"
          :class="agentImageUrl ? '' : 'bg-red-500/10 border border-red-500/20'"
          :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
        >
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
          <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Uploading replay</p>
          <p class="text-xs text-gray-500 mt-0.5">
            {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map"> &middot; {{ gameInfo.map }}</span>
          </p>
        </div>
        <div class="w-full space-y-1.5">
          <div class="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all duration-300"
              :style="{ width: `${uploadProgress}%` }"
            />
          </div>
          <div class="flex items-center justify-between">
            <span v-if="uploadEta" class="text-xs text-gray-600">{{ uploadEta }}</span>
            <span v-else class="text-xs text-gray-600">&nbsp;</span>
            <p class="text-xs text-gray-600">{{ uploadProgress }}%</p>
          </div>
        </div>
      </div>

      <!-- Analysing -->
      <div v-else-if="state === 'analysing'" class="w-full space-y-4 text-center">
        <!-- Dismiss during analysis -->
        <button
          class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
          title="Dismiss"
          @click="dismiss"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div
          class="w-11 h-11 mx-auto rounded-full overflow-hidden flex items-center justify-center transition-all"
          :class="agentImageUrl ? '' : 'bg-orange-500/10 border border-orange-500/20'"
          :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
        >
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
          <svg v-else class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Analysing gameplay</p>
          <p class="text-xs text-gray-500 mt-0.5">
            {{ analysisElapsedSecs > 0 ? `Analysing… ${analysisElapsedDisplay}` : 'Uploading to AI…' }}
          </p>
        </div>
        <!-- Multi-stage progress indicator -->
        <div class="flex items-center gap-0 w-full px-2">
          <template v-for="(stage, i) in ANALYSIS_STAGES" :key="stage">
            <div class="flex items-center gap-1 flex-shrink-0">
              <div
                class="w-1.5 h-1.5 rounded-full transition-colors duration-700"
                :class="i <= analysisStageIndex ? 'bg-orange-500' : 'bg-white/10'"
              />
              <span class="text-xs transition-colors duration-700" :class="i <= analysisStageIndex ? 'text-orange-400' : 'text-gray-700'">{{ stage }}</span>
            </div>
            <div
              v-if="i < ANALYSIS_STAGES.length - 1"
              class="flex-1 h-px mx-1 transition-colors duration-700"
              :class="i < analysisStageIndex ? 'bg-orange-500/50' : 'bg-white/[0.06]'"
            />
          </template>
        </div>
        <!-- Rotating coaching tip -->
        <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl text-left">
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">Did you know?</p>
          <p class="text-xs text-gray-400 leading-relaxed">{{ currentTip }}</p>
        </div>
        <!-- Progress ring + bouncing dots -->
        <div class="flex items-center justify-center gap-3">
          <svg class="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2.5"/>
            <circle
              cx="12" cy="12" r="9" fill="none" stroke="rgb(249,115,22)" stroke-width="2.5"
              stroke-linecap="round"
              :stroke-dasharray="`${Math.min(analysisElapsedSecs / 180 * 56.5, 56.5)} 56.5`"
              style="transition: stroke-dasharray 1s linear;"
            />
          </svg>
          <div class="flex items-center gap-1.5">
            <span v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" :style="{ animationDelay: `${(i - 1) * 0.18}s` }" />
          </div>
        </div>
        <div v-if="analysisStuck" class="flex items-start gap-2 px-3 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-left">
          <svg class="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-gray-400">This is taking a while — complex matches can take up to 10 minutes</p>
            <p class="text-xs text-gray-600 mt-0.5">Your analysis is still running in the background. Grab a coffee and check back on the dashboard.</p>
            <button
              class="mt-2 px-2.5 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="dismiss"
            >Close &amp; check dashboard</button>
          </div>
        </div>
        <div v-if="analysisTimedOut" class="flex items-start gap-2 px-3 py-2.5 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl text-left">
          <svg class="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-amber-300 font-medium">Analysis is taking too long</p>
            <p class="text-xs text-gray-500 mt-0.5">This usually means the AI service is under heavy load. Check the dashboard later for your results.</p>
            <button
              class="mt-2 px-2.5 py-1 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="dismiss"
            >Close</button>
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

        <!-- Agent hero + score -->
        <div class="flex items-center gap-4">
          <div
            class="relative w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 hero-animate-in"
            :class="agentImageUrl ? '' : 'bg-green-500/10 border border-green-500/20'"
            :style="agentImageUrl ? { border: `2px solid ${agentAccentColor}60`, background: agentAccentColor + '20', boxShadow: `0 0 20px ${agentAccentColor}30` } : {}"
          >
            <img v-if="agentImageUrl" :src="agentImageUrl" class="w-full h-full object-cover object-top" />
            <svg v-else class="w-8 h-8 text-green-400 absolute inset-0 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Analysis ready</span>
              <span
                v-if="result?.overall_score"
                class="text-xs font-bold px-1.5 py-0.5 rounded-full score-grade-in"
                :class="scoreGradeBadgeClass(result.overall_score)"
              >{{ scoreGrade(result.overall_score) }}</span>
            </div>
            <p class="text-sm font-bold text-white leading-tight">
              {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map" class="text-gray-500 font-normal"> · {{ gameInfo.map }}</span>
            </p>
          </div>
          <div v-if="result?.overall_score" class="text-right flex-shrink-0">
            <span class="text-3xl font-black tabular-nums score-reveal" :class="scoreClass(result.overall_score)">{{ result.overall_score }}</span>
            <span class="text-xs text-gray-600 font-normal">/100</span>
          </div>
        </div>

        <!-- Score bar -->
        <div v-if="result?.overall_score" class="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-1000"
            :class="scoreBarClass(result.overall_score)"
            :style="{ width: `${result.overall_score}%` }"
          />
        </div>

        <!-- AI Verdict (one-liner from analysis) -->
        <div v-if="result?.verdict" class="flex items-start gap-2 px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
          <svg class="w-3.5 h-3.5 text-red-400/70 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          <p class="text-[11px] text-gray-400 leading-relaxed italic">{{ result.verdict }}</p>
        </div>

        <!-- Match stats row: K/D/A + result -->
        <div v-if="result?.kills != null || result?.match_result" class="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <span
            v-if="result?.match_result"
            class="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
            :class="result.match_result === 'win' ? 'bg-green-500/15 text-green-400 border border-green-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'"
          >{{ result.match_result === 'win' ? 'WIN' : 'LOSS' }}</span>
          <span
            v-if="result?.ally_score != null && result?.enemy_score != null"
            class="text-xs font-mono text-gray-500 flex-shrink-0"
          >{{ result.ally_score }}–{{ result.enemy_score }}</span>
          <div v-if="result?.kills != null" class="flex items-center gap-2 ml-auto">
            <span class="text-xs font-bold text-white tabular-nums">{{ result.kills }}</span>
            <span class="text-xs text-gray-600">/</span>
            <span class="text-xs font-bold text-red-400 tabular-nums">{{ result.deaths ?? '?' }}</span>
            <span class="text-xs text-gray-600">/</span>
            <span class="text-xs font-bold text-gray-400 tabular-nums">{{ result.assists ?? '?' }}</span>
            <span class="text-xs text-gray-600">K/D/A</span>
          </div>
        </div>

        <!-- Improvements list -->
        <div v-if="improvements.length" class="space-y-1.5">
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-600">Focus on</p>
          <div
            v-for="(imp, i) in improvements"
            :key="i"
            class="flex items-start gap-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl"
          >
            <span class="text-xs font-bold w-4 flex-shrink-0 mt-0.5" :class="i === 0 ? 'text-red-400' : 'text-gray-600'">{{ i + 1 }}</span>
            <p class="text-xs text-gray-300 leading-relaxed">{{ imp }}</p>
          </div>
        </div>
        <!-- Fallback: top issue only -->
        <div v-else-if="topIssue" class="flex items-start gap-2 px-3 py-2 bg-red-500/[0.07] border border-red-500/15 rounded-xl">
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p class="text-xs text-gray-300 leading-relaxed">{{ topIssue }}</p>
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

        <!-- Coaching tags — areas flagged by AI -->
        <div v-if="result?.coaching_tags?.length" class="space-y-1.5">
          <p class="text-[9px] font-semibold uppercase tracking-widest text-gray-600">Areas flagged</p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tag in result.coaching_tags"
              :key="tag"
              class="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400/80 border border-red-500/20 capitalize"
            >{{ tag.replace(/_/g, ' ') }}</span>
          </div>
        </div>

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

        <div class="flex gap-2 pt-1">
          <button
            class="flex-1 py-2.5 text-xs font-bold rounded-xl transition-all shadow-lg"
            :style="{ background: `linear-gradient(135deg, ${agentAccentColor || '#dc2626'}, ${agentAccentColor ? agentAccentColor + 'cc' : '#ea580c'})`, boxShadow: `0 4px 14px ${agentAccentColor || '#dc2626'}40` }"
            @click="viewFullAnalysis"
          >View Full Analysis →</button>
          <button
            v-if="result?.overall_score"
            title="Copy score to clipboard"
            class="px-3 py-2.5 text-xs text-gray-400 hover:text-gray-200 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-colors"
            @click="copyScore"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
          <button
            v-if="result?.overall_score"
            :title="cardExportDone ? 'Saved!' : 'Save coaching card as PNG'"
            :disabled="cardExporting"
            class="px-3 py-2.5 text-xs bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
            :class="cardExportDone ? 'text-green-400 border-green-500/20' : 'text-gray-400 hover:text-gray-200'"
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
            <span>{{ cardExporting ? 'Saving…' : cardExportDone ? 'Saved!' : 'Share' }}</span>
          </button>
          <button
            class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-colors"
            @click="dismiss"
          >Dismiss</button>
        </div>

        <!-- Session clips row -->
        <button
          v-if="sessionClipCount > 0"
          class="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl transition-colors text-left"
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

        <!-- Post-game debrief panel -->
        <div
          v-if="debriefLoading || debriefText || debriefFailed"
          class="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
        >
          <div class="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
            <svg class="w-3.5 h-3.5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            <span class="text-xs font-semibold text-purple-300">Instant Debrief</span>
            <span class="text-xs text-gray-600 ml-auto">no VOD needed</span>
          </div>
          <div class="px-3 py-2.5">
            <div v-if="debriefLoading && !debriefText" class="flex items-center gap-2 text-xs text-gray-500">
              <svg class="w-3.5 h-3.5 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <span>Generating your post-game debrief…</span>
            </div>
            <p v-else-if="debriefFailed" class="text-xs text-gray-500 italic">Debrief unavailable for this match — the AI service could not be reached. Try again after your next match.</p>
            <p v-else class="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{{ debriefText }}</p>
          </div>
        </div>
      </div>

      <!-- Pending (auto-analyse off) -->
      <div v-else-if="state === 'pending'" class="w-full space-y-3 text-center">
        <div
          class="w-11 h-11 mx-auto rounded-full overflow-hidden flex items-center justify-center transition-all"
          :class="agentImageUrl ? '' : 'bg-blue-500/10 border border-blue-500/20'"
          :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
        >
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
          <svg v-else class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Game recorded</p>
          <p class="text-xs text-gray-500 mt-0.5">
            {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map"> &middot; {{ gameInfo.map }}</span>
          </p>
          <p class="text-xs text-gray-600 mt-1.5">Auto-analyse is off — analyse now or view later from the dashboard.</p>
        </div>
        <div class="flex gap-2 pt-1">
          <button
            :disabled="analysing"
            class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 disabled:opacity-50 text-white rounded-lg transition-all shadow-sm shadow-red-500/20"
            @click="analyseNow"
          >{{ analysing ? 'Starting...' : 'Analyse Now' }}</button>
          <button
            class="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors"
            @click="dismissPending"
          >Later</button>
        </div>
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
            <p class="text-sm font-semibold text-amber-400">Monthly limit reached</p>
            <p class="text-xs text-gray-400 mt-1">You've used your free analysis this month. Upgrade to get 5–15 analyses per month.</p>
            <p class="text-xs text-gray-600 mt-1">Premium $14.99/mo · Pro $24.99/mo · Check your email for details.</p>
          </div>
          <div class="flex gap-2 pt-1">
            <button
              class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg transition-all shadow-sm shadow-amber-500/20"
              @click="openUpgrade"
            >View Plans →</button>
            <button class="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors" @click="dismiss">Dismiss</button>
          </div>
        </template>

        <!-- Generic upload error -->
        <template v-else>
          <div class="w-11 h-11 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-red-400">Upload failed</p>
            <p class="text-xs text-gray-500 mt-1">{{ errorMessage }}</p>
          </div>
          <div class="flex gap-2 pt-1">
            <button
              :disabled="!pendingRecordingId"
              class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-lg transition-all shadow-sm shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              @click="retryUpload"
            >Retry</button>
            <button class="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors" @click="dismiss">Dismiss</button>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getAgentImage, getAgentColor } from '../lib/valorant'

type State = 'uploading' | 'analysing' | 'ready' | 'error' | 'pending'

const COACHING_TIPS = [
  'Players who review their gameplay weekly improve 2x faster than those who don\'t.',
  'Crosshair placement accounts for up to 40% of your ability to win gunfights.',
  'Economy management separates Gold from Diamond more than aim does.',
  'The #1 mistake at every rank: pushing aggressively without information.',
  'Positioning decisions happen before the fight starts — map awareness wins rounds.',
  'Pro players spend more time watching replays than playing ranked.',
  'A consistent warm-up routine can reduce your reaction time by 15–20ms.',
]

const ANALYSIS_STAGES = ['Upload', 'Analyse', 'Generate']

const state = ref<State>('uploading')
const uploadProgress = ref(0)
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
} | null>(null)
const errorMessage = ref('')
const needsUpgrade = ref(false)
const upgradeUrl = ref('https://upforge.gg/pricing')
const pendingRecordingId = ref<string | null>(null)
const analysing = ref(false)
const analysisStuck = ref(false)
const analysisTimedOut = ref(false)
const tipIndex = ref(Math.floor(Math.random() * COACHING_TIPS.length))
const sessionClipCount = ref(0)
const analysisStartedAt = ref(0)
const analysisElapsedSecs = ref(0)
let sessionStart = 0
let stuckTimer: ReturnType<typeof setTimeout> | null = null
let timeoutTimer: ReturnType<typeof setTimeout> | null = null
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

const analysisStageIndex = computed(() => {
  const s = analysisElapsedSecs.value
  if (s < 30) return 0
  if (s < 150) return 1
  return 2
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

function startStuckTimer() {
  if (stuckTimer) clearTimeout(stuckTimer)
  if (timeoutTimer) clearTimeout(timeoutTimer)
  analysisStartedAt.value = Date.now()
  analysisElapsedSecs.value = 0
  stuckTimer = setTimeout(() => { analysisStuck.value = true }, 5 * 60 * 1000)
  timeoutTimer = setTimeout(() => { analysisTimedOut.value = true }, 15 * 60 * 1000)
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
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  analysisStuck.value = false
  analysisTimedOut.value = false
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
const debriefText = ref<string | null>(null)
const debriefLoading = ref(false)
const debriefFailed = ref(false)
const demoStatus = ref<{ status: string; jobId?: string; error?: string } | null>(null)
const demoProgress = ref(0)

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
  if (score >= 75) return 'A'
  if (score >= 60) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

function scoreGradeBadgeClass(score: number): string {
  if (score >= 90) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
  if (score >= 75) return 'bg-green-500/20 text-green-300 border border-green-500/30'
  if (score >= 60) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (score >= 45) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-300 border border-red-500/30'
}

const agentImageUrl = computed(() => gameInfo.value.agent ? getAgentImage(gameInfo.value.agent) : '')
const agentAccentColor = computed(() => gameInfo.value.agent ? getAgentColor(gameInfo.value.agent) : '')
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
  const ipcCleanup: (() => void)[] = []
  ipcCleanup.push(window.api.on('post-game:upload-start', (...args: unknown[]) => {
    const data = args[0] as { game: string; map: string | null; agent: string | null; matchDetailsStatus?: typeof matchDataStatus.value; killsInTimeline?: number }
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (data.matchDetailsStatus) matchDataStatus.value = data.matchDetailsStatus
    killsCapured.value = data.killsInTimeline ?? 0
    uploadStartedAt.value = Date.now()
  }))
  ipcCleanup.push(window.api.on('post-game:upload-progress', (...args: unknown[]) => { uploadProgress.value = args[0] as number }))
  ipcCleanup.push(window.api.on('post-game:upload-complete', () => { state.value = 'analysing'; startStuckTimer() }))
  ipcCleanup.push(window.api.on('post-game:analysis-ready', (...args: unknown[]) => {
    clearStuckTimer()
    const r = args[0] as typeof result.value & { session_start?: number }
    result.value = r
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
    const payload = args[0] as string | { message: string; recordingId?: string; needsUpgrade?: boolean; upgradeUrl?: string }
    needsUpgrade.value = false
    if (typeof payload === 'string') {
      errorMessage.value = payload
    } else {
      errorMessage.value = payload.message
      if (payload.recordingId) pendingRecordingId.value = payload.recordingId
      if (payload.needsUpgrade) {
        needsUpgrade.value = true
        upgradeUrl.value = payload.upgradeUrl || 'https://upforge.gg/pricing'
      }
    }
    state.value = 'error'
  }))
  ;(window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup = ipcCleanup

  // Debrief arrives asynchronously — show it when ready
  ipcCleanup.push(window.api.on('post-game:debrief', (...args: unknown[]) => {
    const data = args[0] as { debrief: string; agent: string | null; map: string | null } | null
    if (data?.debrief) {
      debriefText.value = data.debrief
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
  const cleanup = (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
  cleanup?.forEach(fn => fn())
  delete (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
})

async function analyseNow() {
  if (!pendingRecordingId.value || analysing.value) return
  analysing.value = true
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

function viewFullAnalysis() {
  if (result.value?.analysis_id) {
    window.open(`https://upforge.gg/valorant/results/${result.value.analysis_id}`, '_blank')
  }
  dismiss()
}

function dismiss() { window.close() }
function openUpgrade() { window.open(upgradeUrl.value, '_blank') }

async function copyScore() {
  if (!result.value?.overall_score) return
  const text = `UpForge Score: ${result.value.overall_score}/100 (${scoreGrade(result.value.overall_score)})`
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
    const scoreColor = score >= 80 ? '#4ade80' : score >= 60 ? '#facc15' : '#f87171'

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

    // Score number
    ctx.fillStyle = scoreColor
    ctx.font = 'bold 110px system-ui, -apple-system, sans-serif'
    const scoreStr = String(score)
    const scoreW = ctx.measureText(scoreStr).width
    ctx.fillText(scoreStr, 60, 285)

    // "/100"
    ctx.fillStyle = '#4b5563'
    ctx.font = '22px system-ui, -apple-system, sans-serif'
    ctx.fillText('/100', 60 + scoreW + 8, 263)

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
  return score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
}
function scoreBarClass(score: number): string {
  return score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
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
