<script setup lang="ts">
import UfSkeleton from '../UfSkeleton.vue'
/**
 * UI v3 Practice → Analytics tab. Presentational only: TrainingHubView passes the real training-API
 * history, benchmark and achievements in and owns the "share week" export.
 * Hero = skill shape from personal bests; then one row per drill with trend, last runs and benchmark inline.
 */
import { computed } from 'vue'
import UfButton from '../UfButton.vue'
import { scenarioIconUrl } from '../../../lib/training-icons'
import type { TrainingBenchmark, TrainingHistory } from '../../../env.d.ts'
import { benchmarkMeta, benchmarkVisible, pct, recentScores, toneColor, trendSummary } from './practice-session-v3'

export interface AnalyticsRadar {
  scores: number[]
  dataPath: string
  outerPath: string
  gridPaths: string[]
  axisLines: Array<{ x1: number; y1: number; x2: number; y2: number }>
  labels: Array<{ x: number; y: number; text: string }>
  dataVertices: Array<{ x: number; y: number }>
  hasData: boolean
}

export interface AnalyticsAchievement {
  id: string
  name: string
  description: string
  icon: string
  secret?: boolean
  unlocked: boolean
  date: string
}

const props = defineProps<{
  loading: boolean
  history: TrainingHistory | null
  benchmark: TrainingBenchmark | null
  drills: Array<{ key: string; label: string; description: string }>
  radarKeys: readonly string[]
  radar: AnalyticsRadar
  sparkline: (scenario: string) => string
  insights: string[]
  achievements: AnalyticsAchievement[]
  weekCount: number
  weekExporting: boolean
  weekDone: boolean
}>()

const emit = defineEmits<{ 'share-week': [] }>()

const hasHistory = computed(() => !!props.history && !!props.history.total)
const unlocked = computed(() => props.achievements.filter(a => a.unlocked).length)
const rows = computed(() => props.drills.map(d => {
  const stats = props.history?.by_scenario?.[d.key]
  const bench = props.benchmark?.[d.key]
  return {
    ...d,
    best: stats?.best_score ?? null,
    trend: trendSummary(stats?.trend ?? null),
    recent: recentScores(stats?.sessions),
    spark: props.sparkline(d.key),
    bench: benchmarkVisible(bench) ? bench : null,
  }
}))
const radarLabel = (k: string) => props.drills.find(d => d.key === k)?.label ?? k
</script>

<template>
  <div class="uf-an">
    <div class="uf-an-main">
      <!-- Hero: skill shape from personal bests -->
      <section class="uf-an-hero uf-rise">
        <div class="uf-an-hero-head">
          <span class="uf-label">Skill shape · personal bests</span>
          <UfButton
            variant="secondary"
            :icon="weekDone ? 'check' : 'share'"
            :disabled="weekExporting || weekCount === 0"
            @click="emit('share-week')"
          >{{ weekExporting ? 'Saving…' : weekDone ? 'Saved' : 'Share this week' }}</UfButton>
        </div>
        <div class="uf-an-radar">
          <svg width="220" height="220" viewBox="-10 -10 160 160" role="img" :aria-label="radar.hasData ? 'Skill shape from your personal bests' : 'Skill shape, no scores yet'">
            <path v-for="(gp, gi) in radar.gridPaths" :key="gi" :d="gp" fill="none" stroke="var(--uf-line)" stroke-width="0.75" />
            <line v-for="(ax, ai) in radar.axisLines" :key="ai" :x1="ax.x1" :y1="ax.y1" :x2="ax.x2" :y2="ax.y2" stroke="var(--uf-line)" stroke-width="0.75" />
            <path :d="radar.outerPath" fill="none" stroke="var(--uf-line-2)" stroke-width="1" />
            <path v-if="radar.hasData" :d="radar.dataPath" fill="rgba(255,70,85,0.12)" stroke="var(--uf-red)" stroke-width="1.5" stroke-linejoin="round" />
            <circle v-for="(v, vi) in radar.dataVertices" :key="vi" :cx="v.x" :cy="v.y" :r="radar.scores[vi] > 0 ? 2.5 : 0" fill="var(--uf-bone)" />
            <text
              v-for="(lbl, li) in radar.labels" :key="li" :x="lbl.x" :y="lbl.y" fill="var(--uf-muted)"
              font-size="8" font-weight="600" text-anchor="middle" dominant-baseline="middle"
            >{{ lbl.text }}</text>
          </svg>
          <dl class="uf-an-bests">
            <div v-for="(k, i) in radarKeys" :key="k">
              <dt class="uf-t4">{{ radarLabel(k) }}</dt>
              <dd class="uf-d3" :style="radar.scores[i] > 0 ? undefined : 'color: var(--uf-faint)'">{{ radar.scores[i] > 0 ? radar.scores[i] : '—' }}</dd>
            </div>
          </dl>
        </div>
        <p v-if="!radar.hasData" class="uf-t2" style="margin: 0">No scores yet. Finish a drill and your shape starts here.</p>
      </section>

      <!-- By drill -->
      <section class="uf-rise uf-d2s">
        <span class="uf-label">By drill</span>
        <ul v-if="loading" class="uf-an-rows" aria-busy="true" aria-label="Loading history">
          <li v-for="i in 5" :key="i">
            <div class="uf-an-row">
              <UfSkeleton :w="32" :h="32" />
              <span class="uf-an-name"><UfSkeleton w="40%" :h="15" /><UfSkeleton w="62%" :h="13" /></span>
            </div>
          </li>
        </ul>
        <p v-else-if="!hasHistory" class="uf-t2" style="margin: 12px 0 0">No training history yet. Play a few drills to see your progress.</p>
        <ul v-else class="uf-an-rows">
          <li v-for="r in rows" :key="r.key">
            <div class="uf-an-row">
              <img :src="scenarioIconUrl(r.key)" alt="" class="uf-an-icon">
              <span class="uf-an-name">
                <span class="uf-t3">{{ r.label }}</span>
                <span class="uf-t4">{{ r.description }}</span>
              </span>
              <span class="uf-t4 uf-an-trend" :style="{ color: toneColor(r.trend?.tone) }">{{ r.trend?.text ?? '' }}</span>
              <span class="uf-an-runs" :aria-label="r.recent.length ? `Last ${r.recent.length} scores: ${r.recent.join(', ')}` : 'No runs yet'">
                <span v-for="(sc, si) in r.recent" :key="si" class="uf-grow" :style="{ height: Math.max(2, pct(sc) * 0.28) + 'px' }" :title="String(sc)" />
                <span v-if="!r.recent.length" class="uf-t4">No runs</span>
              </span>
              <svg v-if="r.spark" width="80" height="28" class="uf-an-spark" aria-hidden="true">
                <path :d="r.spark" fill="none" stroke="var(--uf-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="uf-an-best">
                <span class="uf-d4" :style="r.best == null ? 'color: var(--uf-faint)' : undefined">{{ r.best ?? '—' }}</span>
                <span class="uf-t4">best</span>
              </span>
            </div>
            <div v-if="r.bench" class="uf-an-bench">
              <span class="uf-t4" style="width: 96px">vs all players</span>
              <span class="uf-an-benchbar" :title="`You ${r.bench.user_best ?? '—'} · average ${r.bench.global_avg ?? '—'}`">
                <span class="you uf-fill" :style="{ width: pct(r.bench.user_best) + '%' }" />
                <span class="avg" :style="{ left: pct(r.bench.global_avg) + '%' }" />
              </span>
              <span class="uf-t4 uf-num">You <b>{{ r.bench.user_best ?? '—' }}</b> · avg {{ r.bench.global_avg ?? '—' }}</span>
              <span v-if="r.bench.label" class="uf-t4" style="color: var(--uf-bone)">{{ r.bench.label }}</span>
              <span class="uf-t4" style="margin-left: auto">{{ benchmarkMeta(r.bench) }}</span>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <aside class="uf-an-aside uf-rise uf-d3s">
      <section v-if="insights.length" class="uf-an-block">
        <span class="uf-label">Training insights</span>
        <p v-for="(line, i) in insights" :key="i" class="uf-t4" style="margin: 0; color: var(--uf-bone); line-height: 1.5">{{ line }}</p>
      </section>
      <div v-if="insights.length" class="uf-hair" />
      <section class="uf-an-block">
        <span class="uf-label">Achievements · {{ unlocked }} of {{ achievements.length }}</span>
        <ul class="uf-an-ach">
          <li
            v-for="a in achievements" :key="a.id"
            :class="{ locked: !a.unlocked }"
            :title="a.unlocked ? a.description : a.secret ? 'Secret achievement' : a.description"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- static SVG icons from useAchievements -->
            <span class="uf-an-ach-icon" v-html="a.icon" />
            <span class="uf-an-ach-text">
              <span class="uf-t3">{{ a.secret && !a.unlocked ? 'Secret' : a.name }}</span>
              <span class="uf-t4">{{ a.unlocked ? a.date : a.secret ? 'Keep training to reveal it' : a.description }}</span>
            </span>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.uf-an { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 36px; align-items: start; padding: 14px 12px 32px; }
.uf-an-main { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
.uf-an-hero { display: flex; flex-direction: column; gap: 14px; }
.uf-an-hero-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.uf-an-radar { display: flex; align-items: center; gap: 40px; flex-wrap: wrap; }
.uf-an-bests { display: flex; gap: 28px; margin: 0; flex-wrap: wrap; }
.uf-an-bests > div { display: flex; flex-direction: column-reverse; gap: 4px; }
.uf-an-bests dd { margin: 0; }
.uf-an-rows { list-style: none; margin: 10px 0 0; padding: 0; }
.uf-an-rows > li { border-top: 1px solid var(--uf-line); padding: 12px 0; display: flex; flex-direction: column; gap: 10px; }
.uf-an-row { display: flex; align-items: center; gap: 18px; }
.uf-an-icon { width: 36px; height: 36px; flex: none; }
.uf-an-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.uf-an-trend { width: 96px; text-align: right; flex: none; }
.uf-an-runs { width: 104px; height: 28px; flex: none; display: flex; align-items: flex-end; gap: 3px; }
.uf-an-runs > span:not(.uf-t4) { flex: 1; background: var(--uf-line-2); }
.uf-an-runs > span:last-child:not(.uf-t4) { background: var(--uf-bone); }
.uf-an-spark { flex: none; overflow: visible; }
.uf-an-best { width: 56px; flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.uf-an-bench { display: flex; align-items: center; gap: 14px; padding-left: 54px; flex-wrap: wrap; }
.uf-an-bench b { color: var(--uf-bone); font-weight: 600; }
.uf-an-benchbar { position: relative; width: 160px; height: 3px; background: var(--uf-line); flex: none; }
.uf-an-benchbar .you { position: absolute; left: 0; top: 0; bottom: 0; background: var(--uf-bone); }
.uf-an-benchbar .avg { position: absolute; top: -4px; width: 1px; height: 11px; background: var(--uf-muted); }
.uf-an-aside { display: flex; flex-direction: column; gap: 18px; padding-left: 28px; border-left: 1px solid var(--uf-line); align-self: stretch; }
.uf-an-block { display: flex; flex-direction: column; gap: 10px; }
.uf-an-ach { list-style: none; margin: 0; padding: 0; }
.uf-an-ach li { display: flex; gap: 12px; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--uf-line); }
.uf-an-ach li.locked { opacity: 0.45; }
.uf-an-ach-icon { color: var(--uf-bone); display: inline-flex; flex: none; padding-top: 1px; }
.uf-an-ach-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
@media (max-width: 1100px) {
  .uf-an { grid-template-columns: minmax(0, 1fr); }
  .uf-an-aside { border-left: 0; padding-left: 0; border-top: 1px solid var(--uf-line); padding-top: 18px; }
}
</style>
