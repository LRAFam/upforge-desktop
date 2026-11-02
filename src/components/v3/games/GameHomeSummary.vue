<script setup lang="ts">
/** Home, game set up: the game's real stats summary (CS2 / Deadlock / League). */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UfStatRow from '../UfStatRow.vue'
import UfRoundsLine from '../UfRoundsLine.vue'
import GameMark from './GameMark.vue'
import UfSkeleton from '../UfSkeleton.vue'
import { getDeadlockRankIconUrl } from '../../../lib/deadlock'
import { getFaceitLevelIconUrl } from '../../../lib/cs2'
import { cs2MapRows, cs2Stats, deadlockHeroRecord, deadlockRankCaption, deadlockStats, lolStats, lolSummary, type DemoGame } from './game-data'
import type { GameData } from './useGameData'
import { focusSlots } from '../../../lib/focus'
import { lolFocusHeadline, lolFocusSubline } from '../../../lib/lol-focus'
import { championIconUrl, lolRankEmblemUrl } from '../../../lib/lol'
import { lolAnalysisStatus, lolIdentityNote, lolNoMatchesText } from '../../../lib/lol-display'
import { lolProfileIconId } from '../../../lib/lol-recent'
import { playerIdentity } from '../../../lib/player-identity'
import PlayerAvatar from '../identity/PlayerAvatar.vue'
import LolRecentNotice from './LolRecentNotice.vue'

const props = defineProps<{ game: DemoGame; data: GameData }>()
const router = useRouter()
const lolFocus = computed(() => (props.game === 'lol' ? props.data.lol.focus ?? null : null))
const lolSlots = computed(() => (lolFocus.value ? focusSlots(lolFocus.value) : []))

const stats = computed(() => {
  if (props.game === 'cs2') return cs2Stats(props.data.cs2.profile, props.data.cs2.faceit)
  if (props.game === 'deadlock') return deadlockStats(props.data.deadlock.stats)
  return lolStats(lolSummary(props.data.lol.matches))
})
const rank = computed(() => {
  if (props.game === 'lol') {
    const label = props.data.lol.rank?.rank?.label
    return label ? { label, icon: lolRankEmblemUrl(label) } : null
  }
  if (props.game !== 'deadlock') return null
  const r = props.data.deadlock.stats?.current_rank
  if (!r) return null
  return { label: r.subtier ? `${r.name} ${r.subtier}` : r.name, icon: getDeadlockRankIconUrl(r.name, r.subtier) }
})
const rankCaption = computed(() => (props.game === 'deadlock' ? deadlockRankCaption(props.data.deadlock.stats?.current_rank) : 'Current rank'))
const faceitIcon = computed(() => (props.game === 'cs2' && props.data.cs2.faceit?.connected ? getFaceitLevelIconUrl(props.data.cs2.faceit.level) : null))
const who = computed(() => {
  if (props.game === 'cs2') return props.data.cs2.profile?.identity.steam_display_name ?? ''
  if (props.game === 'lol') return lolIdentityNote({ label: props.data.lol.riotLabel, source: props.data.lol.riotSource })
  return ''
})
/** League profile icon from recent matches; null on older API builds (no avatar, not a stand-in). */
const lolAvatar = computed(() => {
  if (props.game !== 'lol') return null
  const id = lolProfileIconId(props.data.lol.matches)
  return id == null ? null : playerIdentity({ game: 'lol', name: props.data.lol.riotLabel, profileIconId: id })
})
const lolRiotDown = computed(() => props.game === 'lol' && !!props.data.lol.matchesError?.error && !props.data.lol.matches.length)
const topLine = computed(() => {
  if (props.game === 'deadlock') {
    const heroes = deadlockHeroRecord(props.data.deadlock.stats, 3)
    return heroes ? `Most played heroes, won–lost: ${heroes}` : ''
  }
  const rows = props.game === 'cs2' ? cs2MapRows(props.data.cs2.profile?.valve_stats.map_breakdown, 3) : []
  if (!rows.length) return ''
  return `Most played maps: ${rows.map(r => `${r.name} (${r.games})`).join(' · ')}`
})
const form = computed(() => {
  if (props.game === 'lol') return [...props.data.lol.matches].slice(0, 10).reverse().map(m => ({ won: m.win }))
  if (props.game === 'deadlock') return [...(props.data.deadlock.stats?.recent_matches ?? [])].slice(0, 10).reverse().map(m => ({ won: m.match_result === 1 }))
  return []
})
const emptyText = computed(() => {
  if (props.game === 'cs2') return 'No CS2 matches tracked yet. Record or analyse a CS2 match in UpForge to build your map and K/D stats.'
  if (props.game === 'deadlock') return 'No Deadlock matches synced yet. Play a match on your linked Steam account and your stats appear here.'
  return lolNoMatchesText({ label: props.data.lol.riotLabel, source: props.data.lol.riotSource })
})
const a = computed(() => props.data.actions)
function openWeb() {
  if (props.game === 'cs2') a.value.cs2OpenWeb()
  else if (props.game === 'deadlock') a.value.deadlockOpenWeb()
  else a.value.lolOpenWeb()
}
</script>

<template>
  <section class="gsum uf-rise uf-d3s" :aria-label="`Your stats`">
    <GameMark :game="game" label="Your stats">
      <span v-if="who" class="uf-t4 gsum-who"><PlayerAvatar v-if="lolAvatar" :identity="lolAvatar" :size="24" />{{ who }}</span>
    </GameMark>

    <div v-if="data.loading.value && !stats.length && !data.loaded.value" class="gsum-skel" role="status" aria-label="Loading your stats">
      <UfSkeleton v-for="i in 4" :key="i" :h="64" />
    </div>
    <template v-else-if="data.error.value && !stats.length">
      <p class="uf-t2">Couldn't load your {{ game === 'lol' ? 'League' : game === 'cs2' ? 'CS2' : 'Deadlock' }} stats right now.</p>
      <button type="button" class="uf-link" @click="data.load(true)">Try again →</button>
    </template>
    <template v-else>
      <div v-if="rank" class="gsum-rank">
        <img v-if="rank.icon" :src="rank.icon" alt="" width="40" height="40">
        <span class="gsum-rank-t"><span class="uf-d4">{{ rank.label }}</span><span class="uf-t4">{{ rankCaption }}</span></span>
      </div>
      <div v-else-if="faceitIcon" class="gsum-rank">
        <img :src="faceitIcon" alt="" width="36" height="36">
        <span class="gsum-rank-t"><span class="uf-d4">{{ data.cs2.faceit?.nickname }}</span><span class="uf-t4">FACEIT</span></span>
      </div>
      <UfStatRow v-if="stats.length" :items="stats" />
      <LolRecentNotice v-else-if="lolRiotDown" :state="data.lol.matchesError" :has-matches="false" :busy="data.loading.value" @retry="data.load(true)" />
      <p v-else class="uf-t2">{{ emptyText }}</p>
      <LolRecentNotice v-if="game === 'lol' && stats.length" :state="data.lol.matchesError" :has-matches="true" :busy="data.loading.value" @retry="data.load(true)" />
      <div v-if="form.length >= 2" class="gsum-form">
        <span class="uf-t4">Last {{ form.length }} results, oldest first</span>
        <UfRoundsLine :rounds="form" :half-at="999" :height="18" />
      </div>
      <p v-if="topLine" class="uf-t4">{{ topLine }}</p>
      <!-- League focus loop: one measured habit from your own recent games, checked on new matches. -->
      <div v-if="lolFocus" class="gsum-focus" aria-labelledby="gsum-focus-t">
        <span class="uf-label" :style="{ color: lolFocus.progress.status === 'active' ? 'var(--uf-red)' : undefined }">
          {{ lolFocus.progress.status === 'active' ? `Focus · game ${Math.min(lolFocus.progress.games_played + 1, lolFocus.progress.games_required)} of ${lolFocus.progress.games_required}` : `Focus · ${lolFocus.progress.status}` }}
        </span>
        <span id="gsum-focus-t" class="uf-t3">{{ lolFocusHeadline(lolFocus) }}</span>
        <ol class="gsum-slots" aria-label="Focus games">
          <li v-for="(s, i) in lolSlots" :key="i" :class="`gsum-slot gsum-slot--${s}`"
            :aria-label="`Game ${i + 1}: ${s === 'pending' ? 'not played yet' : s === 'hit' ? 'target hit' : 'target missed'}`" />
        </ol>
        <span class="uf-t4">{{ lolFocusSubline(lolFocus) }}</span>
      </div>
      <template v-if="game === 'lol' && data.lol.analyses.length">
        <button v-for="r in data.lol.analyses.slice(0, 3)" :key="r.id" type="button" class="gsum-row" @click="a.lolOpenResults(r.id)">
          <span class="gsum-champ"><img v-if="r.champion && championIconUrl(r.champion)" :src="championIconUrl(r.champion)" alt="" width="24" height="24"><span class="uf-t3">{{ r.champion ?? 'Match' }}</span></span>
          <span class="uf-t4">{{ r.status === 'completed' ? 'Report ready' : lolAnalysisStatus(r) }}</span>
        </button>
      </template>
    </template>

    <span class="gsum-links">
      <button type="button" class="uf-link" @click="router.push('/stats')">See progress →</button>
      <button type="button" class="uf-link" @click="openWeb">View on web →</button>
      <button v-if="game === 'cs2' && !data.cs2.faceit?.connected" type="button" class="uf-link" @click="a.cs2ConnectFaceit()">Connect FACEIT →</button>
      <button v-if="game === 'cs2'" type="button" class="uf-link" @click="a.cs2Settings()">Steam name →</button>
      <button v-if="game === 'lol' && !lolRiotDown && !data.lol.matches.length && data.lol.riotSource === 'valorant'" type="button" class="uf-link" @click="router.push({ path: '/settings', query: { tab: 'account', link: 'lol' } })">Link League Riot ID →</button>
      <button v-if="game === 'lol' && !data.lol.matches.length" type="button" class="uf-link" @click="a.lolRecordings()">Review recordings →</button>
    </span>
  </section>
</template>

<style scoped>
.gsum-skel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.gsum { display: flex; flex-direction: column; gap: 16px; }
.gsum p { margin: 0; }
.gsum-rank { display: flex; gap: 12px; align-items: center; }
.gsum-who { display: inline-flex; gap: 8px; align-items: center; }
.gsum-rank img { object-fit: contain; }
.gsum-rank-t { display: flex; flex-direction: column; gap: 2px; }
.gsum-form { display: flex; flex-direction: column; gap: 6px; max-width: 520px; }
.gsum-row { display: flex; justify-content: space-between; align-items: baseline; width: 100%; max-width: 640px; padding: 8px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); cursor: pointer; text-align: left; }
.gsum-row:hover .uf-t3 { color: #fff; }
.gsum-champ { display: inline-flex; gap: 10px; align-items: center; }
.gsum-champ img { object-fit: cover; }
.gsum-links { display: flex; gap: 18px; flex-wrap: wrap; }
.gsum-focus { display: flex; flex-direction: column; gap: 8px; max-width: 520px; padding-top: 14px; border-top: 1px solid var(--uf-line); }
.gsum-slots { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
.gsum-slot { flex: 1; height: 4px; background: var(--uf-line-2); }
.gsum-slot--hit { background: var(--uf-win); }
.gsum-slot--miss { background: var(--uf-loss); }
</style>
