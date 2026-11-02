<script setup lang="ts">
/**
 * "Your plan": the active 10-week roadmap's current week (GET /api/goals/current, read-only).
 * No roadmap → one quiet line, never an upsell. Goals are ticked on upforge.gg.
 */
import { computed } from 'vue'
import { useStaleLoad } from '../../../lib/stale-cache'
import { openWebFeature } from '../../../lib/web-explore-links'
import UfSkeleton from '../UfSkeleton.vue'
import UfIcon from '../UfIcon.vue'
import type { WeeklyPlan } from '../../../../electron/main/ipc/progress-plan-ipc'

/** Older preloads lack the channel: treat that as "no data", not an error. */
const { data, loading, refreshing, error, reload } = useStaleLoad<{ plan: WeeklyPlan | null } | null>('progress:weekly-plan', async () => {
  const fn = window.api?.progress?.weeklyPlan
  if (!fn) return null
  const res = await fn()
  if (!res.ok) throw new Error(res.error)
  return { plan: res.plan }
})
const plan = computed(() => data.value?.plan ?? null)
const done = computed(() => plan.value?.goals.filter(g => g.done).length ?? 0)
const weeks = computed(() => {
  const p = plan.value
  if (!p) return []
  return Array.from({ length: p.totalWeeks }, (_, i) => (i + 1 < p.week ? 'done' : i + 1 === p.week ? 'now' : 'next'))
})
const openRoadmap = () => void openWebFeature('/improvement-roadmap')
</script>

<template>
  <div v-if="loading || data || error" class="uf-hair" />
  <section v-if="loading || data || error" class="yp3" :class="{ 'uf-refreshing': refreshing }" aria-labelledby="yp3-h">
    <div class="yp3-head">
      <span id="yp3-h" class="uf-label">Your plan<template v-if="plan"> · week {{ plan.week }} of {{ plan.totalWeeks }}</template></span>
      <button v-if="plan" type="button" class="uf-link uf-t4" @click="openRoadmap">Full roadmap on upforge.gg →</button>
    </div>

    <div v-if="loading" aria-hidden="true" class="yp3-body">
      <UfSkeleton :w="260" :h="18" /><UfSkeleton :h="4" /><UfSkeleton :lines="2" />
    </div>

    <div v-else-if="plan" class="yp3-body uf-reveal">
      <div class="yp3-weeks" :aria-label="`Week ${plan.week} of ${plan.totalWeeks}`" role="img">
        <span v-for="(w, i) in weeks" :key="i" class="yp3-week" :class="`is-${w}`" />
      </div>
      <span v-if="plan.focusTopic" class="uf-t3">This week: {{ plan.focusTopic }}</span>
      <span v-if="plan.whyItMatters" class="uf-t4 yp3-why">{{ plan.whyItMatters }}</span>
      <template v-if="plan.goals.length">
        <span class="uf-t4">{{ done }} of {{ plan.goals.length }} goals done this week</span>
        <ul class="yp3-goals">
          <li v-for="(g, i) in plan.goals" :key="i" class="yp3-goal" :class="{ 'is-done': g.done }">
            <span class="yp3-mark" aria-hidden="true"><UfIcon v-if="g.done" name="check" :size="12" /></span>
            <span class="uf-t3">{{ g.text }}</span>
            <span class="sr-only">{{ g.done ? 'done' : 'not done' }}</span>
          </li>
        </ul>
      </template>
      <span v-else class="uf-t4">No goals set for this week yet.</span>
    </div>

    <p v-else-if="error && !data" class="uf-t4 yp3-quiet">
      Couldn't load your roadmap. <button type="button" class="uf-link" @click="reload">Retry</button>
    </p>
    <p v-else class="uf-t4 yp3-quiet">
      No 10-week roadmap running. <button type="button" class="uf-link" @click="openRoadmap">Roadmap on upforge.gg →</button>
    </p>
  </section>
</template>

<style scoped>
.yp3 { display: flex; flex-direction: column; gap: 10px; }
.yp3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.yp3-body { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }
.yp3-weeks { display: flex; gap: 4px; }
.yp3-week { flex: 1; height: 4px; background: rgba(236, 232, 225, 0.12); }
.yp3-week.is-done { background: var(--uf-bone); opacity: 0.55; }
.yp3-week.is-now { background: var(--uf-red); }
.yp3-why { color: var(--uf-muted); }
.yp3-goals { list-style: none; margin: 0; padding: 0; }
.yp3-goal { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.yp3-goal.is-done .uf-t3 { color: var(--uf-muted); }
.yp3-mark { width: 14px; height: 14px; border: 1px solid var(--uf-line); display: inline-flex; align-items: center; justify-content: center; color: var(--uf-win); }
.yp3-quiet { margin: 0; display: flex; gap: 10px; align-items: baseline; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
