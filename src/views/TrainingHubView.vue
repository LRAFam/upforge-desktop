<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { TrainingHistory, CoachingDrill, TrainingBenchmark } from '../env'
import { ACHIEVEMENTS, useAchievements } from '../composables/useAchievements'

const ICON_LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
const ICON_TROPHY_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`
import { useTrainerResultStore } from '../stores/trainerResult'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SessionResult {
  scenario: string
  duration_seconds: number
  score: number
  accuracy_pct: number
  avg_reaction_ms: number
  consistency_score: number
  targets_hit: number
  targets_missed: number
  heatmap?: Array<{ x: number; y: number; hit: boolean }>
  completed_at: string
}

interface AssignedDrill {
  scenario: 'flick' | 'tracking' | 'microadjust' | 'switching' | 'duel'
  difficulty: 'easy' | 'medium' | 'hard' | 'pro'
  duration_seconds: number
  weakness: string
  weakness_score: number
  reason: string
}

// ── State ─────────────────────────────────────────────────────────────────────
const router = useRouter()
const trainerResultStore = useTrainerResultStore()
const launching = ref(false)
const drillRunning = ref(false)    // true from launch success → until result received
const showResultModal = ref(false) // completion modal
const isPB = ref(false) // whether last drill result is a personal best
const drillCardExporting = ref(false)
const drillCardDone = ref(false)
const weekCardExporting = ref(false)
const weekCardDone = ref(false)
const lastResult = ref<SessionResult | null>(null)
const lastPlayedDrill = ref<AssignedDrill | null>(null) // preserved after activeDrill cleared
const sessionHistory = ref<SessionResult[]>([])
const activeDrill = ref<AssignedDrill | null>(null)
const completedDrills = ref<Set<string>>(new Set())
const apiHistory = ref<TrainingHistory | null>(null)
const coachingDrills = ref<CoachingDrill[]>([])
const correlationInsights = ref<string[]>([])
const benchmarkData = ref<TrainingBenchmark | null>(null)
const loadingHistory = ref(false)
const heatmapCanvas = ref<HTMLCanvasElement | null>(null)
const activeTab = ref<'drills' | 'progress' | 'coaching'>('drills')

interface AiCoaching {
  focus_area: string
  headline: string
  message: string
  tips: string[]
  encouragement: string
}
const aiCoaching = ref<AiCoaching | null>(null)
const loadingAiCoaching = ref(false)

// ── Achievements ──────────────────────────────────────────────────────────────
const achievements = useAchievements()
const unlockedCount = computed(() => Object.keys(achievements.unlocked.value).length)
const isUnlocked = (id: string) => !!achievements.unlocked.value[id]
const displayAchievements = computed(() => ACHIEVEMENTS)
function formatAchievementDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

declare global {
  interface Window {
    __ufAchievementUnlocked?: (ids: string[]) => void
  }
}

// Assigned drills from API — falls back to defaults if API unavailable
const assignedDrills = ref<AssignedDrill[]>([
  {
    scenario: 'flick',
    difficulty: 'medium',
    duration_seconds: 60,
    weakness: 'crosshair_placement',
    weakness_score: 34,
    reason: 'Your last 3 VODs show crosshair below head-level on 68% of peeks',
  },
  {
    scenario: 'tracking',
    difficulty: 'medium',
    duration_seconds: 60,
    weakness: 'tracking',
    weakness_score: 41,
    reason: 'Duels against strafing enemies lost 72% of the time',
  },
  {
    scenario: 'microadjust',
    difficulty: 'medium',
    duration_seconds: 45,
    weakness: 'micro_corrections',
    weakness_score: 52,
    reason: 'Close-range duels — small misses under 100ms',
  },
])

// ── Scenario metadata ─────────────────────────────────────────────────────────
const SCENARIO_META: Record<string, {
  label: string; description: string; tip: string
  color: string; bg: string; border: string; band: string; dot: string; ring: string
}> = {
  flick: {
    label: 'Flick',
    description: 'React and snap to stationary targets.',
    tip: 'Keep your arm loose — flicks are shoulder, not wrist.',
    color: 'text-red-400',
    bg: 'bg-red-500/[0.08]',
    border: 'border-red-500/20',
    band: 'bg-red-500',
    dot: 'bg-red-400',
    ring: 'ring-red-500/30',
  },
  tracking: {
    label: 'Tracking',
    description: 'Keep crosshair on a moving target.',
    tip: 'Match the target speed — don\'t overshoot then correct.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/[0.08]',
    border: 'border-sky-500/20',
    band: 'bg-sky-500',
    dot: 'bg-sky-400',
    ring: 'ring-sky-500/30',
  },
  microadjust: {
    label: 'Micro-Adj',
    description: 'Fine corrections from near your cursor.',
    tip: 'Slow your mousepad movement — this is fingertip control.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/[0.08]',
    border: 'border-amber-500/20',
    band: 'bg-amber-500',
    dot: 'bg-amber-400',
    ring: 'ring-amber-500/30',
  },
  switching: {
    label: 'Switch',
    description: 'Click highlighted targets across screen.',
    tip: 'Move your eyes before your mouse — predict, don\'t react.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/[0.08]',
    border: 'border-violet-500/20',
    band: 'bg-violet-500',
    dot: 'bg-violet-400',
    ring: 'ring-violet-500/30',
  },
  duel: {
    label: '3D Duel',
    description: 'FPS arena — peek angles, WASD movement.',
    tip: 'Pre-aim corners before committing — don\'t wide-peek.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/[0.08]',
    border: 'border-emerald-500/20',
    band: 'bg-emerald-500',
    dot: 'bg-emerald-400',
    ring: 'ring-emerald-500/30',
  },
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'text-green-400',
  medium: 'text-yellow-400',
  hard: 'text-orange-400',
  pro: 'text-red-400',
}

const DIFFICULTY_BG: Record<string, string> = {
  easy: 'bg-green-500/10 border-green-500/20',
  medium: 'bg-yellow-500/10 border-yellow-500/20',
  hard: 'bg-orange-500/10 border-orange-500/20',
  pro: 'bg-red-500/10 border-red-500/20',
}

// ── Radar chart constants ─────────────────────────────────────────────────────
const RADAR_SCENARIOS = ['flick', 'tracking', 'microadjust', 'switching', 'duel'] as const
const RADAR_COLORS: Record<string, string> = {
  flick: '#f87171',
  tracking: '#38bdf8',
  microadjust: '#fbbf24',
  switching: '#a78bfa',
  duel: '#34d399',
}
// Map coaching drill category → trainable scenario
const CATEGORY_TO_SCENARIO: Record<string, AssignedDrill['scenario']> = {
  mechanics: 'flick',
  crosshair_placement: 'microadjust',
  tracking: 'tracking',
  switching: 'switching',
  duel: 'duel',
  game_sense: 'flick',
  positioning: 'microadjust',
  default: 'flick',
}

// ── Score helpers ─────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 55) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 55) return 'bg-yellow-500'
  return 'bg-red-500'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 55) return 'Average'
  if (score >= 35) return 'Needs Work'
  return 'Critical'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500/[0.06] border-green-500/20'
  if (score >= 55) return 'bg-yellow-500/[0.06] border-yellow-500/20'
  return 'bg-red-500/[0.06] border-red-500/20'
}

function trendIcon(trend: number | null): string {
  if (trend === null) return ''
  if (trend > 2) return '↑'
  if (trend < -2) return '↓'
  return '→'
}

function trendColor(trend: number | null): string {
  if (trend === null) return 'text-gray-600'
  if (trend > 2) return 'text-green-400'
  if (trend < -2) return 'text-red-400'
  return 'text-gray-500'
}

// ── Skill radar chart ─────────────────────────────────────────────────────────
const radarData = computed(() => {
  const cx = 70, cy = 70, r = 52
  const getPoint = (i: number, frac: number) => {
    const angle = -Math.PI / 2 + (i / RADAR_SCENARIOS.length) * Math.PI * 2
    return { x: cx + r * frac * Math.cos(angle), y: cy + r * frac * Math.sin(angle) }
  }
  const scores = RADAR_SCENARIOS.map(s =>
    apiHistory.value?.by_scenario?.[s]?.best_score ?? 0
  )
  const dataVertices = scores.map((s, i) => getPoint(i, s / 100))
  const outerVertices = RADAR_SCENARIOS.map((_, i) => getPoint(i, 1))
  const dataPath = 'M ' + dataVertices.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') + ' Z'
  const outerPath = 'M ' + outerVertices.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') + ' Z'
  const gridPaths = [0.25, 0.5, 0.75].map(frac => {
    const pts = RADAR_SCENARIOS.map((_, i) => getPoint(i, frac))
    return 'M ' + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') + ' Z'
  })
  const axisLines = outerVertices.map(p => ({ x1: cx, y1: cy, x2: p.x, y2: p.y }))
  const labels = RADAR_SCENARIOS.map((s, i) => {
    const pt = getPoint(i, 1.3)
    return { x: pt.x, y: pt.y, text: SCENARIO_META[s]?.label ?? s, color: RADAR_COLORS[s] }
  })
  const hasData = scores.some(s => s > 0)
  return { dataPath, outerPath, gridPaths, axisLines, labels, scores, dataVertices, hasData }
})

// ── Comparison vs last API session ───────────────────────────────────────────
function lastApiScore(scenario: string): number | null {
  const byScenario = apiHistory.value?.by_scenario?.[scenario]
  const sessions = byScenario?.sessions
  if (!sessions?.length) return null
  // first entry is most recent; we want the one before the live session if available
  return sessions[1]?.score ?? sessions[0]?.score ?? null
}

function scoreDelta(result: SessionResult): number | null {
  const prev = lastApiScore(result.scenario)
  if (prev === null) return null
  return result.score - prev
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function buildSparkline(scenario: string): string {
  const sessions = apiHistory.value?.by_scenario?.[scenario]?.sessions ?? []
  const scores = [...sessions].reverse().slice(-8).map(s => s.score)
  if (scores.length < 2) return ''

  const W = 80, H = 28
  const min = Math.max(0, Math.min(...scores) - 5)
  const max = Math.min(100, Math.max(...scores) + 5)
  const range = max - min || 1

  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * W
    const y = H - ((s - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${pts.join(' L ')}`
}

// ── Heatmap canvas ─────────────────────────────────────────────────────────────
function drawHeatmap(result: SessionResult) {
  nextTick(() => {
    const canvas = heatmapCanvas.value
    if (!canvas || !result.heatmap?.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Background grid
    ctx.fillStyle = '#0b1219'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= W; x += W / 6) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y <= H; y += H / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Crosshair center marker
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(W / 2 - 6, H / 2); ctx.lineTo(W / 2 + 6, H / 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 4); ctx.lineTo(W / 2, H / 2 + 4); ctx.stroke()

    for (const pt of result.heatmap) {
      const x = Math.round(pt.x * W)
      const y = Math.round(pt.y * H)
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = pt.hit ? 'rgba(52,211,153,0.85)' : 'rgba(248,113,113,0.75)'
      ctx.fill()
    }
  })
}

// ── Launch ─────────────────────────────────────────────────────────────────────
async function launchDrill(drill: AssignedDrill) {
  if (launching.value || drillRunning.value) return
  activeDrill.value = drill
  launching.value = true
  try {
    const result = await window.api.trainer.launch({
      scenario: drill.scenario,
      duration_seconds: drill.duration_seconds,
      difficulty: drill.difficulty,
      context: { weakness: drill.weakness, score: drill.weakness_score },
    })
    if (result.ok) {
      drillRunning.value = true
    } else {
      console.error('[TrainingHub] Launch failed:', result.error)
      activeDrill.value = null
    }
  } finally {
    launching.value = false
  }
}

// ── IPC listener ──────────────────────────────────────────────────────────────
let removeListener: (() => void) | null = null

onMounted(async () => {
  await achievements.load()

  removeListener = window.api.on('trainer:session-result', async (result: unknown) => {
    const r = result as SessionResult
    lastResult.value = r
    sessionHistory.value.unshift(r)

    const currentLaunchConfig = activeDrill.value
      ? {
          scenario: activeDrill.value.scenario,
          duration_seconds: activeDrill.value.duration_seconds,
          difficulty: activeDrill.value.difficulty,
          context: { weakness: activeDrill.value.weakness, score: activeDrill.value.weakness_score },
        }
      : null

    if (activeDrill.value) {
      completedDrills.value.add(activeDrill.value.scenario)
      lastPlayedDrill.value = activeDrill.value
    }
    activeDrill.value = null
    drillRunning.value = false

    if (warmupActive.value) {
      warmupResults.value.push(r)
      const nextStep = warmupStep.value + 1
      warmupStep.value = nextStep
      if (nextStep < WARMUP_SEQUENCE.length) {
        // Count down 5s then auto-advance to next step
        warmupCountdown.value = 5
        warmupCountdownInterval = setInterval(() => {
          warmupCountdown.value--
          if (warmupCountdown.value <= 0) {
            clearWarmupTimer()
            launchWarmupStep(nextStep)
          }
        }, 1000)
      } else {
        warmupActive.value = false
        warmupStep.value = 0
        // All steps done — navigate to results view
        const prevBest = apiHistory.value?.by_scenario[r.scenario]?.best_score ?? null
        trainerResultStore.setResult(r, currentLaunchConfig, prevBest)
        router.push('/trainer-results')
      }
    } else {
      const prevBest = apiHistory.value?.by_scenario[r.scenario]?.best_score ?? null
      trainerResultStore.setResult(r, currentLaunchConfig, prevBest)
      router.push('/trainer-results')
    }
    window.api.trainer.getHistory().then(async h => {
      const prevBest = apiHistory.value?.by_scenario[r.scenario]?.best_score ?? null
      apiHistory.value = h
      const newAchs = await achievements.check({
        totalDrills: h?.total ?? 0,
        streak: trainingStats.value.streak,
        lastScore: r.score,
        lastAccuracy: r.accuracy_pct,
        lastReactionMs: r.avg_reaction_ms,
      })
      if (newAchs.length) window.__ufAchievementUnlocked?.(newAchs)
      trainerResultStore.setPB(r.score > 0 && (prevBest === null || r.score > prevBest))
    })
  })

  // Fetch training history + coaching drills from API
  loadingHistory.value = true
  loadingAiCoaching.value = true
  try {
    const [history, drills, insights, benchmark, coaching] = await Promise.all([
      window.api.trainer.getHistory(),
      window.api.trainer.getCoachingDrills(),
      window.api.trainer.getCorrelation(),
      window.api.trainer.getBenchmark(),
      window.api.trainer.getAiCoaching(),
    ])
    apiHistory.value = history
    const drillList = Array.isArray(drills) ? drills : []
    coachingDrills.value = drillList
    correlationInsights.value = Array.isArray(insights) ? insights : []
    benchmarkData.value = benchmark
    aiCoaching.value = coaching
    // If API returned coaching drills that map to scenarios, populate Today's Drills
    if (drillList.length > 0) {
      const mapped: AssignedDrill[] = drillList
        .filter((d: CoachingDrill) => CATEGORY_TO_SCENARIO[d.category])
        .slice(0, 4)
        .map((d: CoachingDrill) => ({
          scenario: CATEGORY_TO_SCENARIO[d.category] ?? 'flick',
          difficulty: 'medium' as const,
          duration_seconds: 60,
          weakness: d.category,
          weakness_score: d.baseline_score,
          reason: d.title,
        }))
      if (mapped.length > 0) assignedDrills.value = mapped
    }
  } finally {
    loadingHistory.value = false
    loadingAiCoaching.value = false
  }
})

onUnmounted(() => {
  removeListener?.()
  clearWarmupTimer()
})

// ── Free play ──────────────────────────────────────────────────────────────────
const freePlayScenario = ref<'flick' | 'tracking' | 'microadjust' | 'switching' | 'duel'>('flick')
const freePlayDifficulty = ref<'easy' | 'medium' | 'hard' | 'pro'>('medium')
const freePlayDuration = ref(60)

async function launchFreePlay() {
  await launchDrill({
    scenario: freePlayScenario.value,
    difficulty: freePlayDifficulty.value,
    duration_seconds: freePlayDuration.value,
    weakness: 'free_play',
    weakness_score: 0,
    reason: 'Free play session',
  })
}

async function stopDrill() {
  await window.api.trainer.kill()
  drillRunning.value = false
  activeDrill.value = null
}

/**
 * Strip ability-related sentences from drill instructions.
 * Deathmatch doesn't allow abilities, so any instruction referencing
 * key presses for abilities (E, Q, C, X) should be removed.
 */
function sanitizeInstructions(text: string | null): string | null {
  if (!text) return null
  const sentences = text.split(/(?<=[.!?])\s+/)
  const filtered = sentences.filter(s =>
    !/\b(?:press(?:ing)?|use|hit|activate|tap)\s+[ECQX]\b|\b[ECQX]\s*\([^)]+\)/i.test(s)
  )
  return (filtered.length > 0 ? filtered.join(' ') : text).trim()
}

async function launchCoachingDrill(drill: CoachingDrill) {
  await launchDrill({
    scenario: CATEGORY_TO_SCENARIO[drill.category] ?? 'flick',
    difficulty: 'medium',
    duration_seconds: 60,
    weakness: drill.category,
    weakness_score: drill.baseline_score,
    reason: drill.title,
  })
}

const averageScore = computed(() => {
  if (!sessionHistory.value.length) return null
  return Math.round(sessionHistory.value.reduce((a, b) => a + b.score, 0) / sessionHistory.value.length)
})

const hasAnyPersonalBest = computed(() =>
  RADAR_SCENARIOS.some(s => (apiHistory.value?.by_scenario[s]?.best_score ?? null) !== null)
)

// ── Drill share card export ────────────────────────────────────────────────────
function _roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

async function exportDrillCard() {
  if (drillCardExporting.value || !lastResult.value) return
  drillCardExporting.value = true
  try {
    const r = lastResult.value
    const drill = lastPlayedDrill.value

    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const ctx = canvas.getContext('2d')!

    const score = r.score
    const sColor = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171'

    // Background
    ctx.fillStyle = '#0b1219'
    ctx.fillRect(0, 0, 1200, 630)

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.018)'
    ctx.lineWidth = 1
    for (let x = 0; x <= 1200; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke() }
    for (let y = 0; y <= 630; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke() }

    // Left accent bar (8px brand red)
    ctx.fillStyle = '#ff4655'
    ctx.fillRect(0, 0, 8, 630)

    // Logo wordmark
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif'
    ctx.fillText('UPFORGE', 48, 82)
    ctx.fillStyle = '#ff4655'
    ctx.font = '13px system-ui, -apple-system, sans-serif'
    ctx.fillText('AI COACHING', 48, 104)

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(48, 118); ctx.lineTo(460, 118); ctx.stroke()

    // Scenario name
    const scenarioLabel = SCENARIO_META[r.scenario]?.label ?? r.scenario
    ctx.fillStyle = '#e5e7eb'
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
    ctx.fillText(scenarioLabel + ' Drill', 48, 150)

    // Difficulty badge
    if (drill?.difficulty) {
      const diffText = drill.difficulty.toUpperCase()
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
      const diffBadgeW = ctx.measureText(diffText).width + 16
      const diffColors: Record<string, string> = { easy: '#4ade80', medium: '#fbbf24', hard: '#fb923c', pro: '#f87171' }
      const dc = diffColors[drill.difficulty] ?? '#9ca3af'
      ctx.fillStyle = dc + '20'
      _roundRectPath(ctx, 48, 160, diffBadgeW, 20, 4)
      ctx.fill()
      ctx.strokeStyle = dc + '50'
      ctx.lineWidth = 1
      _roundRectPath(ctx, 48, 160, diffBadgeW, 20, 4)
      ctx.stroke()
      ctx.fillStyle = dc
      ctx.fillText(diffText, 56, 174)
    }

    // Big score
    ctx.fillStyle = sColor
    ctx.font = 'bold 120px system-ui, -apple-system, sans-serif'
    ctx.fillText(String(score), 48, 315)

    // Grade label
    ctx.fillStyle = '#6b7280'
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif'
    ctx.fillText(scoreLabel(score).toUpperCase(), 48, 338)

    // Score bar
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    _roundRectPath(ctx, 48, 354, 420, 9, 4)
    ctx.fill()
    ctx.fillStyle = sColor
    _roundRectPath(ctx, 48, 354, Math.round(420 * score / 100), 9, 4)
    ctx.fill()

    // Delta vs best
    const delta = scoreDelta(r)
    if (delta !== null) {
      const dColor = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#6b7280'
      const dText = delta > 0 ? `+${delta} vs best` : delta < 0 ? `${delta} vs best` : '= best'
      ctx.fillStyle = dColor
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif'
      ctx.fillText(dText, 48, 382)
    }

    // Stats row
    const stats = [
      { label: 'ACCURACY', value: r.accuracy_pct.toFixed(1) + '%' },
      { label: 'REACTION', value: Math.round(r.avg_reaction_ms) + 'ms' },
      { label: 'HITS', value: `${r.targets_hit}/${r.targets_hit + r.targets_missed}` },
      { label: 'CONSISTENCY', value: r.consistency_score + '%' },
    ]
    const cardW = 190, cardH = 72, cardY = 422, gap = 18
    stats.forEach((stat, i) => {
      const cx = 48 + i * (cardW + gap)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      _roundRectPath(ctx, cx, cardY, cardW, cardH, 10)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      _roundRectPath(ctx, cx, cardY, cardW, cardH, 10)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'
      const vw = ctx.measureText(stat.value).width
      ctx.fillText(stat.value, cx + (cardW - vw) / 2, cardY + 40)
      ctx.fillStyle = '#4b5563'
      ctx.font = '11px system-ui, -apple-system, sans-serif'
      const lw = ctx.measureText(stat.label).width
      ctx.fillText(stat.label, cx + (cardW - lw) / 2, cardY + 58)
    })

    // Bottom separator
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, 580); ctx.lineTo(1200, 580); ctx.stroke()

    // Bottom strip
    ctx.fillStyle = '#4b5563'
    ctx.font = '14px system-ui, -apple-system, sans-serif'
    ctx.fillText('upforge.gg', 48, 606)
    ctx.fillStyle = '#374151'
    const tag = `${scenarioLabel.toUpperCase()} · Aim Training`
    const tagW = ctx.measureText(tag).width
    ctx.fillText(tag, 1152 - tagW, 606)

    // Save
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `upforge-drill-${r.scenario}-${score}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    drillCardDone.value = true
    setTimeout(() => { drillCardDone.value = false }, 2500)
  } catch (e) {
    console.error('[TrainingHub] Drill card export failed:', e)
  } finally {
    drillCardExporting.value = false
  }
}

async function exportWeeklyCard() {
  if (weekCardExporting.value) return
  weekCardExporting.value = true
  try {
    const W = 1200, H = 630
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Background
    ctx.fillStyle = '#0b1219'
    ctx.fillRect(0, 0, W, H)

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Left accent bar
    ctx.fillStyle = '#ff4655'
    ctx.fillRect(0, 0, 8, H)

    // Top glow
    const grd = ctx.createLinearGradient(0, 0, W, 0)
    grd.addColorStop(0, 'rgba(255,70,85,0.12)')
    grd.addColorStop(0.5, 'rgba(255,70,85,0.04)')
    grd.addColorStop(1, 'transparent')
    ctx.fillStyle = grd
    ctx.fillRect(8, 0, W - 8, 3)

    const stats = trainingStats.value
    const now = new Date()
    // Week label: Mon of this week → today
    const dayOfWeek = now.getDay() // 0=Sun
    const monday = new Date(now.getTime() - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400000))
    const weekLabel = `${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

    // UPFORGE wordmark (top-left)
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('UP', 40, 54)
    ctx.fillStyle = '#ff4655'
    const upWidth = ctx.measureText('UP').width
    ctx.fillText('FORGE', 40 + upWidth + 2, 54)

    // AI Coaching label
    ctx.font = '500 11px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillText('AI COACHING', 40, 74)

    // Week label (top-right)
    ctx.font = '500 14px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.textAlign = 'right'
    ctx.fillText(weekLabel, W - 40, 54)
    ctx.fillText('WEEKLY SUMMARY', W - 40, 74)
    ctx.textAlign = 'left'

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(40, 94); ctx.lineTo(W - 40, 94); ctx.stroke()

    // Central stat: drills this week
    const drillsX = 120
    ctx.font = 'bold 96px system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(stats.thisWeekCount), drillsX, 240)
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText('DRILLS THIS WEEK', drillsX, 268)

    // Stat cards row
    const cards = [
      { label: 'AVG SCORE', value: stats.thisWeekAvg !== null ? String(stats.thisWeekAvg) : '—', color: stats.thisWeekAvg !== null ? (stats.thisWeekAvg >= 80 ? '#4ade80' : stats.thisWeekAvg >= 60 ? '#fbbf24' : '#f87171') : '#6b7280' },
      { label: 'BEST SCORE', value: stats.thisWeekBest !== null ? String(stats.thisWeekBest) : '—', color: stats.thisWeekBest !== null ? (stats.thisWeekBest >= 80 ? '#4ade80' : stats.thisWeekBest >= 60 ? '#fbbf24' : '#f87171') : '#6b7280' },
      { label: 'DAY STREAK', value: stats.streak > 0 ? `${stats.streak}d` : '—', color: stats.streak > 0 ? '#fb923c' : '#6b7280' },
      { label: 'VS LAST WEEK', value: stats.improvement !== null ? (stats.improvement > 0 ? `+${stats.improvement}` : String(stats.improvement)) : '—', color: stats.improvement === null ? '#6b7280' : stats.improvement > 0 ? '#4ade80' : stats.improvement < 0 ? '#f87171' : '#9ca3af' },
    ]
    const cardW = 180, cardH = 110, cardGap = 20
    const totalCardsW = cards.length * cardW + (cards.length - 1) * cardGap
    const cardsStartX = (W - totalCardsW) / 2
    const cardsY = 310

    cards.forEach((card, i) => {
      const cx = cardsStartX + i * (cardW + cardGap)
      // Card bg
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(cx, cardsY, cardW, cardH, 12)
      ctx.fill(); ctx.stroke()
      // Value
      ctx.font = 'bold 36px system-ui, sans-serif'
      ctx.fillStyle = card.color
      ctx.textAlign = 'center'
      ctx.fillText(card.value, cx + cardW / 2, cardsY + 58)
      // Label
      ctx.font = '600 10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillText(card.label, cx + cardW / 2, cardsY + 80)
      ctx.textAlign = 'left'
    })

    // Scenario mini pills (bottom section)
    const weekSessions = stats.thisWeekSessions
    const scenarioCounts: Record<string, number> = {}
    weekSessions.forEach(s => { scenarioCounts[s.scenario] = (scenarioCounts[s.scenario] ?? 0) + 1 })
    const scenarioEntries = Object.entries(scenarioCounts).sort((a, b) => b[1] - a[1])

    if (scenarioEntries.length) {
      const pillY = 460
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillText('TRAINED THIS WEEK:', 40, pillY)

      const SCENARIO_COLORS: Record<string, string> = { flick: '#f87171', tracking: '#38bdf8', microadjust: '#a78bfa', switching: '#fbbf24', duel: '#34d399' }
      let pillX = 40
      scenarioEntries.forEach(([scenario, count]) => {
        const label = `${scenario.charAt(0).toUpperCase() + scenario.slice(1)} ×${count}`
        ctx.font = '700 11px system-ui, sans-serif'
        const tw = ctx.measureText(label).width
        const pw = tw + 20, ph = 26
        const py = pillY + 14
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.strokeStyle = SCENARIO_COLORS[scenario] ?? '#6b7280'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(pillX, py, pw, ph, 6); ctx.fill(); ctx.stroke()
        ctx.fillStyle = SCENARIO_COLORS[scenario] ?? '#9ca3af'
        ctx.fillText(label, pillX + 10, py + 17)
        pillX += pw + 8
      })
    }

    // Bottom: upforge.gg
    ctx.font = '500 13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.textAlign = 'center'
    ctx.fillText('upforge.gg', W / 2, H - 28)
    ctx.textAlign = 'left'

    // Export
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `upforge-week-${now.toISOString().slice(0, 10)}.png`
    a.click()

    weekCardDone.value = true
    setTimeout(() => { weekCardDone.value = false }, 2500)
  } catch (e) {
    console.error('[TrainingHub] Weekly card export failed:', e)
  } finally {
    weekCardExporting.value = false
  }
}

// ── Training stats (from API history) ─────────────────────────────────────────
const trainingStats = computed(() => {
  const sessions = apiHistory.value?.sessions ?? []
  const now = new Date()
  const msPerDay = 86400000
  const weekAgo = new Date(now.getTime() - 7 * msPerDay)
  const twoWeeksAgo = new Date(now.getTime() - 14 * msPerDay)

  const thisWeek = sessions.filter(s => new Date(s.completed_at) >= weekAgo)
  const prevWeek = sessions.filter(s => {
    const d = new Date(s.completed_at)
    return d >= twoWeeksAgo && d < weekAgo
  })
  const thisWeekAvg = thisWeek.length
    ? Math.round(thisWeek.reduce((a, s) => a + s.score, 0) / thisWeek.length)
    : null
  const prevWeekAvg = prevWeek.length
    ? Math.round(prevWeek.reduce((a, s) => a + s.score, 0) / prevWeek.length)
    : null
  const improvement = thisWeekAvg !== null && prevWeekAvg !== null ? thisWeekAvg - prevWeekAvg : null

  // Streak: consecutive days back from today with at least one session
  const dayKeys = new Set(sessions.map(s => s.completed_at.slice(0, 10)))
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const key = new Date(now.getTime() - i * msPerDay).toISOString().slice(0, 10)
    if (dayKeys.has(key)) {
      streak++
    } else if (i > 0) {
      break
    }
  }

  return {
    thisWeekCount: thisWeek.length,
    thisWeekBest: thisWeek.length ? Math.max(...thisWeek.map(s => s.score)) : null,
    thisWeekSessions: thisWeek,
    improvement,
    streak,
    totalSessions: sessions.length,
    thisWeekAvg,
  }
})

// ── Daily challenge (deterministic from date) ─────────────────────────────────
const dailyChallenge = computed(() => {
  const now = new Date()
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
  const scenario = RADAR_SCENARIOS[seed % RADAR_SCENARIOS.length] as AssignedDrill['scenario']
  const targets = [60, 65, 70, 75, 80] as const
  const target = targets[Math.floor(seed / 10) % targets.length]
  const todayStr = now.toISOString().slice(0, 10)
  const completed =
    (apiHistory.value?.sessions ?? []).some(
      s => s.scenario === scenario && s.score >= target && s.completed_at.startsWith(todayStr)
    ) || sessionHistory.value.some(s => s.scenario === scenario && s.score >= target)
  return { scenario, target, completed }
})

// ── Warm-up routine ───────────────────────────────────────────────────────────
const WARMUP_SEQUENCE: Array<{ scenario: AssignedDrill['scenario']; difficulty: AssignedDrill['difficulty']; duration_seconds: number }> = [
  { scenario: 'flick', difficulty: 'easy', duration_seconds: 30 },
  { scenario: 'tracking', difficulty: 'easy', duration_seconds: 30 },
  { scenario: 'microadjust', difficulty: 'easy', duration_seconds: 30 },
  { scenario: 'switching', difficulty: 'easy', duration_seconds: 30 },
  { scenario: 'duel', difficulty: 'easy', duration_seconds: 30 },
]
const warmupActive = ref(false)
const warmupStep = ref(0)
const warmupResults = ref<SessionResult[]>([])
const warmupCountdown = ref(0)
let warmupAdvanceTimer: ReturnType<typeof setTimeout> | null = null
let warmupCountdownInterval: ReturnType<typeof setInterval> | null = null

function clearWarmupTimer() {
  if (warmupAdvanceTimer) { clearTimeout(warmupAdvanceTimer); warmupAdvanceTimer = null }
  if (warmupCountdownInterval) { clearInterval(warmupCountdownInterval); warmupCountdownInterval = null }
  warmupCountdown.value = 0
}

async function launchWarmupStep(step: number) {
  clearWarmupTimer()
  const s = WARMUP_SEQUENCE[step]
  if (!s) return
  await launchDrill({
    scenario: s.scenario,
    difficulty: s.difficulty,
    duration_seconds: s.duration_seconds,
    weakness: 'warmup',
    weakness_score: 0,
    reason: `Warm-up step ${step + 1}/${WARMUP_SEQUENCE.length}`,
  })
}

async function startWarmup() {
  warmupActive.value = true
  warmupStep.value = 0
  warmupResults.value = []
  await launchWarmupStep(0)
}

function cancelWarmup() {
  clearWarmupTimer()
  warmupActive.value = false
  warmupStep.value = 0
  warmupResults.value = []
  window.api.trainer.kill()
}

// SVG icon paths for scenario types
const SCENARIO_ICON: Record<string, string> = {
  // Lightning bolt — quick snap
  flick: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M13 3 6 14h7l-2 7 8-11h-7z"/></svg>`,
  // Bullseye — stay on target
  tracking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-4 h-4"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  // Crosshair — precision
  microadjust: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-4 h-4"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="22"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="22" y2="12"/></svg>`,
  // Double arrows — multi-target switching
  switching: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M7 16V4m0 0L4 7m3-3 3 3M17 8v12m0 0 3-3m-3 3-3-3"/></svg>`,
  // 3D cube — first-person duel
  duel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
}

// SVG icon HTML for coaching drill categories
const CATEGORY_ICON: Record<string, string> = {
  mechanics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-4 h-4"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`,
  crosshair_placement: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-4 h-4"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="2" x2="12" y2="7.5"/><line x1="12" y1="16.5" x2="12" y2="22"/><line x1="2" y1="12" x2="7.5" y2="12"/><line x1="16.5" y1="12" x2="22" y2="12"/></svg>`,
  game_sense: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  positioning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  communication: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  utility: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a6 6 0 0 1-7.37 7.37l-5.1 5.1a2.12 2.12 0 0 1-3-3l5.1-5.1A6 6 0 0 1 14.7 6.3z"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M8 12h.01M16 12h.01M12 10v4"/></svg>`,
}
</script>

<template>
  <div class="h-full text-white flex flex-col overflow-hidden relative">

    <!-- ── DRILL RUNNING BANNER ──────────────────────────────────────────── -->
    <Transition name="result-in">
      <div
        v-if="drillRunning && activeDrill"
        class="flex-shrink-0 mx-3 mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.07] overflow-hidden"
      >
        <div class="flex items-center justify-between px-4 py-2.5">
          <div class="flex items-center gap-2.5">
            <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <div>
              <span class="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                {{ SCENARIO_META[activeDrill.scenario]?.label ?? activeDrill.scenario }} in progress
              </span>
              <span class="ml-2 text-[10px] text-gray-500 capitalize">{{ activeDrill.difficulty }} · {{ activeDrill.duration_seconds }}s</span>
            </div>
          </div>
          <button
            class="text-[10px] font-bold text-gray-600 hover:text-red-400 border border-white/[0.07] hover:border-red-500/30 rounded-lg px-2.5 py-1 transition-all flex items-center gap-1"
            @click="stopDrill"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-3 h-3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Stop</button>
        </div>
        <!-- pulse bar -->
        <div class="h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent animate-pulse" />
      </div>
    </Transition>

    <!-- ── WARMUP BETWEEN-STEPS BANNER ──────────────────────────────────── -->
    <Transition name="result-in">
      <div
        v-if="warmupActive && !drillRunning && warmupStep < WARMUP_SEQUENCE.length"
        class="flex-shrink-0 mx-3 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] overflow-hidden"
      >
        <div class="flex items-center justify-between px-4 py-2.5">
          <div class="flex items-center gap-2.5">
            <div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <div>
              <span class="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                Warm-Up {{ warmupStep }}/{{ WARMUP_SEQUENCE.length }} ·
                Next: {{ SCENARIO_META[WARMUP_SEQUENCE[warmupStep]?.scenario ?? 'flick']?.label }}
              </span>
              <span class="ml-2 text-[10px] text-gray-500">Auto-starting in {{ warmupCountdown }}s…</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-[10px] font-bold text-amber-400 border border-amber-500/30 hover:bg-amber-500/[0.1] rounded-lg px-2.5 py-1 transition-all"
              @click="clearWarmupTimer(); launchWarmupStep(warmupStep)"
            >Start Now</button>
            <button
              class="text-[10px] font-bold text-gray-600 hover:text-red-400 border border-white/[0.07] hover:border-red-500/30 rounded-lg px-2.5 py-1 transition-all"
              @click="cancelWarmup"
            >Cancel</button>
          </div>
        </div>
        <div class="h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        <!-- Step progress dots -->
        <div class="flex items-center justify-center gap-1.5 py-2">
          <div
            v-for="(step, si) in WARMUP_SEQUENCE" :key="si"
            :class="['w-1.5 h-1.5 rounded-full transition-all', si < warmupStep ? 'bg-amber-400' : si === warmupStep ? 'bg-amber-400/50 ring-1 ring-amber-400/50' : 'bg-white/10']"
          />
        </div>
      </div>
    </Transition>

    <!-- ── COMPLETION MODAL ───────────────────────────────────────────────── -->
    <Transition name="modal-fade">
      <div
        v-if="showResultModal && lastResult"
        class="absolute inset-0 z-50 flex items-center justify-center"
        style="background: rgba(10,10,10,0.88); backdrop-filter: blur(8px)"
        @click.self="showResultModal = false"
      >
        <div
          class="w-[calc(100%-2rem)] max-w-sm rounded-2xl border overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.9)]"
          :class="scoreBg(lastResult.score)"
        >
          <!-- top accent -->
          <div class="h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30" />

          <!-- header -->
          <div class="flex items-center justify-between px-5 pt-4 pb-0">
            <div class="flex items-center gap-2">
              <span :class="['text-xs font-bold uppercase tracking-widest', scoreColor(lastResult.score)]">
                {{ SCENARIO_META[lastResult.scenario]?.label ?? lastResult.scenario }} Complete
              </span>
            </div>
            <button class="text-gray-600 hover:text-gray-400 transition-colors leading-none flex items-center justify-center w-6 h-6 rounded-lg hover:bg-white/[0.06]" @click="showResultModal = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- score + grade -->
          <div class="flex items-end gap-4 px-5 pt-3 pb-4">
            <div class="flex flex-col">
              <span :class="['text-[64px] font-black leading-none tabular-nums', scoreColor(lastResult.score)]">
                {{ lastResult.score }}
              </span>
              <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{{ scoreLabel(lastResult.score) }}</span>
              <span
                v-if="scoreDelta(lastResult) !== null"
                :class="['text-xs font-bold mt-1 flex items-center gap-0.5', scoreDelta(lastResult)! > 0 ? 'text-green-400' : scoreDelta(lastResult)! < 0 ? 'text-red-400' : 'text-gray-500']"
              >
                <svg v-if="scoreDelta(lastResult)! > 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="18 15 12 9 6 15"/></svg>
                <svg v-else-if="scoreDelta(lastResult)! < 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="6 9 12 15 18 9"/></svg>
                <span v-else>–</span>
                {{ Math.abs(scoreDelta(lastResult)!) }} vs previous
              </span>
              <span v-if="isPB && lastResult.score > 0" class="text-xs font-bold text-yellow-400 flex items-center gap-1 mt-0.5">
                <span v-html="ICON_TROPHY_SM" /> Personal Best!
              </span>
            </div>

            <!-- score bar -->
            <div class="flex-1 mb-2">
              <div class="h-2 bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  :class="['h-full rounded-full transition-all duration-700', lastResult.score >= 80 ? 'bg-green-500' : lastResult.score >= 60 ? 'bg-yellow-500' : 'bg-red-500']"
                  :style="{ width: lastResult.score + '%' }"
                />
              </div>
              <!-- stats grid -->
              <div class="grid grid-cols-3 gap-2 mt-3">
                <div class="bg-white/[0.05] rounded-xl px-3 py-2 text-center border border-white/[0.07]">
                  <div class="text-sm font-black text-white tabular-nums">{{ lastResult.accuracy_pct.toFixed(1) }}<span class="text-gray-600 text-[9px] font-normal">%</span></div>
                  <div class="text-[8px] text-gray-500 uppercase tracking-wide mt-0.5">Acc</div>
                </div>
                <div class="bg-white/[0.05] rounded-xl px-3 py-2 text-center border border-white/[0.07]">
                  <div class="text-sm font-black text-white tabular-nums">{{ Math.round(lastResult.avg_reaction_ms) }}<span class="text-gray-600 text-[9px] font-normal">ms</span></div>
                  <div class="text-[8px] text-gray-500 uppercase tracking-wide mt-0.5">React</div>
                </div>
                <div class="bg-white/[0.05] rounded-xl px-3 py-2 text-center border border-white/[0.07]">
                  <div class="text-sm font-black text-white tabular-nums">{{ lastResult.targets_hit }}<span class="text-gray-600 text-[9px] font-normal">/{{ lastResult.targets_hit + lastResult.targets_missed }}</span></div>
                  <div class="text-[8px] text-gray-500 uppercase tracking-wide mt-0.5">Hits</div>
                </div>
              </div>
            </div>
          </div>

          <!-- action row -->
          <div class="flex gap-2 px-5 pb-4">
            <button
              class="flex-1 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[12px] font-semibold text-gray-400 hover:bg-white/[0.08] transition-all"
              @click="showResultModal = false"
            >View Details</button>
            <button
              :disabled="drillCardExporting"
              class="flex-1 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              :class="drillCardDone ? 'text-green-400 border-green-500/20' : 'text-gray-400 hover:bg-white/[0.08]'"
              @click="exportDrillCard"
            >
              <svg v-if="drillCardExporting" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <svg v-else-if="drillCardDone" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
              <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              {{ drillCardExporting ? 'Saving…' : drillCardDone ? 'Saved!' : 'Share' }}
            </button>
            <button
              v-if="lastPlayedDrill"
              class="flex-1 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-[12px] font-semibold text-red-400 hover:bg-red-500/20 transition-all flex items-center justify-center gap-1.5"
              @click="() => { const d = lastPlayedDrill!; showResultModal = false; launchDrill(d) }"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Play Again</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Top bar -->
    <div class="flex items-center justify-between px-3 pt-3 pb-0 flex-shrink-0">
      <div>
        <h2 class="text-xs font-semibold text-white">Training Hub</h2>
        <p class="text-[10px] text-gray-600 mt-0.5">Aim drills · Progress · Coaching</p>
      </div>
      <!-- Streak badge when > 0 -->
      <div v-if="trainingStats.streak > 0" class="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-orange-400"><path d="M12 2S6.5 9 6.5 13.5a5.5 5.5 0 0 0 11 0C17.5 9 12 2 12 2zm0 14.5a3 3 0 0 1-3-3c0-2.5 3-6 3-6s3 3.5 3 6a3 3 0 0 1-3 3z"/></svg>
        <span class="text-[11px] font-black text-orange-400">{{ trainingStats.streak }}</span>
        <span class="text-[9px] text-gray-600">{{ trainingStats.streak === 1 ? 'day' : 'days' }} streak</span>
      </div>
    </div>

    <!-- Tab nav -->
    <div class="flex px-3 pt-3 pb-0 gap-1 flex-shrink-0">
      <button
        v-for="tab in (['drills', 'progress', 'coaching'] as const)"
        :key="tab"
        class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border"
        :class="
          activeTab === tab
            ? 'bg-red-500/15 border-red-500/30 text-red-400'
            : 'border-transparent text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'
        "
        @click="activeTab = tab"
      >
        <span class="flex items-center gap-1.5">
          <svg v-if="tab === 'drills'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>
          <svg v-else-if="tab === 'progress'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
          {{ tab === 'drills' ? 'Train' : tab === 'progress' ? 'Progress' : 'Coaching' }}
        </span>
        <span
          v-if="tab === 'coaching' && coachingDrills.length"
          class="ml-1 text-[9px] bg-red-500/20 text-red-400 rounded-full px-1.5 py-px border border-red-500/30"
          >{{ coachingDrills.length }}</span
        >
      </button>
    </div>

    <!-- Stats strip (streak / this week / improvement) — always visible -->
    <div class="flex mx-3 mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden flex-shrink-0">
      <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5">
        <span class="text-sm font-black tabular-nums" :class="trainingStats.streak > 0 ? 'text-orange-400' : 'text-gray-700'">
          {{ trainingStats.streak > 0 ? trainingStats.streak : '—' }}
        </span>
        <span class="text-[8px] text-gray-600 uppercase tracking-wide">Streak</span>
      </div>
      <div class="w-px bg-white/[0.05]" />
      <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5">
        <span class="text-sm font-black tabular-nums text-white">{{ trainingStats.thisWeekCount }}</span>
        <span class="text-[8px] text-gray-600 uppercase tracking-wide">This week</span>
      </div>
      <div class="w-px bg-white/[0.05]" />
      <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5">
        <span
          :class="['text-sm font-black tabular-nums', trainingStats.improvement === null ? 'text-gray-700' : trainingStats.improvement > 0 ? 'text-green-400' : trainingStats.improvement < 0 ? 'text-red-400' : 'text-gray-400']"
        >
          {{ trainingStats.improvement === null ? '—' : (trainingStats.improvement > 0 ? '+' : '') + trainingStats.improvement }}
        </span>
        <span class="text-[8px] text-gray-600 uppercase tracking-wide">vs last week</span>
      </div>
      <div class="w-px bg-white/[0.05]" />
      <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5">
        <span class="text-sm font-black tabular-nums text-white">{{ trainingStats.totalSessions }}</span>
        <span class="text-[8px] text-gray-600 uppercase tracking-wide">All time</span>
      </div>
    </div>

    <!-- Divider -->
    <div class="mx-3 mt-3 h-px bg-white/[0.06] flex-shrink-0" />

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto" style="scrollbar-width: none">

      <!-- ── DRILLS TAB ──────────────────────────────────────────────── -->
      <template v-if="activeTab === 'drills'">
        <div class="grid grid-cols-[360px_1fr] gap-4 p-3 items-start">

          <!-- LEFT column -->
          <div class="flex flex-col gap-3">

            <!-- Daily Challenge -->
            <div
              class="rounded-xl border overflow-hidden"
              :class="dailyChallenge.completed ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-red-500/20 bg-red-500/[0.04]'"
            >
              <div class="flex items-center gap-3 px-4 py-3">
                <div :class="['w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', dailyChallenge.completed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400']">
                  <svg v-if="dailyChallenge.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-4 h-4"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><line x1="12" y1="2" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="22"/><line x1="2" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="22" y2="12"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-[9px] font-black uppercase tracking-[0.18em]" :class="dailyChallenge.completed ? 'text-green-400' : 'text-red-400'">Daily Challenge</span>
                    <span v-if="dailyChallenge.completed" class="text-[9px] font-bold text-green-400">Complete!</span>
                  </div>
                  <p class="text-xs font-bold text-white">
                    Score <span :class="dailyChallenge.completed ? 'text-green-300' : 'text-red-400'">{{ dailyChallenge.target }}+</span>
                    on {{ SCENARIO_META[dailyChallenge.scenario]?.label }}
                  </p>
                </div>
                <button
                  v-if="!dailyChallenge.completed"
                  :disabled="launching || drillRunning"
                  class="flex-shrink-0 flex items-center gap-1.5 text-[10px] font-bold text-red-400 border border-red-500/30 hover:bg-red-500/[0.08] rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                  @click="launchDrill({ scenario: dailyChallenge.scenario, difficulty: 'medium', duration_seconds: 60, weakness: 'challenge', weakness_score: 0, reason: `Daily challenge: score ${dailyChallenge.target}+` })"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" class="w-2.5 h-2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Go
                </button>
              </div>
            </div>

            <!-- Warm-Up Routine -->
            <div class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="flex items-center gap-3 px-4 py-3">
                <div class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400">
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" class="w-4 h-4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-[9px] font-black uppercase tracking-[0.18em] text-red-400">Quick Warm-Up</span>
                    <span class="text-[9px] text-gray-600">5 exercises · ~2.5 min</span>
                  </div>
                  <!-- Step pills -->
                  <div class="flex gap-1 flex-wrap">
                    <span
                      v-for="(step, si) in WARMUP_SEQUENCE" :key="si"
                      class="text-[8px] font-bold px-1.5 py-px rounded-full border"
                      :class="[SCENARIO_META[step.scenario]?.bg, SCENARIO_META[step.scenario]?.border, SCENARIO_META[step.scenario]?.color]"
                    >{{ SCENARIO_META[step.scenario]?.label }} 30s</span>
                  </div>
                </div>
                <button
                  :disabled="launching || drillRunning || warmupActive"
                  class="flex-shrink-0 flex items-center gap-1.5 text-[10px] font-bold text-red-400 border border-red-500/30 hover:bg-red-500/[0.08] rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                  @click="startWarmup"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" class="w-2.5 h-2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Start
                </button>
              </div>
            </div>

            <!-- Last result card -->
            <Transition name="result-in">
              <div
                v-if="lastResult"
                class="rounded-xl border overflow-hidden"
                :class="scoreBg(lastResult.score)"
              >
            <div class="flex items-stretch">
              <!-- Score block -->
              <div class="flex flex-col items-center justify-center px-5 py-4 min-w-[80px]">
                <span
                  :class="['text-3xl font-black tabular-nums leading-none', scoreColor(lastResult.score)]"
                  >{{ lastResult.score }}</span
                >
                <span class="text-[9px] font-bold text-gray-500 uppercase tracking-wide mt-1">{{
                  scoreLabel(lastResult.score)
                }}</span>
                <!-- Delta vs last API session -->
                <div
                  v-if="scoreDelta(lastResult) !== null"
                  :class="['text-[10px] font-bold mt-1', scoreDelta(lastResult)! > 0 ? 'text-green-400' : scoreDelta(lastResult)! < 0 ? 'text-red-400' : 'text-gray-500']"
                >
                  {{ scoreDelta(lastResult)! > 0 ? '+' : '' }}{{ scoreDelta(lastResult) }} vs last
                </div>
              </div>

              <!-- Stats -->
              <div class="flex-1 flex items-center px-4 gap-4 border-l border-white/[0.07]">
                <div class="text-center">
                  <div class="text-base font-black text-white tabular-nums">
                    {{ lastResult.accuracy_pct.toFixed(1)
                    }}<span class="text-gray-500 text-xs font-normal">%</span>
                  </div>
                  <div class="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">Acc</div>
                </div>
                <div class="text-center">
                  <div class="text-base font-black text-white tabular-nums">
                    {{ Math.round(lastResult.avg_reaction_ms)
                    }}<span class="text-gray-500 text-xs font-normal">ms</span>
                  </div>
                  <div class="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">React</div>
                </div>
                <div class="text-center">
                  <div class="text-base font-black text-white tabular-nums">
                    {{ lastResult.targets_hit
                    }}<span class="text-gray-500 text-xs font-normal"
                      >/{{ lastResult.targets_hit + lastResult.targets_missed }}</span
                    >
                  </div>
                  <div class="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">Hits</div>
                </div>
                <div class="text-center">
                  <div class="text-base font-black text-white tabular-nums">
                    {{ Math.round(lastResult.consistency_score) }}
                  </div>
                  <div class="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">Cons.</div>
                </div>
              </div>

              <!-- Heatmap -->
              <div
                v-if="lastResult.heatmap?.length"
                class="flex items-center px-3 border-l border-white/[0.07]"
              >
                <div>
                  <canvas
                    ref="heatmapCanvas"
                    width="96"
                    height="64"
                    class="rounded-md"
                    style="image-rendering: pixelated"
                  />
                  <div class="flex items-center justify-center gap-2 mt-1">
                    <span class="flex items-center gap-0.5 text-[8px] text-gray-600"
                      ><span class="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> Hit</span
                    >
                    <span class="flex items-center gap-0.5 text-[8px] text-gray-600"
                      ><span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Miss</span
                    >
                  </div>
                </div>
              </div>

              <!-- Scenario label -->
              <div
                class="flex flex-col items-center justify-center px-3 border-l border-white/[0.07] gap-1"
              >
                <div :class="['w-2 h-2 rounded-full', SCENARIO_META[lastResult.scenario]?.dot]" />
                <span
                  :class="['text-[9px] font-bold uppercase tracking-widest', SCENARIO_META[lastResult.scenario]?.color]"
                  >{{ SCENARIO_META[lastResult.scenario]?.label ?? lastResult.scenario }}</span
                >
              </div>
            </div>
            <!-- Score bar -->
            <div class="h-[2px] bg-white/[0.06]">
              <div
                :class="['h-full transition-all duration-700', scoreBarColor(lastResult.score)]"
                :style="{ width: lastResult.score + '%' }"
              />
            </div>
          </div>
            </Transition>

            <!-- Session history (in-memory) -->
            <div v-if="sessionHistory.length">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500"
                  >This Session</span
                >
                <div class="flex-1 h-px bg-white/[0.05]" />
              </div>
              <div class="space-y-px">
                <div
                  v-for="(s, i) in sessionHistory"
                  :key="i"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/[0.05]"
                  style="background: rgba(255,255,255,0.02)"
                >
                  <div :class="['w-2 h-2 rounded-full flex-shrink-0', SCENARIO_META[s.scenario]?.dot]" />
                  <span class="text-[10px] font-bold text-gray-400 uppercase w-14 truncate">{{
                    SCENARIO_META[s.scenario]?.label ?? s.scenario
                  }}</span>
                  <span :class="['text-sm font-black tabular-nums w-8', scoreColor(s.score)]">{{
                    s.score
                  }}</span>
                  <div class="flex-1 bg-white/[0.05] rounded-full h-px">
                    <div
                      :class="['h-px rounded-full', scoreBarColor(s.score)]"
                      :style="{ width: s.score + '%' }"
                    />
                  </div>
                  <span class="text-[10px] text-gray-600 tabular-nums font-mono"
                    >{{ s.accuracy_pct.toFixed(0) }}%</span
                  >
                  <span class="text-[10px] text-gray-600 tabular-nums font-mono"
                    >{{ Math.round(s.avg_reaction_ms) }}ms</span
                  >
                </div>
              </div>
            </div>

          </div><!-- end LEFT column -->

          <!-- RIGHT column -->
          <div class="flex flex-col gap-3">

            <!-- Section: AI Drills -->
            <div>
              <div class="flex items-center gap-2 mb-2.5">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500"
                  >Today's Drills</span
                >
                <div class="flex-1 h-px bg-white/[0.05]" />
                <span class="text-[9px] text-gray-700">Based on your VODs</span>
              </div>
              <div class="space-y-2">
                <div
                  v-for="drill in assignedDrills"
                  :key="drill.scenario"
                  class="group rounded-xl border overflow-hidden transition-all"
                  :class="
                    completedDrills.has(drill.scenario)
                      ? 'border-green-500/20 bg-green-500/[0.04] opacity-60'
                      : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] cursor-pointer'
                  "
                  @click="!launching && !drillRunning && !completedDrills.has(drill.scenario) && launchDrill(drill)"
                >
                  <div class="flex items-stretch">
                    <!-- Scenario colour band -->
                    <div :class="['w-1 self-stretch flex-shrink-0', SCENARIO_META[drill.scenario]?.band]" />

                    <div class="flex-1 flex items-center gap-3 px-3 py-3 min-w-0">
                      <!-- Scenario icon area -->
                      <div
                        class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border"
                        :class="[SCENARIO_META[drill.scenario]?.bg, SCENARIO_META[drill.scenario]?.border]"
                      >
                        <span v-html="SCENARIO_ICON[drill.scenario] ?? SCENARIO_ICON['flick']" :class="SCENARIO_META[drill.scenario]?.color" />
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                          <span class="text-xs font-bold text-white">{{
                            SCENARIO_META[drill.scenario]?.label
                          }}</span>
                          <span
                            class="text-[9px] font-bold uppercase border px-1.5 py-px rounded-full"
                            :class="[DIFFICULTY_COLORS[drill.difficulty], DIFFICULTY_BG[drill.difficulty]]"
                            >{{ drill.difficulty }}</span
                          >
                          <span class="text-[9px] text-gray-600">{{ drill.duration_seconds }}s</span>
                        </div>
                        <p class="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{{ drill.reason }}</p>
                      </div>

                      <!-- Weakness score -->
                      <div class="flex flex-col items-center gap-1 flex-shrink-0">
                        <div class="w-10 bg-white/[0.06] rounded-full h-1">
                          <div
                            class="h-1 rounded-full bg-red-500/70"
                            :style="{ width: drill.weakness_score + '%' }"
                          />
                        </div>
                        <span class="text-[9px] tabular-nums text-gray-600">{{
                          drill.weakness_score
                        }}/100</span>
                      </div>
                    </div>

                    <!-- Launch / Done button -->
                    <div class="flex-shrink-0 border-l border-white/[0.06]">
                      <button
                        v-if="completedDrills.has(drill.scenario)"
                        class="h-full px-4 text-[10px] font-bold text-green-400 flex items-center gap-1"
                        disabled
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="20 6 9 17 4 12"/></svg>
                        Done
                      </button>
                      <button
                        v-else-if="drillRunning && activeDrill?.scenario === drill.scenario"
                        class="h-full px-4 text-[10px] font-bold text-red-400 flex items-center gap-1.5"
                        disabled
                      >
                        <div class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Running
                      </button>
                      <button
                        v-else
                        :disabled="launching || drillRunning"
                        class="h-full px-4 text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-40 flex items-center justify-center"
                        @click.stop="launchDrill(drill)"
                      >
                        <svg
                          v-if="activeDrill?.scenario === drill.scenario && launching"
                          class="w-3.5 h-3.5 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                          />
                          <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8z"
                          />
                        </svg>
                        <svg v-else viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Section: Free Play -->
            <div>
              <div class="flex items-center gap-2 mb-2.5">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500"
                  >Free Play</span
                >
                <div class="flex-1 h-px bg-white/[0.05]" />
              </div>

              <div class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <!-- Scenario tiles -->
                <div class="grid grid-cols-4 gap-0 border-b border-white/[0.06]">
                  <button
                    v-for="(meta, key) in SCENARIO_META"
                    :key="key"
                    class="py-3 text-center transition-all border-r border-white/[0.04] last:border-0 flex flex-col items-center gap-1"
                    :class="
                      freePlayScenario === key
                        ? `${meta.bg} ${meta.color}`
                        : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'
                    "
                    @click="freePlayScenario = key as typeof freePlayScenario"
                  >
                    <span v-html="SCENARIO_ICON[key] ?? SCENARIO_ICON['flick']" class="flex items-center justify-center" />
                    <span class="text-[10px] font-bold">{{ meta.label }}</span>
                  </button>
                </div>

                <!-- Tip for selected scenario -->
                <div class="px-3 py-2 border-b border-white/[0.05] flex items-start gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 flex-shrink-0 mt-px text-gray-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="8"/></svg>
                  <p class="text-[10px] text-gray-500 italic leading-relaxed">
                    {{ SCENARIO_META[freePlayScenario]?.tip }}
                  </p>
                </div>

                <!-- Difficulty + Duration -->
                <div class="flex gap-0 border-b border-white/[0.05]">
                  <div class="flex flex-1 gap-0">
                    <button
                      v-for="diff in (['easy', 'medium', 'hard', 'pro'] as const)"
                      :key="diff"
                      class="flex-1 py-2 text-[10px] font-bold uppercase transition-all border-r border-white/[0.04]"
                      :class="
                        freePlayDifficulty === diff
                          ? `${DIFFICULTY_COLORS[diff]} bg-white/[0.06]`
                          : 'text-gray-600 hover:text-gray-400'
                      "
                      @click="freePlayDifficulty = diff"
                    >
                      {{ diff }}
                    </button>
                  </div>
                  <div class="flex border-l border-white/[0.05]">
                    <button
                      v-for="dur in [30, 60, 120]"
                      :key="dur"
                      class="px-3 py-2 text-[10px] font-bold transition-all border-r border-white/[0.04] last:border-0"
                      :class="
                        freePlayDuration === dur
                          ? 'text-white bg-white/[0.06]'
                          : 'text-gray-600 hover:text-gray-400'
                      "
                      @click="freePlayDuration = dur"
                    >
                      {{ dur < 60 ? dur + 's' : dur / 60 + 'm' }}
                    </button>
                  </div>
                </div>

                <!-- Launch button -->
                <button
                  :disabled="launching || drillRunning"
                  class="w-full py-2.5 text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 text-red-400 hover:text-red-400 hover:bg-red-500/[0.06]"
                  @click="launchFreePlay"
                >
                  <svg
                    v-if="launching || drillRunning"
                    class="w-3 h-3 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>{{ launching ? 'Launching…' : drillRunning ? 'Drill running…' : 'Launch Free Play' }}</span>
                </button>
              </div>
            </div>

          </div><!-- end RIGHT column -->
        </div><!-- end grid -->
      </template>

      <!-- ── PROGRESS TAB ────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'progress'">
        <div class="grid grid-cols-[340px_1fr] gap-4 p-3 items-start">

          <!-- LEFT column -->
          <div class="flex flex-col gap-3">

            <!-- Share Week button row -->
            <div class="flex items-center justify-between gap-2">
              <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">This Week</span>
              <button
                :disabled="weekCardExporting || trainingStats.thisWeekCount === 0"
                class="flex items-center gap-1.5 text-[10px] font-bold rounded-lg px-3 py-1.5 border transition-all disabled:opacity-40"
                :class="weekCardDone
                  ? 'text-green-400 border-green-500/20 bg-green-500/[0.05]'
                  : 'text-red-400 border-red-500/25 bg-red-500/[0.04] hover:bg-red-500/[0.10]'"
                @click="exportWeeklyCard"
              >
                <svg v-if="weekCardExporting" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                <svg v-else-if="weekCardDone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                {{ weekCardExporting ? 'Saving…' : weekCardDone ? 'Saved!' : 'Share Week' }}
              </button>
            </div>

            <!-- Stats summary 2×2 cards -->
            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-xl border border-white/[0.07] px-4 py-3" style="background: rgba(255,255,255,0.02)">
                <div class="text-xl font-black tabular-nums text-white">{{ trainingStats.totalSessions }}</div>
                <div class="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">Total sessions</div>
              </div>
              <div class="rounded-xl border border-white/[0.07] px-4 py-3" style="background: rgba(255,255,255,0.02)">
                <div class="text-xl font-black tabular-nums" :class="trainingStats.streak > 0 ? 'text-orange-400' : 'text-gray-700'">
                  {{ trainingStats.streak > 0 ? trainingStats.streak : '—' }}
                </div>
                <div class="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">Day streak</div>
              </div>
              <div class="rounded-xl border border-white/[0.07] px-4 py-3" style="background: rgba(255,255,255,0.02)">
                <div class="text-xl font-black tabular-nums" :class="trainingStats.thisWeekAvg !== null ? scoreColor(trainingStats.thisWeekAvg) : 'text-gray-700'">
                  {{ trainingStats.thisWeekAvg ?? '—' }}
                </div>
                <div class="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">Avg this week</div>
              </div>
              <div class="rounded-xl border border-white/[0.07] px-4 py-3" style="background: rgba(255,255,255,0.02)">
                <div
                  class="text-xl font-black tabular-nums"
                  :class="trainingStats.improvement === null ? 'text-gray-700' : trainingStats.improvement > 0 ? 'text-green-400' : trainingStats.improvement < 0 ? 'text-red-400' : 'text-gray-400'"
                >
                  {{ trainingStats.improvement === null ? '—' : (trainingStats.improvement > 0 ? '+' : '') + trainingStats.improvement }}
                </div>
                <div class="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">vs last week</div>
              </div>
            </div>

            <!-- Personal Records trophy row -->
            <div v-if="hasAnyPersonalBest" class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Personal Records</span>
                <div class="flex-1 h-px bg-white/[0.04]" />
                <span class="text-yellow-500/70 flex items-center" v-html="ICON_TROPHY_SM" />
              </div>
              <div class="flex divide-x divide-white/[0.05]">
                <div
                  v-for="s in RADAR_SCENARIOS"
                  :key="s"
                  class="flex-1 flex flex-col items-center py-3 px-1 gap-1"
                >
                  <div class="w-2 h-2 rounded-full flex-shrink-0" :class="SCENARIO_META[s].dot" />
                  <span class="text-[8px] text-gray-500 font-semibold uppercase tracking-wide text-center leading-tight">{{ SCENARIO_META[s].label }}</span>
                  <span
                    class="text-sm font-black tabular-nums"
                    :class="(apiHistory?.by_scenario[s]?.best_score ?? null) != null ? scoreColor(apiHistory!.by_scenario[s].best_score!) : 'text-gray-700'"
                  >{{ apiHistory?.by_scenario[s]?.best_score ?? '—' }}</span>
                </div>
              </div>
            </div>

            <!-- Skill Radar -->
            <div class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Skill Radar</span>
                <div class="flex-1 h-px bg-white/[0.04]" />
                <span class="text-[9px] text-gray-700">personal bests</span>
              </div>
              <div class="flex items-center justify-center gap-4 py-4 px-4">
                <svg width="140" height="140" viewBox="0 0 140 140" class="flex-shrink-0">
                  <!-- grid rings -->
                  <path v-for="(gp, gi) in radarData.gridPaths" :key="gi" :d="gp" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.75" />
                  <!-- axis lines -->
                  <line v-for="(ax, ai) in radarData.axisLines" :key="ai" :x1="ax.x1" :y1="ax.y1" :x2="ax.x2" :y2="ax.y2" stroke="rgba(255,255,255,0.07)" stroke-width="0.75" />
                  <!-- outer ring -->
                  <path :d="radarData.outerPath" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
                  <!-- data fill (only when there is data) -->
                  <path v-if="radarData.hasData" :d="radarData.dataPath" fill="rgba(255,70,85,0.10)" stroke="rgba(255,70,85,0.60)" stroke-width="1.5" stroke-linejoin="round" />
                  <!-- vertex dots -->
                  <circle
                    v-for="(s, vi) in RADAR_SCENARIOS" :key="s"
                    :cx="radarData.dataVertices[vi].x"
                    :cy="radarData.dataVertices[vi].y"
                    :r="radarData.scores[vi] > 0 ? 3 : 0"
                    :fill="RADAR_COLORS[s]"
                  />
                  <!-- labels -->
                  <text
                    v-for="(lbl, li) in radarData.labels" :key="li"
                    :x="lbl.x" :y="lbl.y"
                    :fill="lbl.color"
                    font-size="8.5"
                    font-weight="700"
                    text-anchor="middle"
                    dominant-baseline="middle"
                  >{{ lbl.text }}</text>
                </svg>
                <!-- Score pills -->
                <div class="flex flex-col gap-2">
                  <div v-for="(s, ri) in RADAR_SCENARIOS" :key="s" class="flex items-center gap-2">
                    <div class="w-1.5 h-1.5 rounded-full flex-shrink-0" :style="{ backgroundColor: RADAR_COLORS[s] }" />
                    <span class="text-[9px] text-gray-500 w-14">{{ SCENARIO_META[s]?.label }}</span>
                    <span :class="['text-[11px] font-black tabular-nums w-6 text-right', radarData.scores[ri] > 0 ? scoreColor(radarData.scores[ri]) : 'text-gray-700']">
                      {{ radarData.scores[ri] > 0 ? radarData.scores[ri] : '—' }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="!radarData.hasData" class="px-4 pb-3 -mt-2 text-center">
                <p class="text-[10px] text-gray-700">Complete training sessions to build your radar.</p>
              </div>
            </div>

          </div><!-- end LEFT column -->

          <!-- RIGHT column -->
          <div class="flex flex-col gap-3">

            <div v-if="loadingHistory" class="flex items-center justify-center py-8 gap-2">
              <svg class="w-4 h-4 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span class="text-xs text-gray-600">Loading history…</span>
            </div>

            <div v-else-if="!apiHistory || !apiHistory.total" class="py-8 text-center">
              <p class="text-xs text-gray-600">No training history yet.</p>
              <p class="text-[10px] text-gray-700 mt-1">Complete some drills to see your progress.</p>
            </div>

            <template v-if="apiHistory && apiHistory.total">
              <div class="flex flex-col gap-3">
                <div
                  v-for="(meta, scenario) in SCENARIO_META"
                  :key="scenario"
                  class="rounded-xl border border-white/[0.07] overflow-hidden"
                  style="background: rgba(255,255,255,0.02)"
                >
                  <div class="flex items-center gap-3 px-4 py-3">
                    <!-- Colour dot -->
                    <div :class="['w-2 h-2 rounded-full flex-shrink-0', meta.dot]" />

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-xs font-bold text-white">{{ meta.label }}</span>
                        <!-- Trend badge -->
                        <span
                          v-if="apiHistory.by_scenario[scenario]?.trend !== null"
                          :class="['text-[9px] font-bold', trendColor(apiHistory.by_scenario[scenario]?.trend ?? null)]"
                        >
                          {{ trendIcon(apiHistory.by_scenario[scenario]?.trend ?? null) }}
                          {{
                            Math.abs(apiHistory.by_scenario[scenario]?.trend ?? 0).toFixed(1)
                          }}
                          pts
                        </span>
                      </div>
                      <p class="text-[9px] text-gray-600">{{ meta.description }}</p>
                    </div>

                    <!-- Best score -->
                    <div class="text-right flex-shrink-0">
                      <div
                        v-if="apiHistory.by_scenario[scenario]?.best_score !== null"
                        :class="['text-lg font-black tabular-nums leading-none', scoreColor(apiHistory.by_scenario[scenario]?.best_score ?? 0)]"
                      >
                        {{ apiHistory.by_scenario[scenario]?.best_score }}
                      </div>
                      <div v-else class="text-sm font-black text-gray-700">—</div>
                      <div class="text-[9px] text-gray-600 mt-0.5">best</div>
                    </div>

                    <!-- Sparkline -->
                    <div class="ml-2 flex-shrink-0">
                      <svg width="80" height="28" class="overflow-visible">
                        <path
                          v-if="buildSparkline(scenario)"
                          :d="buildSparkline(scenario)"
                          fill="none"
                          :stroke="meta.dot.replace('bg-', '').includes('red') ? '#f87171' : meta.dot.replace('bg-', '').includes('sky') ? '#38bdf8' : meta.dot.replace('bg-', '').includes('amber') ? '#fbbf24' : '#a78bfa'"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <text v-if="!buildSparkline(scenario)" x="40" y="16" text-anchor="middle" font-size="9" fill="#374151">No data</text>
                      </svg>
                    </div>
                  </div>

                  <!-- Last 5 mini bars -->
                  <div
                    v-if="apiHistory.by_scenario[scenario]?.sessions?.length"
                    class="flex gap-px px-4 pb-3"
                  >
                    <div
                      v-for="(sess, si) in [...(apiHistory.by_scenario[scenario]?.sessions ?? [])].reverse().slice(-8)"
                      :key="si"
                      class="flex-1 flex flex-col items-center gap-0.5"
                    >
                      <div class="w-full bg-white/[0.05] rounded-sm relative" style="height: 24px">
                        <div
                          :class="['absolute bottom-0 left-0 right-0 rounded-sm transition-all', scoreBarColor(sess.score)]"
                          :style="{ height: (sess.score / 100) * 24 + 'px' }"
                        />
                      </div>
                      <span class="text-[7px] text-gray-700 tabular-nums">{{ sess.score }}</span>
                    </div>
                  </div>

                  <!-- Benchmark row -->
                  <div
                    v-if="(benchmarkData?.[scenario]?.peers ?? 0) >= 5"
                    class="px-4 pb-3 border-t border-white/[0.04] pt-2.5"
                  >
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-[9px] font-black uppercase tracking-[0.15em] text-gray-600">vs All Players</span>
                      <span
                        v-if="benchmarkData![scenario].label"
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        :class="{
                          'bg-green-500/10 text-green-400 border border-green-500/30': (benchmarkData![scenario].percentile ?? 0) >= 75,
                          'bg-blue-500/10 text-blue-400 border border-blue-500/30': (benchmarkData![scenario].percentile ?? 0) >= 50 && (benchmarkData![scenario].percentile ?? 0) < 75,
                          'bg-white/5 text-gray-500 border border-white/10': (benchmarkData![scenario].percentile ?? 0) < 50,
                        }"
                      >{{ benchmarkData![scenario].label }}</span>
                    </div>
                    <!-- Dual-bar: user best vs global avg -->
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="text-[8px] text-gray-600 w-10 text-right shrink-0">You</span>
                        <div class="flex-1 bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                          <div
                            class="h-full rounded-full bg-red-500/70 transition-all duration-700"
                            :style="{ width: (benchmarkData![scenario].user_best ?? 0) + '%' }"
                          />
                        </div>
                        <span class="text-[8px] tabular-nums font-bold text-red-400 w-5 shrink-0">{{ benchmarkData![scenario].user_best ?? '—' }}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-[8px] text-gray-600 w-10 text-right shrink-0">Avg</span>
                        <div class="flex-1 bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                          <div
                            class="h-full rounded-full bg-gray-500/50 transition-all duration-700"
                            :style="{ width: (benchmarkData![scenario].global_avg ?? 0) + '%' }"
                          />
                        </div>
                        <span class="text-[8px] tabular-nums text-gray-500 w-5 shrink-0">{{ benchmarkData![scenario].global_avg ?? '—' }}</span>
                      </div>
                    </div>
                    <p class="text-[8px] text-gray-700 mt-1">{{ benchmarkData![scenario].peers }} players compared</p>
                  </div>
                </div>
              </div>
            </template>

            <!-- Correlation Insights -->
            <div v-if="correlationInsights.length" class="rounded-xl border border-white/[0.08] overflow-hidden" style="background: rgba(255,255,255,0.02)">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]">
                <div class="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Training Insights</span>
              </div>
              <div class="divide-y divide-white/[0.04]">
                <div
                  v-for="(insight, i) in correlationInsights"
                  :key="i"
                  class="flex items-start gap-3 px-4 py-2.5"
                >
                  <div class="w-1.5 h-1.5 rounded-full bg-red-500/50 flex-shrink-0 mt-1.5" />
                  <p class="text-[11px] text-gray-400 leading-relaxed">{{ insight }}</p>
                </div>
              </div>
            </div>

            <!-- Achievements -->
            <div class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Achievements</span>
                <div class="flex-1 h-px bg-white/[0.04]" />
                <span class="text-[9px] text-gray-700">{{ unlockedCount }} / {{ ACHIEVEMENTS.length }}</span>
              </div>
              <div class="grid grid-cols-3 gap-px p-px bg-white/[0.04]">
                <div
                  v-for="ach in displayAchievements"
                  :key="ach.id"
                  class="flex flex-col items-center gap-1 px-2 py-3 text-center"
                  :class="isUnlocked(ach.id) ? 'bg-white/[0.02]' : 'bg-white/[0.01]'"
                  :title="isUnlocked(ach.id) ? ach.description : ach.secret ? '???' : ach.description"
                >
                  <span class="flex items-center justify-center" :class="isUnlocked(ach.id) ? '' : 'grayscale opacity-30'">
                    <span v-if="ach.secret && !isUnlocked(ach.id)" v-html="ICON_LOCK" />
                    <span v-else v-html="ach.icon" />
                  </span>
                  <span class="text-[8px] font-bold leading-tight" :class="isUnlocked(ach.id) ? 'text-white' : 'text-gray-700'">
                    {{ ach.secret && !isUnlocked(ach.id) ? '???' : ach.name }}
                  </span>
                  <span v-if="isUnlocked(ach.id)" class="text-[7px] text-red-400/70 font-medium">
                    {{ formatAchievementDate(achievements.unlocked.value[ach.id]) }}
                  </span>
                </div>
              </div>
            </div>

          </div><!-- end RIGHT column -->
        </div><!-- end grid -->
      </template>

      <!-- ── COACHING TAB ────────────────────────────────────────────── -->
      <template v-if="activeTab === 'coaching'">
        <div class="grid grid-cols-[280px_1fr] gap-4 p-3 items-start">

          <!-- LEFT column -->
          <div class="flex flex-col gap-3">

            <!-- AI Coaching context card -->
            <div class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]">
                <div class="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">AI Coaching</span>
              </div>
              <!-- Loading -->
              <div v-if="loadingAiCoaching" class="px-4 py-3 space-y-2">
                <div class="h-3 w-3/4 rounded bg-white/[0.05] animate-pulse" />
                <div class="h-2.5 w-full rounded bg-white/[0.05] animate-pulse" />
                <div class="h-2.5 w-5/6 rounded bg-white/[0.05] animate-pulse" />
              </div>
              <!-- AI response -->
              <div v-else-if="aiCoaching" class="px-4 py-3 space-y-2.5">
                <p class="text-[11px] font-semibold text-white leading-snug">{{ aiCoaching.headline }}</p>
                <p class="text-[10px] text-gray-400 leading-relaxed">{{ aiCoaching.message }}</p>
                <ul class="space-y-1.5 pt-0.5">
                  <li
                    v-for="(tip, i) in aiCoaching.tips"
                    :key="i"
                    class="flex items-start gap-1.5 text-[10px] text-gray-400 leading-relaxed"
                  >
                    <span class="w-1 h-1 rounded-full bg-red-400/60 flex-shrink-0 mt-1.5" />
                    {{ tip }}
                  </li>
                </ul>
                <p class="text-[10px] italic text-gray-500 pt-0.5">{{ aiCoaching.encouragement }}</p>
              </div>
              <!-- Fallback -->
              <div v-else class="px-4 py-3 space-y-2">
                <p class="text-[11px] text-gray-400 leading-relaxed">VOD analysis identifies your weak areas and assigns targeted drills to fix them.</p>
                <div class="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-red-400/70 flex-shrink-0"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                  <span>{{ coachingDrills.length }} drill{{ coachingDrills.length !== 1 ? 's' : '' }} assigned</span>
                </div>
              </div>
            </div>

            <!-- Session Progress card -->
            <div v-if="coachingDrills.length" class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="px-4 py-3">
                <div class="text-[9px] font-black uppercase tracking-[0.15em] text-gray-500 mb-2">Session Progress</div>
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                    <div class="h-full bg-red-500/70 rounded-full transition-all duration-500" :style="{ width: coachingDrills.length ? (completedDrills.size / coachingDrills.length * 100) + '%' : '0%' }" />
                  </div>
                  <span class="text-[10px] font-bold text-gray-400 tabular-nums">{{ completedDrills.size }}/{{ coachingDrills.length }}</span>
                </div>
              </div>
            </div>

            <!-- Training ↔ Game Correlation Insights -->
            <div v-if="correlationInsights.length" class="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]">
                <svg class="w-3 h-3 text-red-400/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Impact on Game</span>
              </div>
              <ul class="px-4 py-3 space-y-2">
                <li
                  v-for="(insight, i) in correlationInsights"
                  :key="i"
                  class="flex items-start gap-2 text-[10px] text-gray-400 leading-relaxed"
                >
                  <span class="w-1 h-1 rounded-full bg-red-400/50 flex-shrink-0 mt-1.5" />
                  {{ insight }}
                </li>
              </ul>
            </div>

          </div><!-- end LEFT column -->

          <!-- RIGHT column -->
          <div class="flex flex-col gap-3">

            <div v-if="loadingHistory" class="flex items-center justify-center py-8 gap-2">
              <svg class="w-4 h-4 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>

            <div
              v-else-if="!coachingDrills.length"
              class="py-8 text-center rounded-xl border border-white/[0.06]"
              style="background: rgba(255,255,255,0.02)"
            >
              <div class="flex items-center justify-center mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-gray-700"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
              </div>
              <p class="text-xs text-gray-500">No coaching drills assigned yet.</p>
              <p class="text-[10px] text-gray-600 mt-1">Analyse a VOD to get personalised drills.</p>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="drill in coachingDrills"
                :key="drill.id"
                class="rounded-xl border border-white/[0.07] overflow-hidden"
                style="background: rgba(255,255,255,0.02)"
              >
                <div class="flex items-start gap-3 px-4 py-3">
                  <!-- Category icon -->
                  <div
                    class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400/70"
                    v-html="CATEGORY_ICON[drill.category] ?? CATEGORY_ICON['default']"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-xs font-bold text-white">{{ drill.title }}</span>
                      <span
                        class="text-[8px] font-bold uppercase bg-red-500/10 text-red-400/80 border border-red-500/20 px-1.5 py-px rounded-full"
                        >{{ drill.category.replace('_', ' ') }}</span
                      >
                    </div>
                    <p v-if="drill.instructions" class="text-[10px] text-gray-500 leading-relaxed mb-1.5">
                      {{ sanitizeInstructions(drill.instructions) }}
                    </p>
                    <!-- VOD source attribution: which weakness drove this drill -->
                    <div class="flex items-center gap-1 mb-1.5">
                      <svg class="w-2.5 h-2.5 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8h12a2 2 0 012 2v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-4a2 2 0 012-2z"/>
                      </svg>
                      <span class="text-[9px] text-gray-700 italic">From VOD analysis · <span class="text-gray-600 capitalize">{{ drill.category.replace(/_/g, ' ') }}</span> weakness</span>
                    </div>
                    <!-- Progress bar: baseline → target -->
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-white/[0.05] rounded-full h-1 relative">
                        <div
                          class="absolute left-0 top-0 h-1 rounded-full bg-red-500/60"
                          :style="{ width: (drill.baseline_score / 10) * 100 + '%' }"
                        />
                        <div
                          class="absolute top-0 h-1 w-px bg-yellow-400/60"
                          :style="{ left: (drill.target_score / 10) * 100 + '%' }"
                        />
                      </div>
                      <span class="text-[9px] text-gray-600 tabular-nums flex-shrink-0">
                        {{ drill.baseline_score }}/10 → {{ drill.target_score }}/10
                      </span>
                    </div>
                    <p v-if="drill.success_metric" class="text-[9px] text-gray-600 mt-1.5 italic flex items-center gap-1">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-2.5 h-2.5 text-red-400/60 flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                      {{ drill.success_metric }}
                    </p>
                  </div>
                </div>
                <!-- End coaching drill card content -->
                </div>
              </div>

          </div><!-- end RIGHT column -->
        </div><!-- end grid -->
      </template>

    </div>
  </div>
</template>

<style scoped>
.result-in-enter-active {
  transition: all 0.25s ease;
}
.result-in-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.modal-fade-enter-active {
  transition: opacity 0.2s ease;
}
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active > div {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-enter-from > div {
  transform: scale(0.92) translateY(10px);
}
</style>
