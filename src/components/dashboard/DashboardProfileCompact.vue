<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard'
import {
  getRankHexColor,
  getRankIconUrl,
  getTierBadgeClass,
  getTierBadgeLabel,
  getDisplayTier,
} from '../../lib/valorant'

const {
  profile,
  profileLoading,
  isValorant,
  isCs2,
  isDeadlock,
  theme,
  playerCardUrl,
  isAdmin,
  dashboardRankLabel,
  quotaPercent,
  onboardingTargetRank,
  refreshProfile,
  openRiotSettings,
} = useDashboard()
</script>

<template>
  <div v-if="profile" class="panel-elevated overflow-hidden flex-shrink-0">
    <div class="px-3.5 py-3">
      <div class="flex items-center gap-3">
        <div class="relative flex-shrink-0">
          <img
            v-if="isValorant && playerCardUrl"
            :src="playerCardUrl"
            class="w-11 h-11 rounded-xl object-cover"
            alt=""
            @error="playerCardUrl = ''"
          />
          <div
            v-else
            class="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center"
          >
            <span class="text-base font-black text-red-400">{{ profile.user.name?.charAt(0).toUpperCase() }}</span>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <p class="text-sm font-bold truncate">{{ profile.user.name }}</p>
            <span
              v-if="isAdmin"
              :class="['px-1.5 py-px rounded text-[8px] font-bold uppercase flex-shrink-0', getTierBadgeClass('admin')]"
            >Admin</span>
            <span
              v-else
              :class="['px-1.5 py-px rounded text-[8px] font-bold uppercase flex-shrink-0', getTierBadgeClass(getDisplayTier(profile.user.tier))]"
            >
              {{ getTierBadgeLabel(getDisplayTier(profile.user.tier)) }}
            </span>
          </div>
          <p class="text-[11px] text-gray-500 mt-0.5 truncate">
            <span v-if="isValorant && profile.user.riot_name">{{ profile.user.riot_name }}#{{ profile.user.riot_tag }}</span>
            <span v-else-if="isCs2" class="text-orange-300/80">CS2</span>
            <span v-else-if="isDeadlock" class="text-teal-300/80">Deadlock</span>
            <button v-else class="text-red-400/70 hover:text-red-400" @click="openRiotSettings">{{ theme.accountLinkLabel }}</button>
          </p>
        </div>
        <button
          class="p-1.5 text-gray-700 hover:text-gray-400 rounded-lg hover:bg-white/[0.04] flex-shrink-0"
          title="Refresh profile"
          @click="refreshProfile"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        </button>
      </div>

      <div
        v-if="isValorant && profile.latest_stats?.current_rank"
        class="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
      >
        <div class="flex items-center gap-1.5 min-w-0">
          <img
            v-if="getRankIconUrl(profile.latest_stats.current_rank)"
            :src="getRankIconUrl(profile.latest_stats.current_rank)!"
            alt=""
            class="w-5 h-5 object-contain flex-shrink-0"
          />
          <span class="text-sm font-black truncate" :style="{ color: getRankHexColor(profile.latest_stats.current_rank) }">
            {{ profile.latest_stats.current_rank }}
          </span>
          <span v-if="profile.latest_stats.rr != null" class="text-[10px] text-gray-600 tabular-nums">{{ profile.latest_stats.rr }} RR</span>
        </div>
        <span v-if="onboardingTargetRank" class="text-[10px] text-red-300/80 font-semibold truncate">→ {{ onboardingTargetRank }}</span>
      </div>
      <p v-else class="mt-2 text-[11px] text-gray-600">
        <span class="font-semibold text-gray-400">{{ dashboardRankLabel }}</span>
      </p>
    </div>

    <div
      v-if="profile.user.analysis_stats && !isAdmin"
      class="px-3.5 py-2 border-t border-white/[0.07] flex items-center gap-2"
    >
      <span class="text-[9px] text-gray-600 uppercase tracking-wide shrink-0">Reports</span>
      <div v-if="profile.user.analysis_stats.limit != null" class="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          class="h-full rounded-full"
          :class="quotaPercent >= 80 ? 'bg-red-500' : quotaPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'"
          :style="{ width: `${100 - quotaPercent}%` }"
        />
      </div>
      <span class="text-[10px] tabular-nums text-gray-500 shrink-0">
        {{ Math.max(0, (profile.user.analysis_stats.limit ?? 0) - profile.user.analysis_stats.total) }} left
      </span>
    </div>
  </div>
  <div v-else-if="profileLoading" class="h-24 panel-elevated animate-pulse flex-shrink-0" />
</template>
