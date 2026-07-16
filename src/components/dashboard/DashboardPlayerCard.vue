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
import { getDeadlockRankIconUrl } from '../../lib/deadlock'
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
  cs2FaceitConnection,
  deadlockLinked,
  deadlockStats,
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

function deadlockRankIconUrl() {
  const rank = deadlockStats.value?.current_rank
  if (!rank) return getDeadlockRankIconUrl('Obscurus')
  return getDeadlockRankIconUrl(rank.name, rank.subtier) ?? getDeadlockRankIconUrl('Obscurus')
}
</script>

<template>
  <div v-if="profile" class="panel-elevated overflow-hidden flex-shrink-0">
    <!-- Identity -->
    <div class="px-4 pt-3.5 pb-3">
      <div class="flex items-start gap-3">
        <div class="relative flex-shrink-0">
          <img v-if="isValorant && playerCardUrl" :src="playerCardUrl" class="w-12 h-12 rounded-xl object-cover" @error="playerCardUrl = ''" />
          <div v-else class="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center">
            <span class="text-lg font-black text-red-400">{{ profile.user.name?.charAt(0).toUpperCase() }}</span>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <p class="text-sm font-bold truncate leading-tight">{{ profile.user.name }}</p>
            <span
              v-if="isAdmin"
              :class="['px-1.5 py-px rounded text-[9px] font-bold uppercase flex items-center gap-0.5 flex-shrink-0', getTierBadgeClass('admin')]"
            >
              <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clip-rule="evenodd" /></svg>
              Admin
            </span>
            <span
              v-else
              :class="['px-1.5 py-px rounded text-[9px] font-bold uppercase flex items-center gap-0.5 flex-shrink-0', getTierBadgeClass(getDisplayTier(profile.user.tier))]"
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
          <p class="text-[11px] text-gray-500 mt-1 leading-snug truncate">
            <span v-if="isCs2" class="text-orange-300/80">CS2 · demo analysis &amp; VOD coaching</span>
            <span v-else-if="isDeadlock" class="text-teal-300/80">Deadlock · replay analysis</span>
            <span v-else-if="profile.user.riot_name">{{ profile.user.riot_name }}#{{ profile.user.riot_tag }}</span>
            <button v-else class="text-red-400/70 hover:text-red-400 transition-colors" @click="openRiotSettings">{{ theme.accountLinkLabel }}</button>
          </p>
        </div>
        <div class="flex gap-0.5 flex-shrink-0 -mt-0.5">
          <button class="p-1.5 text-gray-700 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" @click="refreshProfile">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
          <button class="p-1.5 text-gray-700 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]" @click="openBrowser">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </button>
        </div>
      </div>

      <!-- Valorant rank + goal (single compact band) -->
      <div
        v-if="isValorant && profile.latest_stats?.current_rank"
        class="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2"
      >
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <div class="flex items-center gap-1.5 min-w-0">
            <img
              v-if="getRankIconUrl(profile.latest_stats.current_rank)"
              :src="getRankIconUrl(profile.latest_stats.current_rank)!"
              :alt="profile.latest_stats.current_rank"
              class="w-5 h-5 object-contain flex-shrink-0"
            />
            <span
              class="text-sm font-black leading-none truncate"
              :style="{ color: getRankHexColor(profile.latest_stats.current_rank) }"
            >{{ profile.latest_stats.current_rank }}</span>
            <span
              v-if="profile.latest_stats.leaderboard_rank"
              class="text-[9px] font-black bg-yellow-400/15 text-yellow-300 border border-yellow-400/25 px-1 py-px rounded-full tabular-nums flex-shrink-0"
            >#{{ profile.latest_stats.leaderboard_rank }}</span>
          </div>
          <template v-if="profile.latest_stats.rr != null || profile.latest_stats.last_rr_change != null">
            <span class="text-gray-700 text-[10px] hidden sm:inline">·</span>
            <div class="flex items-center gap-1.5 text-[11px]">
              <span v-if="profile.latest_stats.rr != null" class="font-semibold text-gray-500 tabular-nums">
                {{ profile.latest_stats.rr }} <span class="text-gray-700 font-medium">RR</span>
              </span>
              <span
                v-if="profile.latest_stats.last_rr_change != null"
                class="font-black tabular-nums px-1 py-px rounded text-[10px]"
                :class="profile.latest_stats.last_rr_change > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'"
              >{{ profile.latest_stats.last_rr_change > 0 ? '+' : '' }}{{ profile.latest_stats.last_rr_change }}</span>
            </div>
          </template>
        </div>
        <div
          v-if="onboardingTargetRank"
          class="flex items-center gap-1 flex-shrink-0 rounded-md border border-red-500/15 bg-red-500/[0.06] px-1.5 py-0.5 text-[10px] text-gray-500"
        >
          <span class="hidden sm:inline">Goal</span>
          <img
            v-if="getRankIconUrl(onboardingTargetRank)"
            :src="getRankIconUrl(onboardingTargetRank)!"
            alt=""
            class="w-3 h-3 object-contain"
          />
          <span class="font-semibold text-red-300/90 whitespace-nowrap">{{ onboardingTargetRank }}</span>
        </div>
      </div>
    </div>

    <template v-if="isValorant && profile.latest_stats">
      <div class="grid grid-cols-4 divide-x divide-white/[0.04] border-t border-white/[0.07]">
        <div class="flex flex-col items-center py-2">
          <span class="text-base font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.kd_ratio != null ? (profile.latest_stats.kd_ratio >= 1.2 ? 'text-green-400' : profile.latest_stats.kd_ratio >= 0.8 ? 'text-white' : 'text-red-400') : 'text-gray-600'">{{ profile.latest_stats.kd_ratio?.toFixed(2) ?? '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-1 uppercase tracking-wide">K/D</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-base font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.win_rate != null ? (profile.latest_stats.win_rate >= 52 ? 'text-green-400' : profile.latest_stats.win_rate >= 45 ? 'text-white' : 'text-red-400') : 'text-gray-600'">{{ profile.latest_stats.win_rate != null ? Math.round(profile.latest_stats.win_rate) + '%' : '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-1 uppercase tracking-wide">Win</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-base font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.avg_combat_score != null ? (profile.latest_stats.avg_combat_score >= 220 ? 'text-orange-400' : profile.latest_stats.avg_combat_score >= 160 ? 'text-white' : 'text-gray-300') : 'text-gray-600'">{{ profile.latest_stats.avg_combat_score ?? '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-1 uppercase tracking-wide">ACS</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-base font-black tabular-nums leading-none stat-number" :class="profile.latest_stats.headshot_percentage != null ? (profile.latest_stats.headshot_percentage >= 25 ? 'text-orange-400' : profile.latest_stats.headshot_percentage >= 18 ? 'text-white' : 'text-gray-400') : 'text-gray-600'">
            {{ profile.latest_stats.headshot_percentage != null ? Math.round(profile.latest_stats.headshot_percentage) + '%' : '—' }}
          </span>
          <span class="text-[9px] text-gray-600 mt-1 uppercase tracking-wide">HS%</span>
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
    <div v-else-if="isValorant" class="px-4 pb-3 pt-0">
      <button class="text-xs text-gray-600 hover:text-gray-400 transition-colors" @click="openRiotSettings">No stats yet — link your Riot ID</button>
      <div
        v-if="onboardingTargetRank"
        class="mt-2 inline-flex items-center gap-1 rounded-md border border-red-500/15 bg-red-500/[0.06] px-1.5 py-0.5 text-[10px] text-gray-500"
      >
        <span>Goal</span>
        <img v-if="getRankIconUrl(onboardingTargetRank)" :src="getRankIconUrl(onboardingTargetRank)!" alt="" class="w-3 h-3 object-contain" />
        <span class="font-semibold text-red-300/90">{{ onboardingTargetRank }}</span>
      </div>
    </div>
    <div v-else-if="isCs2" class="px-4 pb-3 pt-0">
      <p v-if="cs2FaceitConnection?.connected" class="text-xs text-gray-500 leading-relaxed">
        FACEIT:
        <span class="text-orange-300/90 font-semibold">{{ cs2FaceitConnection.nickname }}</span>
        <span v-if="cs2FaceitConnection.level != null" class="text-gray-600"> · Lv {{ cs2FaceitConnection.level }}</span>
      </p>
      <p v-else class="text-xs text-gray-600 leading-relaxed">
        Link your <button class="text-orange-400/80 hover:text-orange-300 transition-colors" @click="openAccountSetup">FACEIT username</button> on the web, or upload demos for AI coaching.
      </p>
    </div>
    <div v-else-if="isDeadlock" class="px-4 pb-3 pt-0">
      <template v-if="deadlockLinked">
        <div
          class="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2"
        >
          <div v-if="deadlockStats?.current_rank" class="flex items-center gap-1.5 min-w-0">
            <img
              v-if="deadlockRankIconUrl()"
              :src="deadlockRankIconUrl()!"
              alt="Rank"
              class="w-5 h-5 object-contain flex-shrink-0"
            />
            <span class="text-sm font-black text-teal-300 leading-none truncate">
              {{ deadlockStats.current_rank.name }}
              <span v-if="deadlockStats.current_rank.subtier != null" class="ml-0.5">{{ deadlockStats.current_rank.subtier }}</span>
            </span>
          </div>
          <p v-if="deadlockStats?.summary" class="text-[10px] text-gray-600 flex-shrink-0 tabular-nums">
            <span class="text-teal-400 font-semibold">{{ deadlockStats.summary.wins }}</span>W
            · <span class="text-red-400 font-semibold">{{ deadlockStats.summary.losses }}</span>L
            · <span class="text-white font-semibold">{{ deadlockStats.summary.win_rate }}%</span>
          </p>
          <p v-else class="text-[11px] text-gray-500">Syncing…</p>
        </div>
      </template>
      <p v-else class="text-xs text-gray-600 leading-relaxed">
        <button class="text-teal-400/80 hover:text-teal-300 transition-colors" @click="openAccountSetup">{{ theme.accountLinkLabel }}</button> on the web to sync rank &amp; match history.
      </p>
    </div>

    <div v-if="paymentPastDue" class="px-4 py-3 border-t border-white/[0.07]">
      <PaymentFailedAlert @error="showBillingError" />
    </div>

    <div v-if="profile.user.analysis_stats" class="px-4 py-2 border-t border-white/[0.07] space-y-1.5">
      <div class="flex items-center gap-2.5">
        <span class="text-[9px] text-gray-600 shrink-0 w-12 uppercase tracking-wide">Analyses</span>
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
            {{ profile.user.analysis_stats.total }}/{{ profile.user.analysis_stats.limit }}
          </span>
        </template>
      </div>
      <div v-if="profile.user.archive_stats?.limit != null" class="flex items-center gap-2.5">
        <span class="text-[9px] text-gray-600 shrink-0 w-12 uppercase tracking-wide">Cloud</span>
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
