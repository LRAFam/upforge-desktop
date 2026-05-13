<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { TrainingHistory, CoachingDrill } from '../env'

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
const launching = ref(false)
const drillRunning = ref(false)    // true from launch success → until result received
const showResultModal = ref(false) // completion modal
const lastResult = ref<SessionResult | null>(null)
const lastPlayedDrill = ref<AssignedDrill | null>(null) // preserved after activeDrill cleared
const sessionHistory = ref<SessionResult[]>([])
const activeDrill = ref<AssignedDrill | null>(null)
const completedDrills = ref<Set<string>>(new Set())
const apiHistory = ref<TrainingHistory | null>(null)
const coachingDrills = ref<CoachingDrill[]>([])
const correlationInsights = ref<string[]>([])
const loadingHistory = ref(false)
const heatmapCanvas = ref<HTMLCanvasElement | null>(null)
const activeTab = ref<'drills' | 'progress' | 'coaching'>('drills')

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
  removeListener = window.api.on('trainer:session-result', (result: unknown) => {
    const r = result as SessionResult
    lastResult.value = r
    sessionHistory.value.unshift(r)
    if (activeDrill.value) {
      completedDrills.value.add(activeDrill.value.scenario)
      lastPlayedDrill.value = activeDrill.value
    }
    activeDrill.value = null
    drillRunning.value = false
    showResultModal.value = true
    activeTab.value = 'drills'
    nextTick(() => drawHeatmap(r))
    // Refresh API history so Progress tab reflects the new session
    window.api.trainer.getHistory().then(h => { apiHistory.value = h })
  })

  // Fetch training history + coaching drills from API
  loadingHistory.value = true
  try {
    const [history, drills, insights] = await Promise.all([
      window.api.trainer.getHistory(),
      window.api.trainer.getCoachingDrills(),
      window.api.trainer.getCorrelation(),
    ])
    apiHistory.value = history
    const drillList = Array.isArray(drills) ? drills : []
    coachingDrills.value = drillList
    correlationInsights.value = Array.isArray(insights) ? insights : []
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
          reason: d.instructions ?? d.title,
        }))
      if (mapped.length > 0) assignedDrills.value = mapped
    }
  } finally {
    loadingHistory.value = false
  }
})

onUnmounted(() => {
  removeListener?.()
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

async function launchCoachingDrill(drill: CoachingDrill) {
  await launchDrill({
    scenario: CATEGORY_TO_SCENARIO[drill.category] ?? 'flick',
    difficulty: 'medium',
    duration_seconds: 60,
    weakness: drill.category,
    weakness_score: drill.baseline_score,
    reason: drill.instructions ?? drill.title,
  })
}

const averageScore = computed(() => {
  if (!sessionHistory.value.length) return null
  return Math.round(sessionHistory.value.reduce((a, b) => a + b.score, 0) / sessionHistory.value.length)
})

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
  <div class="h-full text-white flex flex-col overflow-hidden relative" style="background: #0b1219">

    <!-- ── DRILL RUNNING BANNER ──────────────────────────────────────────── -->
    <Transition name="result-in">
      <div
        v-if="drillRunning && activeDrill"
        class="flex-shrink-0 mx-4 mt-3 rounded-xl border border-teal-500/30 bg-teal-500/[0.07] overflow-hidden"
      >
        <div class="flex items-center justify-between px-4 py-2.5">
          <div class="flex items-center gap-2.5">
            <div class="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <div>
              <span class="text-[11px] font-bold text-teal-300 uppercase tracking-wider">
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
        <div class="h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent animate-pulse" />
      </div>
    </Transition>

    <!-- ── COMPLETION MODAL ───────────────────────────────────────────────── -->
    <Transition name="modal-fade">
      <div
        v-if="showResultModal && lastResult"
        class="absolute inset-0 z-50 flex items-center justify-center"
        style="background: rgba(11,18,25,0.88); backdrop-filter: blur(8px)"
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
              v-if="lastPlayedDrill"
              class="flex-1 py-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 text-[12px] font-semibold text-teal-300 hover:bg-teal-500/20 transition-all flex items-center justify-center gap-1.5"
              @click="() => { const d = lastPlayedDrill!; showResultModal = false; launchDrill(d) }"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Play Again</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Top bar -->
    <div
      class="flex items-center justify-between px-4 pt-3 pb-0 flex-shrink-0"
    >
      <div class="flex items-center gap-3">
        <h1 class="text-sm font-black tracking-tight">Aim Training</h1>
        <span
          class="text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/25 rounded-full px-2 py-0.5 uppercase tracking-widest"
          >Beta</span
        >
      </div>
      <div v-if="averageScore !== null" class="flex items-center gap-2">
        <span class="text-[10px] text-gray-500">Session avg</span>
        <span :class="['text-sm font-black tabular-nums', scoreColor(averageScore)]">{{
          averageScore
        }}</span>
      </div>
    </div>

    <!-- Tab nav -->
    <div class="flex px-4 pt-3 pb-0 gap-1 flex-shrink-0">
      <button
        v-for="tab in (['drills', 'progress', 'coaching'] as const)"
        :key="tab"
        class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border"
        :class="
          activeTab === tab
            ? 'bg-teal-500/15 border-teal-500/30 text-teal-300'
            : 'border-transparent text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'
        "
        @click="activeTab = tab"
      >
        <span class="flex items-center gap-1.5">
          <!-- Drills: crosshair -->
          <svg v-if="tab === 'drills'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>
          <!-- Progress: trend line -->
          <svg v-else-if="tab === 'progress'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          <!-- Coaching: list -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
          {{ tab === 'drills' ? 'Drills' : tab === 'progress' ? 'Progress' : 'Coaching' }}
        </span>
        <span
          v-if="tab === 'coaching' && coachingDrills.length"
          class="ml-1 text-[9px] bg-[#ff4655]/20 text-[#ff4655] rounded-full px-1.5 py-px border border-[#ff4655]/30"
          >{{ coachingDrills.length }}</span
        >
      </button>
    </div>

    <!-- Divider -->
    <div class="mx-4 mt-3 h-px bg-white/[0.06] flex-shrink-0" />

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto" style="scrollbar-width: none">

      <!-- ── DRILLS TAB ──────────────────────────────────────────────── -->
      <template v-if="activeTab === 'drills'">

        <!-- Last result card -->
        <Transition name="result-in">
          <div
            v-if="lastResult"
            class="mx-4 mt-3 rounded-xl border overflow-hidden"
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

        <!-- Section: AI Drills -->
        <div class="px-4 mt-4">
          <div class="flex items-center gap-2 mb-2.5">
            <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500"
              >Today's Drills</span
            >
            <div class="flex-1 h-px bg-white/[0.05]" />
            <span class="text-[9px] text-gray-700">AI · based on your VODs</span>
          </div>
          <div class="space-y-2">
            <div
              v-for="drill in assignedDrills"
              :key="drill.scenario"
              class="group rounded-xl border overflow-hidden transition-all"
              :class="
                completedDrills.has(drill.scenario)
                  ? 'border-teal-500/20 bg-teal-500/[0.04] opacity-60'
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
                    <p class="text-[11px] text-gray-500 leading-relaxed truncate">{{ drill.reason }}</p>
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
                    class="h-full px-4 text-[10px] font-bold text-teal-400 flex items-center gap-1"
                    disabled
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="20 6 9 17 4 12"/></svg>
                    Done
                  </button>
                  <button
                    v-else-if="drillRunning && activeDrill?.scenario === drill.scenario"
                    class="h-full px-4 text-[10px] font-bold text-teal-400 flex items-center gap-1.5"
                    disabled
                  >
                    <div class="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
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
        <div class="px-4 mt-4 mb-4">
          <div class="flex items-center gap-2 mb-2.5">
            <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500"
              >Free Play</span
            >
            <div class="flex-1 h-px bg-white/[0.05]" />
          </div>

          <div class="rounded-xl border border-white/[0.07] overflow-hidden" style="background: #0d1520">
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
              class="w-full py-2.5 text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 text-teal-400 hover:text-teal-300 hover:bg-teal-500/[0.06]"
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

        <!-- Session history (in-memory) -->
        <div v-if="sessionHistory.length" class="px-4 mb-4">
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
              style="background: #0d1520"
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
      </template>

      <!-- ── PROGRESS TAB ────────────────────────────────────────────── -->
      <template v-if="activeTab === 'progress'">
        <div class="px-4 mt-4">
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

          <div v-else class="space-y-3 pb-4">

            <!-- Skill Radar -->
            <div class="rounded-xl border border-white/[0.07] overflow-hidden" style="background: #0d1520">
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
                  <path v-if="radarData.hasData" :d="radarData.dataPath" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.55)" stroke-width="1.5" stroke-linejoin="round" />
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
            <div
              v-for="(meta, scenario) in SCENARIO_META"
              :key="scenario"
              class="rounded-xl border border-white/[0.07] overflow-hidden"
              style="background: #0d1520"
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
            </div>
          </div>
        </div>

        <!-- AI Insights: training vs in-game correlation -->
        <div v-if="correlationInsights.length" class="px-4 mt-1 pb-4">
          <div class="rounded-xl border border-teal-500/20 overflow-hidden" style="background: #0a1a14">
            <div class="flex items-center gap-2 px-4 py-2.5 border-b border-teal-500/10">
              <svg class="w-3.5 h-3.5 text-teal-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              <span class="text-[9px] font-black uppercase tracking-[0.18em] text-teal-400">AI Insights · Training Impact</span>
            </div>
            <div class="divide-y divide-teal-500/[0.08]">
              <div
                v-for="(insight, i) in correlationInsights"
                :key="i"
                class="flex items-start gap-3 px-4 py-2.5"
              >
                <div class="w-1.5 h-1.5 rounded-full bg-teal-500/60 flex-shrink-0 mt-1.5" />
                <p class="text-[11px] text-gray-400 leading-relaxed">{{ insight }}</p>
              </div>
            </div>
          </div>
        </div>

      </template>

      <!-- ── COACHING TAB ────────────────────────────────────────────── -->
      <template v-if="activeTab === 'coaching'">
        <div class="px-4 mt-4 pb-4">
          <p class="text-[10px] text-gray-600 mb-3 leading-relaxed">
            These drills are assigned by UpForge AI based on your VOD analysis. Complete them
            in-game to improve your weak areas.
          </p>

          <div v-if="loadingHistory" class="flex items-center justify-center py-8 gap-2">
            <svg class="w-4 h-4 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>

          <div
            v-else-if="!coachingDrills.length"
            class="py-8 text-center rounded-xl border border-white/[0.06]"
            style="background: #0d1520"
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
              style="background: #0d1520"
            >
              <div class="flex items-start gap-3 px-4 py-3">
                <!-- Category icon -->
                <div
                  class="w-8 h-8 rounded-lg bg-[#ff4655]/10 border border-[#ff4655]/20 flex items-center justify-center flex-shrink-0 text-[#ff4655]/70"
                  v-html="CATEGORY_ICON[drill.category] ?? CATEGORY_ICON['default']"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-bold text-white">{{ drill.title }}</span>
                    <span
                      class="text-[8px] font-bold uppercase bg-[#ff4655]/10 text-[#ff4655]/80 border border-[#ff4655]/20 px-1.5 py-px rounded-full"
                      >{{ drill.category.replace('_', ' ') }}</span
                    >
                  </div>
                  <p v-if="drill.instructions" class="text-[10px] text-gray-500 leading-relaxed mb-1.5">
                    {{ drill.instructions }}
                  </p>
                  <!-- Progress bar: baseline → target -->
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-white/[0.05] rounded-full h-1 relative">
                      <div
                        class="absolute left-0 top-0 h-1 rounded-full bg-teal-500/60"
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-2.5 h-2.5 text-teal-600 flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                    {{ drill.success_metric }}
                  </p>
                </div>
              </div>
              <!-- Train it button — maps coaching drill → trainer scenario -->
              <div v-if="CATEGORY_TO_SCENARIO[drill.category]" class="border-t border-white/[0.05] px-4 py-2 flex items-center justify-between">
                <span class="text-[9px] text-gray-600">
                  Train: <span class="text-gray-500">{{ SCENARIO_META[CATEGORY_TO_SCENARIO[drill.category]]?.label ?? drill.category }}</span>
                </span>
                <button
                  :disabled="launching || drillRunning"
                  class="flex items-center gap-1.5 text-[10px] font-bold text-teal-400 hover:text-teal-300 border border-teal-500/25 hover:border-teal-500/50 hover:bg-teal-500/[0.06] rounded-lg px-2.5 py-1 transition-all disabled:opacity-40"
                  @click="launchCoachingDrill(drill)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" class="w-2.5 h-2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Train Now
                </button>
              </div>
            </div>
          </div>
        </div>
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
