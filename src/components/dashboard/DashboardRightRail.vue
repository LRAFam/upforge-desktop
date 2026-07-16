<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import {
  getRankHexColor,
  getRankIconUrl,
} from '../../lib/valorant'
import { WEB_EXPLORE_LINKS, openWebFeature } from '../../lib/web-explore-links'
import { isPlatformAdmin } from '../../lib/tier-features'

const {
  profile,
  profileLoading,
  isValorant,
  weeklyFocus,
  totalSessionsAnalysed,
  avgScore,
  currentStreak,
  dashboardAnalyses,
  dashboardRankLabel,
  playerCardUrl,
  quotaPercent,
  router,
} = useDashboard()

const isAdmin = computed(() =>
  isPlatformAdmin(profile.value?.user?.tier, profile.value?.user?.is_admin),
)

const analysisUsed = computed(() => profile.value?.user?.analysis_stats?.total ?? 0)
const analysisLimit = computed(() => profile.value?.user?.analysis_stats?.limit ?? null)

function openWeb(url: string, embed = true) {
  void openWebFeature(url, embed)
}

const launchBusy = ref(false)

const weeklyDone = computed(() => {
  const weekAgo = Date.now() - 7 * 86400000
  return dashboardAnalyses.value.filter(a => new Date(a.created_at).getTime() > weekAgo).length
})

const winRate = computed(() => {
  const tracked = dashboardAnalyses.value.filter(a => a.won != null)
  if (!tracked.length) return null
  return Math.round(tracked.filter(a => a.won).length / tracked.length * 100)
})

const avgKd = computed(() => {
  const withKd = dashboardAnalyses.value.filter(a => a.kda != null)
  if (!withKd.length) return null
  return (withKd.reduce((s, a) => s + (a.kda ?? 0), 0) / withKd.length).toFixed(2)
})

const avgHs = computed(() => {
  const withHs = dashboardAnalyses.value.filter(a => a.hs_pct != null)
  if (!withHs.length) return null
  return Math.round(withHs.reduce((s, a) => s + (a.hs_pct ?? 0), 0) / withHs.length)
})

async function runDrill() {
  const plan = weeklyFocus.value
  if (!plan || launchBusy.value) return
  launchBusy.value = true
  try {
    await window.api.trainer.launch({
      scenario: plan.drill.scenario,
      difficulty: 'medium',
      duration: 60,
    })
  } catch {
    router.push('/training')
  } finally {
    launchBusy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2.5 min-h-0">
    <div v-if="profile" class="dash-panel overflow-hidden flex-shrink-0">
      <div class="px-3.5 py-3 flex items-center gap-3">
        <img
          v-if="isValorant && playerCardUrl"
          :src="playerCardUrl"
          alt=""
          class="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10"
        />
        <div
          v-else
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/20 flex items-center justify-center ring-1 ring-white/10"
        >
          <span class="text-sm font-black text-red-400">{{ profile.user.name?.charAt(0) }}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold truncate">{{ profile.user.name }}</p>
          <p class="text-[10px] text-gray-500 truncate">{{ dashboardRankLabel }}</p>
        </div>
        <img
          v-if="isValorant && profile.latest_stats?.current_rank && getRankIconUrl(profile.latest_stats.current_rank)"
          :src="getRankIconUrl(profile.latest_stats.current_rank)!"
          alt=""
          class="w-8 h-8 object-contain flex-shrink-0 drop-shadow-[0_0_12px_rgba(255,70,85,0.35)]"
        />
      </div>
      <div
        v-if="isValorant && profile.latest_stats?.current_rank"
        class="px-3.5 pb-3 flex items-baseline gap-2"
      >
        <span class="text-lg font-black" :style="{ color: getRankHexColor(profile.latest_stats.current_rank) }">
          {{ profile.latest_stats.current_rank }}
        </span>
        <span v-if="profile.latest_stats.rr != null" class="text-[11px] text-gray-500 tabular-nums">{{ profile.latest_stats.rr }} RR</span>
      </div>
      <div
        v-if="profile.user.analysis_stats && !isAdmin && analysisLimit != null"
        class="px-3.5 py-2 border-t border-white/[0.07] flex items-center gap-2"
      >
        <span class="text-[9px] text-gray-600 uppercase tracking-wide shrink-0">Analyses</span>
        <div class="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="quotaPercent >= 80 ? 'bg-red-500' : quotaPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'"
            :style="{ width: `${100 - quotaPercent}%` }"
          />
        </div>
        <span
          class="text-[10px] tabular-nums shrink-0"
          :class="analysisUsed >= analysisLimit ? 'text-red-400' : 'text-gray-400'"
        >
          {{ analysisUsed }}/{{ analysisLimit }}
        </span>
      </div>
    </div>
    <div v-else-if="profileLoading" class="h-24 dash-panel animate-pulse" />

    <div v-if="isValorant && weeklyFocus" class="dash-panel overflow-hidden flex-shrink-0">
      <div class="px-3.5 py-2.5 border-b border-white/[0.07] flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">This week</span>
        <button type="button" class="text-[10px] text-gray-600 hover:text-gray-300" @click="router.push('/training')">Edit</button>
      </div>
      <ul class="divide-y divide-white/[0.05]">
        <li class="px-3.5 py-2.5 flex items-start gap-2.5">
          <span class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-[10px]">✓</span>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-semibold text-gray-200">Weekly goal</p>
            <p class="text-[10px] text-gray-500 leading-snug mt-0.5">{{ weeklyFocus.goal }}</p>
          </div>
        </li>
        <li class="px-3.5 py-2.5 flex items-start gap-2.5">
          <span class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/15 text-[10px] text-gray-600" />
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-semibold text-gray-200">{{ weeklyFocus.drill.label }}</p>
            <button
              type="button"
              class="text-[10px] font-bold text-red-400 mt-1 disabled:opacity-50"
              :disabled="launchBusy"
              @click="runDrill"
            >{{ launchBusy ? 'Launching…' : 'Run in trainer →' }}</button>
          </div>
        </li>
        <li class="px-3.5 py-2.5 flex items-start gap-2.5">
          <span class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/15 text-[10px] text-gray-600" />
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-semibold text-gray-200">Track · {{ weeklyFocus.metric.label }}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">{{ weeklyFocus.metric.hint }}</p>
          </div>
        </li>
      </ul>
    </div>

    <div class="dash-panel overflow-hidden flex-shrink-0">
      <div class="px-3.5 py-2.5 border-b border-white/[0.07]">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Weekly progress</span>
        <p class="text-[11px] text-gray-400 mt-1">{{ Math.min(weeklyDone, 6) }} of 6 sessions this week</p>
      </div>
      <div class="px-3.5 py-3 flex gap-1.5">
        <span
          v-for="i in 6"
          :key="i"
          class="h-2 flex-1 rounded-full"
          :class="i <= weeklyDone ? 'bg-gradient-to-r from-red-600 to-orange-500' : 'bg-white/[0.06]'"
        />
      </div>
    </div>

    <div class="dash-panel overflow-hidden flex-shrink-0">
      <div class="px-3.5 py-2.5 border-b border-white/[0.07]">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Recent stats</span>
      </div>
      <div class="grid grid-cols-2 gap-px bg-white/[0.05]">
        <div class="bg-[#141414] px-3 py-2.5">
          <p class="text-lg font-black text-white tabular-nums">{{ winRate != null ? `${winRate}%` : '—' }}</p>
          <p class="text-[9px] uppercase tracking-wide text-gray-600">Win rate</p>
        </div>
        <div class="bg-[#141414] px-3 py-2.5">
          <p class="text-lg font-black text-white tabular-nums">{{ avgKd ?? '—' }}</p>
          <p class="text-[9px] uppercase tracking-wide text-gray-600">K/D</p>
        </div>
        <div class="bg-[#141414] px-3 py-2.5">
          <p class="text-lg font-black text-white tabular-nums">{{ avgHs != null ? `${avgHs}%` : '—' }}</p>
          <p class="text-[9px] uppercase tracking-wide text-gray-600">HS%</p>
        </div>
        <div class="bg-[#141414] px-3 py-2.5">
          <p class="text-lg font-black text-white tabular-nums">{{ totalSessionsAnalysed }}</p>
          <p class="text-[9px] uppercase tracking-wide text-gray-600">Matches</p>
        </div>
      </div>
      <button
        type="button"
        class="w-full py-2 text-[10px] font-semibold text-gray-500 border-t border-white/[0.07] hover:text-gray-300 hover:bg-white/[0.02]"
        @click="router.push('/history')"
      >
        View all analytics →
      </button>
    </div>

    <div v-if="currentStreak !== 0" class="dash-panel px-3.5 py-2.5 flex items-center justify-between flex-shrink-0">
      <span class="text-[10px] font-bold uppercase tracking-wide text-gray-500">Rank streak</span>
      <span class="text-sm font-black tabular-nums" :class="currentStreak > 0 ? 'text-emerald-400' : 'text-red-400'">
        {{ currentStreak > 0 ? '+' : '' }}{{ currentStreak }}
      </span>
    </div>

    <div v-if="avgScore != null" class="dash-panel px-3.5 py-2.5 flex items-center justify-between flex-shrink-0">
      <span class="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg AI score</span>
      <span class="text-sm font-black tabular-nums text-gray-200">{{ avgScore * 10 }}</span>
    </div>

    <div class="dash-panel overflow-hidden flex-shrink-0">
      <div class="px-3.5 py-2.5 border-b border-white/[0.07]">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Explore on web</span>
        <p class="text-[10px] text-gray-500 mt-1">Deep coaching lives on upforge.gg</p>
      </div>
      <ul class="divide-y divide-white/[0.05]">
        <li v-for="link in WEB_EXPLORE_LINKS" :key="link.href">
          <button
            type="button"
            class="w-full px-3.5 py-2 text-left hover:bg-white/[0.03] transition-colors"
            @click="openWeb(link.href, link.embed)"
          >
            <span class="text-[11px] font-semibold text-gray-200">{{ link.label }}</span>
            <span class="block text-[10px] text-gray-600 mt-0.5">{{ link.hint }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
