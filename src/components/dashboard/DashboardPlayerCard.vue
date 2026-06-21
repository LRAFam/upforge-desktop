<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard'
import {
  getRankHexColor,
  getRankIconUrl,
  getTierBadgeClass,
  getTierBadgeLabel,
  getDisplayTier,
} from '../../lib/valorant'
import { getSubscriptionIconUrl } from '../../lib/rank-assets'
import PaymentFailedAlert from '../PaymentFailedAlert.vue'

const {
  profile,
  profileLoading,
  isValorant,
  isCs2,
  isDeadlock,
  theme,
  playerCardUrl,
  isAdmin,
  paymentPastDue,
  quotaPercent,
  archiveQuotaPercent,
  onboardingTargetRank,
  showRankHistory,
  rrHistory,
  rrSparkline,
  formatEntryDate,
  rrDelta,
  refreshProfile,
  openBrowser,
  openRiotSettings,
  openAccountSetup,
  showBillingError,
} = useDashboard()
</script>

<template>
  <div v-if="profile" class="panel-elevated overflow-hidden flex-shrink-0">
    <div class="px-4 pt-4 pb-3">
      <div class="flex items-start gap-3">
        <div class="relative flex-shrink-0">
          <img v-if="isValorant && playerCardUrl" :src="playerCardUrl" class="w-14 h-14 rounded-xl object-cover" @error="playerCardUrl = ''" />
          <div v-else class="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center">
            <span class="text-xl font-black text-red-400">{{ profile.user.name?.charAt(0).toUpperCase() }}</span>
          </div>
        </div>
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
            <button v-else class="text-red-400/70 hover:text-red-400 transition-colors" @click="openRiotSettings">{{ theme.accountLinkLabel }}</button>
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
        <button class="text-teal-400/80 hover:text-teal-300 transition-colors" @click="openAccountSetup">{{ theme.accountLinkLabel }}</button> on the web to sync rank &amp; match history.
      </p>
      <p v-if="onboardingTargetRank" class="text-[10px] text-gray-600">
        Goal: <span class="font-semibold" :class="isCs2 ? 'text-orange-300/90' : 'text-teal-300/90'">{{ onboardingTargetRank }}</span>
      </p>
    </div>

    <div v-if="paymentPastDue" class="px-4 py-3 border-t border-white/[0.07]">
      <PaymentFailedAlert @error="showBillingError" />
    </div>

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
</template>

<style scoped>
@keyframes statEnter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stat-number {
  animation: statEnter 0.4s ease-out both;
}
</style>
