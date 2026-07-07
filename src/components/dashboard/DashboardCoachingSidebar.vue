<script setup lang="ts">
import { ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { getAgentImage, getAgentColor } from '../../lib/valorant'
import { formatRelativeTime } from '../../lib/dashboard-match-row'
import { scoreGrade, scoreGradeBadgeClass } from '../../lib/analysis-scoring'
import PanelCarousel from '../PanelCarousel.vue'
import SkillProfileBars from '../SkillProfileBars.vue'
import CoachMemoryCard from '../CoachMemoryCard.vue'

const {
  router,
  isValorant,
  theme,
  clipCount,
  lastInsight,
  lastInsightTraining,
  emptyCoachingTitle,
  emptyCoachingMessage,
  emptyCoachingAction,
  rightInsightIndex,
  rightInsightPanels,
  playstyleProfile,
  skillProfile,
  skillProfilePrevious,
  playerRankName,
  onboardingTargetRank,
  onboardingWeaknesses,
  goalsRankIcon,
  correlationInsights,
  trainerLastSession,
  trainerSessionCount,
  activityLog,
  openAnalysis,
  trainLastInsight,
  openPlaystyleProfile,
  openEmptyCoachingAction,
  formatLogTime,
  logEntryColor,
  clearLog,
  copyActivityLog,
} = useDashboard()

const logCopied = ref(false)

async function copyLog() {
  const ok = await copyActivityLog()
  if (!ok) return
  logCopied.value = true
  setTimeout(() => { logCopied.value = false }, 2000)
}
</script>

<template>
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
      <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border" :class="[theme.accentBg, theme.accentBorder]">
        <svg class="w-3.5 h-3.5" :class="theme.accentMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-gray-400">{{ emptyCoachingTitle }}</p>
        <p class="text-[10px] text-gray-600 leading-snug">{{ emptyCoachingMessage }}</p>
      </div>
      <button class="flex-shrink-0 px-2 py-1 text-[10px] font-semibold text-gray-400 hover:text-white border border-white/[0.09] rounded-lg transition-colors" @click="openEmptyCoachingAction">{{ emptyCoachingAction }}</button>
    </div>
  </div>

  <PanelCarousel
    v-if="rightInsightPanels.length"
    v-model:index="rightInsightIndex"
    :panels="rightInsightPanels"
  >
    <template #default="{ panel }">
      <template v-if="panel">
        <div v-if="panel.id === 'playstyle' && playstyleProfile" class="space-y-2 pt-0.5">
          <div class="flex items-center justify-between gap-2">
            <span
              v-if="playstyleProfile.profile_milestone?.label"
              class="text-[9px] font-bold uppercase tracking-wider text-violet-300/90"
            >
              {{ playstyleProfile.profile_milestone.label }}
            </span>
            <span class="text-[9px] text-gray-600 tabular-nums">
              {{ playstyleProfile.vods_analyzed ?? 0 }} VODs
              <template v-if="playstyleProfile.matches_tracked > 0">
                · {{ playstyleProfile.matches_tracked }}m
              </template>
            </span>
            <button type="button" class="text-[9px] text-gray-600 hover:text-gray-300 shrink-0" @click="openPlaystyleProfile">View →</button>
          </div>
          <p
            v-if="playstyleProfile.metrics?.combat?.death_hotspots?.[0]"
            class="text-[10px] text-gray-500 leading-snug"
          >
            Top death zone:
            <span class="text-gray-300">{{ playstyleProfile.metrics.combat.death_hotspots[0].callout }}</span>
            ({{ playstyleProfile.metrics.combat.death_hotspots[0].count }}×)
          </p>
          <ul v-if="(playstyleProfile.brain_habits ?? playstyleProfile.focus_areas)?.length" class="space-y-1.5">
            <li
              v-for="area in (playstyleProfile.brain_habits ?? playstyleProfile.focus_areas).slice(0, 2)"
              :key="area.id"
              class="flex items-start gap-1.5"
            >
              <span class="mt-1 w-1 h-1 rounded-full flex-shrink-0" :class="area.severity === 'high' ? 'bg-red-400' : area.severity === 'medium' ? 'bg-yellow-400' : 'bg-gray-500'" />
              <p class="text-[10px] text-gray-400 leading-snug line-clamp-3">{{ area.text }}</p>
            </li>
          </ul>
          <p v-else class="text-[10px] text-gray-500 leading-snug">
            {{ playstyleProfile.matches_tracked < 3 ? `${3 - playstyleProfile.matches_tracked} more desktop games for habits` : 'Analyse more VODs to sharpen habits' }}
          </p>
        </div>

        <div v-else-if="panel.id === 'skills' && skillProfile" class="space-y-2 pt-0.5">
          <SkillProfileBars :profile="skillProfile" :previous="skillProfilePrevious" :rank-name="playerRankName" compact />
          <CoachMemoryCard :profile="skillProfile" :focus-areas="playstyleProfile?.focus_areas" />
        </div>

        <div v-else-if="panel.id === 'goals'" class="space-y-2 pt-0.5">
          <p v-if="onboardingTargetRank" class="text-[11px] text-gray-300 flex items-center gap-2">
            <img v-if="goalsRankIcon" :src="goalsRankIcon" alt="" class="w-5 h-5 object-contain flex-shrink-0" />
            <span>Target: <span class="font-bold" :class="theme.goalRankClass">{{ onboardingTargetRank }}</span></span>
          </p>
          <div v-if="onboardingWeaknesses.length" class="flex flex-wrap gap-1">
            <span v-for="w in onboardingWeaknesses.slice(0, 4)" :key="w" class="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] text-gray-500 border border-white/[0.06]">{{ w }}</span>
          </div>
        </div>

        <ul v-else-if="panel.id === 'impact'" class="space-y-1.5 pt-0.5">
          <li v-for="(insight, i) in correlationInsights.slice(0, 3)" :key="i" class="flex items-start gap-1.5">
            <span class="mt-1 w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
            <p class="text-[10px] text-gray-400 leading-snug line-clamp-2">{{ insight }}</p>
          </li>
        </ul>

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

  <div v-if="activityLog.length" class="bg-white/[0.02] border border-white/[0.10] rounded-xl overflow-hidden flex-shrink-0">
    <div class="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.07]">
      <span class="text-[9px] font-bold uppercase tracking-widest text-gray-600">Activity</span>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="text-[9px] font-semibold text-gray-600 hover:text-gray-300 transition-colors"
          @click="copyLog"
        >
          {{ logCopied ? 'Copied' : 'Copy' }}
        </button>
        <button
          type="button"
          class="w-4 h-4 flex items-center justify-center text-gray-700 hover:text-gray-400 transition-colors"
          title="Clear log"
          @click="clearLog"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="py-1 max-h-32 overflow-y-auto scroll-col">
      <div v-for="entry in [...activityLog].reverse().slice(0, 8)" :key="entry.time" class="flex items-start gap-2 px-3 py-1">
        <div :class="['w-1 h-1 rounded-full flex-shrink-0 mt-1.5', logEntryColor(entry.message)]" />
        <span class="text-[9px] text-gray-700 tabular-nums flex-shrink-0 font-mono">{{ formatLogTime(entry.time) }}</span>
        <span class="text-[9px] text-gray-500 leading-snug min-w-0 break-words">{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
