<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { priorTrainingSessions, reactionMetricScore, isTrackingScenario, trainingComparisonRequest, resultCountCells, reactionMetricLabel, isTimeToHitMetric, accuracyMetricLabel, drillDetailCells } from '../lib/training-result-metrics'
import { TRAINER_SCENARIOS, isBetaScenario, trainerScenarioDef, type TrainerUiGroup } from '../lib/trainer-scenarios'
import { asSessionEnded, launchConfigFromInfo, launchTrainer, sessionEndedMessage } from '../lib/trainer-launch'
import upforgeLogo from '../assets/upforge-logo.webp'
import TrainingIcon from '../components/training/TrainingIcon.vue'
import { useRouter } from 'vue-router'
import { useTrainerResultStore } from '../stores/trainerResult'
import type { TrainingHistory } from '../env'
import { uiV3 } from '../lib/ui-v3'
import { scenarioIconUrl } from '../lib/training-icons'
import UfButton from '../components/v3/UfButton.vue'
import UfIcon from '../components/v3/UfIcon.vue'
import { deltaTone, isBest, pct, signed, toneColor } from '../components/v3/practice/practice-session-v3'

const router = useRouter()
const store = useTrainerResultStore()

// ── Redirect if no result in store ───────────────────────────────────────────
if (!store.result) {
  router.replace('/training')
}

// ── State ─────────────────────────────────────────────────────────────────────
const history = ref<TrainingHistory | null>(null)
const launching = ref(false)
const launched = ref(false)
const heatmapCanvas = ref<HTMLCanvasElement | null>(null)

let removeListener: (() => void) | null = null
let removeEndedListener: (() => void) | null = null

// ── Scenario metadata ─────────────────────────────────────────────────────────
// Labels from the canonical registry (src/lib/trainer-scenarios.ts); colour by drill group.
const GROUP_STYLE: Record<TrainerUiGroup, { color: string; accent: string }> = {
  aim:       { color: 'text-red-400',     accent: '#f87171' },
  reaction:  { color: 'text-sky-400',     accent: '#38bdf8' },
  precision: { color: 'text-amber-400',   accent: '#fbbf24' },
  duel:      { color: 'text-emerald-400', accent: '#34d399' },
}
const SCENARIO_META: Record<string, { label: string; color: string; accent: string }> = Object.fromEntries(
  TRAINER_SCENARIOS.map(s => [s.key, { label: s.label, ...GROUP_STYLE[s.uiGroup] }]),
)

/** "Continue your rotation": every drill, alternating groups so the next one trains something different. */
const SCENARIO_ROTATION = [
  'flick', 'tracking', 'microadjust', 'switching', 'gridshot', 'strafe_track', 'microflick',
  'strafe_aim', 'sixshot', 'head_height', 'angle_clearing', 'distance_switching', 'duel',
]

// ── Computed ─────────────────────────────────────────────────────────────────
const result = computed(() => store.result!)
const isPB = computed(() => !!trainingComparisonRequest(result.value) && store.isPB)

const scenarioMeta = computed(() =>
  SCENARIO_META[result.value?.scenario ?? ''] ?? { label: result.value?.scenario ?? '', color: 'text-gray-400', accent: '#9ca3af' }
)

function scoreColor(s: number) {
  if (s >= 90) return 'text-violet-400'
  if (s >= 78) return 'text-green-400'
  if (s >= 65) return 'text-teal-400'
  if (s >= 50) return 'text-yellow-400'
  if (s >= 35) return 'text-orange-400'
  return 'text-red-400'
}

function scoreLabel(s: number) {
  if (s >= 90) return 'S · Outstanding'
  if (s >= 78) return 'A · Strong Game'
  if (s >= 65) return 'B · Solid'
  if (s >= 50) return 'C · Room to Improve'
  if (s >= 35) return 'D · Developing'
  return 'E · Lots to Work On'
}

function scoreAccent(s: number) {
  if (s >= 75) return '#4ade80'
  if (s >= 50) return '#facc15'
  if (s >= 25) return '#fb923c'
  return '#f87171'
}

const reactionScore = reactionMetricScore
const tracking = computed(() => isTrackingScenario(result.value.scenario))
const timeToHit = computed(() => isTimeToHitMetric(result.value.scenario))
// Jiggle Peek / Trade Window send exposure / trade time in avg_reaction_ms, measured even with no hits.
const hasReaction = computed(() => !tracking.value && (timeToHit.value ? result.value.targets_hit > 0 : result.value.avg_reaction_ms > 0))
const reactionLabel = computed(() => reactionMetricLabel(result.value.scenario))
const reactionTitle = computed(() => timeToHit.value
  ? 'Average time to a successful hit. The bar uses a fixed 150–400ms reference, not a player percentile.'
  : `Average ${reactionLabel.value.toLowerCase()} in ms. Lower is better. The bar uses a fixed 150–400ms reference.`)
const accuracyLabel = computed(() => accuracyMetricLabel(result.value.scenario))
const detailCells = computed(() => drillDetailCells(result.value))
const isBeta = computed(() => isBetaScenario(result.value.scenario))
const hasConsistency = computed(() => !tracking.value && result.value.targets_hit >= 2)
const countCells = computed(() => resultCountCells(result.value))
const scenarioTip = computed(() => trainerScenarioDef(result.value.scenario)?.tip ?? 'Pre-aim corners before committing — don\'t wide-peek.')
const trainerNotice = ref<string | null>(null)
const priorSessions = computed(() => priorTrainingSessions(
  history.value?.by_scenario?.[result.value.scenario]?.sessions ?? [], result.value,
))
const scoreDelta = computed(() => priorSessions.value.length ? (result.value.score - priorSessions.value[0].score) * 10 : null)

// Top 5 sessions for this scenario (including current, sorted by score desc)
const leaderboard = computed(() => {
  const sessions = priorSessions.value
  const current = {
    score: result.value.score,
    completed_at: result.value.completed_at,
    isCurrent: true,
  }
  const all = [
    ...sessions.map(s => ({ score: s.score, completed_at: s.completed_at, isCurrent: false })),
    current,
  ]
  return all
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s, i) => ({ ...s, rank: i + 1 }))
})

// Score history for chart (chronological, last 10 sessions + current)
const chartScores = computed<number[]>(() => {
  const sessions = priorSessions.value
  const hist = [...sessions].reverse().slice(-9).map(s => s.score)
  return [...hist, result.value.score]
})

// ── SVG chart ─────────────────────────────────────────────────────────────────
const W = 400, H = 100
const PAD = { top: 10, bottom: 14, left: 28, right: 10 }
const chartW = W - PAD.left - PAD.right
const chartH = H - PAD.top - PAD.bottom

const gridLines = [25, 50, 75].map(v => ({
  y: PAD.top + chartH - (v / 100) * chartH,
  label: String(v * 10),
}))

const chartPath = computed(() => {
  const scores = chartScores.value
  if (scores.length < 2) return ''
  const pts = scores.map((s, i) => {
    const x = PAD.left + (i / (scores.length - 1)) * chartW
    const y = PAD.top + chartH - (s / 100) * chartH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${pts.join(' L ')}`
})

const chartFill = computed(() => {
  const scores = chartScores.value
  if (scores.length < 2) return ''
  const pts = scores.map((s, i) => {
    const x = PAD.left + (i / (scores.length - 1)) * chartW
    const y = PAD.top + chartH - (s / 100) * chartH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const lastX = PAD.left + chartW
  const firstX = PAD.left
  const baseY = PAD.top + chartH
  return `M ${pts.join(' L ')} L ${lastX},${baseY} L ${firstX},${baseY} Z`
})

const chartDots = computed(() => {
  const scores = chartScores.value
  if (!scores.length) return []
  return scores.map((s, i) => ({
    cx: PAD.left + (i / Math.max(scores.length - 1, 1)) * chartW,
    cy: PAD.top + chartH - (s / 100) * chartH,
    isCurrent: i === scores.length - 1,
    score: s,
  }))
})

// ── Coaching insight ─────────────────────────────────────────────────────────
const coachingInsight = computed(() => {
  const r = result.value
  const lines: string[] = []
  const acc  = r.accuracy_pct
  const rxn  = r.avg_reaction_ms
  const cons = r.consistency_score
  const total = r.targets_hit + r.targets_missed

  if (acc < 25) {
    lines.push('Accuracy is very low. Let your crosshair fully settle before clicking. Pre-aim common positions instead of reacting after the target appears.')
  } else if (acc < 45) {
    lines.push('Accuracy suggests rushed shots. Slow down slightly — a well-aimed shot 50ms later is worth more than two misses.')
  } else if (acc < 65) {
    lines.push('Accuracy is building. Hold tighter crosshair placement so you need less movement to reach targets.')
  } else if (acc >= 85) {
    lines.push('Excellent accuracy. Consider increasing difficulty or target speed to push your ceiling further.')
  }

  if (!timeToHit.value) {
    // Exposure / trade time: the reaction-time advice below does not apply.
  } else if (hasReaction.value && rxn > 700) {
    lines.push('High reaction time detected. Ensure you click promptly and aren\'t over-tracking. If this is a flick drill, check your sensitivity — too low causes slow swings.')
  } else if (hasReaction.value && rxn > 350) {
    lines.push('Reaction time has room to improve. Stay mentally engaged between targets — anticipate the next appearance zone rather than waiting for it.')
  } else if (hasReaction.value && rxn < 150 && acc < 65) {
    lines.push('Very fast reactions but accuracy is suffering. Dial back speed slightly to find your precision floor.')
  }

  if (hasConsistency.value && cons < 35) {
    lines.push('High variance detected. Warm up for 2–3 minutes before your next session — cold muscles amplify inconsistency significantly.')
  } else if (hasConsistency.value && cons < 55) {
    lines.push('Moderate consistency. Identify your strongest few shots and try to replicate that mental state across the full drill.')
  }

  if (hasConsistency.value && total > 0 && r.targets_hit / total > 0.9 && cons < 60) {
    lines.push('High hit rate but lower consistency suggests mechanical capability without full control yet. Deliberate repetition will lock this in.')
  }

  if (!hasReaction.value && !tracking.value) lines.push('No successful hits recorded. Reaction time and consistency are not available for this run.')
  if (tracking.value) return [r.scenario === 'strafe_track' ? 'Tracking accuracy measures time on target while firing. Reaction time and click consistency do not apply to this drill.' : 'Tracking accuracy measures time with the cursor on target. Reaction time and click consistency do not apply to this drill.']
  if (hasReaction.value && !hasConsistency.value) lines.push('At least two successful hits are needed to measure consistency.')

  if (!lines.length) {
    lines.push('Strong performance across all metrics. Consistency is the key to translating trainer scores into real match impact. Stay on a daily cadence.')
  }

  return lines
})

// ── Recommended next drill ────────────────────────────────────────────────────
const recommended = computed(() => {
  const r = result.value
  const scenario = r.scenario
  const acc  = r.accuracy_pct
  const rxn  = r.avg_reaction_ms
  const cons = r.consistency_score

  if (scenario === 'tracking' && acc < 50) {
    return { scenario: 'microadjust', reason: 'Reinforce fine targeting control after low tracking accuracy' }
  }
  if (scenario === 'flick' && rxn > 400) {
    return { scenario: 'switching', reason: 'Train rapid target acquisition to reduce reaction time' }
  }
  if (hasConsistency.value && cons < 50) {
    return { scenario, reason: 'Repeat for consistency — variance is still high' }
  }
  const idx = SCENARIO_ROTATION.indexOf(scenario)
  const next = SCENARIO_ROTATION[(idx + 1) % SCENARIO_ROTATION.length]
  return { scenario: next, reason: 'Continue your rotation to build well-rounded aim' }
})

const recommendedMeta = computed(() =>
  SCENARIO_META[recommended.value.scenario] ?? scenarioMeta.value
)

// ── Heatmap ──────────────────────────────────────────────────────────────────
function drawHeatmap() {
  nextTick(() => {
    const canvas = heatmapCanvas.value
    if (!canvas || !result.value.heatmap?.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    for (const pt of result.value.heatmap) {
      const x = pt.x * width
      const y = pt.y * height
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 10)
      if (pt.hit) {
        grad.addColorStop(0, 'rgba(74,222,128,0.8)')
        grad.addColorStop(1, 'rgba(74,222,128,0)')
      } else {
        grad.addColorStop(0, 'rgba(248,113,113,0.7)')
        grad.addColorStop(1, 'rgba(248,113,113,0)')
      }
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

// ── Play Again ────────────────────────────────────────────────────────────────
async function playAgain() {
  if (launching.value || !store.launchConfig) return
  await launchFromResults(store.launchConfig)
}

async function tryRecommended() {
  if (launching.value) return
  const rec = recommended.value
  await launchFromResults({
    scenario: rec.scenario,
    duration_seconds: store.launchConfig?.duration_seconds ?? 60,
    difficulty: store.launchConfig?.difficulty ?? 'medium',
    context: { weakness: rec.scenario, score: 0 },
    // A different drill is free play: it does not count towards the original assigned drill.
    ...(rec.scenario === store.launchConfig?.scenario && store.launchConfig?.user_drill_id
      ? { user_drill_id: store.launchConfig.user_drill_id } : {}),
  })
}

/** Every launch from this screen updates launchConfig, so the next result and "Play again" match it. */
async function launchFromResults(req: Parameters<typeof launchTrainer>[0]) {
  launching.value = true
  launched.value = false
  trainerNotice.value = null
  try {
    const res = await launchTrainer(req)
    if (res.ok) {
      launched.value = true
      store.setLaunchConfig(res.config)
    } else {
      trainerNotice.value = res.error ?? null
    }
  } finally {
    launching.value = false
  }
}

function backToHub() {
  router.push('/training')
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

async function loadComparison() {
  const current = result.value
  const comparison = trainingComparisonRequest(current)
  store.setPB(false)
  history.value = null
  if (!comparison) return
  const response = await window.api.trainer.getHistory(comparison)
  if (store.result !== current) return
  history.value = response
  const best = response?.by_scenario?.[current.scenario]?.best_score
  store.setPB(response !== null && best != null && current.score > best)
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!store.result) return

  await loadComparison()
  drawHeatmap()

  // Listen for results from Play Again (since TrainingHubView is unmounted)
  removeListener = window.api.on('trainer:session-result', async (raw: unknown, launch?: unknown) => {
    const r = raw as typeof store.result
    if (!r) return
    store.setResult(r, launchConfigFromInfo(launch) ?? store.launchConfig, null)
    launched.value = false
    trainerNotice.value = null
    await loadComparison()
    drawHeatmap()
  })

  removeEndedListener = window.api.on('trainer:session-ended', (raw: unknown) => {
    const ended = asSessionEnded(raw)
    if (!ended || ended.reason === 'completed' || launching.value) return
    launched.value = false
    trainerNotice.value = sessionEndedMessage(ended)
  })
})

onUnmounted(() => {
  removeEndedListener?.()
  removeListener?.()
})
</script>

<template>
  <!-- UI v3 (legacy markup below, unchanged) -->
  <div v-if="uiV3 && !result" class="uf-tr fixed inset-0 flex flex-col overflow-hidden">
    <div class="uf-tr-bar">
      <span class="uf-label">Training results</span>
      <button type="button" aria-label="Back to training" class="uf-tr-close" @click="backToHub"><UfIcon name="close" :size="16" /></button>
    </div>
    <div class="uf-tr-body">
      <div class="uf-tr-empty">
        <p class="uf-t2" style="margin: 0">No drill result yet. Finish a drill and your score shows up here.</p>
        <button type="button" class="uf-link" @click="backToHub">Back to Practice</button>
      </div>
    </div>
  </div>
  <div v-else-if="uiV3 && result" class="uf-tr fixed inset-0 flex flex-col overflow-hidden">
    <div class="uf-tr-bar">
      <span class="uf-label">Training results</span>
      <button type="button" aria-label="Back to training" class="uf-tr-close" @click="backToHub"><UfIcon name="close" :size="16" /></button>
    </div>

    <div class="uf-tr-body" tabindex="0" role="region" aria-label="Training results">
      <!-- Hero: the score, then the coach's sentence and the one action -->
      <section class="uf-tr-hero">
        <div class="uf-tr-score uf-rise">
          <span class="uf-tr-kicker">
            <img :src="scenarioIconUrl(result.scenario)" alt="" class="uf-tr-icon">
            <span class="uf-t3">{{ scenarioMeta.label }}<span v-if="isBeta" class="uf-picker-tag" style="color: var(--uf-gold)">Beta</span></span>
            <span class="uf-t4">{{ formatDate(result.completed_at) }}<span v-if="store.launchConfig" style="text-transform: capitalize"> · {{ store.launchConfig.difficulty }} · {{ store.launchConfig.duration_seconds }}s</span></span>
          </span>
          <span class="uf-d1">{{ result.score * 10 }}</span>
          <span class="uf-tr-score-meta">
            <span class="uf-t4">/ 1000 · {{ scoreLabel(result.score) }}</span>
            <span v-if="scoreDelta !== null" class="uf-t4 uf-num" :style="{ color: toneColor(deltaTone(scoreDelta)) }">{{ signed(scoreDelta) }} vs previous</span>
            <span v-else-if="history?.by_scenario?.[result.scenario]?.sessions?.length === 0" class="uf-t4">First run with these settings</span>
            <span v-if="isPB" class="uf-t4" style="color: var(--uf-gold)">★ New personal best</span>
          </span>
        </div>
        <div class="uf-tr-coach uf-rise uf-d1s">
          <span class="uf-label">Session feedback</span>
          <p class="uf-t1" style="margin: 0">{{ coachingInsight[0] }}</p>
          <p v-for="(line, i) in coachingInsight.slice(1)" :key="i" class="uf-t2" style="margin: 0">{{ line }}</p>
          <div class="uf-tr-actions">
            <UfButton v-if="store.launchConfig" variant="primary" icon="play" :disabled="launching" @click="playAgain">{{ launching ? 'Launching…' : 'Play again' }}</UfButton>
            <UfButton variant="link" @click="backToHub">Back to training</UfButton>
          </div>
          <p v-if="launched" class="uf-t4" style="margin: 0; color: var(--uf-win)">Trainer launched. Finish the drill to see your results here.</p>
          <p v-if="trainerNotice" class="uf-t4" role="status" style="margin: 0">{{ trainerNotice }}</p>
        </div>
      </section>

      <!-- Numbers inline -->
      <dl class="uf-tr-stats uf-rise uf-d2s">
        <div>
          <dt class="uf-t4">{{ accuracyLabel }}</dt>
          <dd class="uf-d4">{{ result.accuracy_pct.toFixed(1) }}%</dd>
          <span class="uf-tr-bar-in"><span class="uf-fill" :style="{ width: pct(result.accuracy_pct) + '%' }" /></span>
        </div>
        <div :title="reactionTitle">
          <dt class="uf-t4">{{ reactionLabel }}</dt>
          <dd class="uf-d4" :style="hasReaction ? undefined : 'color: var(--uf-faint)'">{{ hasReaction ? `${result.avg_reaction_ms}ms` : 'Not measured' }}</dd>
          <span class="uf-tr-bar-in"><span class="uf-fill" :style="{ width: (hasReaction ? pct(reactionScore(result.avg_reaction_ms)) : 0) + '%' }" /></span>
        </div>
        <div>
          <dt class="uf-t4">Consistency</dt>
          <dd class="uf-d4" :style="hasConsistency ? undefined : 'color: var(--uf-faint)'">{{ hasConsistency ? result.consistency_score : 'Not measured' }}</dd>
          <span class="uf-tr-bar-in"><span class="uf-fill" :style="{ width: (hasConsistency ? pct(result.consistency_score) : 0) + '%' }" /></span>
        </div>
        <div v-for="cell in countCells" :key="cell.label">
          <dt class="uf-t4">{{ cell.label }}</dt>
          <dd class="uf-d4">{{ cell.value }}</dd>
        </div>
        <div v-for="cell in detailCells" :key="`d-${cell.label}`">
          <dt class="uf-t4">{{ cell.label }}</dt>
          <dd class="uf-d4">{{ cell.value }}</dd>
        </div>
      </dl>

      <div class="uf-tr-grid">
        <div class="uf-tr-main">
          <section class="uf-rise uf-d3s">
            <span class="uf-label">Score trend</span>
            <p class="uf-t4" style="margin: 8px 0 12px">
              {{ trainingComparisonRequest(result) ? `${result.metadata?.difficulty} · ${result.duration_seconds}s · Updated scoring. Comparisons use matching settings.` : 'Legacy or incomplete settings. This score is saved separately from current comparisons.' }}
            </p>
            <p v-if="chartScores.length < 2" class="uf-t2" style="margin: 0">Play another run with the same difficulty and length to see a trend.</p>
            <svg v-else :viewBox="`0 0 ${W} ${H}`" class="uf-tr-chart" role="img" :aria-label="`Score trend over ${chartScores.length} runs`">
              <line v-for="g in gridLines" :key="g.label" :x1="PAD.left" :y1="g.y" :x2="W - PAD.right" :y2="g.y" stroke="var(--uf-line)" stroke-width="1" />
              <text v-for="g in gridLines" :key="`t-${g.label}`" :x="PAD.left - 4" :y="g.y + 3.5" text-anchor="end" fill="var(--uf-faint)" font-size="8">{{ g.label }}</text>
              <path :d="chartPath" fill="none" stroke="var(--uf-bone)" stroke-width="1.5" stroke-linejoin="round" />
              <circle
                v-for="(dot, i) in chartDots" :key="i" :cx="dot.cx" :cy="dot.cy" :r="dot.isCurrent ? 4 : 2.5"
                :fill="dot.isCurrent ? 'var(--uf-red)' : 'var(--uf-muted)'"
              />
            </svg>
          </section>

          <section v-if="['head_height', 'angle_clearing', 'distance_switching', 'clear_site'].includes(result.scenario)" class="uf-tr-block uf-rise uf-d3s">
            <span class="uf-label">Crosshair placement</span>
            <span class="uf-t4">Average vertical correction when the head first became visible</span>
            <span class="uf-d3">{{ typeof result.metadata?.mean_vertical_error_deg === 'number' ? `${result.metadata.mean_vertical_error_deg.toFixed(2)}°` : 'No visible targets measured' }}</span>
            <span class="uf-t4">Lower is better. Standing target sizes are estimated from range footage.</span>
          </section>

          <section v-if="result.heatmap?.length" class="uf-tr-block uf-rise uf-d4s">
            <span class="uf-label">Shot map</span>
            <div class="uf-tr-heat">
              <canvas ref="heatmapCanvas" width="640" height="360" />
              <span class="uf-tr-heat-key uf-t4"><i style="background: rgba(74,222,128,0.8)" />Hit <i style="background: rgba(248,113,113,0.7)" />Miss</span>
            </div>
          </section>
        </div>

        <aside class="uf-tr-aside uf-rise uf-d4s">
          <section class="uf-tr-block">
            <span class="uf-label">Your next drill</span>
            <span class="uf-t3">{{ recommendedMeta.label }}</span>
            <span class="uf-t4">{{ recommended.reason }}</span>
            <UfButton variant="secondary" icon="play" :disabled="launching" @click="tryRecommended">{{ launching ? 'Launching…' : 'Start drill' }}</UfButton>
          </section>
          <div class="uf-hair" />
          <section class="uf-tr-block">
            <span class="uf-label">Top runs · this drill</span>
            <p v-if="leaderboard.length === 0" class="uf-t4" style="margin: 0">No runs on record yet.</p>
            <ol v-else class="uf-tr-top">
              <li v-for="entry in leaderboard" :key="entry.rank" :class="{ current: entry.isCurrent }">
                <span class="uf-t4 uf-num" :style="isBest(entry.rank) ? 'color: var(--uf-gold)' : undefined" style="width: 32px">{{ isBest(entry.rank) ? '★' : '' }}{{ entry.rank }}</span>
                <span class="uf-d4">{{ entry.score * 10 }}</span>
                <span class="uf-t4" style="margin-left: auto">{{ entry.isCurrent ? 'This run' : formatDate(entry.completed_at) }}</span>
              </li>
            </ol>
          </section>
          <div class="uf-hair" />
          <section class="uf-tr-block">
            <span class="uf-label">Tip</span>
            <span class="uf-t4">
              {{ scenarioTip }}
            </span>
          </section>
        </aside>
      </div>
    </div>
  </div>

  <template v-else>
  <div v-if="result" class="results-shell fixed inset-0 flex flex-col overflow-hidden select-none">

    <header class="results-header">
      <div class="results-brand-row">
        <img :src="upforgeLogo" alt="UpForge" class="h-9 w-auto" />
        <span class="text-xs text-white/50">Training results</span>
        <button type="button" aria-label="Back to training" class="results-close" @click="backToHub">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div class="results-title-row">
        <div class="flex min-w-0 items-center gap-3">
          <div class="results-scenario-icon"><TrainingIcon :name="result.scenario" class="h-6 w-6" /></div>
          <div class="min-w-0">
            <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">{{ scenarioMeta.label }}<span v-if="isBeta" class="rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">Beta</span></h1>
            <p class="mt-1 text-xs text-white/50">Session complete · {{ formatDate(result.completed_at) }}<span v-if="store.launchConfig" class="capitalize"> · {{ store.launchConfig.difficulty }} · {{ store.launchConfig.duration_seconds }}s</span></p>
          </div>
        </div>
        <span v-if="isPB" class="flex items-center gap-2 text-sm font-semibold text-amber-300"><TrainingIcon name="leaderboards" class="h-5 w-5" />New personal best</span>
      </div>
    </header>

    <!-- ── Responsive results layout ────────────────────────────────────────────── -->
    <div class="results-body flex-1 min-h-0 overflow-y-auto" tabindex="0" role="region" aria-label="Training results">

      <!-- ═══ LEFT PANEL ═══════════════════════════════════════════════════ -->
      <div class="results-panel results-summary flex flex-col gap-4 p-5">

        <!-- Score -->
        <div class="results-score">
          <span class="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Score</span>
          <span :class="['text-[64px] font-bold leading-none tabular-nums', scoreColor(result.score)]">
            {{ result.score * 10 }}
          </span>
          <span class="text-[11px] text-white/50 mt-1 font-medium">/ 1000 <span class="mx-2 text-white/20">|</span> {{ scoreLabel(result.score) }}</span>

          <div v-if="scoreDelta !== null" class="mt-2 flex items-center gap-1">
            <svg v-if="scoreDelta > 0" class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
            <svg v-else-if="scoreDelta < 0" class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            <span :class="['text-sm font-bold', scoreDelta > 0 ? 'text-green-400' : scoreDelta < 0 ? 'text-red-400' : 'text-gray-500']">
              {{ scoreDelta > 0 ? '+' : '' }}{{ scoreDelta }}
            </span>
            <span class="text-xs text-white/50">vs previous</span>
          </div>
          <div v-else-if="history?.by_scenario?.[result.scenario]?.sessions?.length === 0" class="mt-2">
            <span class="text-xs text-white/50 italic">First session — no comparison yet</span>
          </div>
        </div>

        <!-- Quick stats -->
        <div class="bg-white/[0.03] border border-white/[0.10] rounded-lg p-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-0.5">Duration</div>
            <div class="text-sm font-semibold text-white/80">{{ result.duration_seconds }}s</div>
          </div>
          <div v-for="cell in countCells" :key="cell.label">
            <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-0.5">{{ cell.label }}</div>
            <div class="text-sm font-semibold text-white/80">{{ cell.value }}</div>
          </div>
          <div v-for="cell in detailCells" :key="`d-${cell.label}`">
            <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-0.5">{{ cell.label }}</div>
            <div class="text-sm font-semibold text-white/80">{{ cell.value }}</div>
          </div>
        </div>

        <!-- Leaderboard -->
        <div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-2 px-0.5">This Scenario — Top Sessions</div>
          <div
            v-if="leaderboard.length === 0"
            class="text-xs text-white/50 italic px-0.5"
          >
            No sessions on record yet.
          </div>
          <div
            v-for="entry in leaderboard"
            :key="entry.rank"
            :class="[
              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 mb-1 transition-colors',
              entry.isCurrent
                ? 'bg-white/[0.07] border border-white/[0.12]'
                : 'bg-white/[0.02] border border-transparent',
            ]"
          >
            <span :class="['text-[10px] font-bold w-5 text-center', entry.rank === 1 ? 'text-yellow-400' : entry.rank === 2 ? 'text-gray-400' : entry.rank === 3 ? 'text-amber-600' : 'text-white/50']">
              <template v-if="entry.rank <= 3">
                <svg class="w-3 h-3 inline" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </template>
              <template v-else>#{{ entry.rank }}</template>
            </span>
            <span :class="['text-sm font-bold tabular-nums', scoreColor(entry.score)]">
              {{ entry.score * 10 }}
            </span>
            <span class="flex-1 text-[10px] text-white/50">
              {{ entry.isCurrent ? 'this run' : formatDate(entry.completed_at) }}
            </span>
          </div>
        </div>

      </div>

      <!-- ═══ CENTER PANEL ══════════════════════════════════════════════════ -->
      <div class="results-panel flex flex-col gap-5 p-5">

        <p class="text-[11px] text-white/50">
          {{ trainingComparisonRequest(result) ? `${result.metadata?.difficulty} · ${result.duration_seconds}s · Updated scoring. Comparisons use matching settings.` : 'Legacy or incomplete settings. This score is saved separately from current comparisons.' }}
        </p>
        <!-- Score trend chart -->
        <div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-3">Score Trend</div>
          <div v-if="chartScores.length < 2" class="h-[100px] flex items-center justify-center">
            <span class="text-xs text-white/50 italic">Complete another run with the same difficulty and duration to show a trend</span>
          </div>
          <svg v-else :viewBox="`0 0 ${W} ${H}`" class="w-full h-[100px]">
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="scoreAccent(result.score)" stop-opacity="0.3" />
                <stop offset="100%" :stop-color="scoreAccent(result.score)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <!-- Grid lines -->
            <line
              v-for="g in gridLines" :key="g.label"
              :x1="PAD.left" :y1="g.y" :x2="W - PAD.right" :y2="g.y"
              stroke="rgba(255,255,255,0.05)" stroke-width="1"
            />
            <text
              v-for="g in gridLines" :key="`t-${g.label}`"
              :x="PAD.left - 4" :y="g.y + 3.5"
              text-anchor="end" fill="rgba(255,255,255,0.2)" font-size="8"
            >{{ g.label }}</text>
            <!-- Fill -->
            <path :d="chartFill" fill="url(#chartFill)" />
            <!-- Line -->
            <path :d="chartPath" fill="none" :stroke="scoreAccent(result.score)" stroke-width="1.5" stroke-linejoin="round" />
            <!-- Dots -->
            <circle
              v-for="(dot, i) in chartDots" :key="i"
              :cx="dot.cx" :cy="dot.cy"
              :r="dot.isCurrent ? 4 : 2.5"
              :fill="dot.isCurrent ? scoreAccent(result.score) : 'rgba(255,255,255,0.4)'"
              :stroke="dot.isCurrent ? '#0b1219' : 'none'"
              :stroke-width="dot.isCurrent ? 2 : 0"
            />
          </svg>
        </div>

        <div v-if="['head_height', 'angle_clearing', 'distance_switching', 'clear_site'].includes(result.scenario)" class="border border-white/10 rounded-lg p-4 space-y-2 text-sm">
          <p class="font-semibold text-white">Crosshair placement</p>
          <p class="text-white/60">Average vertical correction when the head first became visible:</p>
          <p class="text-lg tabular-nums text-teal-400">
            {{ typeof result.metadata?.mean_vertical_error_deg === 'number' ? `${result.metadata.mean_vertical_error_deg.toFixed(2)}°` : 'No visible targets measured' }}
          </p>
          <p class="text-xs text-white/50">Lower is better. Standing target sizes are estimated from range footage.</p>
        </div>

        <!-- Stat breakdown -->
        <div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-3">Performance Breakdown</div>
          <div class="flex flex-col gap-3">
            <!-- Accuracy -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-white/60">{{ accuracyLabel }}</span>
                <span :class="['text-xs font-bold tabular-nums', scoreColor(result.accuracy_pct)]">
                  {{ result.accuracy_pct.toFixed(1) }}%
                </span>
              </div>
              <div class="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :style="{ width: `${result.accuracy_pct}%`, backgroundColor: scoreAccent(result.accuracy_pct) }"
                />
              </div>
            </div>
            <!-- Reaction -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-white/60" :title="reactionTitle">{{ reactionLabel }}</span>
                <span :class="['text-xs font-bold tabular-nums', scoreColor(reactionScore(result.avg_reaction_ms))]">
                  {{ hasReaction ? `${result.avg_reaction_ms}ms` : 'Not measured' }}
                </span>
              </div>
              <div class="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :style="{ width: `${hasReaction ? reactionScore(result.avg_reaction_ms) : 0}%`, backgroundColor: scoreAccent(reactionScore(result.avg_reaction_ms)) }"
                />
              </div>
              <div class="flex justify-between mt-0.5">
                <span class="text-[9px] text-white/50">slow</span>
                <span class="text-[9px] text-white/50">fast (≤150ms)</span>
              </div>
            </div>
            <!-- Consistency -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-white/60">Consistency</span>
                <span :class="['text-xs font-bold tabular-nums', scoreColor(result.consistency_score)]">
                  {{ hasConsistency ? result.consistency_score : 'Not measured' }}
                </span>
              </div>
              <div class="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :style="{ width: `${hasConsistency ? result.consistency_score : 0}%`, backgroundColor: scoreAccent(result.consistency_score) }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Heatmap -->
        <div v-if="result.heatmap?.length">
          <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-3">Shot Heatmap</div>
          <div class="relative bg-white/[0.03] border border-white/[0.10] rounded-lg overflow-hidden" style="aspect-ratio: 16/9;">
            <canvas ref="heatmapCanvas" class="absolute inset-0 w-full h-full" width="640" height="360" />
            <div class="absolute bottom-2 right-2 flex items-center gap-3">
              <span class="flex items-center gap-1 text-[9px] text-green-400/60">
                <span class="w-1.5 h-1.5 rounded-full bg-green-400/60 inline-block" /> hit
              </span>
              <span class="flex items-center gap-1 text-[9px] text-red-400/60">
                <span class="w-1.5 h-1.5 rounded-full bg-red-400/60 inline-block" /> miss
              </span>
            </div>
          </div>
        </div>

      </div>

      <!-- ═══ RIGHT PANEL ══════════════════════════════════════════════════ -->
      <div class="results-panel flex flex-col gap-4 p-5">

        <!-- AI Coaching insight -->
        <div>
          <div class="flex items-center gap-1.5 mb-3">
            <svg class="w-3 h-3 text-[#ff4655]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.5A3.992 3.992 0 0112 18a3.992 3.992 0 01-2.79-1.115l-.347-.499z" />
            </svg>
            <span class="text-[9px] font-bold uppercase tracking-widest text-white/40">Session feedback</span>
          </div>
          <div class="space-y-4">
            <p
              v-for="(line, i) in coachingInsight"
              :key="i"
              class="text-sm leading-relaxed text-white/70"
            >
              {{ line }}
            </p>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-white/[0.09]" />

        <!-- Recommended next -->
        <div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-3">Your next drill</div>
          <div class="results-next-drill">
            <div class="text-base font-semibold text-white mb-1">{{ recommendedMeta.label }}</div>
            <div class="text-[10px] text-white/40 leading-relaxed mb-3">{{ recommended.reason }}</div>
            <button
              class="w-full text-xs font-semibold text-white/70 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 rounded-md py-1.5 transition-colors"
              :disabled="launching"
              @click="tryRecommended"
            >
              {{ launching ? 'Launching…' : 'Start drill' }}
            </button>
          </div>
        </div>

        <!-- Launched notice -->
        <div
          v-if="launched"
          class="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center"
        >
          <div class="text-xs text-green-400 font-semibold">Trainer launched!</div>
          <div class="text-[10px] text-green-400/60 mt-0.5">Complete the drill to see your results here.</div>
        </div>
        <div v-if="trainerNotice" class="bg-white/[0.04] border border-white/[0.10] rounded-lg p-3 text-center text-[11px] text-white/70" role="status">
          {{ trainerNotice }}
        </div>

        <!-- Tip -->
        <div class="mt-auto pt-2 border-t border-white/[0.07]">
          <div class="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-1.5">Tip</div>
          <p class="text-[10px] leading-relaxed text-white/50 italic">
            {{ scenarioTip }}
          </p>
        </div>

      </div>
    </div>

    <!-- ── Footer ──────────────────────────────────────────────────────────── -->
    <div class="results-footer flex flex-wrap items-center justify-end gap-3 px-5 py-3 border-t border-white/[0.10] flex-shrink-0">
      <span v-if="store.launchConfig" class="text-[10px] text-white/50 capitalize mr-auto">
        {{ store.launchConfig.difficulty }} · {{ store.launchConfig.duration_seconds }}s
      </span>
      <button
        class="px-4 py-2 rounded-lg text-xs font-medium text-white/50 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.14] transition-colors"
        @click="backToHub"
      >
        Back to training
      </button>
      <button
        v-if="store.launchConfig"
        class="px-5 py-2 rounded-lg text-xs font-bold text-white bg-[#ff4655] hover:bg-[#e03545] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        :disabled="launching"
        @click="playAgain"
      >
        <span v-if="launching">Launching…</span>
        <span v-else>Play again</span>
      </button>
    </div>

  </div>
  </template>
</template>

<style scoped>
.results-shell { background: #101113; color: #e5e7eb; }
.results-header { flex-shrink: 0; padding: 30px 24px 20px; border-bottom: 1px solid #ffffff14; border-top: 3px solid #ff4655; }
.results-brand-row { display: flex; align-items: center; gap: 20px; }
.results-close { margin-left: auto; padding: 8px; color: #9ca3af; border-radius: 6px; }
.results-close:hover { background: #ffffff0a; color: white; }
.results-title-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-top: 22px; }
.results-scenario-icon { padding: 12px; border: 1px solid #ff465533; background: #ff46550a; color: #ff4655; border-radius: 8px; }
.results-summary { background: #ffffff02; }
.results-score { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 0 20px; }
.results-next-drill { background: #ffffff03; border: 1px solid #ffffff14; border-left: 3px solid #ff4655; padding: 16px; border-radius: 6px; }
.results-footer { background: #141518; }
.results-shell :deep(button:focus-visible) { outline: 2px solid #ff4655; outline-offset: 3px; }

.results-body {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(260px, 1fr) minmax(280px, 1.15fr);
  align-content: start;
  scrollbar-gutter: stable;
}
.results-panel {
  min-width: 0;
  overflow-wrap: anywhere;
}
.results-panel + .results-panel {
  border-left: 1px solid rgb(255 255 255 / 9%);
}
@media (max-width: 900px) {
  .results-body { grid-template-columns: minmax(0, 1fr); }
  .results-panel + .results-panel {
    border-left: 0;
    border-top: 1px solid rgb(255 255 255 / 9%);
  }
}
</style>

<style scoped>
/* ── UI v3 ── */
.uf-tr { background: var(--uf-bg); color: var(--uf-bone); font-family: var(--uf-body); z-index: 30; }
.uf-tr-bar { height: 40px; flex: none; display: flex; align-items: center; padding-left: 40px; background: var(--uf-chrome); border-bottom: 1px solid var(--uf-line); }
.uf-tr-close { margin-left: auto; width: 44px; align-self: stretch; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-muted); cursor: pointer; }
.uf-tr-close:hover { background: var(--uf-red-deep); color: #fff; }
.uf-tr-body { flex: 1; min-height: 0; overflow-y: auto; padding: 32px 40px 40px; display: flex; flex-direction: column; gap: 32px; }
.uf-tr-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; padding: 56px 0; }
.uf-tr-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 56px; align-items: end; }
.uf-tr-score { display: flex; flex-direction: column; gap: 14px; }
.uf-tr-kicker { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.uf-tr-icon { width: 36px; height: 36px; flex: none; }
.uf-tr-score-meta { display: flex; gap: 16px; flex-wrap: wrap; }
.uf-tr-coach { display: flex; flex-direction: column; gap: 12px; max-width: 760px; padding-bottom: 6px; }
.uf-tr-actions { display: flex; align-items: center; gap: 24px; margin-top: 8px; }
.uf-tr-stats { display: flex; margin: 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.uf-tr-stats > div { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; min-width: 0; }
.uf-tr-stats > div + div { border-left: 1px solid var(--uf-line); }
.uf-tr-stats > div:first-child { padding-left: 0; }
.uf-tr-stats dt { order: 2; }
.uf-tr-stats dd { margin: 0; order: 1; }
.uf-tr-bar-in { order: 3; height: 3px; background: var(--uf-line); }
.uf-tr-bar-in > span { display: block; height: 100%; background: var(--uf-bone); }
.uf-tr-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 40px; align-items: start; }
.uf-tr-main { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
.uf-tr-chart { width: 100%; height: 140px; }
.uf-tr-block { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.uf-tr-heat { position: relative; width: 100%; aspect-ratio: 16 / 9; background: var(--uf-raised); border: 1px solid var(--uf-line); }
.uf-tr-heat canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.uf-tr-heat-key { position: absolute; right: 10px; bottom: 8px; display: flex; gap: 8px; align-items: center; }
.uf-tr-heat-key i { width: 8px; height: 8px; display: inline-block; }
.uf-tr-aside { display: flex; flex-direction: column; gap: 18px; padding-left: 28px; border-left: 1px solid var(--uf-line); align-self: stretch; }
.uf-tr-top { list-style: none; margin: 0; padding: 0; align-self: stretch; }
.uf-tr-top li { display: flex; align-items: baseline; gap: 14px; padding: 8px 0 8px 8px; border-top: 1px solid var(--uf-line); border-left: 2px solid transparent; }
.uf-tr-top li.current { border-left-color: var(--uf-red); background: var(--uf-raised); }
@media (max-width: 1000px) {
  .uf-tr-hero, .uf-tr-grid { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .uf-tr-stats { flex-wrap: wrap; }
  .uf-tr-aside { border-left: 0; padding-left: 0; }
}
</style>
