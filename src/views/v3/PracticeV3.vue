<script setup lang="ts">
import { plural } from '../../lib/plural'
/**
 * UI v3 Practice (board 23). Presentational only: TrainingHubView owns all state and behaviour
 * (launching drills, guided sessions, results) and passes real training-API data in.
 * Renders the header + tabs for every tab, and the Train body; other tab bodies stay in the view.
 */
import UfTabs from '../../components/v3/UfTabs.vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import UfButton from '../../components/v3/UfButton.vue'
import PracticeDrillTile from '../../components/v3/practice/PracticeDrillTile.vue'
import { scenarioIconUrl, TRAINING_ARTWORK } from '../../lib/training-icons'
import {
  PRACTICE_TABS,
  practiceStatItems,
  practiceTitle,
  sessionMinutes,
  showRecommended,
  type PracticeCategory,
  type PracticeStats,
  type PracticeTab,
} from '../../components/v3/practice/practice-v3'
import { focusDrillPlan } from '../../components/v3/practice/focus-drills'
import { focusBeforeAfter } from '../../lib/focus'
import { usePracticeFocus } from '../../components/v3/practice/usePracticeFocus'

export interface PracticeDrillCard {
  scenario: string
  label: string
  description: string
  difficulty: string
  durationSeconds: number
  personalBest: number | null
  globalRank: number | null
  completed: boolean
}

const props = defineProps<{
  activeTab: PracticeTab
  stats: PracticeStats
  sessionSteps: Array<{ phaseLabel: string; scenario: string; duration_seconds: number }>
  sessionFocusReason: string | null
  sessionDisabled: boolean
  recommended: Array<{ scenario: string; reason: string }>
  recommendedFromApi: boolean
  categories: Array<{ id: PracticeCategory; label: string }>
  activeCategory: PracticeCategory
  drills: PracticeDrillCard[]
  runningScenario: string | null
  busy: boolean
  daily: { scenarioLabel: string; target: number; completed: boolean }
  freePlayOptions: Array<{ key: string; label: string }>
  freePlayScenario: string
  insights: string[]
  scenarioLabel: (key: string) => string
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: PracticeTab]
  'update:activeCategory': [category: PracticeCategory]
  'update:freePlayScenario': [scenario: string]
  'start-session': []
  'play-recommended': [index: number]
  'play-drill': [scenario: string]
  'play-daily': []
  'launch-free': []
}>()

const statItems = computed(() => practiceStatItems(props.stats))
// Hide the header numbers until there is something to show (review P3-6): three zeros read as a hero.
const hasStats = computed(() => statItems.value.some(s => !['0', '—', '-', ''].includes(String(s.value).trim())))
const tabItems = PRACTICE_TABS.map(t => ({ key: t.id, label: t.label }))
const categoryItems = computed(() => props.categories.map(c => ({ key: c.id, label: c.label })))
const minutes = computed(() => sessionMinutes(props.sessionSteps))
const recommendedVisible = computed(() => showRecommended(props.recommendedFromApi, props.recommended.length))

// "Today's session, from your focus": the player's active focus mapped to drills in this catalogue.
const { focus } = usePracticeFocus(typeof window === 'undefined' ? undefined : window.api?.app)
const focusPlan = computed(() => focusDrillPlan(focus.value?.metric, props.drills.map(d => d.scenario)))
const focusProgress = computed(() => focusBeforeAfter(focus.value))
const focusDrills = computed(() => (focusPlan.value?.scenarios ?? [])
  .map(s => props.drills.find(d => d.scenario === s))
  .filter((d): d is PracticeDrillCard => !!d))
</script>

<template>
  <div class="uf-practice" :class="{ 'is-train': activeTab === 'train' }">
    <header class="uf-practice-head">
      <div class="uf-practice-titlerow uf-rise">
        <div class="uf-practice-title">
          <span class="uf-label">Training hub</span>
          <h1 class="uf-d2" style="margin: 0">{{ practiceTitle(activeTab) }}</h1>
        </div>
        <dl v-if="hasStats" class="uf-practice-stats">
          <div v-for="s in statItems" :key="s.label" class="uf-practice-stat" :title="s.title">
            <dt class="uf-t4">{{ s.label }}</dt>
            <dd class="uf-d4" :style="s.tone ? { color: s.tone === 'win' ? 'var(--uf-win)' : 'var(--uf-loss)' } : undefined">{{ s.value }}</dd>
          </div>
        </dl>
      </div>
      <UfTabs :items="tabItems" :model-value="activeTab" label="Practice sections" divider
        @update:model-value="emit('update:activeTab', $event as PracticeTab)" />
    </header>

    <div v-if="activeTab === 'train'" class="uf-practice-body">
      <!-- Hero: today's guided session (the one red action on this screen) -->
      <section class="uf-session uf-rise uf-d1s">
        <img :src="TRAINING_ARTWORK.guidedSessionHero" alt="" class="uf-session-art">
        <div class="uf-session-scrim" />
        <div v-if="focusPlan && focus" class="uf-session-body">
          <span class="uf-label">Today’s session · from your focus</span>
          <p class="uf-t1" style="margin: 0; max-width: 760px">From your focus: {{ focus.label }}</p>
          <p class="uf-t2" style="margin: 0; max-width: 620px">{{ focusPlan.caption }}</p>
          <p v-if="focusProgress" class="uf-t4" style="margin: 0">
            Before: {{ focusProgress.before }} · Since: {{ focusProgress.since }} over {{ focusProgress.games }} game{{ focusProgress.games === 1 ? '' : 's' }}
            <span :style="{ color: focusProgress.improved ? 'var(--uf-win)' : 'var(--uf-muted)' }">{{ focusProgress.improved ? '· better' : '· not yet' }}</span>
          </p>
          <div class="uf-session-row">
            <ol class="uf-session-steps">
              <li v-for="(d, i) in focusDrills" :key="d.scenario">
                <span class="uf-d4" style="color: var(--uf-faint)">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="uf-session-step-text"><span class="uf-t4">{{ d.personalBest != null ? `Best ${Math.round(d.personalBest)}` : 'Not played yet' }}</span><span class="uf-t3">{{ d.label }}</span></span>
              </li>
            </ol>
            <div class="uf-session-actions">
              <UfButton v-if="sessionSteps.length" variant="link" :disabled="sessionDisabled" @click="emit('start-session')">Guided session instead</UfButton>
              <UfButton variant="primary" icon="play" :disabled="busy || !focusDrills.length" @click="emit('play-drill', focusDrills[0].scenario)">Start with {{ focusDrills[0]?.label }}</UfButton>
            </div>
          </div>
        </div>
        <div v-else class="uf-session-body">
          <span class="uf-label">Today’s session<template v-if="minutes"> · {{ minutes }} min</template></span>
          <p v-if="sessionSteps.length" class="uf-t1" style="margin: 0; max-width: 760px">
            {{ sessionFocusReason || 'Warm up, practise your focus drill, then cool down.' }}
          </p>
          <p v-else class="uf-t2" style="margin: 0; max-width: 620px">
            Your session plan isn’t ready yet. Play any drill below and the coach builds one from your results.
          </p>
          <div v-if="sessionSteps.length" class="uf-session-row">
            <ol v-if="sessionSteps.length" class="uf-session-steps">
              <li v-for="(step, i) in sessionSteps" :key="i">
                <span class="uf-d4" style="color: var(--uf-faint)">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="uf-session-step-text"><span class="uf-t4">{{ step.phaseLabel }}</span><span class="uf-t3">{{ scenarioLabel(step.scenario) }}</span></span>
              </li>
            </ol>
            <UfButton variant="primary" icon="play" :disabled="sessionDisabled" @click="emit('start-session')">Start session</UfButton>
          </div>
        </div>
      </section>

      <div class="uf-practice-grid">
        <div class="uf-practice-main">
          <section v-if="recommendedVisible" class="uf-rise uf-d2s">
            <span class="uf-label">Recommended from your matches</span>
            <ul class="uf-reco">
              <li v-for="(r, i) in recommended" :key="`${r.scenario}:${i}`">
                <img :src="scenarioIconUrl(r.scenario)" alt="" class="uf-reco-icon">
                <span class="uf-reco-text"><span class="uf-t3">{{ scenarioLabel(r.scenario) }}</span><span class="uf-t4">{{ r.reason }}</span></span>
                <UfButton variant="link" :disabled="busy" @click="emit('play-recommended', i)">Play</UfButton>
              </li>
            </ul>
          </section>

          <section class="uf-rise uf-d3s">
            <div class="uf-library-head">
              <span class="uf-label">Drill library</span>
              <UfTabs :items="categoryItems" :model-value="activeCategory" size="filter" label="Drill categories"
                @update:model-value="emit('update:activeCategory', $event as PracticeCategory)" />
              <span class="uf-t4 uf-library-count">{{ plural(drills.length, 'drill') }}</span>
            </div>
            <div class="uf-library">
              <PracticeDrillTile v-for="d in drills" :key="d.scenario" :label="d.label" :description="d.description"
                :icon-src="scenarioIconUrl(d.scenario)" :difficulty="d.difficulty" :duration-seconds="d.durationSeconds"
                :personal-best="d.personalBest" :global-rank="d.globalRank" :completed="d.completed"
                :running="runningScenario === d.scenario" :disabled="busy" @play="emit('play-drill', d.scenario)" />
            </div>
          </section>
        </div>

        <aside class="uf-practice-aside uf-rise uf-d4s">
          <section class="uf-aside-block">
            <span class="uf-label" :style="daily.completed ? 'color: var(--uf-win)' : undefined">Daily challenge</span>
            <div class="uf-daily">
              <img :src="TRAINING_ARTWORK.dailyChallenge" alt="" class="uf-daily-icon">
              <span class="uf-t3">Score {{ daily.target }}+ · {{ daily.scenarioLabel }}</span>
            </div>
            <span v-if="daily.completed" class="uf-t4" style="color: var(--uf-win)">Done today</span>
            <UfButton v-else variant="link" :disabled="busy" @click="emit('play-daily')">Play the challenge</UfButton>
          </section>
          <div class="uf-hair" />
          <section class="uf-aside-block">
            <span class="uf-label">Quick play</span>
            <label class="uf-t4" for="uf-free-play">Drill</label>
            <select id="uf-free-play" class="uf-select" :value="freePlayScenario"
              @change="emit('update:freePlayScenario', ($event.target as HTMLSelectElement).value)">
              <option v-for="o in freePlayOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
            <UfButton variant="secondary" icon="play" :disabled="busy" @click="emit('launch-free')">Launch drill</UfButton>
          </section>
          <div class="uf-hair" />
          <section class="uf-aside-block">
            <span class="uf-label">Loadout</span>
            <span class="uf-t4">Crosshair and sensitivity used in drills.</span>
            <UfButton variant="link" @click="emit('update:activeTab', 'loadouts')">Open loadouts</UfButton>
          </section>
          <template v-if="insights.length">
            <div class="uf-hair" />
            <section class="uf-aside-block">
              <span class="uf-label">Did it carry over?</span>
              <p v-for="(line, i) in insights" :key="i" class="uf-t4" style="margin: 0; color: var(--uf-bone); line-height: 1.5">{{ line }}</p>
            </section>
          </template>
          <RouterLink to="/training/calibration" class="uf-link" style="margin-top: auto">Valorant calibration →</RouterLink>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uf-practice { display: flex; flex-direction: column; flex: none; min-height: 0; }
.uf-practice.is-train { flex: 1; }
.uf-practice-head { flex: none; padding: 26px 40px 0; display: flex; flex-direction: column; gap: 18px; }
.uf-practice-titlerow { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; }
.uf-practice-title { display: flex; flex-direction: column; gap: 10px; }
.uf-practice-stats { display: flex; gap: 28px; margin: 0; }
.uf-practice-stat { display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 4px; }
.uf-practice-stat dd { margin: 0; }

.uf-practice-body { flex: 1; min-height: 0; overflow-y: auto; padding: 22px 40px 32px; display: flex; flex-direction: column; gap: 28px; }

.uf-session { position: relative; overflow: hidden; flex: none; min-height: 150px; box-shadow: inset 0 0 0 1px var(--uf-line); }
.uf-session-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: saturate(0.7); }
.uf-session-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, var(--uf-bg) 0%, rgba(14,17,22,0.9) 45%, rgba(14,17,22,0.45) 100%); }
.uf-session-body { position: relative; padding: 26px 28px; display: flex; flex-direction: column; gap: 14px; }
.uf-session-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.uf-session-steps { display: flex; gap: 32px; margin: 0; padding: 0; list-style: none; }
.uf-session-steps li { display: flex; gap: 10px; align-items: baseline; }
.uf-session-step-text { display: flex; flex-direction: column; gap: 2px; }
.uf-session-actions { display: flex; align-items: center; gap: 22px; }

.uf-practice-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 36px; align-items: start; }
.uf-practice-main { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
.uf-reco { list-style: none; margin: 10px 0 0; padding: 0; }
.uf-reco li { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-reco-icon { width: 36px; height: 36px; flex: none; }
.uf-reco-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uf-library-head { display: flex; align-items: baseline; gap: 12px 24px; margin-bottom: 14px; flex-wrap: wrap; }
.uf-library-count { margin-left: auto; white-space: nowrap; }
.uf-library { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }

.uf-practice-aside { display: flex; flex-direction: column; gap: 18px; padding-left: 28px; border-left: 1px solid var(--uf-line); align-self: stretch; }
.uf-aside-block { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.uf-daily { display: flex; gap: 12px; align-items: center; }
.uf-daily-icon { width: 36px; height: 36px; flex: none; }
.uf-select { width: 100%; height: 40px; padding: 0 10px; background: var(--uf-raised); color: var(--uf-bone); border: 1px solid var(--uf-line-2); border-radius: 0; font: 400 16px/1 var(--uf-body); }
</style>

<style>
/* Shared tab bodies (Analytics, Leaderboards, Loadouts) still use the legacy markup inside the v3 frame:
   square the corners and use v3 surfaces so they sit with the new header until they are rebuilt. */
.ui-v3 .uf-practice-legacy .scroll-col { padding: 8px 28px 28px; }
.ui-v3 .uf-practice-legacy .scroll-col [class*='rounded'] { border-radius: 0 !important; }
.ui-v3 .uf-practice-legacy .scroll-col .dash-panel { background: var(--uf-raised); border-color: var(--uf-line); }
</style>
