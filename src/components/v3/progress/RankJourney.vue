<script setup lang="ts">
/**
 * Rank journey: ELO line + trend fill, an up/down ring at every rank change, a rank badge at the start,
 * the first time each rank is reached and the end, focus start marker. A legend under the chart explains
 * the rings and the focus line (no text inside the plot, so labels never sit on marks). Real data only.
 */
import { computed } from 'vue'
import { getRankIconUrl } from '../../../lib/valorant'
import { badgeIndexes, chartGeometry, eloDelta, eloSeries, rankChanges, spacedByX, type RankSnapshot } from './progress-chart'

const props = defineProps<{ history: RankSnapshot[]; focusStartedAt?: string | null; focusLabel?: string | null }>()

const W = 1100
const H = 260
const box = { width: W, height: H, padX: 56, padTop: 28, padBottom: 30 }

const series = computed(() => eloSeries(props.history))
const geo = computed(() => chartGeometry(series.value, box))
const delta = computed(() => eloDelta(series.value))
const rising = computed(() => (delta.value ?? 0) >= 0)
const lineColor = computed(() => (rising.value ? 'var(--uf-win)' : 'var(--uf-loss)'))
const first = computed(() => series.value[0] ?? null)
const last = computed(() => series.value[series.value.length - 1] ?? null)
// Every change keeps its ring; badges only where a rank is first reached (and the start/end), thinned so they never overlap.
const changes = computed(() => rankChanges(series.value).map(c => ({ ...c, point: geo.value?.points[c.index] })))
const badges = computed(() => {
  const g = geo.value
  if (!g) return []
  const picked = badgeIndexes(series.value).map(index => ({ index, x: g.points[index].x, y: g.points[index].y, rank: series.value[index].rank, icon: getRankIconUrl(series.value[index].rank) }))
  return spacedByX(picked.filter(b => b.icon), 44)
})
const hasUp = computed(() => changes.value.some(c => c.up))
const hasDown = computed(() => changes.value.some(c => !c.up))
const firstIcon = computed(() => getRankIconUrl(first.value?.rank))
const lastIcon = computed(() => getRankIconUrl(last.value?.rank))
const focusX = computed(() => {
  if (!props.focusStartedAt || !geo.value || !first.value || !last.value) return null
  const t = new Date(props.focusStartedAt).getTime()
  if (!Number.isFinite(t) || t < first.value.t || t > last.value.t) return null
  return geo.value.xAt(t)
})
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const days = computed(() => (first.value && last.value ? Math.max(1, Math.round((last.value.t - first.value.t) / 86_400_000)) : 0))
const sentence = computed(() => {
  if (delta.value == null || !first.value || !last.value) return ''
  const d = Math.abs(Math.round(delta.value))
  const span = `${days.value} day${days.value === 1 ? '' : 's'}`
  if (d === 0) return `Your rating has held steady over the last ${span}.`
  const dir = delta.value > 0 ? 'up' : 'down'
  const ranks = first.value.rank && last.value.rank && first.value.rank !== last.value.rank ? `, from ${first.value.rank} to ${last.value.rank}` : ''
  return `Your rating is ${dir} ${d} over the last ${span}${ranks}.`
})
</script>

<template>
  <section class="rj">
    <div class="rj-head uf-rise">
      <div class="rj-ranks">
        <img v-if="firstIcon" :src="firstIcon" :alt="first?.rank ?? ''" class="rj-icon rj-icon--from">
        <span v-if="firstIcon && lastIcon" class="rj-arrow">→</span>
        <img v-if="lastIcon" :src="lastIcon" :alt="last?.rank ?? ''" class="rj-icon">
        <div class="rj-title">
          <span class="uf-d2">{{ first?.rank && last?.rank && first.rank !== last.rank ? `${first.rank} → ${last.rank}` : (last?.rank ?? 'Your rating') }}</span>
          <span class="uf-t4">Rank rating · last {{ days }} day{{ days === 1 ? '' : 's' }}</span>
        </div>
      </div>
      <div v-if="delta != null" class="rj-delta">
        <span class="uf-d3" :style="{ color: lineColor }">{{ delta > 0 ? '+' : '' }}{{ Math.round(delta) }}</span>
        <span class="uf-t4">rating</span>
      </div>
    </div>
    <p v-if="sentence" class="uf-t1 rj-sentence uf-rise uf-d1s">{{ sentence }}</p>
    <svg v-if="geo" class="rj-chart uf-rise uf-d2s" :viewBox="`0 0 ${W} ${H}`" role="img"
      :aria-label="`Rank rating from ${first?.elo} to ${last?.elo}`">
      <defs>
        <linearGradient id="rj-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :style="{ stopColor: (rising ? 'var(--uf-win)' : 'var(--uf-loss)'), stopOpacity: 0.3 }" />
          <stop offset="1" :style="{ stopColor: (rising ? 'var(--uf-win)' : 'var(--uf-loss)'), stopOpacity: 0 }" />
        </linearGradient>
      </defs>
      <line :x1="box.padX" :x2="W - box.padX" :y1="H - box.padBottom" :y2="H - box.padBottom" style="stroke: var(--uf-line)" />
      <path :d="geo.area" fill="url(#rj-fill)" />
      <template v-if="focusX != null">
        <line :x1="focusX" :x2="focusX" :y1="box.padTop" :y2="H - box.padBottom" style="stroke: var(--uf-red); stroke-opacity: 0.55" stroke-dasharray="3 4" />
      </template>
      <path :d="geo.line" fill="none" :style="{ stroke: (rising ? 'var(--uf-win)' : 'var(--uf-loss)') }" stroke-width="3" stroke-linejoin="round" />
      <template v-for="c in changes" :key="c.index">
        <circle v-if="c.point" :cx="c.point.x" :cy="c.point.y" r="7" :style="{ fill: 'var(--uf-bg)', stroke: c.up ? 'var(--uf-win)' : 'var(--uf-loss)' }" stroke-width="3" />
      </template>
      <image v-for="b in badges" :key="`b${b.index}`" :href="b.icon!" :x="b.x - 16" :y="Math.max(0, b.y - 48)" width="32" height="32"><title>{{ b.rank }}</title></image>
      <circle :cx="geo.points[geo.points.length - 1].x" :cy="geo.points[geo.points.length - 1].y" r="5" :style="{ fill: (rising ? 'var(--uf-win)' : 'var(--uf-loss)') }" />
      <text v-if="first" :x="box.padX" :y="H - 8" style="fill: var(--uf-faint); font: 12px var(--uf-body)">{{ fmtDate(first.t) }}</text>
      <text v-if="last" :x="W - box.padX" :y="H - 8" style="fill: var(--uf-faint); font: 12px var(--uf-body)" text-anchor="end">{{ fmtDate(last.t) }}</text>
    </svg>
    <div v-if="geo && (hasUp || hasDown || focusX != null)" class="rj-legend uf-t4">
      <span v-if="hasUp" class="rj-key"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" style="fill: var(--uf-bg); stroke: var(--uf-win)" stroke-width="2.5" /></svg>Ranked up</span>
      <span v-if="hasDown" class="rj-key"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" style="fill: var(--uf-bg); stroke: var(--uf-loss)" stroke-width="2.5" /></svg>Ranked down</span>
      <span v-if="focusX != null" class="rj-key"><svg width="14" height="14" aria-hidden="true"><line x1="7" x2="7" y1="0" y2="14" style="stroke: var(--uf-red)" stroke-width="2" stroke-dasharray="3 3" /></svg>Focus started<template v-if="focusLabel">: {{ focusLabel }}</template></span>
    </div>
  </section>
</template>

<style scoped>
.rj { display: flex; flex-direction: column; gap: 16px; }
.rj-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
.rj-ranks { display: flex; align-items: center; gap: 12px; }
.rj-icon { width: 52px; height: 52px; }
.rj-icon--from { width: 40px; height: 40px; opacity: 0.8; }
.rj-arrow { color: var(--uf-faint); font: 600 15px/1 var(--uf-body); }
.rj-title { display: flex; flex-direction: column; gap: 6px; }
.rj-delta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.rj-sentence { margin: 0; max-width: 820px; }
.rj-chart { width: 100%; height: auto; display: block; }
.rj-legend { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: -6px; }
.rj-key { display: inline-flex; align-items: center; gap: 8px; }
</style>
