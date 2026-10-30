<script setup lang="ts">
/**
 * UI v3 Progress (boards 8 · 8b · 8c). Real data only:
 * rank rating from stats.rrHistory (plotted as ELO), match stats from the analyses StatsView loads,
 * the focus and its per-match metric history from app.getFocus.
 */
import UfTabs from '../../components/v3/UfTabs.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import UfStatRow from '../../components/v3/UfStatRow.vue'
import UfRoundsLine from '../../components/v3/UfRoundsLine.vue'
import RankJourney from '../../components/v3/progress/RankJourney.vue'
import { rankForecast, valorantDivisionName } from '../../lib/ideas/rank-forecast'
import RecurringHabitsV3 from '../../components/v3/progress/RecurringHabitsV3.vue'
import { rankHistoryInRange, formatMetric, halfDelta, metricLabel, sparkline, type RankSnapshot } from '../../components/v3/progress/progress-chart'
import type { FocusResponse } from '../../lib/focus'
import GameProgress from '../../components/v3/games/GameProgress.vue'
import type { DemoGame } from '../../components/v3/games/game-data'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { readCache, writeCache } from '../../lib/stale-cache'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'

type RangeValue = '7d' | '30d' | '90d' | 'all'
interface Row { name: string; games: number; wins: number; wr: number; kda: string; roundWr: string }

const props = defineProps<{
  loading: boolean
  refreshing?: boolean
  refreshFailed?: boolean
  range: RangeValue
  ranges: Array<{ label: string; value: RangeValue }>
  gameCount: number
  isValorant: boolean
  rankHistory: RankSnapshot[]
  winRate: number
  avgScore: number | null
  avgKda: string
  avgHs: number | null
  deltas: { winRate: number | null; score: number | null; kda: number | null; hs: number | null }
  recentForm: string[]
  agentRows: Row[]
  mapRows: Row[]
}>()
const emit = defineEmits<{ 'update:range': [RangeValue]; retry: [] }>()
/** Sections that replaced a skeleton fade in once; cached data draws without animation. */
const fromSkeleton = props.loading
const { primaryGame } = usePrimaryGame()
const demoGame = computed<DemoGame | null>(() => (props.isValorant ? null : primaryGame.value === 'valorant' ? null : primaryGame.value))
/** Analysed-match tables: Valorant has agents + maps; other games get their own word for the character table. */
const tables = computed(() => {
  if (!demoGame.value) return [{ title: 'Agents', rows: props.agentRows }, { title: 'Maps', rows: props.mapRows }]
  if (demoGame.value === 'cs2') return [{ title: 'Maps', rows: props.mapRows }]
  return [{ title: demoGame.value === 'lol' ? 'Champions' : 'Heroes', rows: props.agentRows }]
})
const rangeItems = computed(() => props.ranges.map(r => ({ key: r.value, label: r.label })))
function setRange(key: string) {
  const match = props.ranges.find(r => r.value === key)
  if (match) emit('update:range', match.value)
}

// Shares the focus cache with Home, so the focus column draws at once on repeat visits.
const cachedFocus = readCache<FocusResponse>('focus')?.value
const focusData = ref<FocusResponse | null>(cachedFocus?.success ? cachedFocus : null)
async function loadFocus() {
  const res = (await window.api?.app?.getFocus?.().catch(() => null)) ?? null
  if (res?.success) { focusData.value = res; writeCache('focus', res) }
  else if (!focusData.value) focusData.value = res
}
let offFocus: (() => void) | null = null
onMounted(() => {
  void loadFocus()
  offFocus = window.api?.app?.onFocusUpdated?.(() => { void loadFocus() }) ?? null
})
onUnmounted(() => offFocus?.())

const focus = computed(() => focusData.value?.focus ?? null)

/** Habit trends: every metric with ≥2 values in the focus history. Only the focus metric gets good/bad colour (its direction is known). */
const habits = computed(() => {
  const hist = focusData.value?.history ?? []
  const keys = new Set<string>()
  for (const h of hist) for (const k of Object.keys(h.metrics ?? {})) keys.add(k)
  const out: Array<{ key: string; label: string; spark: string; first: string; last: string; tone: string | null }> = []
  for (const key of keys) {
    const vals = hist.map(h => h.metrics?.[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const d = halfDelta(vals)
    if (!d) continue
    let tone: string | null = null
    if (focus.value?.metric === key) {
      const better = focus.value.better === 'lower' ? d.last < d.first : d.last > d.first
      tone = d.last === d.first ? null : better ? 'var(--uf-win)' : 'var(--uf-loss)'
    }
    out.push({
      key,
      label: focus.value?.metric === key ? focus.value.label : metricLabel(key),
      spark: sparkline(vals, 150, 34),
      first: formatMetric(key, d.first),
      last: formatMetric(key, d.last),
      tone,
    })
  }
  return out.sort((a, b) => (a.key === focus.value?.metric ? -1 : b.key === focus.value?.metric ? 1 : 0)).slice(0, 5)
})

const focusStatus = computed(() => {
  const f = focus.value
  if (!f) return ''
  const s = f.progress.status
  if (s === 'achieved') return 'Locked in'
  if (s === 'missed') return 'Missed — the coach will suggest the next one'
  return `Game ${Math.min(f.progress.games_played + 1, f.progress.games_required)} of ${f.progress.games_required} · ${f.progress.hits} hit${f.progress.hits === 1 ? '' : 's'}`
})
const focusSlots = computed(() => {
  const f = focus.value
  if (!f) return []
  return Array.from({ length: f.progress.games_required }, (_, i) => f.checks[i] ? (f.checks[i].hit ? 'hit' : 'miss') : 'pending')
})

const delta = (v: number | null, suffix = '') => (v == null || Math.abs(v) < 0.05 ? 'Steady' : `${v > 0 ? 'Up' : 'Down'} ${Math.abs(Math.abs(v) >= 10 ? Math.round(v) : Number(v.toFixed(1)))}${suffix}`)
const stats = computed(() => [
  { value: props.gameCount ? `${props.winRate}%` : '—', caption: 'Win rate', sub: delta(props.deltas.winRate, '%') },
  { value: props.avgScore != null ? String(props.avgScore) : '—', caption: 'Coach score', sub: delta(props.deltas.score) },
  { value: props.avgKda, caption: 'K/D', sub: delta(props.deltas.kda) },
  { value: props.avgHs != null ? `${props.avgHs}%` : '—', caption: 'Headshots', sub: delta(props.deltas.hs, '%') },
])
const form = computed(() => [...props.recentForm].reverse().filter(r => r !== '-').map(r => ({ won: r === 'W' })))
const hasRank = computed(() => props.rankHistory.filter(h => Number.isFinite(h.elo) && h.elo > 0).length >= 2)
// The rank line follows the range tabs; with too few rank games in the range it shows the whole history and says so.
const rankInRange = computed(() => rankHistoryInRange(props.rankHistory, props.range))
const rankForChart = computed(() => rankInRange.value ?? props.rankHistory)
// Rank pace (P6): only with ≥20 rank updates over ≥14 days and a clearly upward trend; whole history.
const forecastSource = computed(() => props.rankHistory
  .map(h => ({ t: new Date(h.date).getTime(), value: h.elo }))
  .filter(p => Number.isFinite(p.t) && Number.isFinite(p.value) && p.value > 0))
const forecastPoints = computed(() => forecastSource.value.length)
const forecast = computed(() => rankForecast(forecastSource.value, 100, valorantDivisionName))
</script>

<template>
  <div class="pv3" :class="{ 'uf-refreshing': refreshing }">
    <header class="pv3-head uf-rise">
      <div class="pv3-headl">
        <span class="uf-label">Progress</span>
        <UfSkeleton v-if="loading" :w="150" :h="14" />
        <span v-else class="uf-t4">{{ gameCount }} game{{ gameCount === 1 ? '' : 's' }} in this range</span>
      </div>
      <UfTabs :items="rangeItems" :model-value="range" size="filter" label="Range" @update:model-value="setRange" />
    </header>

    <p v-if="refreshFailed && !loading" class="uf-t4 pv3-stale" role="status">
      Couldn't refresh · showing your last data
      <button type="button" class="uf-link" @click="emit('retry')">Retry</button>
    </p>

    <div v-if="loading" class="pv3-skel" role="status" aria-label="Loading your progress">
      <div class="pv3-skel-head"><UfSkeleton :w="52" :h="52" /><UfSkeleton :w="280" :h="40" /></div>
      <UfSkeleton :w="'min(760px, 100%)'" :h="30" />
      <UfSkeleton :h="'clamp(160px, 23cqw, 260px)'" />
      <div class="pv3-cols"><UfSkeleton :lines="4" /><UfSkeleton :lines="3" /></div>
      <div class="pv3-skel-row"><UfSkeleton v-for="i in 4" :key="i" :h="64" /></div>
    </div>

    <template v-else>
      <div :class="{ 'uf-reveal': fromSkeleton }" class="pv3-loaded">
      <GameProgress v-if="demoGame" :key="demoGame" :game="demoGame" />
      <template v-else-if="isValorant && hasRank">
        <RankJourney :history="rankForChart" :focus-started-at="focus?.started_at" :focus-label="focus?.label" />
        <p v-if="forecast" class="uf-t4 pv3-forecast" :title="'Based on the trend of your last ' + forecastPoints + ' rank updates. A range, not a promise.'">{{ forecast.sentence }}</p>
      </template>
      <section v-else class="pv3-empty">
        <span class="uf-d2">Your rank line</span>
        <p class="uf-t2">Not enough rank history yet. Play a few ranked games and your rating line starts here.</p>
      </section>
      <p v-if="isValorant && hasRank && !rankInRange" class="uf-t4 pv3-note">Not enough ranked games in this range, so the rank line shows your whole rank history.</p>

      <div v-if="!demoGame" class="uf-hair" />

      <div v-if="!demoGame" class="pv3-cols">
        <section class="pv3-col">
          <span class="uf-label">Habits that moved · first half vs second half</span>
          <template v-if="habits.length">
            <div v-for="h in habits" :key="h.key" class="pv3-habit">
              <span class="uf-t3">{{ h.label }}</span>
              <svg width="150" height="34" viewBox="0 0 150 34" aria-hidden="true"><polyline :points="h.spark" fill="none" :stroke="h.tone ?? 'rgba(236,232,225,0.55)'" stroke-width="2" /></svg>
              <span class="pv3-habit-vals"><span class="uf-t4">{{ h.first }}</span><span class="uf-t4">→</span><span class="uf-d4" :style="h.tone ? { color: h.tone } : undefined">{{ h.last }}</span></span>
            </div>
          </template>
          <p v-else class="uf-t2">Habit trends appear after a few matches are checked by your coach.</p>
        </section>
        <section class="pv3-col pv3-col--side">
          <span class="uf-label">Your focus</span>
          <template v-if="focus">
            <span class="uf-d2">{{ focus.label }}</span>
            <div class="pv3-slots" aria-label="Focus games">
              <span v-for="(s, i) in focusSlots" :key="i" class="pv3-slot" :class="`is-${s}`"><span class="uf-fill" /></span>
            </div>
            <span class="uf-t4" style="color: var(--uf-muted)">{{ focusStatus }}</span>
          </template>
          <p v-else class="uf-t2">No focus yet. Your coach sets one from your recent matches.</p>
        </section>
      </div>

      <div v-if="!demoGame" class="uf-hair" />
      <RecurringHabitsV3 v-if="!demoGame" />

      <div class="uf-hair" />

      <section class="pv3-block">
        <span class="uf-label">{{ demoGame ? 'Analysed in UpForge' : 'Your matches' }}</span>
        <p v-if="!gameCount" class="uf-t2" style="margin: 0">No analysed matches in this range yet. Pick a longer range or play a match with recording on.</p>
        <UfStatRow v-else :items="stats" />
        <div v-if="form.length >= 2" class="pv3-form">
          <span class="uf-t4">Last {{ form.length }} results, oldest first</span>
          <UfRoundsLine :rounds="form" :half-at="999" :height="26" />
        </div>
      </section>

      <div v-if="gameCount" class="pv3-cols">
        <section v-for="t in tables" :key="t.title" class="pv3-col">
          <span class="uf-label">{{ t.title }} · win rate</span>
          <template v-if="t.rows.length">
            <div class="pv3-row pv3-row--head uf-t4"><span>Name</span><span>Games</span><span>Won</span><span>K/D</span></div>
            <div v-for="r in t.rows" :key="r.name" class="pv3-row">
              <span class="uf-t3">{{ r.name }}</span>
              <span class="uf-t4 uf-num">{{ r.games }}</span>
              <span class="pv3-bar"><span class="uf-fill" :style="{ width: `${r.wr}%`, background: r.wr >= 50 ? 'var(--uf-win)' : 'var(--uf-loss)' }" /><b class="uf-d4">{{ r.wr }}%</b></span>
              <span class="uf-t4 uf-num">{{ r.kda }}</span>
            </div>
            <span v-if="t.rows.every(r => r.games < 5)" class="uf-t4">Fewer than 5 games each is an early read.</span>
          </template>
          <p v-else class="uf-t2">No {{ t.title.toLowerCase() }} in this range yet.</p>
        </section>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pv3 { container-type: inline-size; height: 100%; overflow-y: auto; box-sizing: border-box; padding: 28px 40px 40px; display: flex; flex-direction: column; gap: 26px; }
.pv3-loaded { display: flex; flex-direction: column; gap: 26px; }
.pv3-stale { margin: -12px 0 0; display: flex; gap: 10px; align-items: baseline; }
.pv3-skel { display: flex; flex-direction: column; gap: 26px; }
.pv3-skel-head { display: flex; gap: 16px; align-items: center; }
.pv3-skel-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.pv3-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.pv3-headl { display: flex; flex-direction: column; gap: 6px; }
.pv3-empty { display: flex; flex-direction: column; gap: 10px; }
.pv3-empty p { margin: 0; max-width: 720px; }
.pv3-note { margin: -12px 0 0; }
.pv3-cols { display: grid; grid-template-columns: 1.5fr 1fr; gap: 40px; }
.pv3-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pv3-col p { margin: 0; }
.pv3-col--side { border-left: 1px solid var(--uf-line); padding-left: 32px; }
.pv3-habit { display: grid; grid-template-columns: 1.2fr 160px 0.9fr; gap: 16px; align-items: center; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.pv3-habit-vals { display: flex; gap: 10px; align-items: baseline; justify-content: flex-end; }
.pv3-slots { display: flex; gap: 4px; }
.pv3-slot { flex: 1; height: 4px; background: rgba(236, 232, 225, 0.12); }
.pv3-slot > span { display: block; height: 4px; }
.pv3-slot.is-hit > span { background: var(--uf-win); }
.pv3-slot.is-miss > span { background: var(--uf-loss); }
.pv3-block { display: flex; flex-direction: column; gap: 18px; }
.pv3-form { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
.pv3-row { display: grid; grid-template-columns: 1.3fr 0.5fr 1.4fr 0.5fr; gap: 16px; align-items: center; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.pv3-row--head { border-top: 0; padding: 0 0 4px; }
.pv3-bar { position: relative; height: 24px; display: flex; align-items: center; }
.pv3-bar > span { position: absolute; left: 0; top: 3px; bottom: 3px; opacity: 0.25; }
.pv3-bar > b { position: relative; padding-left: 8px; }
.pv3-forecast { margin: 8px 0 0; color: var(--uf-muted); }
</style>
