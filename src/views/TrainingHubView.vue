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
  scenario: 'flick' | 'tracking' | 'microadjust' | 'switching'
  difficulty: 'easy' | 'medium' | 'hard' | 'pro'
  duration_seconds: number
  weakness: string
  weakness_score: number
  reason: string
}

// ── State ─────────────────────────────────────────────────────────────────────
const launching = ref(false)
const lastResult = ref<SessionResult | null>(null)
const sessionHistory = ref<SessionResult[]>([])
const activeDrill = ref<AssignedDrill | null>(null)
const completedDrills = ref<Set<string>>(new Set())
const apiHistory = ref<TrainingHistory | null>(null)
const coachingDrills = ref<CoachingDrill[]>([])
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
  if (launching.value) return
  activeDrill.value = drill
  launching.value = true
  try {
    const result = await window.api.trainer.launch({
      scenario: drill.scenario,
      duration_seconds: drill.duration_seconds,
      difficulty: drill.difficulty,
      context: { weakness: drill.weakness, score: drill.weakness_score },
    })
    if (!result.ok) {
      console.error('[TrainingHub] Launch failed:', result.error)
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
    if (activeDrill.value) completedDrills.value.add(activeDrill.value.scenario)
    activeDrill.value = null
    drawHeatmap(r)
  })

  // Fetch training history + coaching drills from API
  loadingHistory.value = true
  try {
    const [history, drills] = await Promise.all([
      window.api.trainer.getHistory(),
      window.api.trainer.getCoachingDrills(),
    ])
    apiHistory.value = history
    coachingDrills.value = Array.isArray(drills) ? drills : []
  } finally {
    loadingHistory.value = false
  }
})

onUnmounted(() => {
  removeListener?.()
})

// ── Free play ──────────────────────────────────────────────────────────────────
const freePlayScenario = ref<'flick' | 'tracking' | 'microadjust' | 'switching'>('flick')
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

const averageScore = computed(() => {
  if (!sessionHistory.value.length) return null
  return Math.round(sessionHistory.value.reduce((a, b) => a + b.score, 0) / sessionHistory.value.length)
})

const categoryIcon: Record<string, string> = {
  mechanics: '🎯',
  crosshair_placement: '⊕',
  game_sense: '🧠',
  positioning: '📍',
  communication: '💬',
  utility: '🛠️',
}
</script>

<template>
  <div class="h-full text-white flex flex-col overflow-hidden" style="background: #0b1219">

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
        {{ tab === 'drills' ? '🎯 Drills' : tab === 'progress' ? '📈 Progress' : '📋 Coaching' }}
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
              @click="!launching && !completedDrills.has(drill.scenario) && launchDrill(drill)"
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
                    <span :class="['text-sm font-black', SCENARIO_META[drill.scenario]?.color]">{{
                      drill.scenario === 'flick'
                        ? '⚡'
                        : drill.scenario === 'tracking'
                          ? '◎'
                          : drill.scenario === 'microadjust'
                            ? '⊕'
                            : '⊞'
                    }}</span>
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
                    class="h-full px-4 text-[10px] font-bold text-teal-400"
                    disabled
                  >
                    ✓ Done
                  </button>
                  <button
                    v-else
                    :disabled="launching"
                    class="h-full px-4 text-sm font-bold text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-40"
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
                    <span v-else>▶</span>
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
                <span class="text-base">{{
                  key === 'flick'
                    ? '⚡'
                    : key === 'tracking'
                      ? '◎'
                      : key === 'microadjust'
                        ? '⊕'
                        : '⊞'
                }}</span>
                <span class="text-[10px] font-bold">{{ meta.label }}</span>
              </button>
            </div>

            <!-- Tip for selected scenario -->
            <div class="px-3 py-2 border-b border-white/[0.05] flex items-start gap-2">
              <span class="text-[9px] text-gray-600 flex-shrink-0 pt-px">💡</span>
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
              :disabled="launching"
              class="w-full py-2.5 text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 text-teal-400 hover:text-teal-300 hover:bg-teal-500/[0.06]"
              @click="launchFreePlay"
            >
              <svg
                v-if="launching"
                class="w-3 h-3 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>{{ launching ? 'Launching…' : '▶ Launch Free Play' }}</span>
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
            <div class="text-2xl mb-2">📋</div>
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
                  class="w-8 h-8 rounded-lg bg-[#ff4655]/10 border border-[#ff4655]/20 flex items-center justify-center flex-shrink-0 text-sm"
                >
                  {{ categoryIcon[drill.category] ?? '🎮' }}
                </div>
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
                  <p v-if="drill.success_metric" class="text-[9px] text-gray-600 mt-1.5 italic">
                    ✓ {{ drill.success_metric }}
                  </p>
                </div>
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
</style>
