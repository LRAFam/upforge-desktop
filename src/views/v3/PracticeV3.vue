<script setup lang="ts">
/**
 * UI v3 Practice. Presentational only: TrainingHubView owns all state and behaviour (launching drills,
 * guided sessions, results) and passes real training-API data in.
 * Renders the header + tabs for every tab, and the Today and Drills bodies; the other tab bodies stay in the view.
 *
 * Today reads top to bottom: the routine (one red action) over a real frame of the drill, the focus as
 * measured in matches since it was set, drills the coach picked from matches, then single drills.
 * Copy says what was measured, never what caused it (src/lib/coaching-copy-safety.test.ts).
 * Drills groups the catalogue by what each drill is for instead of one long table.
 */
import UfTabs from '../../components/v3/UfTabs.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import UfButton from '../../components/v3/UfButton.vue'
import FocusesV3 from '../../components/v3/focus/FocusesV3.vue'
import { hasFocusLoop } from '../../lib/focuses'
import PracticeHeroV3 from '../../components/v3/practice/PracticeHeroV3.vue'
import PracticeDrillTileV3 from '../../components/v3/practice/PracticeDrillTileV3.vue'
import TrainingDrillMoments from '../../components/training/TrainingDrillMoments.vue'
import { drillFrame, frameLayout } from '../../components/v3/practice/drill-frames'
import {
  PRACTICE_TABS,
  focusBars,
  groupDrills,
  practiceGameScope,
  practiceOwnsTab,
  pickNextDrill,
  practiceStatItems,
  routineFromDrills,
  routineFromSession,
  sessionMinutes,
  type DrillGroupId,
  type MatchDrillRow,
  type PracticeCategory,
  type PracticeStats,
  type PracticeTab,
  type RoutineStep,
} from '../../components/v3/practice/practice-v3'
import { focusDrillPlan } from '../../components/v3/practice/focus-drills'
import { useDrillRulebook } from '../../lib/drill-rulebook'
import { FOCUS_VERDICT_LABEL, VALORANT_FOCUS_DESKTOP_ONLY, focusBeforeAfter } from '../../lib/focus'
import { usePracticeFocus } from '../../components/v3/practice/usePracticeFocus'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import '../../components/v3/practice/practice-v3.css'

export interface PracticeDrillCard {
  scenario: string
  label: string
  description: string
  /** Beta drill: launchable by hand, shows a Beta tag. */
  beta?: boolean
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
  sessionSteps: Array<{ phase?: string; phaseLabel: string; scenario: string; duration_seconds: number }>
  sessionFocusReason: string | null
  sessionDisabled: boolean
  matchDrills: MatchDrillRow[]
  /** "Your 29 runs from older trainer versions were scored differently…" or null. */
  scoringNote: string | null
  /** Valorant calibration is an admin measuring tool; the link shows only for admins. */
  showCalibration: boolean
  /** Kept for the view's v-model contract. Drills are grouped by job now, not filtered by category. */
  categories: Array<{ id: PracticeCategory; label: string }>
  activeCategory: PracticeCategory
  drills: PracticeDrillCard[]
  runningScenario: string | null
  busy: boolean
  daily: { scenarioLabel: string; target: number; completed: boolean }
  /** Kept for the view's contract. Quick play is covered by the Drills tab. */
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
  'dismiss-match-drill': [id: number]
  'play-drill': [scenario: string]
  /** A drill started from the Drills tab: the player picks its difficulty and length first. */
  'play-manual-drill': [scenario: string]
  'play-daily': []
  'launch-free': []
}>()

const statItems = computed(() => practiceStatItems(props.stats))
// Hide the header numbers until there is something to show (review P3-6): three zeros read as a hero.
const hasStats = computed(() => statItems.value.some(s => !['0', '—', '-', ''].includes(String(s.value).trim())))
const tabItems = PRACTICE_TABS.map(t => ({ key: t.id, label: t.label }))
const ownsTab = computed(() => practiceOwnsTab(props.activeTab))
const minutes = computed(() => sessionMinutes(props.sessionSteps))
const openSteps = ref<number | null>(null)

// "Today's session, from your focus": the player's active focus mapped to drills in this catalogue.
const { focus, ready: focusReady } = usePracticeFocus(typeof window === 'undefined' ? undefined : window.api?.app)
// One rule for every game: focus, match drills and calibration come from Valorant analyses (practiceGameScope).
const { primaryGame } = usePrimaryGame()
const scope = computed(() => practiceGameScope(primaryGame.value))
const matchCoaching = computed(() => scope.value.matchCoaching)
const showSensLink = computed(() => primaryGame.value === 'cs2' || primaryGame.value === 'deadlock')
// League has no aim trainer: next-match focus instead of a session, and the drill library, daily
// challenge and quick play stay hidden behind a link for players who want them anyway.
const aimTrainer = computed(() => scope.value.aimTrainer)
const libraryAnyway = ref(false)
const showTrainerDrills = computed(() => aimTrainer.value || libraryAnyway.value)
watch(primaryGame, () => { libraryAnyway.value = false })
// One finding → drill mapping: the API rulebook (empty = no proven drill, said plainly).
const rulebook = useDrillRulebook(typeof window === 'undefined' ? undefined : window.api?.trainer)
const focusPlan = computed(() => focusDrillPlan(focus.value?.metric, props.drills.map(d => d.scenario), rulebook.value))
const focusProgress = computed(() => focusBeforeAfter(focus.value))
// "Do this next": the match report's drill (from "Practise this"), else the top drill from matches.
const route = useRoute() as ReturnType<typeof useRoute> | undefined
const router = useRouter() as ReturnType<typeof useRouter> | undefined
const nextDrill = computed(() => pickNextDrill(route?.query ?? {}, props.matchDrills, props.drills.map(d => d.scenario)))
const nextDrillLabel = computed(() => props.drills.find(d => d.scenario === nextDrill.value?.scenario)?.label ?? null)
function playNextDrill() {
  const n = nextDrill.value
  if (!n?.scenario) return
  if (n.matchDrillId != null) emit('play-match-drill', n.matchDrillId)
  else emit('play-drill', n.scenario)
}
function clearReportDrill() { router?.replace({ path: '/training' }).catch(() => {}) }
const focusDrills = computed(() => (focusPlan.value?.scenarios ?? [])
  .map(s => props.drills.find(d => d.scenario === s))
  .filter((d): d is PracticeDrillCard => !!d))

// ── Hero: which of the four cases applies, the steps drawn along its line, and the drill pictured ──
type HeroKind = 'report' | 'focus' | 'match' | 'session' | 'empty'
const hasFocusPlan = computed(() => !!(focusPlan.value && focus.value && matchCoaching.value))
/**
 * A focus leads only when it has a trainer drill to start. A focus with no drill would leave the hero
 * with nothing to do, so the coach's match drill or the session leads and the focus stays in
 * "In your matches" below. It takes the hero only when there is nothing else to offer.
 */
const heroKind = computed<HeroKind>(() => {
  if (nextDrill.value?.source === 'match_report') return 'report'
  if (hasFocusPlan.value && focusDrills.value.length) return 'focus'
  if (nextDrill.value) return 'match'
  if (props.sessionSteps.length) return 'session'
  return hasFocusPlan.value ? 'focus' : 'empty'
})
// The focus and the rulebook arrive a few seconds after the screen. Until both are known the hero could
// still change (a match drill giving way to a focus), so it holds a placeholder instead of drawing one
// answer and swapping it. Both are remembered between runs, so this is seen on a first run only.
const waitedOut = ref(false)
let waitTimer: ReturnType<typeof setTimeout> | null = null
onMounted(() => { waitTimer = setTimeout(() => { waitedOut.value = true }, 5000) })
onBeforeUnmount(() => { if (waitTimer) clearTimeout(waitTimer) })
const heroPending = computed(() => {
  if (waitedOut.value || !matchCoaching.value || nextDrill.value?.source === 'match_report') return false
  if (!focusReady.value) return true
  return !!focus.value && rulebook.value === null
})
const rail = computed<RoutineStep[]>(() => {
  if (heroKind.value === 'focus') return routineFromDrills(focusDrills.value)
  if (heroKind.value === 'session') return routineFromSession(props.sessionSteps, props.scenarioLabel)
  return []
})
const heroScenario = computed<string | null>(() => {
  if (heroKind.value === 'report' || heroKind.value === 'match') return nextDrill.value?.scenario ?? null
  if (heroKind.value === 'focus') return focusDrills.value[0]?.scenario ?? null
  const steps = props.sessionSteps
  // No plan yet: picture the drill the screen offers to start with.
  return (steps.find(s => s.phase === 'focus') ?? steps[0])?.scenario ?? todayDrills.value[0]?.scenario ?? null
})
const heroCaption = computed(() => (heroScenario.value ? props.scenarioLabel(heroScenario.value) : null))

// ── In your matches: the focus measured game by game since it was set, and trainer-vs-match lines ──
const bars = computed(() => (matchCoaching.value ? focusBars(focus.value) : null))
const showInMatches = computed(() => matchCoaching.value || props.insights.length > 0)
const barsLabel = computed(() => {
  const c = bars.value
  if (!c) return ''
  const hits = c.bars.filter(b => b.hit).length
  return `${c.bars.length} ${c.bars.length === 1 ? 'game' : 'games'} since this focus was set, ${hits} on target`
})

// ── Drills ──
const drillByScenario = computed(() => new Map(props.drills.map(d => [d.scenario, d])))
/** Drills picked for this player: the match report's, the focus plan's and the coach's match drills. */
const yourScenarios = computed(() => {
  const keys = [nextDrill.value?.scenario, ...(focusPlan.value?.scenarios ?? []), ...props.matchDrills.map(r => r.trainerScenario)]
  return [...new Set(keys.filter((k): k is string => !!k && drillByScenario.value.has(k)))]
})
const groups = computed(() => groupDrills(props.drills, yourScenarios.value)
  .filter(g => g.id !== 'yours' || g.drills.length > 0 || matchCoaching.value))
const GROUP_COPY: Record<DrillGroupId, { label: string; what: string }> = {
  yours: { label: 'Your drill', what: 'Picked from your matches and your focus.' },
  warmup: { label: 'Warm-up', what: 'A loosen-up before you queue.' },
  beta: { label: 'Beta lab', what: 'Experiments you start by hand. Still being tuned.' },
  more: { label: 'More drills', what: 'Every other drill in the trainer.' },
}
/** Today's single drills: the ones in the routine, else the warm-ups. */
const todayDrills = computed(() => {
  const fromRail = [...new Set(rail.value.map(s => s.scenario))]
    .map(k => drillByScenario.value.get(k))
    .filter((d): d is PracticeDrillCard => !!d)
  if (fromRail.length) return fromRail
  return groupDrills(props.drills, []).find(g => g.id === 'warmup')?.drills ?? props.drills.slice(0, 3)
})
const focusScenario = computed(() => rail.value.find(s => s.focus)?.scenario ?? null)
/** The daily challenge as a tile: pictured by its own drill. */
const dailyTile = computed(() => ({
  scenario: props.drills.find(d => d.label === props.daily.scenarioLabel)?.scenario ?? '',
  label: 'Daily challenge',
  description: `Score ${props.daily.target}+ on ${props.daily.scenarioLabel}`,
  personalBest: null, oldBest: null, globalRank: null, completed: props.daily.completed,
}))

/** A drill's own frame as a small picture, cut so its target sits in the middle. */
function thumb(scenario: string | null | undefined) {
  const frame = drillFrame(scenario)
  if (!frame) return null
  const l = frameLayout(frame.target, { width: 112, height: 63 }, { x: 0.5, y: 0.5 }, 1.7)
  return { url: frame.url, style: { width: `${l.width}%`, left: `${l.left}%`, top: `${l.top}%` } }
}
</script>

<template>
  <div class="uf-practice" :class="{ 'is-own': ownsTab }">
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

    <!-- ── Today ─────────────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'train'" class="uf-practice-body">
      <!-- A game without the aim trainer (League): its next-match focus leads, and the aim drills stay behind a link. -->
      <section v-if="!aimTrainer" class="uf-noplan uf-rise uf-d1s" aria-label="Next-match focus">
        <FocusesV3 v-if="hasFocusLoop(primaryGame)" :game="primaryGame" heading="Your next-match focus">
          <template #fallback>
            <span class="uf-label">Your next-match focus</span>
            <p class="uf-t4" style="margin: 0">Your coach sets one from your recent matches. It shows here and on Home.</p>
          </template>
        </FocusesV3>
        <button type="button" class="uf-link uf-t4" :aria-expanded="libraryAnyway" @click="libraryAnyway = !libraryAnyway">
          {{ libraryAnyway ? 'Hide the aim drill library' : 'Open the aim drill library anyway →' }}
        </button>
      </section>
      <!-- Hero: the routine and the one red action on this screen, over a real frame of the drill -->
      <div v-else-if="heroPending" class="uf-hero-wait" aria-busy="true"><UfSkeleton :h="400" /></div>
      <PracticeHeroV3 v-else class="uf-reveal" :scenario="heroScenario" :caption="heroCaption">
        <template v-if="heroKind === 'report' && nextDrill">
          <span class="uf-label">Do this next · from your last match</span>
          <p class="uf-t1 uf-hero-say">{{ nextDrill.title }}</p>
          <p v-if="nextDrill.why" class="uf-t2 uf-hero-why">Why: {{ nextDrill.why }}</p>
          <p class="uf-t4 uf-hero-why">
            <template v-if="nextDrillLabel">Warm up with the {{ nextDrillLabel }} drill here, then do this in a custom game before you queue.</template>
            <template v-else>Do this in a custom game before you queue. One drill, done properly, beats five done once.</template>
          </p>
          <div class="uf-hero-actions">
            <UfButton v-if="nextDrill.scenario" variant="primary" icon="play" :disabled="busy" @click="playNextDrill">Start {{ nextDrillLabel }}</UfButton>
            <UfButton variant="link" @click="clearReportDrill">See all drills</UfButton>
          </div>
        </template>

        <template v-else-if="heroKind === 'focus' && focus && focusPlan">
          <span class="uf-label">Today’s session · from your focus</span>
          <p class="uf-t1 uf-hero-say">{{ focus.label }}</p>
          <p class="uf-t2 uf-hero-why">{{ focusPlan.caption }}</p>
          <ol v-if="rail.length" class="uf-rail" aria-label="Today’s drills">
            <li v-for="s in rail" :key="s.scenario" :class="{ 'is-focus': s.focus }">
              <span class="uf-rail-track" aria-hidden="true"><i /><b /></span>
              <span class="uf-t4">{{ s.caption }}</span>
              <span class="uf-t3">{{ s.label }}</span>
            </li>
          </ol>
          <div class="uf-hero-actions">
            <UfButton v-if="focusDrills.length" variant="primary" icon="play" :disabled="busy" @click="emit('play-drill', focusDrills[0].scenario)">Start with {{ focusDrills[0]?.label }}</UfButton>
            <UfButton v-if="sessionSteps.length" variant="link" :disabled="sessionDisabled" @click="emit('start-session')">Guided session instead</UfButton>
          </div>
        </template>

        <template v-else-if="heroKind === 'match' && nextDrill">
          <span class="uf-label">Do this next · from your matches</span>
          <p class="uf-t1 uf-hero-say">{{ nextDrill.title }}</p>
          <p v-if="nextDrill.why" class="uf-t2 uf-hero-why">{{ nextDrill.why }}</p>
          <p v-else-if="nextDrill.goal" class="uf-t2 uf-hero-why">Goal: {{ nextDrill.goal }}</p>
          <template v-if="!nextDrill.scenario">
            <p v-if="nextDrill.steps" class="uf-t4 uf-hero-why" style="color: var(--uf-bone); line-height: 1.5">{{ nextDrill.steps }}</p>
            <p v-if="nextDrill.goal && nextDrill.why" class="uf-t4 uf-hero-why">Goal: {{ nextDrill.goal }}</p>
          </template>
          <div class="uf-hero-actions">
            <UfButton v-if="nextDrill.scenario" variant="primary" icon="play" :disabled="busy" @click="playNextDrill">Start {{ nextDrillLabel ?? 'drill' }}</UfButton>
            <UfButton v-if="sessionSteps.length" variant="link" :disabled="sessionDisabled" @click="emit('start-session')">Guided session instead</UfButton>
          </div>
        </template>

        <template v-else-if="heroKind === 'session'">
          <span class="uf-label">Today’s session<template v-if="minutes"> · {{ minutes }} min</template></span>
          <p class="uf-t1 uf-hero-say">{{ (matchCoaching && sessionFocusReason) || 'Warm up, practise your focus drill, then cool down.' }}</p>
          <ol class="uf-rail" aria-label="Today’s session">
            <li v-for="(s, i) in rail" :key="i" :class="{ 'is-focus': s.focus }">
              <span class="uf-rail-track" aria-hidden="true"><i /><b /></span>
              <span class="uf-t4">{{ s.caption }}</span>
              <span class="uf-t3">{{ s.label }}</span>
            </li>
          </ol>
          <div class="uf-hero-actions">
            <UfButton variant="primary" icon="play" :disabled="sessionDisabled" @click="emit('start-session')">Start session</UfButton>
          </div>
        </template>

        <template v-else>
          <span class="uf-label">Today’s session</span>
          <p class="uf-t2 uf-hero-why">Your session plan isn’t ready yet. Play any drill below and the coach builds one from your results.</p>
          <div v-if="todayDrills.length" class="uf-hero-actions">
            <UfButton variant="primary" icon="play" :disabled="busy" @click="emit('play-drill', todayDrills[0].scenario)">Start with {{ todayDrills[0].label }}</UfButton>
          </div>
        </template>
      </PracticeHeroV3>

      <div class="uf-practice-sections">
        <p v-if="scope.note" class="uf-t4 uf-practice-note">
          {{ scope.note }}
          <RouterLink v-if="showSensLink" to="/settings?tab=trainer" class="uf-link">Trainer settings →</RouterLink>
        </p>

        <!-- What an aim trainer cannot show: the same measure in your matches. Measured, not a claim of cause. -->
        <section v-if="showInMatches" class="uf-inmatch uf-rise uf-d1s">
          <div class="uf-inmatch-say">
            <span class="uf-label">{{ matchCoaching ? 'In your matches' : 'Trainer vs matches' }}</span>
            <template v-if="focusProgress && focus && matchCoaching">
              <p class="uf-inmatch-nums">
                <span class="uf-d3" style="color: var(--uf-muted)">{{ focusProgress.before }}</span>
                <span class="uf-d4" style="color: var(--uf-faint)" aria-hidden="true">→</span>
                <span class="uf-d3" :style="{ color: focusProgress.verdict === 'better' ? 'var(--uf-win)' : 'var(--uf-bone)' }">{{ focusProgress.since }}</span>
              </p>
              <p class="uf-t3" style="margin: 0">{{ focus.label }}</p>
              <p class="uf-t4" style="margin: 0">
                Started at {{ focusProgress.before }}, {{ focusProgress.since }} average over {{ focusProgress.games }} game{{ focusProgress.games === 1 ? '' : 's' }}:
                <span :style="{ color: focusProgress.verdict === 'better' ? 'var(--uf-win)' : 'var(--uf-muted)' }">{{ FOCUS_VERDICT_LABEL[focusProgress.verdict] }}</span>.
              </p>
            </template>
            <template v-else-if="matchCoaching && !insights.length">
              <p class="uf-t3" style="margin: 0">Nothing to compare yet.</p>
              <p class="uf-t4" style="margin: 0; max-width: 420px">{{ VALORANT_FOCUS_DESKTOP_ONLY }}</p>
            </template>
            <p v-for="(line, i) in insights" :key="`i${i}`" class="uf-t4 uf-inmatch-line">{{ line }}</p>
          </div>
          <div v-if="bars" class="uf-inmatch-chart">
            <div class="uf-inmatch-bars" role="img" :aria-label="barsLabel">
              <span v-for="(b, i) in bars.bars" :key="i" class="uf-inmatch-bar uf-grow" :class="{ 'is-hit': b.hit }" :style="{ height: `${Math.max(4, b.height * 100)}%` }" />
              <span class="uf-inmatch-base" :style="{ bottom: `${bars.baseline * 100}%` }" />
            </div>
            <span class="uf-t4">{{ barsLabel }}. The line is your starting point.</span>
          </div>
        </section>

        <!-- Coach-assigned drills always show: the coach assigned them for the player's game. -->
        <section v-if="matchDrills.length" class="uf-rise uf-d2s">
          <span class="uf-label">From your matches</span>
          <ul class="uf-rows">
            <li v-for="r in matchDrills" :key="r.id" class="uf-mrow">
              <div class="uf-mrow-main">
                <span class="uf-thumb" aria-hidden="true">
                  <img v-if="thumb(r.trainerScenario)" :src="thumb(r.trainerScenario)!.url" alt="" :style="thumb(r.trainerScenario)!.style">
                  <span v-else class="uf-t4 uf-thumb-say">In game</span>
                </span>
                <div class="uf-mrow-what">
                  <span class="uf-t3">{{ r.title }}<span v-if="r.beta" class="uf-mrow-tag">Beta</span></span>
                  <span class="uf-t4">{{ r.fromMatches ? `From your match stats · ${r.meta}` : r.meta }}</span>
                  <span v-if="r.why" class="uf-t4" style="color: var(--uf-bone)">{{ r.why }}</span>
                  <span v-if="r.stat" class="uf-t4 uf-mrow-stat" :style="r.stat.trend === 'better' ? 'color: var(--uf-win)' : undefined">{{ r.stat.text }}</span>
                  <TrainingDrillMoments v-if="r.hasMoments" :drill-id="r.id" />
                </div>
                <UfButton v-if="r.steps || r.goal" variant="link" :aria-expanded="openSteps === r.id"
                  @click="openSteps = openSteps === r.id ? null : r.id">{{ openSteps === r.id ? 'Hide steps' : 'Steps' }}</UfButton>
                <UfButton v-if="r.trainerScenario" variant="link" :disabled="busy" @click="emit('play-match-drill', r.id)">Play</UfButton>
                <button type="button" class="uf-link" :aria-label="`Not now: ${r.title}`" @click="emit('dismiss-match-drill', r.id)">Not now</button>
              </div>
              <div v-if="openSteps === r.id" class="uf-mrow-steps">
                <p v-if="r.steps" class="uf-t4" style="margin: 0; color: var(--uf-bone); line-height: 1.5">{{ r.steps }}</p>
                <p v-if="r.goal" class="uf-t4" style="margin: 0; line-height: 1.5">Goal: {{ r.goal }}</p>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="showTrainerDrills" class="uf-rise uf-d3s">
          <div class="uf-section-head">
            <span class="uf-label">Play one on its own</span>
            <UfButton variant="link" @click="emit('update:activeTab', 'drills')">All drills</UfButton>
          </div>
          <ul class="uf-tiles">
            <PracticeDrillTileV3 v-for="d in todayDrills" :key="d.scenario" :drill="d" :focus="d.scenario === focusScenario"
              :running="runningScenario === d.scenario" :busy="busy" @play="emit('play-drill', $event)" />
            <PracticeDrillTileV3 :drill="dailyTile" :busy="busy || daily.completed"
              :state-text="daily.completed ? 'Done today' : 'Today only'" @play="emit('play-daily')" />
          </ul>
        </section>

        <p v-if="showTrainerDrills" class="uf-t4 uf-practice-note">
          Drills use the crosshair and sensitivity from your setup.
          <button type="button" class="uf-link" @click="emit('update:activeTab', 'loadouts')">Setup</button>
          <RouterLink v-if="showCalibration && matchCoaching" to="/training/calibration" class="uf-link uf-t4" style="margin-left: 14px">Valorant calibration (admin) →</RouterLink>
        </p>
      </div>
    </div>

    <!-- ── Drills ────────────────────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'drills'" class="uf-practice-body">
      <div class="uf-practice-sections">
        <p v-if="scope.note" class="uf-t4 uf-practice-note">
          {{ scope.note }}
          <RouterLink v-if="showSensLink" to="/settings?tab=trainer" class="uf-link">Trainer settings →</RouterLink>
        </p>
        <button v-if="!aimTrainer" type="button" class="uf-link uf-t4 uf-library-anyway" :aria-expanded="libraryAnyway" @click="libraryAnyway = !libraryAnyway">
          {{ libraryAnyway ? 'Hide the aim drill library' : 'Open the aim drill library anyway →' }}
        </button>
        <template v-if="showTrainerDrills">
          <p v-if="scoringNote" class="uf-t4 uf-practice-note">{{ scoringNote }}</p>
          <section v-for="(g, gi) in groups" :key="g.id" class="uf-rise" :class="`uf-d${Math.min(gi + 1, 4)}s`">
            <div class="uf-section-head uf-section-head--start">
              <span class="uf-label">{{ GROUP_COPY[g.id].label }}</span>
              <span class="uf-t4">{{ GROUP_COPY[g.id].what }}</span>
            </div>
            <ul v-if="g.drills.length" class="uf-tiles">
              <PracticeDrillTileV3 v-for="d in g.drills" :key="d.scenario" :drill="d" :focus="g.id === 'yours'"
                :running="runningScenario === d.scenario" :busy="busy" @play="emit('play-manual-drill', $event)" />
            </ul>
            <p v-else class="uf-t4 uf-group-empty">No drill picked yet. {{ VALORANT_FOCUS_DESKTOP_ONLY }}</p>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uf-practice { display: flex; flex-direction: column; flex: none; min-height: 0; }
.uf-practice.is-own { flex: 1; }
.uf-practice-head { flex: none; padding: 26px 40px 0; display: flex; flex-direction: column; gap: 18px; }
.uf-practice-titlerow { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; }
.uf-practice-stats { display: flex; gap: 28px; margin: 0; }
.uf-practice-stat { display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 4px; }
.uf-practice-stat dd { margin: 0; }

.uf-practice-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.uf-hero-wait { flex: none; border-bottom: 1px solid var(--uf-line); }
/* A small real frame of the drill, cut so its target is in the middle. Empty for drills with no frame. */
.uf-thumb { position: relative; flex: none; width: 112px; height: 63px; overflow: hidden; background: var(--uf-raised); }
.uf-thumb img { position: absolute; max-width: none; height: auto; }
.uf-thumb-say { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--uf-muted); }
/* Drills as picture tiles */
.uf-tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 26px 18px; }
.uf-practice-sections { padding: 30px 40px 36px; display: flex; flex-direction: column; gap: 34px; }
.uf-practice-note { margin: 0; max-width: 760px; }
.uf-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px 24px; flex-wrap: wrap; margin-bottom: 10px; }
.uf-section-head--start { justify-content: flex-start; gap: 8px 18px; }

/* Hero copy */
.uf-hero-say { margin: 0; max-width: 600px; }
.uf-hero-why { margin: 0; max-width: 540px; }
.uf-hero-actions { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; margin-top: 8px; }
/* The routine along one line: a square marker and a hairline per step, the focus step in red. */
.uf-rail { display: flex; list-style: none; margin: 6px 0 0; padding: 0; max-width: 580px; }
.uf-rail li { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 7px; padding-right: 14px; }
.uf-rail-track { display: flex; align-items: center; margin-right: -14px; }
.uf-rail-track i { width: 7px; height: 7px; flex: none; background: var(--uf-muted); }
.uf-rail-track b { height: 1px; flex: 1; background: var(--uf-line-2); }
.uf-rail li:last-child .uf-rail-track b { background: linear-gradient(90deg, var(--uf-line-2), transparent); }
.uf-rail li.is-focus .uf-rail-track i { background: var(--uf-red); }
.uf-rail li.is-focus .uf-rail-track b { background: linear-gradient(90deg, var(--uf-red), var(--uf-line-2)); }
.uf-rail li.is-focus:last-child .uf-rail-track b { background: linear-gradient(90deg, var(--uf-red), transparent); }

/* In your matches */
.uf-inmatch { display: flex; gap: 20px 56px; flex-wrap: wrap; align-items: flex-end; }
.uf-inmatch-say { flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.uf-inmatch-nums { margin: 2px 0 0; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.uf-inmatch-line { margin: 0; color: var(--uf-bone); line-height: 1.5; max-width: 560px; font-variant-numeric: tabular-nums; }
.uf-inmatch-chart { flex: 1.3 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.uf-inmatch-bars { position: relative; display: flex; align-items: flex-end; gap: 8px; height: 84px; border-bottom: 1px solid var(--uf-line-2); }
.uf-inmatch-bar { flex: 1 1 0; max-width: 56px; background: var(--uf-faint); transform-origin: bottom; }
.uf-inmatch-bar.is-hit { background: var(--uf-win); }
.uf-inmatch-base { position: absolute; left: 0; right: 0; height: 1px; background: var(--uf-bone); opacity: 0.55; }
/* A game without the aim trainer: the next-match focus stands where the hero would */
.uf-noplan { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; max-width: 840px; padding: 30px 40px 0; }
.uf-library-anyway { align-self: flex-start; }

/* Hairline rows */
.uf-rows { list-style: none; margin: 0; padding: 0; border-bottom: 1px solid var(--uf-line); }
.uf-mrow { padding: 13px 0; border-top: 1px solid var(--uf-line); }
.uf-mrow-main { display: flex; align-items: center; gap: 20px; }
.uf-mrow-what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.uf-mrow-tag { margin-left: 8px; font: 600 12px/1.2 var(--uf-body); letter-spacing: 0.12em; text-transform: uppercase; color: var(--uf-gold); }
.uf-mrow-stat { font-variant-numeric: tabular-nums; }
.uf-mrow-steps { display: flex; flex-direction: column; gap: 6px; padding: 10px 0 2px; max-width: 760px; }
.uf-group-empty { margin: 0; padding: 13px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); max-width: none; }
</style>

<style>
/* Shared tab bodies (Analytics, Leaderboards, Loadouts) still use the legacy markup inside the v3 frame:
   square the corners and use v3 surfaces so they sit with the new header until they are rebuilt. */
.ui-v3 .uf-practice-legacy .scroll-col { padding: 8px 28px 28px; }
.ui-v3 .uf-practice-legacy .scroll-col [class*='rounded'] { border-radius: 0 !important; }
.ui-v3 .uf-practice-legacy .scroll-col .dash-panel { background: var(--uf-raised); border-color: var(--uf-line); }
</style>
