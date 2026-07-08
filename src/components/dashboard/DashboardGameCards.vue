<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboard } from '../../composables/useDashboard'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { PRIMARY_GAMES, PRIMARY_GAME_ARTWORK, type PrimaryGame } from '../../lib/games'
import { gameBrand } from '../../lib/game-branding'
import { getRankHexColor } from '../../lib/valorant'
import { openGameAnalyze } from '../../lib/game-modules'

const router = useRouter()
const { primaryGame, setPrimaryGame } = usePrimaryGame()
const {
  profile,
  weeklyFocus,
  cs2FaceitConnection,
  cs2Profile,
  deadlockLinked,
  deadlockStats,
  dashboardAnalyses,
} = useDashboard()

const launchBusy = ref(false)
const cs2SteamName = ref('')

onMounted(async () => {
  const saved = await window.api.settings.get().catch(() => null)
  cs2SteamName.value = saved?.cs2SteamName?.trim() ?? ''
})

function cs2Linked(): boolean {
  return Boolean(
    cs2FaceitConnection.value?.connected
    || cs2Profile.value?.identity?.linked
    || cs2SteamName.value,
  )
}

function lastMatch(game: PrimaryGame): { prefix: string; result: string; muted: boolean } {
  if (game !== primaryGame.value) {
    return { prefix: 'Last Match:', result: '—', muted: true }
  }
  const item = [...dashboardAnalyses.value].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
  if (!item) return { prefix: 'Last Match:', result: 'No matches yet', muted: true }
  const wl = item.won === true ? 'Win' : item.won === false ? 'Loss' : 'Match'
  const score = item.rounds_won != null && item.rounds_lost != null ? ` ${item.rounds_won}–${item.rounds_lost}` : ''
  return { prefix: 'Last Match:', result: `${wl}${score}`, muted: false }
}

function rankBlock(game: PrimaryGame): {
  main: string
  sub?: string
  color: string
} {
  const brand = gameBrand(game)
  if (game === 'valorant') {
    const rank = profile.value?.latest_stats?.current_rank
    const riotName = profile.value?.user?.riot_name
    const riotTag = profile.value?.user?.riot_tag
    return {
      main: rank ?? (riotName ? `${riotName}#${riotTag ?? 'NA1'}` : 'Link Riot ID'),
      sub: rank
        ? (profile.value?.latest_stats?.rr != null ? `${profile.value.latest_stats.rr} RR` : undefined)
        : (riotName ? 'Linked' : undefined),
      color: rank ? getRankHexColor(rank) : brand.accent,
    }
  }
  if (game === 'cs2') {
    const valve = cs2Profile.value?.valve_stats
    const steamName = cs2Profile.value?.identity?.steam_display_name || cs2SteamName.value
    if (valve?.matches_tracked) {
      return {
        main: valve.avg_kd != null ? `${valve.avg_kd} K/D avg` : `${valve.matches_tracked} matches`,
        sub: steamName ? steamName : `${valve.matches_tracked} tracked in UpForge`,
        color: brand.accent,
      }
    }
    if (steamName) {
      return { main: steamName, sub: 'Steam name set', color: brand.accent }
    }
    return { main: 'Set Steam name', sub: 'Settings → Recording', color: brand.accent }
  }
  if (deadlockStats.value?.current_rank) {
    const r = deadlockStats.value.current_rank
    return {
      main: r.subtier != null ? `${r.name} ${r.subtier}` : r.name,
      sub: deadlockStats.value.summary?.win_rate != null ? `TOP ${deadlockStats.value.summary.win_rate}% WR` : undefined,
      color: brand.accent,
    }
  }
  return { main: deadlockLinked.value ? 'Syncing…' : 'Link Steam', color: brand.accent }
}

async function selectGame(game: PrimaryGame) {
  if (game !== primaryGame.value) await setPrimaryGame(game)
}

async function primaryAction(game: PrimaryGame, e: Event) {
  e.stopPropagation()
  await setPrimaryGame(game)
  if (game === 'cs2' && !cs2Linked()) {
    await window.api.cs2.openConnectFaceit().catch(() => {})
    router.push('/settings?tab=recording')
    return
  }
  if (game === 'valorant') {
    const plan = weeklyFocus.value
    if (!plan) {
      router.push('/training')
      return
    }
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
    return
  }
  openGameAnalyze(game)
}

function cs2FaceitRank(): { main: string; sub?: string; color: string } {
  const brand = gameBrand('cs2')
  if (!cs2FaceitConnection.value?.connected) {
    return { main: 'Not linked', sub: 'Optional third-party rank', color: brand.accent }
  }
  const l = cs2FaceitConnection.value.level
  const n = cs2FaceitConnection.value.nickname
  return {
    main: l != null ? `Level ${l}` : n ?? 'Linked',
    sub: n ? `#${n}` : cs2FaceitConnection.value.elo != null ? `${cs2FaceitConnection.value.elo} ELO` : undefined,
    color: '#f97316',
  }
}

const cards = computed(() =>
  PRIMARY_GAMES.map(g => {
    const brand = gameBrand(g.id)
    const rank = rankBlock(g.id)
    const faceitRank = g.id === 'cs2' ? cs2FaceitRank() : null
    const match = lastMatch(g.id)
    const ctaLabel = g.id === 'cs2' && !cs2Linked() ? 'Link CS2' : brand.ctaLabel
    const ctaIcon = g.id === 'cs2' && !cs2Linked() ? 'target' as const : brand.ctaIcon
    return {
      id: g.id,
      brand,
      rank,
      faceitRank,
      match,
      art: PRIMARY_GAME_ARTWORK[g.id],
      active: primaryGame.value === g.id,
      ctaLabel,
      ctaIcon,
      ctaSolid: g.id === 'cs2' && !cs2Linked() ? true : brand.ctaSolid,
    }
  }),
)
</script>

<template>
  <div class="grid grid-cols-3 gap-3 flex-shrink-0">
    <button
      v-for="c in cards"
      :key="c.id"
      type="button"
      class="game-card relative overflow-hidden rounded-xl text-left transition-all duration-200 min-h-[196px] flex flex-col"
      :class="c.active ? 'game-card--active' : 'hover:border-white/[0.16]'"
      :style="{ '--accent': c.brand.accent, '--accent-rgb': c.brand.accentRgb }"
      @click="selectGame(c.id)"
    >
      <img :src="c.art" alt="" class="absolute inset-0 w-full h-full object-cover object-[center_20%] scale-105" />
      <div
        class="absolute inset-0"
        :style="{ background: `linear-gradient(160deg, rgba(8,8,10,0.92) 0%, rgba(8,8,10,0.72) 42%, rgba(${c.brand.accentRgb}, 0.12) 100%)` }"
      />

      <div class="relative z-10 flex flex-col flex-1 p-4">
        <div class="mb-4">
          <span class="text-[12px] font-black tracking-[0.1em] text-white/90">{{ c.brand.wordmark }}</span>
        </div>

        <div class="flex-1 min-w-0 space-y-1">
          <template v-if="c.id === 'cs2'">
            <p class="text-[11px] text-gray-500">
              {{ c.brand.valveRankLabel }}:
              <span class="font-bold text-[13px]" :style="{ color: c.rank.color }">{{ c.rank.main }}</span>
            </p>
            <p v-if="c.rank.sub" class="text-[12px] font-semibold text-gray-300 tabular-nums">{{ c.rank.sub }}</p>
            <p class="text-[11px] text-gray-500 pt-1">
              {{ c.brand.faceitRankLabel }}:
              <span class="font-bold text-[13px]" :style="{ color: c.faceitRank?.color }">{{ c.faceitRank?.main }}</span>
            </p>
            <p v-if="c.faceitRank?.sub" class="text-[12px] font-semibold text-gray-300 tabular-nums">{{ c.faceitRank.sub }}</p>
          </template>
          <template v-else>
            <p class="text-[11px] text-gray-500">
              {{ c.brand.rankLabel }}:
              <span class="font-bold text-[13px]" :style="{ color: c.rank.color }">{{ c.rank.main }}</span>
            </p>
            <p v-if="c.rank.sub" class="text-[12px] font-semibold text-gray-300 tabular-nums">{{ c.rank.sub }}</p>
          </template>
          <p class="text-[11px] pt-1">
            <span class="text-gray-600">{{ c.match.prefix }}</span>
            <span class="font-semibold" :class="c.match.muted ? 'text-gray-600' : 'text-gray-300'"> {{ c.match.result }}</span>
          </p>
        </div>

        <button
          type="button"
          class="mt-4 w-full py-2.5 rounded-lg text-[12px] font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          :class="c.ctaSolid
            ? 'text-white shadow-[0_8px_24px_rgba(var(--accent-rgb),0.35)]'
            : 'border bg-black/20 hover:bg-black/30'"
          :style="c.ctaSolid
            ? { background: `linear-gradient(180deg, ${c.brand.accent}, ${c.brand.accent}dd)` }
            : { borderColor: `${c.brand.accent}66`, color: c.brand.accent }"
          :disabled="c.id === 'valorant' && launchBusy"
          @click="primaryAction(c.id, $event)"
        >
          <svg v-if="c.ctaIcon === 'target'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-width="1.75"/><circle cx="12" cy="12" r="2" stroke-width="1.75"/></svg>
          <svg v-else-if="c.ctaIcon === 'upload'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6H16a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          <svg v-else class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          {{ c.id === 'valorant' && launchBusy ? 'Launching…' : c.ctaLabel }}
        </button>
      </div>
    </button>
  </div>
</template>

<style scoped>
.game-card {
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}
.game-card--active {
  border-color: rgba(var(--accent-rgb), 0.45);
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(var(--accent-rgb), 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
</style>
