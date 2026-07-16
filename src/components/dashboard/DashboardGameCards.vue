<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboard } from '../../composables/useDashboard'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { PRIMARY_GAME_ARTWORK, type PrimaryGame } from '../../lib/games'
import { gameBrand } from '../../lib/game-branding'
import { getRankHexColor, getRankIconUrl } from '../../lib/valorant'
import { getFaceitLevelIconUrl } from '../../lib/cs2'
import { getDeadlockRankIconUrl } from '../../lib/deadlock'
import cs2Emblem from '../../assets/games/cs2-emblem.webp'
import { openGameAnalyze } from '../../lib/game-modules'
import { openAccountLinkSettings } from '../../lib/account-link-navigation'
import { canOpenTimeline, canWatchRawRecording } from '../../lib/recording-demo-status'

const router = useRouter()
const { primaryGame, setPrimaryGame } = usePrimaryGame()
const {
  profile,
  profileLoading,
  weeklyFocus,
  cs2FaceitConnection,
  cs2Profile,
  cs2SteamName,
  cs2LinksLoading,
  deadlockLinked,
  deadlockStats,
  deadlockLinksLoading,
  lolRecentMatches,
  dashboardAnalyses,
  pendingRecordings,
  openAnalysisRow,
  openRecordingReview,
} = useDashboard()

const launchBusy = ref(false)

type GameLinkState = 'loading' | 'linked' | 'unlinked'

function riotLinked(): boolean {
  return Boolean(profile.value?.user?.riot_name?.trim())
}

function gameLinked(game: PrimaryGame): boolean {
  if (game === 'valorant' || game === 'lol') {
    return riotLinked()
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
    || deadlockStats.value,
  )
}

function gameLinkState(game: PrimaryGame): GameLinkState {
  if (gameLinked(game)) return 'linked'
  if ((game === 'valorant' || game === 'lol') && profileLoading.value) return 'loading'
  if (game === 'cs2' && cs2LinksLoading.value) return 'loading'
  if (game === 'deadlock' && deadlockLinksLoading.value) return 'loading'
  return 'unlinked'
}

function linkHint(game: PrimaryGame): string {
  if (game === 'valorant') return 'Link your Riot ID to sync rank and match stats.'
  if (game === 'lol') return 'Link your Riot ID to sync League matches and coaching.'
  if (game === 'cs2') return 'Add your Steam name or connect FACEIT to track matches.'
  return 'Link Steam to sync Deadlock rank and stats.'
}

function linkLabel(game: PrimaryGame): string {
  if (game === 'valorant') return 'Link Valorant'
  if (game === 'lol') return 'Link Riot ID'
  if (game === 'cs2') return 'Link CS2'
  return 'Link Deadlock'
}

function linkedAccountLabel(game: PrimaryGame): string | null {
  if (game === 'valorant' || game === 'lol') {
    const name = profile.value?.user?.riot_name?.trim()
    if (!name) return null
    const tag = profile.value?.user?.riot_tag?.trim() || 'NA1'
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
  if (deadlockLinked.value || profile.value?.user?.deadlock_account_id) {
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
  if (game === 'lol') {
    const last = lolRecentMatches.value[0]
    if (last) {
      return {
        label: 'Last game',
        main: last.champion,
        sub: `${last.win ? 'Win' : 'Loss'} · ${last.kills}/${last.deaths}/${last.assists}`,
        color: last.win ? '#22c55e' : brand.accent,
        iconUrl: null,
      }
    }
    return { label: brand.rankLabel, main: 'Riot linked', color: brand.accent }
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

/** Only the tab-selected game — tabs own switching. */
const card = computed(() => {
  const id = primaryGame.value
  const brand = gameBrand(id)
  const linkState = gameLinkState(id)
  const linked = linkState === 'linked'
  return {
    id,
    brand,
    linkState,
    linked,
    account: linked ? linkedAccountLabel(id) : null,
    rank: linked ? rankBlock(id) : null,
    faceitRank: linked && id === 'cs2' ? cs2FaceitRank() : null,
    match: linked && id !== 'lol' ? lastMatch(id) : null,
    linkHint: linkHint(id),
    linkLabel: linkLabel(id),
    art: PRIMARY_GAME_ARTWORK[id],
    ctaLabel: brand.ctaLabel,
    ctaIcon: brand.ctaIcon,
    ctaSolid: brand.ctaSolid,
  }
})
</script>

<template>
  <div
    class="game-card game-card--active relative overflow-hidden rounded-2xl text-left transition-all duration-200 min-h-[168px] h-full flex flex-col flex-shrink-0"
    :style="{ '--accent': card.brand.accent, '--accent-rgb': card.brand.accentRgb }"
  >
    <div class="game-card-accent absolute inset-x-0 top-0 h-px z-20" />
    <img :src="card.art" alt="" class="absolute inset-0 w-full h-full object-cover object-[center_22%] scale-110 opacity-70" />
    <div
      class="absolute inset-0"
      :style="{ background: `linear-gradient(155deg, rgba(10,10,12,0.96) 0%, rgba(10,10,12,0.82) 52%, rgba(${card.brand.accentRgb}, 0.14) 100%)` }"
    />

    <div class="relative z-10 flex flex-1 flex-col justify-between gap-3 p-4">
      <div class="min-w-0 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <img :src="card.brand.logo" alt="" class="h-5 w-5 object-contain flex-shrink-0 opacity-90" />
            <span class="text-[10px] font-black tracking-[0.14em] text-white/85 truncate">{{ card.brand.wordmark }}</span>
          </div>
          <span
            v-if="card.linkState === 'loading'"
            class="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/8 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-blue-300/90"
          >
            <svg class="h-2.5 w-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Syncing
          </span>
          <span
            v-else-if="card.linked"
            class="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-emerald-300/90"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Linked
          </span>
        </div>

        <template v-if="card.linkState === 'loading'">
          <p class="text-[11px] leading-relaxed text-gray-500">
            Checking your {{ card.brand.wordmark }} account…
          </p>
        </template>

        <template v-else-if="!card.linked">
          <p class="text-[11px] leading-relaxed text-gray-500">{{ card.linkHint }}</p>
        </template>

        <template v-else>
          <p v-if="card.account" class="text-[12px] font-semibold text-gray-200 truncate">{{ card.account }}</p>

          <template v-if="card.id === 'cs2' && card.rank">
            <div class="game-card-stat">
              <img v-if="card.rank.iconUrl" :src="card.rank.iconUrl" alt="" class="game-card-stat__icon" />
              <div class="min-w-0">
                <p class="game-card-stat__label">{{ card.rank.label }}</p>
                <p class="game-card-stat__value" :style="{ color: card.rank.color }">{{ card.rank.main }}</p>
                <p v-if="card.rank.sub" class="game-card-stat__meta">{{ card.rank.sub }}</p>
              </div>
            </div>
            <div v-if="card.faceitRank" class="game-card-stat game-card-stat--compact">
              <img v-if="card.faceitRank.iconUrl" :src="card.faceitRank.iconUrl" alt="" class="game-card-stat__icon game-card-stat__icon--sm" />
              <div class="min-w-0">
                <p class="game-card-stat__label">{{ card.faceitRank.label }}</p>
                <p class="game-card-stat__value game-card-stat__value--sm" :style="{ color: card.faceitRank.color }">{{ card.faceitRank.main }}</p>
                <p v-if="card.faceitRank.sub" class="game-card-stat__meta">{{ card.faceitRank.sub }}</p>
              </div>
            </div>
          </template>

          <div v-else-if="card.rank" class="game-card-stat">
            <img v-if="card.rank.iconUrl" :src="card.rank.iconUrl" alt="" class="game-card-stat__icon" />
            <div class="min-w-0">
              <p class="game-card-stat__label">{{ card.rank.label }}</p>
              <p class="game-card-stat__value" :style="{ color: card.rank.color }">{{ card.rank.main }}</p>
              <p v-if="card.rank.sub" class="game-card-stat__meta">{{ card.rank.sub }}</p>
            </div>
          </div>

          <p v-if="card.match" class="flex items-center gap-1.5 text-[10px]">
            <span class="text-gray-600 uppercase tracking-wide">{{ card.match.prefix }}</span>
            <span
              class="rounded-md border px-1.5 py-0.5 font-semibold tabular-nums"
              :class="card.match.muted
                ? 'border-white/[0.06] bg-white/[0.02] text-gray-600'
                : 'border-white/[0.08] bg-white/[0.04] text-gray-300'"
            >{{ card.match.result }}</span>
          </p>
        </template>
      </div>

      <div class="flex-shrink-0">
        <button
          v-if="card.linkState === 'loading'"
          type="button"
          disabled
          class="game-card-btn game-card-btn--muted w-full cursor-not-allowed"
        >
          <svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Syncing…
        </button>
        <button
          v-else-if="!card.linked"
          type="button"
          class="game-card-btn game-card-btn--solid w-full"
          @click="linkGame(card.id, $event)"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
          {{ card.linkLabel }}
        </button>
        <button
          v-else
          type="button"
          class="game-card-btn w-full disabled:opacity-50"
          :class="card.ctaSolid ? 'game-card-btn--solid' : 'game-card-btn--outline'"
          :disabled="card.id === 'valorant' && launchBusy"
          @click="primaryAction(card.id, $event)"
        >
          <svg v-if="card.ctaIcon === 'target'" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-width="1.75"/><circle cx="12" cy="12" r="2" stroke-width="1.75"/></svg>
          <svg v-else-if="card.ctaIcon === 'upload'" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6H16a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          <svg v-else class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          {{ card.id === 'valorant' && launchBusy ? 'Launching…' : card.ctaLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 12px 36px rgba(0, 0, 0, 0.28);
}
.game-card--active {
  border-color: rgba(var(--accent-rgb), 0.28);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 12px 36px rgba(0, 0, 0, 0.3),
    0 0 40px rgba(var(--accent-rgb), 0.06);
}
.game-card-accent {
  background: linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.85), transparent);
}
.game-card-stat {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.game-card-stat--compact {
  margin-top: 2px;
}
.game-card-stat__icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
}
.game-card-stat__icon--sm {
  width: 26px;
  height: 26px;
}
.game-card-stat__label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(156, 163, 175, 0.9);
}
.game-card-stat__value {
  margin-top: 1px;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.game-card-stat__value--sm {
  font-size: 14px;
}
.game-card-stat__meta {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(209, 213, 219, 0.85);
  font-variant-numeric: tabular-nums;
}
.game-card-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease;
}
.game-card-btn--solid {
  color: #fff;
  background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 88%, #000));
  box-shadow: 0 6px 20px rgba(var(--accent-rgb), 0.32);
}
.game-card-btn--solid:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}
.game-card-btn--outline {
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: rgba(0, 0, 0, 0.22);
}
.game-card-btn--outline:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.32);
}
.game-card-btn--muted {
  color: rgba(156, 163, 175, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}
</style>
