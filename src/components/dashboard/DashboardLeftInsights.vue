<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard'
import { getAgentImage, getAgentColor } from '../../lib/valorant'
import PanelCarousel from '../PanelCarousel.vue'

const {
  profile,
  leftInsightIndex,
  leftInsightPanels,
  scoreTrend,
  avgScore,
  scoreChartData,
  topAgents,
  forgeRankColor,
  forgeRankGradient,
  forgeRankInitial,
  getMasteryIconUrl,
  triggerPrestige,
} = useDashboard()
</script>

<template>
  <PanelCarousel
    v-if="leftInsightPanels.length"
    v-model:index="leftInsightIndex"
    :panels="leftInsightPanels"
  >
    <template #default="{ panel }">
      <template v-if="panel">
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
</template>
