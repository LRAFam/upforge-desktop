<script setup lang="ts">
import { plural } from '../../../lib/plural'
/**
 * Progress for CS2 / Deadlock / League: the data the old CS2StatsPanel, Cs2ValveStatsPanel,
 * DeadlockStatsPanel and LolStatsPanel showed, as v3 hero numbers, a rank line and bar tables.
 */
import { computed, ref, toRef, watch } from 'vue'
import UfButton from '../UfButton.vue'
import UfStatRow from '../UfStatRow.vue'
import UfRoundsLine from '../UfRoundsLine.vue'
import GameMark from './GameMark.vue'
import { mapDisplayName } from './display-names'
import { useGameData } from './useGameData'
import type { DeadlockProfileStats } from '../../../env.d.ts'
import { getDeadlockHeroIconUrl, getDeadlockRankIconUrl } from '../../../lib/deadlock'
import { getFaceitLevelIconUrl } from '../../../lib/cs2'
import { parseCs2Score } from '../../../lib/cs2-analyses'
import { championIconUrl, lolRankEmblemUrl } from '../../../lib/lol'
import { lolAnalysisStatus, lolIdentityNote, lolMatchMeta, lolNoMatchesText } from '../../../lib/lol-display'
import { matchReportPath } from '../../../lib/match-report'
import { useRouter } from 'vue-router'
import { fmtDeadlockDuration, fmtDeadlockNW } from '../../../lib/deadlock-analyses'
import { fmtLolKda } from '../../../lib/lol-analyses'
import { leagueDivisionName, rankForecast } from '../../../lib/ideas/rank-forecast'
import { lolEarlyDeaths, lolRankSentence, lolRankSeries, lolTrendSentence, lolTrends, type LolEarlyDeathRow, type LolTrendMatch } from '../../../lib/lol-progress'
import UfSkeleton from '../UfSkeleton.vue'
import UfTabs from '../UfTabs.vue'
import {
  DEADLOCK_QUEUE_LABEL, deadlockMatchWon, deadlockQueueOf, deadlockQueueStats, deadlockQueueTabs, deadlockSeasonView,
  defaultDeadlockQueue, filterDeadlockQueue, type DeadlockQueueTab,
} from '../../../lib/deadlock-queues'
import DeadlockReviewV3 from './DeadlockReviewV3.vue'
import Cs2ResultV3 from './Cs2ResultV3.vue'
import LolLoadoutStrip from './LolLoadoutStrip.vue'
import LolRecentNotice from './LolRecentNotice.vue'
import PlayerAvatar from '../identity/PlayerAvatar.vue'
import { playerIdentity } from '../../../lib/player-identity'
import { lolProfileIconId } from '../../../lib/lol-recent'
import { deadlockRowHeroArt } from '../../../lib/deadlock-item-build'
import { useStaleLoad } from '../../../lib/stale-cache'
import {
  GAME_NAME, cs2MapRows, cs2MapsHaveWinRate, cs2Stats, deadlockHeroRows, deadlockRankSeries, deadlockStats,
  deadlockRankCaption, formatRankDate, lolChampionRows, lolStats, lolSummary, rankSentence, stepLine, type DemoGame,
} from './game-data'

const props = defineProps<{ game: DemoGame }>()
const gd = useGameData(toRef(props, 'game'))
const a = gd.actions
const router = useRouter()
const lolId = computed(() => ({ label: gd.lol.riotLabel, source: gd.lol.riotSource }))
const lolRankIcon = computed(() => (gd.lol.rank?.rank?.label ? lolRankEmblemUrl(gd.lol.rank.rank.label) : null))
/** League profile icon from recent matches (Riot's `profileIcon`); null on older API builds. */
const lolAvatar = computed(() => {
  const id = lolProfileIconId(gd.lol.matches)
  return id == null ? null : playerIdentity({ game: 'lol', name: gd.lol.riotLabel, profileIconId: id })
})
/** Riot failed with nothing to list: say so instead of "no games". */
const lolRiotDown = computed(() => props.game === 'lol' && !!gd.lol.matchesError?.error && !gd.lol.matches.length)
function openLolReport(matchId: string) {
  const path = matchReportPath('lol', matchId)
  if (path) void router.push(path)
}

const setup = computed(() => gd.setup.value)
// Deadlock: Ranked, Standard and Street Brawl are shown apart (Street Brawl is its own short mode).
const dlMatches = computed(() => gd.deadlock.stats?.recent_matches ?? [])
const dlQueueTabs = computed(() => deadlockQueueTabs(dlMatches.value))
const dlQueuePick = ref<DeadlockQueueTab | null>(null)
const dlQueue = computed<DeadlockQueueTab>(() => {
  const pick = dlQueuePick.value
  return pick && dlQueueTabs.value.some(t => t.key === pick) ? pick : defaultDeadlockQueue(dlMatches.value)
})
const dlQueueMatches = computed(() => filterDeadlockQueue(dlMatches.value, dlQueue.value))

const stats = computed(() => {
  if (props.game === 'cs2') return cs2Stats(gd.cs2.profile, gd.cs2.faceit)
  if (props.game === 'deadlock') {
    // Older API builds send no mode fields: keep the summary view (one "Other" queue only).
    return dlQueueTabs.value.every(t => t.key === 'other') ? deadlockStats(gd.deadlock.stats) : deadlockQueueStats(dlMatches.value, dlQueue.value)
  }
  return lolStats(lolSummary(gd.lol.matches))
})
const table = computed(() => {
  if (props.game === 'cs2') {
    const maps = gd.cs2.profile?.valve_stats.map_breakdown
    return cs2MapsHaveWinRate(maps)
      ? { title: 'Maps · win rate and K/D', head: 'Win rate', rows: cs2MapRows(maps) }
      : { title: 'Maps · share of tracked matches', head: 'Share', rows: cs2MapRows(maps) }
  }
  if (props.game === 'deadlock') {
    const art = new Map((gd.deadlock.stats?.hero_stats ?? []).map(h => [h.hero_name, deadlockRowHeroArt(h)?.src ?? null]))
    // hero_stats is deadlock-api's all-time total over every mode, so say so.
    return { title: 'Heroes · win rate, all modes', head: 'Won', rows: deadlockHeroRows(gd.deadlock.stats).map(r => ({ ...r, icon: art.get(r.name) ?? getDeadlockHeroIconUrl(r.icon) })) }
  }
  return { title: 'Champions · win rate', head: 'Won', rows: lolChampionRows(gd.lol.matches).map(r => ({ ...r, icon: championIconUrl(r.name) })) }
})

// Deadlock rank line: mmr_history, or the rank badge on recent matches when that is empty (dated when the API sends start_time).
const W = 1100
const H = 170
const allSeries = computed(() => (props.game === 'deadlock' ? deadlockRankSeries(gd.deadlock.stats?.mmr_history, gd.deadlock.stats?.recent_matches) : []))
// A new ranked season moves every rank: draw this season only, or mark the reset (never call it a drop).
const seasonView = computed(() => deadlockSeasonView(allSeries.value, gd.deadlock.stats?.ranked_season, rankSentence(allSeries.value)))
const series = computed(() => seasonView.value.series)
const points = computed(() => stepLine(series.value.map(p => p.score), W, H, 10))
const lineColor = computed(() => (seasonView.value.tone === 'win' ? 'var(--uf-win)' : seasonView.value.tone === 'loss' ? 'var(--uf-loss)' : 'var(--uf-bone)'))
const markerX = computed(() => (seasonView.value.markerAt == null ? null : points.value[seasonView.value.markerAt]?.x ?? null))
const sentence = computed(() => seasonView.value.sentence)
const rank = computed(() => {
  const r = gd.deadlock.stats?.current_rank
  if (props.game !== 'deadlock' || !r) return null
  return { label: r.subtier ? `${r.name} ${r.subtier}` : r.name, icon: getDeadlockRankIconUrl(r.name, r.subtier) }
})
const firstIcon = computed(() => (series.value[0] ? getDeadlockRankIconUrl(series.value[0].name, series.value[0].sub) : null))

// League rank line from stored League-V4 snapshots, and trends from recent matches.
const lolSeries = computed(() => (props.game === 'lol' ? lolRankSeries(gd.lol.rank) : []))
const lolPoints = computed(() => stepLine(lolSeries.value.map(p => p.value), W, H, 10))
const lolRising = computed(() => lolSeries.value.length >= 2 && lolSeries.value[lolSeries.value.length - 1].value >= lolSeries.value[0].value)
const lolSentence = computed(() => lolRankSentence(lolSeries.value))
// Rank pace (P6): ≥20 rank snapshots over ≥14 days and a clearly upward trend, else nothing.
const lolForecast = computed(() => rankForecast(
  lolSeries.value.map(s => ({ t: new Date(s.captured_at).getTime(), value: s.value })), 100, leagueDivisionName))
const lolTrendRows = computed(() => (props.game === 'lol' ? lolTrends(gd.lol.matches as LolTrendMatch[]) : []))
// Deaths before 14:00 from coached games' stored timelines (no extra Riot calls).
const lolEarly = computed(() => (props.game === 'lol' ? lolEarlyDeaths(gd.lol.analyses as LolEarlyDeathRow[]) : null))

const faceit = computed(() => (props.game === 'cs2' && gd.cs2.faceit?.connected ? gd.cs2.faceit : null))
const form = computed(() => {
  if (props.game === 'lol') return [...gd.lol.matches].slice(0, 20).reverse().map(m => ({ won: m.win }))
  if (props.game === 'deadlock') {
    return [...dlQueueMatches.value].slice(0, 20).reverse().map(m => deadlockMatchWon(m)).filter((w): w is boolean => w !== null).map(won => ({ won }))
  }
  // CS2: the API's recent list is already oldest first; matches without a known result are left out.
  if (props.game === 'cs2') return (gd.cs2.profile?.valve_stats.recent ?? []).filter(m => typeof m.won === 'boolean').map(m => ({ won: m.won as boolean }))
  return []
})
// CS2 matches analysed from FACEIT or web demo uploads count even before this PC's demo folder is found:
// show them, with the setup step as one line, instead of "Nothing to track yet".
const cs2HasData = computed(() => props.game === 'cs2' && (gd.cs2.profile?.valve_stats.matches_tracked ?? 0) > 0)
const deadlockRecent = computed(() => dlQueueMatches.value.slice(0, 6))
const deadlockRankCap = computed(() => deadlockRankCaption(gd.deadlock.stats?.current_rank))
type DeadlockRecent = DeadlockProfileStats['recent_matches'][number]
function deadlockMatchLine(m: DeadlockRecent): string {
  const mode = dlQueue.value === 'all' ? `${DEADLOCK_QUEUE_LABEL[deadlockQueueOf(m)]} · ` : ''
  return `${mode}K/D/A ${m.player_kills}/${m.player_deaths}/${m.player_assists} · ${fmtDeadlockNW(m.net_worth)} souls · ${fmtDeadlockDuration(m.match_duration_s)}`
}
function openDeadlockReport(matchId: number) {
  const path = matchReportPath('deadlock', String(matchId))
  if (path) void router.push(path)
}
const metaTop = computed(() => (gd.deadlock.stats?.top_meta_heroes ?? []).slice(0, 4))
const deadlockReviews = computed(() => gd.deadlock.analyses.slice(0, 5))
const review = ref<{ jobId: string; hero: string | null } | null>(null)
function reviewLabel(status: string): string {
  return status === 'completed' ? 'Read →' : status === 'failed' ? 'Failed' : 'Writing…'
}

// CS2 (round 7): analysed demos open in the app instead of the web.
// Only fetched on CS2 Progress; on other games the cached list is left untouched.
const cs2Reviews = useStaleLoad('cs2:demo-reviews', () => (props.game === 'cs2' ? window.api.cs2.getAnalyses(5) : Promise.reject(new Error('not cs2'))))
watch(() => props.game, g => { if (g === 'cs2') void cs2Reviews.reload() })
const cs2Review = ref<string | null>(null)

function openWeb() {
  if (props.game === 'cs2') a.cs2OpenWeb()
  else if (props.game === 'deadlock') a.deadlockOpenWeb()
  else a.lolOpenWeb()
}
</script>

<template>
  <div class="gprog">
    <GameMark :game="game" label="Your progress">
      <button type="button" class="uf-link" @click="openWeb">More on upforge.gg →</button>
    </GameMark>

    <div v-if="!gd.loaded.value" class="gprog-skel" role="status" :aria-label="`Loading your ${GAME_NAME[game]} stats`">
      <UfSkeleton :w="260" :h="40" />
      <div class="gprog-skel-row"><UfSkeleton v-for="i in 4" :key="i" :h="64" /></div>
      <UfSkeleton :lines="3" />
    </div>

    <section v-else-if="gd.error.value && !setup?.ready" class="gprog-empty">
      <p class="uf-t2">Couldn't load your {{ GAME_NAME[game] }} stats right now.</p>
      <button type="button" class="uf-link" @click="gd.load(true)">Try again →</button>
    </section>

    <section v-else-if="setup && !setup.ready && !cs2HasData" class="gprog-empty">
      <span class="uf-d2">Nothing to track yet</span>
      <p class="uf-t2">{{ setup.missing }}</p>
      <div class="gprog-act">
        <UfButton v-if="setup.action" variant="primary" :disabled="gd.cs2.detecting" @click="gd.runSetup(setup.action)">{{ setup.actionLabel }}</UfButton>
        <span v-if="gd.cs2.detectError" class="uf-t4" role="alert" style="color: var(--uf-loss)">{{ gd.cs2.detectError }}</span>
      </div>
      <p v-if="setup.note" class="uf-t4">{{ setup.note }}</p>
    </section>

    <template v-else>
      <p v-if="gd.error.value" class="uf-t4" role="alert">Couldn't refresh your stats. Showing what loaded last. <button type="button" class="uf-link" @click="gd.load(true)">Retry →</button></p>

      <!-- Rank -->
      <section v-if="game === 'deadlock'" class="gprog-rank uf-rise">
        <div class="gprog-rank-head">
          <img v-if="rank?.icon" :src="rank.icon" alt="" width="64" height="64">
          <span class="gprog-rank-t">
            <span class="uf-d2">{{ rank?.label ?? 'Unranked' }}</span>
            <span class="uf-t4">{{ deadlockRankCap }}</span>
          </span>
        </div>
        <template v-if="points.length">
          <p class="uf-t1">{{ sentence }}</p>
          <div class="gprog-chart">
            <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="sentence">
              <line v-for="p in points" :key="p.x" :x1="p.x" :x2="p.x" :y1="H" :y2="H - 4" stroke="var(--uf-line-2)" />
              <line v-if="markerX != null" :x1="markerX" :x2="markerX" y1="0" :y2="H" stroke="var(--uf-muted)"
                stroke-dasharray="6 5" stroke-width="2" vector-effect="non-scaling-stroke" />
              <polyline :points="points.map(p => `${p.x},${p.y}`).join(' ')" fill="none"
                :stroke="lineColor" stroke-width="2.5" vector-effect="non-scaling-stroke" />
            </svg>
            <span class="gprog-chart-l uf-t4"><img v-if="firstIcon" :src="firstIcon" alt="" width="22" height="22">{{ series[0].label }}<template v-if="series[0].at"> · {{ formatRankDate(series[0].at) }}</template></span>
            <span class="gprog-chart-r uf-t4">{{ series[series.length - 1].label }} · {{ series[series.length - 1].at ? formatRankDate(series[series.length - 1].at) : 'now' }}</span>
          </div>
          <span class="uf-t4">{{ series[0].at ? `${series.length} ranked matches${seasonView.seasonOnly ? ' this season' : ''}, oldest on the left.` : `Last ${series.length} rank updates, oldest on the left.` }}<template v-if="markerX != null"> Dashed line: {{ gd.deadlock.stats?.ranked_season?.name ?? 'new season' }} reset.</template></span>
        </template>
        <p v-else class="uf-t2">Not enough rank history yet. Play ranked matches and your rank line starts here.</p>
      </section>

      <section v-else-if="game === 'cs2'" class="gprog-rank uf-rise">
        <div v-if="faceit" class="gprog-rank-head">
          <img v-if="getFaceitLevelIconUrl(faceit.level)" :src="getFaceitLevelIconUrl(faceit.level)!" alt="" width="56" height="56">
          <span class="gprog-rank-t"><span class="uf-d2">{{ faceit.nickname }}</span><span class="uf-t4">FACEIT{{ faceit.level ? ` · level ${faceit.level}` : '' }}</span></span>
        </div>
        <p v-else class="uf-t2">FACEIT isn't connected. Connect it to see your Elo and level here. <button type="button" class="uf-link" @click="a.cs2ConnectFaceit()">Connect FACEIT →</button></p>
        <p v-if="gd.cs2.profile?.valve_stats.premier_rating == null" class="uf-t4">{{ gd.cs2.profile?.identity.steam_id
          ? 'No Premier rating found for your Steam ID yet, so there\'s no rank line for CS2.'
          : 'Premier rating needs your Steam ID. UpForge saves it the first time it finds you in one of your demos.' }}</p>
        <p v-if="setup && !setup.ready && setup.action" class="uf-t4">{{ setup.missing }} <button type="button" class="uf-link" :disabled="gd.cs2.detecting" @click="gd.runSetup(setup.action)">{{ setup.actionLabel }} →</button></p>
      </section>

      <section v-else class="gprog-rank uf-rise">
        <div class="gprog-rank-head">
          <img v-if="lolRankIcon" :src="lolRankIcon" alt="" width="64" height="64">
          <span class="gprog-rank-t">
            <span class="uf-d2">{{ gd.lol.rank?.rank?.label ?? 'Unranked' }}</span>
            <span class="uf-t4 gprog-who"><PlayerAvatar v-if="lolAvatar" :identity="lolAvatar" :size="24" />{{ lolIdentityNote(lolId) }} · Ranked Solo/Duo</span>
          </span>
        </div>
        <template v-if="lolPoints.length">
          <p class="uf-t1">{{ lolSentence }}</p>
          <p v-if="lolForecast" class="uf-t4" style="margin: 0; color: var(--uf-muted)">{{ lolForecast.sentence }}</p>
          <div class="gprog-chart">
            <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="lolSentence">
              <line v-for="p in lolPoints" :key="p.x" :x1="p.x" :x2="p.x" :y1="H" :y2="H - 4" stroke="var(--uf-line-2)" />
              <polyline :points="lolPoints.map(p => `${p.x},${p.y}`).join(' ')" fill="none"
                :stroke="lolRising ? 'var(--uf-win)' : 'var(--uf-loss)'" stroke-width="2.5" vector-effect="non-scaling-stroke" />
            </svg>
            <span class="gprog-chart-l uf-t4">{{ lolSeries[0].label }}</span>
            <span class="gprog-chart-r uf-t4">{{ lolSeries[lolSeries.length - 1].label }} · now</span>
          </div>
          <span class="uf-t4">{{ lolSeries.length }} rank changes since UpForge started tracking, oldest on the left.</span>
        </template>
        <p v-else-if="gd.lol.rank?.rank" class="uf-t2">Your rank line starts here. It grows each time your rank changes after a coached match.</p>
        <p v-else class="uf-t4">No Ranked Solo/Duo rank found for this account yet. Play ranked games and analyse one to start your rank line.</p>
      </section>

      <section v-if="game === 'lol' && lolTrendRows.length" class="gprog-block uf-rise uf-d1s">
        <span class="uf-label">Trends · last {{ plural(lolTrendRows[0].values.length, 'game') }}</span>
        <div v-for="tr in lolTrendRows" :key="tr.key" class="gprog-line">
          <span class="uf-t3 gprog-grow">{{ lolTrendSentence(tr) }}</span>
          <span class="uf-t4" :style="{ color: tr.direction === 'better' ? 'var(--uf-win)' : tr.direction === 'worse' ? 'var(--uf-loss)' : 'var(--uf-faint)' }">{{ tr.direction === 'better' ? 'Improving' : tr.direction === 'worse' ? 'Slipping' : 'Steady' }}</span>
        </div>
      </section>

      <section v-if="game === 'lol' && lolEarly" class="gprog-block uf-rise uf-d1s">
        <span class="uf-label">Early game · last {{ lolEarly.games }} coached games</span>
        <p class="uf-t3" style="margin: 0">{{ lolEarly.sentence }}</p>
      </section>

      <div class="uf-hair" />

      <!-- Numbers -->
      <section class="gprog-block uf-rise uf-d2s">
        <span class="uf-label">Your matches</span>
        <UfTabs v-if="game === 'deadlock' && dlQueueTabs.length > 1" size="filter" label="Queue" :items="dlQueueTabs"
          :model-value="dlQueue" @update:model-value="k => (dlQueuePick = k as DeadlockQueueTab)" />
        <UfStatRow v-if="stats.length" :items="stats" />
        <LolRecentNotice v-else-if="lolRiotDown" :state="gd.lol.matchesError" :has-matches="false" :busy="gd.loading.value" @retry="gd.load(true)" />
        <p v-else class="uf-t2">{{ game === 'cs2'
          ? 'No CS2 matches tracked yet. Record or analyse CS2 matches in UpForge to build map and K/D stats.'
          : game === 'deadlock' ? 'No Deadlock matches synced yet. Play a match on your linked Steam account.'
            : lolNoMatchesText(lolId) }}</p>
        <UfButton v-if="game === 'lol' && !lolRiotDown && !gd.lol.matches.length && gd.lol.riotSource === 'valorant'" variant="link" style="align-self: flex-start" @click="router.push({ path: '/settings', query: { tab: 'account', link: 'lol' } })">Link League Riot ID</UfButton>
        <UfButton v-if="game === 'lol' && !gd.lol.matches.length" variant="link" style="align-self: flex-start" @click="a.lolRecordings()">Review recordings</UfButton>
        <div v-if="form.length >= 2" class="gprog-form">
          <span class="uf-t4">Last {{ form.length }} results, oldest first</span>
          <UfRoundsLine :rounds="form" :half-at="999" :height="26" />
        </div>
      </section>

      <!-- Tables -->
      <div class="gprog-cols uf-rise uf-d3s">
        <section class="gprog-col">
          <span class="uf-label">{{ table.title }}</span>
          <template v-if="table.rows.length">
            <div class="gprog-row gprog-row--head uf-t4"><span>Name</span><span>Games</span><span>{{ table.head }}</span><span /></div>
            <div v-for="r in table.rows" :key="r.name" class="gprog-row">
              <span class="gprog-name"><img v-if="r.icon" :src="r.icon" alt="" width="22" height="22"><span class="uf-t3">{{ r.name }}</span></span>
              <span class="uf-t4 uf-num">{{ r.games }}</span>
              <span class="gprog-bar"><span class="uf-fill" :style="{ width: `${r.pct}%`, background: r.tone === 'win' ? 'var(--uf-win)' : r.tone === 'loss' ? 'var(--uf-loss)' : 'var(--uf-bone)' }" /><b class="uf-d4">{{ r.pct }}%</b></span>
              <span class="uf-t4">{{ r.extra }}</span>
            </div>
            <span v-if="table.rows.every(r => r.games < 5)" class="uf-t4">Fewer than 5 games each is an early read.</span>
          </template>
          <p v-else class="uf-t2">Nothing here yet.</p>
        </section>

        <section class="gprog-col gprog-col--side">
          <template v-if="game === 'deadlock'">
            <span class="uf-label">Recent matches</span>
            <button v-for="m in deadlockRecent" :key="m.match_id" type="button" class="gprog-dl gprog-btn"
              :disabled="!matchReportPath('deadlock', String(m.match_id))" :aria-label="`${m.hero_name}, ${deadlockMatchWon(m) ? 'won' : 'lost'}: open the match report`"
              @click="openDeadlockReport(m.match_id)">
              <img v-if="deadlockRowHeroArt(m)" :src="deadlockRowHeroArt(m)!.src" alt="" width="32" height="40" :class="`is-${deadlockRowHeroArt(m)!.kind}`">
              <span class="gprog-dl-t">
                <span class="uf-t3"><span :style="{ color: deadlockMatchWon(m) ? 'var(--uf-win)' : 'var(--uf-loss)' }">{{ deadlockMatchWon(m) ? 'Won' : 'Lost' }}</span> · {{ m.hero_name }}</span>
                <span class="uf-t4 uf-num">{{ deadlockMatchLine(m) }}</span>
              </span>
              <span class="uf-t4">Report →</span>
            </button>
            <p v-if="!deadlockRecent.length" class="uf-t2">No recent matches yet.</p>
            <p v-if="metaTop.length" class="uf-t4">Strongest heroes this patch: {{ metaTop.map(h => `${h.hero_name} ${Math.round(h.win_rate)}%`).join(' · ') }}</p>
            <span class="uf-label" style="margin-top: 14px">Replay reviews</span>
            <button v-for="r in deadlockReviews" :key="r.job_id" type="button" class="gprog-line gprog-btn"
              :disabled="r.status !== 'completed'" @click="review = { jobId: r.job_id, hero: r.hero }">
              <span class="uf-t3 gprog-grow">{{ r.hero ?? 'Match' }}<template v-if="r.match_result"> · {{ r.match_result === 'win' ? 'Won' : r.match_result === 'loss' ? 'Lost' : r.match_result }}</template></span>
              <span class="uf-t4">{{ reviewLabel(r.status) }}</span>
            </button>
            <p v-if="!deadlockReviews.length" class="uf-t4">No replay reviews yet. Record a match, then choose Review replay on it in Matches.</p>
          </template>
          <template v-else-if="game === 'lol'">
            <span class="uf-label">Riot match reports</span>
            <button v-for="r in gd.lol.analyses.slice(0, 6)" :key="r.id" type="button" class="gprog-line gprog-btn" @click="a.lolOpenResults(r)">
              <span class="gprog-name gprog-grow"><img v-if="r.champion && championIconUrl(r.champion)" :src="championIconUrl(r.champion)" alt="" width="22" height="22"><span class="uf-t3">{{ r.champion ?? 'Match' }}</span></span>
              <span class="uf-t4">{{ lolAnalysisStatus(r) }} →</span>
            </button>
            <template v-if="!gd.lol.analyses.length">
              <p class="uf-t2">No match reports yet.</p>
            </template>
            <template v-if="gd.lol.matches.length">
              <span class="uf-label" style="margin-top: 14px">Recent games</span>
              <LolRecentNotice :state="gd.lol.matchesError" :has-matches="true" :busy="gd.loading.value" @retry="gd.load(true)" />
              <button v-for="m in gd.lol.matches.slice(0, 5)" :key="m.match_id" type="button" class="gprog-lol gprog-btn"
                :disabled="!matchReportPath('lol', m.match_id)" :aria-label="`${m.champion}, ${m.win ? 'won' : 'lost'}: open the match report`" @click="openLolReport(m.match_id)">
                <img v-if="championIconUrl(m.champion)" :src="championIconUrl(m.champion)" alt="" width="32" height="32">
                <span class="gprog-lol-t">
                  <span class="uf-t3"><span :style="{ color: m.win ? 'var(--uf-win)' : 'var(--uf-loss)' }">{{ m.win ? 'Won' : 'Lost' }}</span> · {{ m.champion }} · <span class="uf-num">{{ fmtLolKda(m.kills, m.deaths, m.assists) }}</span></span>
                  <span class="uf-t4">{{ lolMatchMeta(m) }}</span>
                  <LolLoadoutStrip :match="m" />
                </span>
                <span class="uf-t4">Report →</span>
              </button>
            </template>
          </template>
          <template v-else>
            <span class="uf-label">Steam</span>
            <span class="uf-t3">{{ gd.cs2.profile?.identity.steam_display_name ?? 'Not set' }}</span>
            <span class="uf-t4">UpForge finds you in demo files by your Steam ID, or by this name until it has seen one.</span>
            <button type="button" class="uf-link" @click="a.cs2Settings()">Change it →</button>
            <span class="uf-label" style="margin-top: 14px">Demo reviews</span>
            <button v-for="r in (cs2Reviews.data.value ?? [])" :key="r.job_id ?? r.id" type="button" class="gprog-line gprog-btn"
              :disabled="!r.job_id || r.status !== 'completed'" @click="cs2Review = r.job_id">
              <span class="uf-t3 gprog-grow">{{ r.map ? mapDisplayName('cs2', r.map) : 'Match' }}<template v-if="parseCs2Score(r.score)"> · {{ parseCs2Score(r.score)!.won }}–{{ parseCs2Score(r.score)!.lost }}</template></span>
              <span class="uf-t4">{{ reviewLabel(r.status) }}</span>
            </button>
            <p v-if="cs2Reviews.loading.value" class="uf-t4">Loading reviews…</p>
            <p v-else-if="!(cs2Reviews.data.value ?? []).length" class="uf-t4">No demo reviews yet. Analyse a match with its demo to get one.</p>
          </template>
        </section>
      </div>
    </template>
    <DeadlockReviewV3 v-if="game === 'deadlock'" :open="!!review" :job-id="review?.jobId ?? null" :hero="review?.hero" @close="review = null" />
    <Cs2ResultV3 v-if="game === 'cs2'" :open="!!cs2Review" :job-id="cs2Review" @close="cs2Review = null" />
  </div>
</template>

<style scoped>
.gprog-skel { display: flex; flex-direction: column; gap: 18px; }
.gprog-skel-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.gprog { display: flex; flex-direction: column; gap: 26px; }
.gprog p { margin: 0; }
.gprog-empty { display: flex; flex-direction: column; gap: 12px; }
.gprog-empty p { max-width: 720px; }
.gprog-act { display: flex; gap: 16px; align-items: center; }
.gprog-rank { display: flex; flex-direction: column; gap: 14px; }
.gprog-rank-head { display: flex; gap: 16px; align-items: center; }
.gprog-rank-head img { object-fit: contain; }
.gprog-rank-t { display: flex; flex-direction: column; gap: 4px; }
.gprog-chart { position: relative; height: 170px; padding: 0 0 22px; }
.gprog-chart svg { width: 100%; height: 170px; display: block; }
.gprog-chart-l, .gprog-chart-r { position: absolute; bottom: -4px; display: inline-flex; gap: 6px; align-items: center; }
.gprog-chart-l { left: 0; }
.gprog-chart-r { right: 0; color: var(--uf-bone); }
.gprog-block { display: flex; flex-direction: column; gap: 18px; align-items: flex-start; }
.gprog-block > * { align-self: stretch; }
.gprog-form { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
.gprog-cols { display: grid; grid-template-columns: 1.5fr 1fr; gap: 40px; }
.gprog-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; align-items: flex-start; }
.gprog-col > .gprog-row, .gprog-col > .gprog-line { align-self: stretch; }
.gprog-col--side { border-left: 1px solid var(--uf-line); padding-left: 32px; }
.gprog-row { display: grid; grid-template-columns: 1.3fr 0.5fr 1.4fr 0.8fr; gap: 16px; align-items: center; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.gprog-row--head { border-top: 0; padding: 0 0 4px; }
.gprog-name { display: flex; gap: 10px; align-items: center; min-width: 0; }
.gprog-name img { object-fit: cover; object-position: center 18%; flex: none; }
.gprog-bar { position: relative; height: 24px; display: flex; align-items: center; }
.gprog-bar > span { position: absolute; left: 0; top: 3px; bottom: 3px; opacity: 0.25; }
.gprog-bar > b { position: relative; padding-left: 8px; }
.gprog-line { display: flex; gap: 12px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.gprog-btn { width: 100%; background: none; border-left: 0; border-right: 0; border-bottom: 0; cursor: pointer; text-align: left; }
.gprog-btn:hover .uf-t3 { color: #fff; }
.gprog-grow { flex: 1; min-width: 0; }
.gprog-dl { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.gprog-dl img { object-fit: cover; flex: none; }
.gprog-dl img.is-card { object-position: center 18%; }
.gprog-dl img.is-icon { height: 32px; }
.gprog-who { display: inline-flex; gap: 8px; align-items: center; }
.gprog-dl-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gprog-lol { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.gprog-lol img { object-fit: cover; flex: none; }
.gprog-lol-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
@container (max-width: 900px) { .gprog-cols { grid-template-columns: 1fr; } .gprog-col--side { border-left: 0; padding-left: 0; } }
</style>
