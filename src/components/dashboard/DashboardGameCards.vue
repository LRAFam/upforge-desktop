<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboard } from '../../composables/useDashboard'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { PRIMARY_GAMES, PRIMARY_GAME_ARTWORK, type PrimaryGame } from '../../lib/games'
import { gameBrand } from '../../lib/game-branding'
import { getRankHexColor, getRankIconUrl } from '../../lib/valorant'
import { getFaceitLevelIconUrl } from '../../lib/cs2'
import { getDeadlockRankIconUrl } from '../../lib/deadlock'
import cs2Emblem from '../../assets/games/cs2-emblem.png'
import { openGameAnalyze } from '../../lib/game-modules'
import { openAccountLinkSettings } from '../../lib/account-link-navigation'
import { canOpenTimeline, canWatchRawRecording } from '../../lib/recording-demo-status'

const router = useRouter()
const { primaryGame, setPrimaryGame } = usePrimaryGame()
const {
  profile,
  profileLoading,
  status,
  weeklyFocus,
  cs2FaceitConnection,
  cs2Profile,
  cs2SteamName,
  cs2LinksLoading,
  deadlockLinked,
  deadlockStats,
  deadlockLinksLoading,
  dashboardAnalyses,
  pendingRecordings,
  openAnalysisRow,
  openRecordingReview,
} = useDashboard()

const launchBusy = ref(false)

type GameLinkState = 'loading' | 'linked' | 'unlinked'

function authUser() {
  return status.value.user as {
    riot_name?: string | null
    riot_tag?: string | null
    deadlock_account_id?: number | null
  } | null
}

function gameLinked(game: PrimaryGame): boolean {
  if (game === 'valorant') {
    return Boolean(
      profile.value?.user?.riot_name?.trim()
      || authUser()?.riot_name?.trim(),
    )
  }
  if (game === 'cs2') {
    return Boolean(
      cs2FaceitConnection.value?.connected
      || cs2Profile.value?.identity?.linked
      || cs2SteamName.value,
    )
  }
  return Boolean(
    deadlockLinked.value
    || profile.value?.user?.deadlock_account_id
    || authUser()?.deadlock_account_id
    || deadlockStats.value,
  )
}

function gameLinkState(game: PrimaryGame): GameLinkState {
  if (gameLinked(game)) return 'linked'
  if (game === 'valorant' && profileLoading.value) return 'loading'
  if (game === 'cs2' && cs2LinksLoading.value) return 'loading'
  if (game === 'deadlock' && deadlockLinksLoading.value) return 'loading'
  return 'unlinked'
}

function linkHint(game: PrimaryGame): string {
  if (game === 'valorant') return 'Link your Riot ID to sync rank and match stats.'
  if (game === 'cs2') return 'Add your Steam name or connect FACEIT to track matches.'
  return 'Link Steam to sync Deadlock rank and stats.'
}

function linkLabel(game: PrimaryGame): string {
  if (game === 'valorant') return 'Link Valorant'
  if (game === 'cs2') return 'Link CS2'
  return 'Link Deadlock'
}

function linkedAccountLabel(game: PrimaryGame): string | null {
  if (game === 'valorant') {
    const name = profile.value?.user?.riot_name?.trim() || authUser()?.riot_name?.trim()
    if (!name) return null
    const tag = profile.value?.user?.riot_tag?.trim() || authUser()?.riot_tag?.trim() || 'NA1'
    return `${name}#${tag}`
  }
  if (game === 'cs2') {
    if (cs2FaceitConnection.value?.connected && cs2FaceitConnection.value.nickname) {
      return cs2FaceitConnection.value.nickname
    }
    const steam = cs2Profile.value?.identity?.steam_display_name || cs2SteamName.value
    return steam || null
  }
  if (deadlockStats.value?.current_rank) return 'Steam linked'
  if (deadlockLinked.value || profile.value?.user?.deadlock_account_id || authUser()?.deadlock_account_id) {
    return 'Steam linked'
  }
  return null
}

function lastMatch(game: PrimaryGame): { prefix: string; result: string; muted: boolean } {
  if (game !== primaryGame.value) {
    return { prefix: 'Last match', result: '—', muted: true }
  }
  const item = [...dashboardAnalyses.value].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
  if (!item) return { prefix: 'Last match', result: 'None yet', muted: true }
  const wl = item.won === true ? 'Win' : item.won === false ? 'Loss' : 'Match'
  const score = item.rounds_won != null && item.rounds_lost != null ? ` ${item.rounds_won}–${item.rounds_lost}` : ''
  return { prefix: 'Last match', result: `${wl}${score}`, muted: false }
}

function rankBlock(game: PrimaryGame): {
  label: string
  main: string
  sub?: string
  color: string
  iconUrl?: string | null
} {
  const brand = gameBrand(game)
  if (game === 'valorant') {
    const rank = profile.value?.latest_stats?.current_rank
    const rr = profile.value?.latest_stats?.rr
    return {
      label: brand.rankLabel,
      main: rank ?? 'Unranked',
      sub: rr != null ? `${rr} RR` : undefined,
      color: rank ? getRankHexColor(rank) : brand.accent,
      iconUrl: rank ? getRankIconUrl(rank) : null,
    }
  }
  if (game === 'cs2') {
    const valve = cs2Profile.value?.valve_stats
    const steamName = cs2Profile.value?.identity?.steam_display_name || cs2SteamName.value
    if (valve?.premier_rating != null) {
      return {
        label: 'Premier rating',
        main: String(valve.premier_rating),
        sub: steamName || `${valve.matches_tracked ?? 0} matches tracked`,
        color: brand.accent,
        iconUrl: cs2Emblem,
      }
    }
    if (valve?.matches_tracked) {
      return {
        label: brand.valveRankLabel ?? brand.rankLabel,
        main: valve.avg_kd != null ? `${valve.avg_kd} K/D avg` : `${valve.matches_tracked} matches`,
        sub: steamName || `${valve.matches_tracked} tracked`,
        color: brand.accent,
        iconUrl: cs2Emblem,
      }
    }
    if (steamName) {
      return {
        label: brand.valveRankLabel ?? brand.rankLabel,
        main: steamName,
        sub: 'Steam name set',
        color: brand.accent,
        iconUrl: cs2Emblem,
      }
    }
    if (cs2FaceitConnection.value?.connected) {
      const l = cs2FaceitConnection.value.level
      const n = cs2FaceitConnection.value.nickname
      return {
        label: brand.faceitRankLabel ?? 'FACEIT',
        main: l != null ? `Level ${l}` : n ?? 'Connected',
        sub: n && l != null ? n : cs2FaceitConnection.value.elo != null ? `${cs2FaceitConnection.value.elo} ELO` : undefined,
        color: '#f97316',
        iconUrl: getFaceitLevelIconUrl(l),
      }
    }
    return { label: brand.rankLabel, main: 'Syncing…', color: brand.accent }
  }
  if (deadlockStats.value?.current_rank) {
    const r = deadlockStats.value.current_rank
    return {
      label: brand.rankLabel,
      main: r.subtier != null ? `${r.name} ${r.subtier}` : r.name,
      sub: deadlockStats.value.summary?.win_rate != null ? `${deadlockStats.value.summary.win_rate}% WR` : undefined,
      color: brand.accent,
      iconUrl: getDeadlockRankIconUrl(r.name, r.subtier),
    }
  }
  if (deadlockLinked.value || profile.value?.user?.deadlock_account_id) {
    return { label: brand.rankLabel, main: 'Rank syncing…', color: brand.accent }
  }
  return { label: brand.rankLabel, main: 'Syncing stats…', color: brand.accent }
}

function cs2FaceitRank(): { label: string; main: string; sub?: string; color: string; iconUrl?: string | null } | null {
  if (!cs2FaceitConnection.value?.connected) return null
  const hasSteamLine = Boolean(
    cs2Profile.value?.identity?.steam_display_name
    || cs2SteamName.value
    || cs2Profile.value?.valve_stats?.matches_tracked,
  )
  if (!hasSteamLine) return null
  const l = cs2FaceitConnection.value.level
  const n = cs2FaceitConnection.value.nickname
  return {
    label: gameBrand('cs2').faceitRankLabel ?? 'FACEIT',
    main: l != null ? `Level ${l}` : n ?? 'Connected',
    sub: n && l != null ? n : cs2FaceitConnection.value.elo != null ? `${cs2FaceitConnection.value.elo} ELO` : undefined,
    color: '#f97316',
    iconUrl: getFaceitLevelIconUrl(l),
  }
}

async function selectGame(game: PrimaryGame) {
  if (game !== primaryGame.value) await setPrimaryGame(game)
}

async function linkGame(game: PrimaryGame, e: Event) {
  e.stopPropagation()
  await setPrimaryGame(game)
  await openAccountLinkSettings(router, game)
}

async function reviewDeadlock() {
  const pending = pendingRecordings.value.find(r => r.game === 'deadlock' && !r.clipsOnly)
  if (pending && canWatchRawRecording(pending)) {
    openRecordingReview(pending, canOpenTimeline(pending) ? 'timeline' : 'raw')
    return
  }
  const latest = dashboardAnalyses.value.find(a => a.game_mode === 'DEADLOCK')
  if (latest) {
    await openAnalysisRow(latest)
    return
  }
  await window.api.deadlock.openReplaysFolder()
}

async function primaryAction(game: PrimaryGame, e: Event) {
  e.stopPropagation()
  await setPrimaryGame(game)
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
  if (game === 'deadlock') {
    await reviewDeadlock()
    return
  }
  openGameAnalyze(game)
}

const cards = computed(() =>
  PRIMARY_GAMES.map(g => {
    const brand = gameBrand(g.id)
    const linkState = gameLinkState(g.id)
    const linked = linkState === 'linked'
    return {
      id: g.id,
      brand,
      linkState,
      linked,
      account: linked ? linkedAccountLabel(g.id) : null,
      rank: linked ? rankBlock(g.id) : null,
      faceitRank: linked && g.id === 'cs2' ? cs2FaceitRank() : null,
      match: linked ? lastMatch(g.id) : null,
      linkHint: linkHint(g.id),
      linkLabel: linkLabel(g.id),
      art: PRIMARY_GAME_ARTWORK[g.id],
      active: primaryGame.value === g.id,
      ctaLabel: brand.ctaLabel,
      ctaIcon: brand.ctaIcon,
      ctaSolid: brand.ctaSolid,
    }
  }),
)
</script>

<template>
  <div class="grid grid-cols-3 gap-3 flex-shrink-0">
    <div
      v-for="c in cards"
      :key="c.id"
      role="button"
      tabindex="0"
      class="game-card relative overflow-hidden rounded-xl text-left transition-all duration-200 min-h-[196px] flex flex-col cursor-pointer"
      :class="c.active ? 'game-card--active' : 'hover:border-white/[0.16]'"
      :style="{ '--accent': c.brand.accent, '--accent-rgb': c.brand.accentRgb }"
      @click="selectGame(c.id)"
      @keydown.enter.prevent="selectGame(c.id)"
      @keydown.space.prevent="selectGame(c.id)"
    >
      <img :src="c.art" alt="" class="absolute inset-0 w-full h-full object-cover object-[center_20%] scale-105" />
      <div
        class="absolute inset-0"
        :style="{ background: `linear-gradient(160deg, rgba(8,8,10,0.92) 0%, rgba(8,8,10,0.72) 42%, rgba(${c.brand.accentRgb}, 0.12) 100%)` }"
      />

      <div class="relative z-10 flex flex-col flex-1 p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <span class="text-[12px] font-black tracking-[0.1em] text-white/90">{{ c.brand.wordmark }}</span>
          <span
            v-if="c.linkState === 'loading'"
            class="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-300/90"
          >
            <svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Syncing
          </span>
          <span
            v-else-if="c.linked"
            class="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300/90"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Linked
          </span>
        </div>

        <!-- Still loading link / profile data -->
        <template v-if="c.linkState === 'loading'">
          <p class="flex-1 text-[12px] leading-relaxed text-gray-400 pr-1">
            Checking your {{ c.brand.wordmark }} account…
          </p>
          <button
            type="button"
            disabled
            class="mt-4 w-full py-2.5 rounded-lg text-[12px] font-bold flex items-center justify-center gap-2 text-gray-500 border border-white/[0.08] bg-white/[0.03] cursor-not-allowed"
          >
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Syncing…
          </button>
        </template>

        <!-- Unlinked: one hint + link CTA only -->
        <template v-else-if="!c.linked">
          <p class="flex-1 text-[12px] leading-relaxed text-gray-400 pr-1">{{ c.linkHint }}</p>
          <button
            type="button"
            class="mt-4 w-full py-2.5 rounded-lg text-[12px] font-bold flex items-center justify-center gap-2 text-white shadow-[0_8px_24px_rgba(var(--accent-rgb),0.35)] transition-all"
            :style="{ background: `linear-gradient(180deg, ${c.brand.accent}, ${c.brand.accent}dd)` }"
            @click="linkGame(c.id, $event)"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
            {{ c.linkLabel }}
          </button>
        </template>

        <!-- Linked: account, rank, last match, game action -->
        <template v-else>
          <div class="flex-1 min-w-0 space-y-1.5">
            <p v-if="c.account" class="text-[11px] font-semibold text-gray-300 truncate">{{ c.account }}</p>

            <template v-if="c.id === 'cs2' && c.rank">
              <div class="flex items-center gap-1.5">
                <img
                  v-if="c.rank.iconUrl"
                  :src="c.rank.iconUrl"
                  alt=""
                  class="w-5 h-5 object-contain flex-shrink-0"
                />
                <p class="text-[11px] text-gray-500 min-w-0">
                  {{ c.rank.label }}:
                  <span class="font-bold text-[13px]" :style="{ color: c.rank.color }">{{ c.rank.main }}</span>
                </p>
              </div>
              <p v-if="c.rank.sub" class="text-[12px] font-semibold text-gray-300 tabular-nums pl-[26px]">{{ c.rank.sub }}</p>
              <template v-if="c.faceitRank">
                <div class="flex items-center gap-1.5 pt-0.5">
                  <img
                    v-if="c.faceitRank.iconUrl"
                    :src="c.faceitRank.iconUrl"
                    alt=""
                    class="w-5 h-5 object-contain flex-shrink-0"
                  />
                  <p class="text-[11px] text-gray-500 min-w-0">
                    {{ c.faceitRank.label }}:
                    <span class="font-bold text-[13px]" :style="{ color: c.faceitRank.color }">{{ c.faceitRank.main }}</span>
                  </p>
                </div>
                <p v-if="c.faceitRank.sub" class="text-[12px] font-semibold text-gray-300 tabular-nums pl-[26px]">{{ c.faceitRank.sub }}</p>
              </template>
            </template>

            <template v-else-if="c.rank">
              <div class="flex items-center gap-1.5">
                <img
                  v-if="c.rank.iconUrl"
                  :src="c.rank.iconUrl"
                  alt=""
                  class="w-5 h-5 object-contain flex-shrink-0"
                />
                <p class="text-[11px] text-gray-500 min-w-0">
                  {{ c.rank.label }}:
                  <span class="font-bold text-[13px]" :style="{ color: c.rank.color }">{{ c.rank.main }}</span>
                </p>
              </div>
              <p v-if="c.rank.sub" class="text-[12px] font-semibold text-gray-300 tabular-nums pl-[26px]">{{ c.rank.sub }}</p>
            </template>

            <p v-if="c.match" class="text-[11px] pt-0.5">
              <span class="text-gray-600">{{ c.match.prefix }}</span>
              <span class="font-semibold" :class="c.match.muted ? 'text-gray-600' : 'text-gray-300'"> · {{ c.match.result }}</span>
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
        </template>
      </div>
    </div>
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
