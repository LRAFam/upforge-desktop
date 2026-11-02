<script setup lang="ts">
import { plural } from '../../lib/plural'
/**
 * UI v3 Practice (board 23). Presentational only: TrainingHubView owns all state and behaviour
 * (launching drills, guided sessions, results) and passes real training-API data in.
 * Renders the header + tabs for every tab, and the Train body; other tab bodies stay in the view.
 */
import UfTabs from '../../components/v3/UfTabs.vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import UfButton from '../../components/v3/UfButton.vue'
import { scenarioIconUrl, TRAINING_ARTWORK } from '../../lib/training-icons'
import {
  PRACTICE_TABS,
  difficultyLabel,
  durationLabel,
  noBestCaption,
  practiceGameScope,
  practiceStatItems,
  sessionMinutes,
  type MatchDrillRow,
  type PracticeCategory,
  type PracticeStats,
  type PracticeTab,
} from '../../components/v3/practice/practice-v3'
import { focusDrillPlan } from '../../components/v3/practice/focus-drills'
import { focusBeforeAfter } from '../../lib/focus'
import { usePracticeFocus } from '../../components/v3/practice/usePracticeFocus'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import '../../components/v3/practice/practice-v3.css'

export interface PracticeDrillCard {
  scenario: string
  label: string
  description: string
  difficulty: string
  durationSeconds: number
  personalBest: number | null
  /** Best from before the scoring update (doesn't count as a personal best). */
  oldBest: number | null
  globalRank: number | null
  completed: boolean
}

const props = defineProps<{
  activeTab: PracticeTab
  stats: PracticeStats
  sessionSteps: Array<{ phaseLabel: string; scenario: string; duration_seconds: number }>
  sessionFocusReason: string | null
  sessionDisabled: boolean
  matchDrills: MatchDrillRow[]
  /** "Your 29 runs from before … used the old scoring" or null. */
  scoringNote: string | null
  /** Valorant calibration is an admin measuring tool; the link shows only for admins. */
  showCalibration: boolean
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
  'play-match-drill': [id: number]
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
const openSteps = ref<number | null>(null)
const drillMeta = (d: PracticeDrillCard) => [difficultyLabel(d.difficulty), durationLabel(d.durationSeconds)].filter(Boolean).join(' · ')
const stepCaption = (d: PracticeDrillCard) => d.personalBest != null ? `Best ${Math.round(d.personalBest)}` : noBestCaption(d.oldBest)

// "Today's session, from your focus": the player's active focus mapped to drills in this catalogue.
const { focus } = usePracticeFocus(typeof window === 'undefined' ? undefined : window.api?.app)
// One rule for every game: focus, match drills and calibration come from Valorant analyses (practiceGameScope).
const { primaryGame } = usePrimaryGame()
const scope = computed(() => practiceGameScope(primaryGame.value))
const matchCoaching = computed(() => scope.value.matchCoaching)
const showSensLink = computed(() => primaryGame.value === 'cs2' || primaryGame.value === 'deadlock')
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
        <h1 class="uf-d2" style="margin: 0">Practice</h1>
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
      <p v-if="scope.note" class="uf-t4" style="margin: 0; max-width: 760px">
        {{ scope.note }}
        <RouterLink v-if="showSensLink" to="/settings?tab=trainer" class="uf-link">Trainer settings →</RouterLink>
      </p>
      <!-- Hero: today's guided session (the one red action on this screen) -->
      <section class="uf-session uf-rise uf-d1s">
        <img :src="TRAINING_ARTWORK.guidedSessionHero" alt="" class="uf-session-art">
        <div class="uf-session-scrim" />
        <div v-if="focusPlan && focus && matchCoaching" class="uf-session-body">
          <span class="uf-label">Today’s session · from your focus</span>
          <p class="uf-t1" style="margin: 0; max-width: 760px">{{ focus.label }}</p>
          <p class="uf-t2" style="margin: 0; max-width: 620px">{{ focusPlan.caption }}</p>
          <p v-if="focusProgress" class="uf-t4" style="margin: 0">
            Before: {{ focusProgress.before }} · Since: {{ focusProgress.since }} over {{ focusProgress.games }} game{{ focusProgress.games === 1 ? '' : 's' }}
            <span :style="{ color: focusProgress.improved ? 'var(--uf-win)' : 'var(--uf-muted)' }">{{ focusProgress.improved ? '· better' : '· not yet' }}</span>
          </p>
          <div class="uf-session-row">
            <ol class="uf-session-steps">
              <li v-for="(d, i) in focusDrills" :key="d.scenario">
                <span class="uf-d4" style="color: var(--uf-faint)">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="uf-session-step-text"><span class="uf-t4">{{ stepCaption(d) }}</span><span class="uf-t3">{{ d.label }}</span></span>
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
            {{ (matchCoaching && sessionFocusReason) || 'Warm up, practise your focus drill, then cool down.' }}
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
          <section v-if="matchDrills.length && matchCoaching" class="uf-rise uf-d2s">
            <span class="uf-label">Drills from your matches</span>
            <ul class="uf-reco">
              <li v-for="r in matchDrills" :key="r.id">
                <div class="uf-reco-row">
                  <img v-if="r.trainerScenario" :src="scenarioIconUrl(r.trainerScenario)" alt="" class="uf-reco-icon">
                  <img v-else :src="TRAINING_ARTWORK.vodRecommend" alt="" class="uf-reco-icon">
                  <span class="uf-reco-text"><span class="uf-t3">{{ r.title }}</span><span class="uf-t4">{{ r.meta }}</span></span>
                  <UfButton v-if="r.trainerScenario" variant="link" :disabled="busy" @click="emit('play-match-drill', r.id)">Play</UfButton>
                  <UfButton v-else-if="r.steps || r.goal" variant="link" :aria-expanded="openSteps === r.id"
                    @click="openSteps = openSteps === r.id ? null : r.id">{{ openSteps === r.id ? 'Hide steps' : 'Steps' }}</UfButton>
                </div>
                <div v-if="openSteps === r.id" class="uf-reco-steps">
                  <p v-if="r.steps" class="uf-t4" style="margin: 0; color: var(--uf-bone); line-height: 1.5">{{ r.steps }}</p>
                  <p v-if="r.goal" class="uf-t4" style="margin: 0; line-height: 1.5">Goal: {{ r.goal }}</p>
                </div>
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
            <p v-if="scoringNote" class="uf-t4" style="margin: 0 0 10px">{{ scoringNote }}</p>
            <table class="uf-library">
              <thead>
                <tr>
                  <th scope="col" class="uf-t4"><span class="uf-sr">Drill</span></th>
                  <th scope="col" class="uf-t4" />
                  <th scope="col" class="uf-t4 uf-lib-what">What it trains</th>
                  <th scope="col" class="uf-t4 uf-lib-pb">Personal best</th>
                  <th scope="col"><span class="uf-sr">Play</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in drills" :key="d.scenario" :class="{ 'is-running': runningScenario === d.scenario }">
                  <td class="uf-lib-icon"><img :src="scenarioIconUrl(d.scenario)" alt=""></td>
                  <td class="uf-lib-name">
                    <span class="uf-t3">{{ d.label }}</span>
                    <span class="uf-t4">{{ drillMeta(d) }}</span>
                  </td>
                  <td class="uf-t4 uf-lib-what">{{ d.description }}</td>
                  <td class="uf-lib-pb">
                    <span v-if="d.personalBest != null" class="uf-d4" style="color: var(--uf-gold)"><span aria-hidden="true">★ </span>{{ Math.round(d.personalBest) }}</span>
                    <template v-else>
                      <span class="uf-d4" style="color: var(--uf-faint)">—</span>
                      <span class="uf-t4">{{ noBestCaption(d.oldBest) }}</span>
                    </template>
                    <span v-if="runningScenario === d.scenario" class="uf-t4 uf-live" style="color: var(--uf-red)">Running</span>
                    <span v-else-if="d.completed" class="uf-t4" style="color: var(--uf-win)">Played today</span>
                    <span v-else-if="d.globalRank" class="uf-t4">Rank #{{ d.globalRank }}</span>
                  </td>
                  <td class="uf-lib-play">
                    <UfButton variant="link" :disabled="busy" :aria-label="`Play ${d.label}`" @click="emit('play-drill', d.scenario)">Play</UfButton>
                  </td>
                </tr>
              </tbody>
            </table>
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
            <select id="uf-free-play" class="uf-pselect" :value="freePlayScenario"
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
            <RouterLink v-if="showCalibration && matchCoaching" to="/training/calibration" class="uf-link uf-t4">Valorant calibration (admin) →</RouterLink>
          </section>
          <template v-if="insights.length">
            <div class="uf-hair" />
            <section class="uf-aside-block">
              <span class="uf-label">Did it carry over?</span>
              <p v-for="(line, i) in insights" :key="i" class="uf-t4" style="margin: 0; color: var(--uf-bone); line-height: 1.5">{{ line }}</p>
            </section>
          </template>
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
.uf-reco li { padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-reco-row { display: flex; align-items: center; gap: 14px; }
.uf-reco-icon { width: 40px; height: 40px; flex: none; object-fit: contain; }
.uf-reco-steps { display: flex; flex-direction: column; gap: 6px; padding: 10px 0 2px 54px; max-width: 760px; }
.uf-reco-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uf-library-head { display: flex; align-items: baseline; gap: 12px 24px; margin-bottom: 14px; flex-wrap: wrap; }
.uf-library-count { margin-left: auto; white-space: nowrap; }
.uf-library { width: 100%; border-collapse: collapse; }
.uf-library th { text-align: left; font-weight: 400; padding: 0 12px 8px 0; white-space: nowrap; }
.uf-library td { padding: 10px 12px 10px 0; border-top: 1px solid var(--uf-line); vertical-align: middle; }
.uf-library tr.is-running td:first-child { box-shadow: inset 2px 0 0 var(--uf-red); }
.uf-lib-icon { width: 56px; }
.uf-lib-icon img { width: 48px; height: 48px; display: block; object-fit: contain; }
.uf-lib-name { width: 200px; }
.uf-lib-name, .uf-lib-pb { white-space: nowrap; }
.uf-lib-name > span, .uf-lib-pb > span { display: block; }
.uf-lib-what { line-height: 1.45; }
td.uf-lib-what { min-width: 180px; }
.uf-lib-pb { width: 120px; text-align: right; }
.uf-library th.uf-lib-pb { text-align: right; }
.uf-lib-play { width: 1%; text-align: right; white-space: nowrap; padding-right: 0 !important; }
.uf-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 1100px) { .uf-lib-what { display: none; } }

.uf-practice-aside { display: flex; flex-direction: column; gap: 18px; padding-left: 28px; border-left: 1px solid var(--uf-line); align-self: stretch; }
.uf-aside-block { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.uf-daily { display: flex; gap: 12px; align-items: center; }
.uf-daily-icon { width: 36px; height: 36px; flex: none; }
</style>

<style>
/* Shared tab bodies (Analytics, Leaderboards, Loadouts) still use the legacy markup inside the v3 frame:
   square the corners and use v3 surfaces so they sit with the new header until they are rebuilt. */
.ui-v3 .uf-practice-legacy .scroll-col { padding: 8px 28px 28px; }
.ui-v3 .uf-practice-legacy .scroll-col [class*='rounded'] { border-radius: 0 !important; }
.ui-v3 .uf-practice-legacy .scroll-col .dash-panel { background: var(--uf-raised); border-color: var(--uf-line); }
</style>
