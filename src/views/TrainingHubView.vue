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
const SCENARIO_META: Record<string, { label: string; description: string; color: string; bg: string; border: string; band: string; dot: string }> = {
  flick: {
    label: 'Flick',
    description: 'React and snap to stationary targets.',
    color: 'text-red-400',
    bg: 'bg-red-500/[0.08]',
    border: 'border-red-500/20',
    band: 'bg-red-500',
    dot: 'bg-red-500',
  },
  tracking: {
    label: 'Tracking',
    description: 'Keep crosshair on a moving target.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/[0.08]',
    border: 'border-sky-500/20',
    band: 'bg-sky-500',
    dot: 'bg-sky-500',
  },
  microadjust: {
    label: 'Micro-Adj',
    description: 'Fine corrections from near your cursor.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/[0.08]',
    border: 'border-amber-500/20',
    band: 'bg-amber-500',
    dot: 'bg-amber-500',
  },
  switching: {
    label: 'Switch',
    description: 'Click highlighted targets across screen.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/[0.08]',
    border: 'border-violet-500/20',
    band: 'bg-violet-500',
    dot: 'bg-violet-500',
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

function scoreBgStrip(score: number): string {
  if (score >= 80) return 'bg-green-500/[0.08]'
  if (score >= 55) return 'bg-yellow-500/[0.08]'
  return 'bg-red-500/[0.08]'
}


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
  <div class="h-full bg-[#0c0c0c] text-white flex flex-col overflow-hidden">

    <!-- Top bar -->
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/[0.05] flex-shrink-0">
      <div class="flex items-center gap-3">
        <h1 class="text-sm font-bold tracking-tight">Aim Training</h1>
        <span class="text-[10px] font-bold bg-white/[0.06] text-gray-500 border border-white/[0.08] rounded px-1.5 py-0.5 uppercase tracking-widest">Beta</span>
      </div>
      <div v-if="averageScore !== null" class="flex items-center gap-2">
        <span class="text-xs text-gray-600">Session avg</span>
        <span :class="['text-sm font-black tabular-nums', scoreColor(averageScore)]">{{ averageScore }}</span>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">

      <!-- Last result strip -->
      <Transition name="result-in">
        <div v-if="lastResult" class="mx-4 mt-3 rounded-lg bg-white/[0.03] border border-white/[0.07] overflow-hidden">
          <div class="flex items-stretch">
            <!-- Score block -->
            <div :class="['flex flex-col items-center justify-center px-4 py-3 min-w-[72px]', scoreBgStrip(lastResult.score)]">
              <span :class="['text-2xl font-black tabular-nums leading-none', scoreColor(lastResult.score)]">{{ lastResult.score }}</span>
              <span class="text-[10px] font-semibold text-gray-500 uppercase mt-0.5">{{ scoreLabel(lastResult.score) }}</span>
            </div>
            <!-- Stats -->
            <div class="flex-1 flex items-center px-4 gap-5 border-l border-white/[0.06]">
              <div>
                <div class="text-sm font-bold text-white tabular-nums">{{ lastResult.accuracy_pct.toFixed(1) }}<span class="text-gray-600 text-xs font-normal">%</span></div>
                <div class="text-[10px] text-gray-600 uppercase tracking-wide mt-0.5">Accuracy</div>
              </div>
              <div>
                <div class="text-sm font-bold text-white tabular-nums">{{ Math.round(lastResult.avg_reaction_ms) }}<span class="text-gray-600 text-xs font-normal">ms</span></div>
                <div class="text-[10px] text-gray-600 uppercase tracking-wide mt-0.5">Reaction</div>
              </div>
              <div>
                <div class="text-sm font-bold text-white tabular-nums">{{ lastResult.targets_hit }}<span class="text-gray-600 text-xs font-normal">/{{ lastResult.targets_hit + lastResult.targets_missed }}</span></div>
                <div class="text-[10px] text-gray-600 uppercase tracking-wide mt-0.5">Hits</div>
              </div>
              <div>
                <div class="text-sm font-bold text-white tabular-nums">{{ Math.round(lastResult.consistency_score) }}</div>
                <div class="text-[10px] text-gray-600 uppercase tracking-wide mt-0.5">Consistency</div>
              </div>
            </div>
            <!-- Scenario label -->
            <div class="flex items-center px-4 border-l border-white/[0.06]">
              <span :class="['text-[10px] font-bold uppercase tracking-widest', SCENARIO_META[lastResult.scenario]?.color]">
                {{ SCENARIO_META[lastResult.scenario]?.label ?? lastResult.scenario }}
              </span>
            </div>
          </div>
          <!-- Score bar -->
          <div class="h-[2px] bg-white/[0.04]">
            <div :class="['h-full transition-all duration-700', scoreBarColor(lastResult.score)]" :style="{ width: lastResult.score + '%' }" />
          </div>
        </div>
      </Transition>

      <!-- Section: AI Drills -->
      <div class="px-4 mt-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Today's Drills</span>
          <div class="flex-1 h-px bg-white/[0.05]" />
          <span class="text-[10px] text-gray-700">AI · based on your VODs</span>
        </div>
        <div class="space-y-1.5">
          <div
            v-for="drill in assignedDrills"
            :key="drill.scenario"
            class="group flex items-center gap-0 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10] transition-all overflow-hidden cursor-pointer"
            @click="!launching && launchDrill(drill)"
          >
            <!-- Scenario colour band -->
            <div :class="['w-1 self-stretch flex-shrink-0', SCENARIO_META[drill.scenario]?.band]" />
            <!-- Content -->
            <div class="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-white">{{ SCENARIO_META[drill.scenario]?.label }}</span>
                  <span :class="['text-[10px] font-bold uppercase', DIFFICULTY_COLORS[drill.difficulty]]">{{ drill.difficulty }}</span>
                  <span class="text-[10px] text-gray-600">{{ drill.duration_seconds }}s</span>
                </div>
                <p class="text-[11px] text-gray-500 mt-0.5 truncate leading-relaxed">{{ drill.reason }}</p>
              </div>
              <!-- Weakness bar -->
              <div class="flex items-center gap-2 flex-shrink-0">
                <div class="w-12 bg-white/[0.06] rounded-full h-0.5">
                  <div class="h-0.5 rounded-full bg-red-500/70" :style="{ width: drill.weakness_score + '%' }" />
                </div>
                <span class="text-[10px] tabular-nums text-gray-600 w-6">{{ drill.weakness_score }}</span>
              </div>
            </div>
            <!-- Launch button -->
            <button
              :disabled="launching"
              class="flex-shrink-0 h-full px-4 text-xs font-bold border-l border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-40"
              :class="activeDrill?.scenario === drill.scenario && launching ? 'text-gray-600' : ''"
              @click.stop="launchDrill(drill)"
            >
              <span v-if="activeDrill?.scenario === drill.scenario && launching" class="flex items-center gap-1.5">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              </span>
              <span v-else>▶</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Section: Free Play -->
      <div class="px-4 mt-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Free Play</span>
          <div class="flex-1 h-px bg-white/[0.05]" />
        </div>

        <!-- Scenario tiles -->
        <div class="grid grid-cols-4 gap-1.5 mb-2">
          <button
            v-for="(meta, key) in SCENARIO_META"
            :key="key"
            :class="[
              'rounded-lg border py-2.5 text-center transition-all',
              freePlayScenario === key
                ? `${meta.border} ${meta.bg} ${meta.color}`
                : 'border-white/[0.06] bg-white/[0.02] text-gray-600 hover:text-gray-400 hover:bg-white/[0.04]'
            ]"
            @click="freePlayScenario = key as typeof freePlayScenario"
          >
            <div class="text-xs font-bold">{{ meta.label }}</div>
          </button>
        </div>

        <!-- Difficulty + Duration row -->
        <div class="flex gap-2 mb-2">
          <div class="flex-1">
            <div class="flex gap-1">
              <button
                v-for="diff in (['easy','medium','hard','pro'] as const)"
                :key="diff"
                :class="[
                  'flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all border',
                  freePlayDifficulty === diff
                    ? `${DIFFICULTY_COLORS[diff]} bg-white/[0.06] border-white/10`
                    : 'text-gray-600 bg-transparent border-white/[0.04] hover:text-gray-400'
                ]"
                @click="freePlayDifficulty = diff"
              >{{ diff }}</button>
            </div>
          </div>
          <div class="flex gap-1">
            <button
              v-for="dur in [30, 60, 120]"
              :key="dur"
              :class="[
                'px-2.5 py-1.5 rounded text-[10px] font-bold transition-all border',
                freePlayDuration === dur
                  ? 'text-white bg-white/[0.08] border-white/10'
                  : 'text-gray-600 bg-transparent border-white/[0.04] hover:text-gray-400'
              ]"
              @click="freePlayDuration = dur"
            >{{ dur < 60 ? dur + 's' : (dur/60) + 'm' }}</button>
          </div>
        </div>

        <button
          :disabled="launching"
          class="w-full py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-xs font-bold text-gray-300 hover:text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          @click="launchFreePlay"
        >
          <svg v-if="launching" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          {{ launching ? 'Launching…' : 'Launch' }}
        </button>
      </div>

      <!-- Section: History -->
      <div v-if="sessionHistory.length" class="px-4 mt-4 mb-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">This Session</span>
          <div class="flex-1 h-px bg-white/[0.05]" />
        </div>
        <div class="space-y-px">
          <div
            v-for="(s, i) in sessionHistory"
            :key="i"
            class="flex items-center gap-3 px-3 py-2 rounded bg-white/[0.02] border border-white/[0.04]"
          >
            <div :class="['w-1.5 h-1.5 rounded-full flex-shrink-0', SCENARIO_META[s.scenario]?.dot]" />
            <span class="text-[10px] font-bold text-gray-500 uppercase w-16 truncate">{{ SCENARIO_META[s.scenario]?.label ?? s.scenario }}</span>
            <span :class="['text-sm font-black tabular-nums w-8', scoreColor(s.score)]">{{ s.score }}</span>
            <div class="flex-1 bg-white/[0.04] rounded-full h-px">
              <div :class="['h-px rounded-full', scoreBarColor(s.score)]" :style="{ width: s.score + '%' }" />
            </div>
            <span class="text-[10px] text-gray-600 tabular-nums">{{ s.accuracy_pct.toFixed(0) }}%</span>
            <span class="text-[10px] text-gray-600 tabular-nums">{{ Math.round(s.avg_reaction_ms) }}ms</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.result-in-enter-active { transition: all 0.25s ease; }
.result-in-enter-from { opacity: 0; transform: translateY(-4px); }
</style>
