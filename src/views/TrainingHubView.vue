<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

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
const SCENARIO_META: Record<string, { label: string; description: string; color: string; bg: string; border: string }> = {
  flick: {
    label: 'Flick',
    description: 'React and snap to stationary targets. Trains flick accuracy and reaction time.',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  tracking: {
    label: 'Tracking',
    description: 'Keep your crosshair on a moving target. Trains smooth mouse control.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  microadjust: {
    label: 'Micro-Adjust',
    description: 'Small corrections from near your cursor. Trains fine motor control.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  switching: {
    label: 'Switching',
    description: 'Multiple targets — click the highlighted one. Trains target priority.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
  },
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'text-green-400',
  medium: 'text-yellow-400',
  hard: 'text-orange-400',
  pro: 'text-red-400',
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

// ── Launch ────────────────────────────────────────────────────────────────────
async function launchDrill(drill: AssignedDrill) {
  if (launching.value) return
  activeDrill.value = drill
  launching.value = true
  try {
    const result = await window.api.trainer.launch({
      scenario: drill.scenario,
      duration_seconds: drill.duration_seconds,
      difficulty: drill.difficulty,
      context: {
        weakness: drill.weakness,
        score: drill.weakness_score,
      },
    })
    if (!result.ok) {
      console.error('[TrainingHub] Launch failed:', result.error)
    }
  } finally {
    launching.value = false
  }
}

// ── IPC listener — receive result from Godot ──────────────────────────────────
let removeListener: (() => void) | null = null

onMounted(() => {
  removeListener = window.api.on('trainer:session-result', (result: unknown) => {
    const r = result as SessionResult
    lastResult.value = r
    sessionHistory.value.unshift(r)
    activeDrill.value = null
  })
})

onUnmounted(() => {
  removeListener?.()
})

// ── Custom drill (free play) ──────────────────────────────────────────────────
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
  const sum = sessionHistory.value.reduce((a, b) => a + b.score, 0)
  return Math.round(sum / sessionHistory.value.length)
})
</script>

<template>
  <div class="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <div class="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" stroke-width="2"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
            </svg>
          </div>
          <h1 class="text-2xl font-black tracking-tight">Aim Training</h1>
          <span class="text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2.5 py-0.5 uppercase tracking-widest">Beta</span>
        </div>
        <p class="text-gray-400 text-sm">AI-assigned drills based on your VOD weaknesses</p>
      </div>
      <div v-if="averageScore !== null" class="text-right">
        <div class="text-xs text-gray-500 uppercase tracking-widest mb-1">Session Avg</div>
        <div :class="['text-3xl font-black', scoreColor(averageScore)]">{{ averageScore }}</div>
      </div>
    </div>

    <!-- Last result banner -->
    <Transition name="slide-down">
      <div v-if="lastResult" class="rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold uppercase tracking-widest text-gray-400">Last Session</span>
            <span :class="['text-xs font-bold uppercase px-2 py-0.5 rounded-full', SCENARIO_META[lastResult.scenario]?.bg, SCENARIO_META[lastResult.scenario]?.color]">
              {{ SCENARIO_META[lastResult.scenario]?.label ?? lastResult.scenario }}
            </span>
          </div>
          <div :class="['text-2xl font-black', scoreColor(lastResult.score)]">
            {{ lastResult.score }} <span class="text-sm font-normal text-gray-400">— {{ scoreLabel(lastResult.score) }}</span>
          </div>
        </div>
        <div class="w-full bg-white/[0.06] rounded-full h-1.5 mb-3">
          <div :class="['h-1.5 rounded-full transition-all duration-700', scoreBarColor(lastResult.score)]"
               :style="{ width: lastResult.score + '%' }" />
        </div>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-lg font-bold text-white">{{ lastResult.accuracy_pct.toFixed(1) }}%</div>
            <div class="text-xs text-gray-500">Accuracy</div>
          </div>
          <div>
            <div class="text-lg font-bold text-white">{{ Math.round(lastResult.avg_reaction_ms) }}ms</div>
            <div class="text-xs text-gray-500">Avg Reaction</div>
          </div>
          <div>
            <div class="text-lg font-bold text-white">{{ Math.round(lastResult.consistency_score) }}</div>
            <div class="text-xs text-gray-500">Consistency</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- AI-Assigned Drills -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
        <h2 class="text-sm font-bold uppercase tracking-widest text-gray-300">AI-Assigned Drills</h2>
      </div>
      <div class="space-y-3">
        <div
          v-for="drill in assignedDrills"
          :key="drill.scenario"
          :class="['rounded-xl border p-4 transition-all', SCENARIO_META[drill.scenario]?.border, SCENARIO_META[drill.scenario]?.bg]"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span :class="['font-bold text-sm', SCENARIO_META[drill.scenario]?.color]">
                  {{ SCENARIO_META[drill.scenario]?.label }}
                </span>
                <span :class="['text-xs font-semibold uppercase', DIFFICULTY_COLORS[drill.difficulty]]">
                  {{ drill.difficulty }}
                </span>
                <span class="text-xs text-gray-500">{{ drill.duration_seconds }}s</span>
              </div>
              <p class="text-xs text-gray-400 leading-relaxed">{{ drill.reason }}</p>
              <div class="flex items-center gap-1.5 mt-2">
                <div class="text-xs text-gray-500">Weakness score:</div>
                <div class="flex-1 max-w-[80px] bg-white/[0.08] rounded-full h-1">
                  <div class="h-1 rounded-full bg-red-500" :style="{ width: drill.weakness_score + '%' }" />
                </div>
                <div class="text-xs text-red-400 font-bold">{{ drill.weakness_score }}/100</div>
              </div>
            </div>
            <button
              :disabled="launching"
              :class="[
                'shrink-0 px-4 py-2 rounded-lg text-sm font-bold transition-all',
                activeDrill?.scenario === drill.scenario && launching
                  ? 'bg-white/10 text-gray-400 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-400 text-white'
              ]"
              @click="launchDrill(drill)"
            >
              <span v-if="activeDrill?.scenario === drill.scenario && launching">
                Launching…
              </span>
              <span v-else>Train</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Free Play -->
    <div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 class="text-sm font-bold uppercase tracking-widest text-gray-300 mb-3">Free Play</h2>
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide block mb-1">Scenario</label>
          <select v-model="freePlayScenario"
            class="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50">
            <option value="flick">Flick</option>
            <option value="tracking">Tracking</option>
            <option value="microadjust">Micro-Adjust</option>
            <option value="switching">Switching</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide block mb-1">Difficulty</label>
          <select v-model="freePlayDifficulty"
            class="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide block mb-1">Duration</label>
          <select v-model="freePlayDuration"
            class="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50">
            <option :value="30">30s</option>
            <option :value="60">60s</option>
            <option :value="120">2 min</option>
          </select>
        </div>
      </div>
      <button
        :disabled="launching"
        class="w-full py-2.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-bold text-white transition-all disabled:opacity-40"
        @click="launchFreePlay"
      >
        {{ launching ? 'Launching…' : 'Start Free Play' }}
      </button>
    </div>

    <!-- Session History -->
    <div v-if="sessionHistory.length">
      <h2 class="text-sm font-bold uppercase tracking-widest text-gray-300 mb-3">This Session</h2>
      <div class="space-y-2">
        <div
          v-for="(session, i) in sessionHistory"
          :key="i"
          class="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
        >
          <span :class="['text-xs font-bold uppercase px-2 py-0.5 rounded', SCENARIO_META[session.scenario]?.bg, SCENARIO_META[session.scenario]?.color]">
            {{ SCENARIO_META[session.scenario]?.label ?? session.scenario }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 text-sm">
              <span :class="['font-black text-lg', scoreColor(session.score)]">{{ session.score }}</span>
              <span class="text-gray-500 text-xs">{{ session.accuracy_pct.toFixed(1) }}% acc</span>
              <span class="text-gray-500 text-xs">{{ Math.round(session.avg_reaction_ms) }}ms</span>
            </div>
          </div>
          <div class="w-16">
            <div class="w-full bg-white/[0.06] rounded-full h-1">
              <div :class="['h-1 rounded-full', scoreBarColor(session.score)]" :style="{ width: session.score + '%' }" />
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
