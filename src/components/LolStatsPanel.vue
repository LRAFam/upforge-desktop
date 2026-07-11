<template>
  <div class="rounded-xl border border-[#c89b3c]/25 bg-[#c89b3c]/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-[#c89b3c]/15">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded-md flex items-center justify-center" style="background:rgba(200,155,60,0.15)">
          <svg class="w-3 h-3 text-[#c89b3c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-200">League Stats</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="p-1 text-gray-700 hover:text-gray-400 transition-colors rounded"
          title="Refresh"
          @click="loadAll(true)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
        <button
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
          style="background:rgba(200,155,60,0.12);color:#d4af37;border:1px solid rgba(200,155,60,0.25)"
          @click="openWeb"
        >
          View on web →
        </button>
      </div>
    </div>

    <div v-if="loading" class="px-3.5 py-4 flex items-center gap-2">
      <div class="w-3 h-3 rounded-full border border-[#c89b3c]/30 border-t-[#c89b3c] animate-spin" />
      <span class="text-xs text-gray-600">Loading League stats…</span>
    </div>

    <div v-else-if="fetchError" class="px-3.5 py-4 flex items-center justify-between gap-3">
      <p class="text-xs text-amber-400/90 leading-relaxed">Couldn't load LoL data — try refreshing.</p>
      <button
        class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300"
        @click="loadAll(true)"
      >
        Retry
      </button>
    </div>

    <div v-else-if="!linked" class="px-3.5 py-4 flex items-center justify-between gap-3">
      <p class="text-xs text-gray-500 leading-relaxed">
        Link your <strong class="text-gray-400 font-semibold">Riot account</strong> on the web to sync ranked matches and coaching history.
      </p>
      <button
        class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all"
        style="background:rgba(200,155,60,0.15);color:#d4af37;border:1px solid rgba(200,155,60,0.25)"
        @click="openConnect"
      >
        Link Riot →
      </button>
    </div>

    <div v-else class="divide-y divide-white/[0.03]">
      <div class="flex items-center gap-3 px-3.5 py-3">
        <img
          v-if="rankEmblemUrl"
          :src="rankEmblemUrl"
          class="w-9 h-9 object-contain flex-shrink-0"
          alt="Rank"
        />
        <div
          v-else
          class="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-[#c89b3c] flex-shrink-0"
          style="background:rgba(200,155,60,0.1);border:1px solid rgba(200,155,60,0.15)"
        >
          LoL
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-black text-white truncate">
            {{ riotLabel }}
          </div>
          <div class="flex gap-3 text-[10px] text-gray-500 mt-0.5">
            <span v-if="recentSummary">
              <span class="text-emerald-400 font-semibold">{{ recentSummary.wins }}</span>W
              <span class="mx-0.5">·</span>
              <span class="text-red-400 font-semibold">{{ recentSummary.losses }}</span>L
              <span class="mx-0.5">·</span>
              <span class="text-white font-semibold">{{ recentSummary.winRate }}%</span> WR
            </span>
            <span v-if="recentSummary">KDA <strong class="text-white">{{ recentSummary.avgKda }}</strong></span>
            <span v-else class="text-gray-600">Ranked Solo/Duo</span>
          </div>
        </div>
      </div>

      <div v-if="recentMatches.length" class="px-3.5 py-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Recent ranked</p>
        <div class="space-y-1">
          <div
            v-for="match in recentMatches.slice(0, 5)"
            :key="match.match_id"
            class="flex items-center gap-2"
          >
            <span
              class="w-5 text-center text-[9px] font-bold rounded py-0.5 flex-shrink-0"
              :class="match.win ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'"
            >
              {{ match.win ? 'W' : 'L' }}
            </span>
            <img
              v-if="match.champion"
              :src="championIconUrl(match.champion)"
              class="w-5 h-5 rounded flex-shrink-0 object-cover"
              :alt="match.champion"
            />
            <span class="flex-1 text-[10px] text-gray-300 truncate">{{ match.champion }}</span>
            <span class="text-[10px] font-mono text-gray-600 flex-shrink-0 w-10 text-right">
              {{ fmtLolDuration(match.game_duration_seconds) }}
            </span>
            <span class="text-[10px] font-mono text-gray-500 flex-shrink-0 w-14 text-right">
              {{ fmtLolKda(match.kills, match.deaths, match.assists) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="analyses.length" class="px-3.5 py-2 pb-3">
        <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Coaching</p>
        <div class="space-y-1">
          <button
            v-for="item in analyses.slice(0, 4)"
            :key="item.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-white/[0.03] transition-colors"
            @click="openResults(item.id)"
          >
            <img
              v-if="item.champion"
              :src="championIconUrl(item.champion)"
              class="w-5 h-5 rounded flex-shrink-0 object-cover"
              :alt="item.champion"
            />
            <span class="flex-1 text-[10px] text-gray-300 truncate">{{ item.champion ?? 'Match' }}</span>
            <span
              class="text-[9px] font-semibold uppercase tracking-wide flex-shrink-0"
              :class="item.status === 'completed' ? 'text-emerald-400/80' : 'text-gray-500'"
            >
              {{ item.status === 'completed' ? 'Done' : item.readiness_state === 'waiting_match_data' ? 'Syncing' : item.status }}
            </span>
          </button>
        </div>
      </div>

      <div v-else-if="!recentMatches.length" class="px-3.5 py-3 pb-3">
        <p class="text-[11px] text-gray-600 leading-relaxed">
          No ranked Solo/Duo matches yet. Play a game with UpForge open, or analyse a match on the web.
        </p>
        <button
          class="mt-2 text-[10px] font-semibold text-[#c89b3c] hover:text-[#e0c068] transition-colors"
          @click="openAnalyze"
        >
          Analyse on web →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { LolAnalysisItem, LolMatchSummary } from '../env.d.ts'
import { championIconUrl, lolRankEmblemUrl } from '../lib/lol'
import { fmtLolDuration, fmtLolKda } from '../lib/lol-analyses'

const loading = ref(true)
const fetchError = ref(false)
const linked = ref(false)
const riotLabel = ref('Riot account')
const recentMatches = ref<LolMatchSummary[]>([])
const analyses = ref<LolAnalysisItem[]>([])

const recentSummary = computed(() => {
  const rows = recentMatches.value
  if (!rows.length) return null
  const wins = rows.filter((m) => m.win).length
  const losses = rows.length - wins
  const kills = rows.reduce((s, m) => s + m.kills, 0)
  const deaths = rows.reduce((s, m) => s + m.deaths, 0)
  const assists = rows.reduce((s, m) => s + m.assists, 0)
  const kda = deaths > 0 ? ((kills + assists) / deaths).toFixed(2) : (kills + assists).toFixed(1)
  return {
    wins,
    losses,
    winRate: Math.round((wins / rows.length) * 100),
    avgKda: kda,
  }
})

const rankEmblemUrl = computed(() => {
  if (!recentSummary.value) return ''
  const wr = recentSummary.value.winRate
  if (wr >= 60) return lolRankEmblemUrl('gold')
  if (wr >= 50) return lolRankEmblemUrl('silver')
  return lolRankEmblemUrl('bronze')
})

let refreshCleanup: (() => void) | null = null

async function loadAll(force = false) {
  loading.value = true
  fetchError.value = false
  try {
    const prof = await window.api.profile.get()
    const user = prof?.user
    linked.value = !!(user?.riot_name && user?.riot_tag)
    riotLabel.value = linked.value
      ? `${user!.riot_name}#${user!.riot_tag}`
      : 'Riot account'

    if (!linked.value) {
      recentMatches.value = []
      analyses.value = []
      return
    }

    const [matches, items] = await Promise.all([
      window.api.lol.getRecentMatches(force),
      window.api.lol.getAnalyses(8),
    ])
    recentMatches.value = matches
    analyses.value = items
  } catch {
    fetchError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAll()
  refreshCleanup = window.api.on('dashboard:refresh', () => {
    loadAll(true)
  })
})

onUnmounted(() => {
  refreshCleanup?.()
})

function openWeb() {
  window.api.lol.openHistory()
}

function openAnalyze() {
  window.api.lol.openAnalyze()
}

function openConnect() {
  window.api.lol.openConnectRiot()
}

function openResults(id: number) {
  window.api.lol.openResults(id)
}
</script>
