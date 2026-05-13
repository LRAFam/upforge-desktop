<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center"
      style="background: rgba(11,18,25,0.95); background-image: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,70,85,0.06) 0%, transparent 70%)"
    >
      <!-- Step dots -->
      <div class="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div
          v-for="i in 4"
          :key="i"
          class="rounded-full transition-all duration-300"
          :class="i === step ? 'w-5 h-1.5 bg-[#ff4655]' : i < step ? 'w-1.5 h-1.5 bg-[#ff4655]/40' : 'w-1.5 h-1.5 bg-white/15'"
        />
      </div>

      <!-- Back arrow -->
      <button
        v-if="step > 1"
        class="absolute top-5 left-6 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/[0.06]"
        @click="prevStep"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <!-- Close button (step 4 or already completed) -->
      <button
        v-if="step === 4 || alreadyCompleted"
        class="absolute top-5 right-6 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/[0.06]"
        @click="handleComplete"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <!-- Card -->
      <div class="w-full max-w-sm mx-6 rounded-2xl border border-white/[0.07] bg-[#0d1520] shadow-[0_32px_80px_rgba(0,0,0,0.8)] overflow-hidden relative">
        <!-- Top accent bar -->
        <div class="h-px bg-gradient-to-r from-transparent via-[#ff4655]/50 to-transparent" />

        <!-- Slide container -->
        <div class="relative overflow-hidden">
          <Transition :name="slideDir">
            <!-- Step 1: Welcome -->
            <div v-if="step === 1" key="step1" class="px-7 pt-8 pb-7">
              <div class="flex items-center gap-2 mb-6">
                <span class="text-2xl font-black text-white tracking-tight">UP</span>
                <span class="text-2xl font-black text-[#ff4655] tracking-tight">FORGE</span>
              </div>
              <h2 class="text-xl font-black text-white mb-2 leading-tight">Welcome to UpForge</h2>
              <p class="text-sm text-gray-400 leading-relaxed mb-8">
                Auto-records your matches. AI coaches you after every game. Let's get you set up.
              </p>
              <button
                class="w-full py-3 rounded-xl bg-[#ff4655] hover:bg-[#e83d4a] text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                @click="nextStep"
              >
                Let's Go
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            <!-- Step 2: Game Setup -->
            <div v-else-if="step === 2" key="step2" class="px-7 pt-8 pb-7">
              <p class="text-[10px] font-bold text-[#ff4655] uppercase tracking-widest mb-1">Step 1 of 3</p>
              <h2 class="text-xl font-black text-white mb-1 leading-tight">Choose your game</h2>
              <p class="text-xs text-gray-500 mb-5">Pick your primary game for coaching.</p>
              <div class="flex flex-col gap-3 mb-7">
                <button
                  v-for="game in GAMES"
                  :key="game.id"
                  class="flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left"
                  :class="selectedGame === game.id
                    ? 'border-[#ff4655]/50 bg-[#ff4655]/[0.07]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'"
                  @click="selectedGame = game.id"
                >
                  <div
                    class="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
                    :class="selectedGame === game.id ? 'border-[#ff4655]' : 'border-white/20'"
                  >
                    <div v-if="selectedGame === game.id" class="w-2 h-2 rounded-full bg-[#ff4655]" />
                  </div>
                  <div>
                    <div class="text-sm font-bold text-white">{{ game.name }}</div>
                    <div class="text-[11px] text-gray-500 mt-0.5">{{ game.description }}</div>
                  </div>
                  <span class="ml-auto text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider flex-shrink-0">Live</span>
                </button>
              </div>
              <button
                class="w-full py-3 rounded-xl bg-[#ff4655] hover:bg-[#e83d4a] text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                @click="nextStep"
              >
                Next
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            <!-- Step 3: Sensitivity Setup -->
            <div v-else-if="step === 3" key="step3" class="px-7 pt-8 pb-7">
              <p class="text-[10px] font-bold text-[#ff4655] uppercase tracking-widest mb-1">Step 2 of 3</p>
              <h2 class="text-xl font-black text-white mb-1 leading-tight">Sensitivity Setup</h2>
              <p class="text-xs text-gray-500 mb-5">Match these to your in-game settings for accurate aim training calibration.</p>

              <!-- DPI -->
              <div class="mb-4">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Mouse DPI</label>
                <div class="flex gap-2 mb-2">
                  <button
                    v-for="preset in DPI_PRESETS"
                    :key="preset"
                    class="flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all"
                    :class="dpi === preset
                      ? 'border-[#ff4655]/50 bg-[#ff4655]/10 text-[#ff4655]'
                      : 'border-white/[0.07] bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:border-white/15'"
                    @click="dpi = preset"
                  >{{ preset }}</button>
                </div>
                <input
                  v-model.number="dpi"
                  type="number"
                  min="100"
                  max="32000"
                  step="100"
                  class="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-[#ff4655]/40 transition-colors"
                  placeholder="e.g. 800"
                />
              </div>

              <!-- In-game sensitivity -->
              <div class="mb-4">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">In-Game Sensitivity</label>
                <input
                  v-model.number="sensitivity"
                  type="number"
                  min="0.01"
                  max="20"
                  step="0.01"
                  class="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-[#ff4655]/40 transition-colors"
                  placeholder="e.g. 0.4"
                />
              </div>

              <!-- eDPI display -->
              <div v-if="edpi > 0" class="flex items-center justify-between px-4 py-3 rounded-xl border bg-white/[0.02] mb-6" :class="edpiBorderClass">
                <div>
                  <div class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">eDPI</div>
                  <div class="text-xl font-black text-white mt-0.5 tabular-nums">{{ edpi }}</div>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 rounded-full border" :class="edpiLabelClass">{{ edpiLabel }}</span>
              </div>

              <button
                class="w-full py-3 rounded-xl bg-[#ff4655] hover:bg-[#e83d4a] text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                @click="nextStep"
              >
                Next
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            <!-- Step 4: Ready -->
            <div v-else-if="step === 4" key="step4" class="px-7 pt-8 pb-7">
              <div class="w-10 h-10 rounded-2xl bg-[#ff4655]/10 border border-[#ff4655]/20 flex items-center justify-center mb-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ff4655" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 class="text-xl font-black text-white mb-1 leading-tight">You're Ready!</h2>
              <p class="text-xs text-gray-500 mb-6">Here are your hotkeys to get started:</p>

              <div class="space-y-2 mb-7">
                <div
                  v-for="hk in HOTKEYS"
                  :key="hk.key"
                  class="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <span class="px-2 py-1 rounded-lg bg-white/[0.07] border border-white/10 text-xs font-black text-white font-mono min-w-[36px] text-center">{{ hk.key }}</span>
                  <span class="text-sm text-gray-300">{{ hk.action }}</span>
                </div>
              </div>

              <button
                :disabled="saving"
                class="w-full py-3 rounded-xl bg-[#ff4655] hover:bg-[#e83d4a] text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                @click="handleComplete"
              >
                <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start Training
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{ complete: [] }>()

defineProps<{ alreadyCompleted?: boolean }>()

const step = ref(1)
const slideDir = ref<'slide-left' | 'slide-right'>('slide-left')
const saving = ref(false)

const selectedGame = ref<'valorant' | 'cs2'>('valorant')
const dpi = ref(800)
const sensitivity = ref(0.4)

const GAMES = [
  { id: 'valorant' as const, name: 'Valorant', description: '5v5 tactical shooter · Riot Games' },
  { id: 'cs2' as const, name: 'CS2', description: 'Counter-Strike 2 · Valve' },
]

const DPI_PRESETS = [400, 800, 1600, 3200]

const HOTKEYS = [
  { key: 'F9', action: 'Save clip' },
  { key: 'F10', action: 'Toggle overlay' },
  { key: 'F8', action: 'Screenshot' },
]

const edpi = computed(() => {
  if (!dpi.value || !sensitivity.value) return 0
  return Math.round(dpi.value * sensitivity.value)
})

const edpiLabel = computed(() => {
  const e = edpi.value
  if (e <= 0) return ''
  if (e <= 300) return 'Elite'
  if (e <= 600) return 'Good'
  return 'High'
})

const edpiLabelClass = computed(() => {
  const lbl = edpiLabel.value
  if (lbl === 'Elite') return 'text-green-400 border-green-500/30 bg-green-500/10'
  if (lbl === 'Good') return 'text-[#fbbf24] border-yellow-500/30 bg-yellow-500/10'
  return 'text-red-400 border-red-500/30 bg-red-500/10'
})

const edpiBorderClass = computed(() => {
  const lbl = edpiLabel.value
  if (lbl === 'Elite') return 'border-green-500/20'
  if (lbl === 'Good') return 'border-yellow-500/20'
  return 'border-red-500/20'
})

function nextStep() {
  slideDir.value = 'slide-left'
  step.value = Math.min(step.value + 1, 4)
}

function prevStep() {
  slideDir.value = 'slide-right'
  step.value = Math.max(step.value - 1, 1)
}

async function handleComplete() {
  if (saving.value) return
  saving.value = true
  try {
    const current = await window.api.settings.get()
    await window.api.settings.save({
      onboardingComplete: true,
      trainerMouse: {
        ...current.trainerMouse,
        game: selectedGame.value,
        dpi: dpi.value,
        sensitivity: sensitivity.value,
      },
    })
  } catch (e) {
    console.error('[Onboarding] Failed to save settings:', e)
  } finally {
    saving.value = false
  }
  emit('complete')
}
</script>

<style scoped>
.slide-left-enter-active,
.slide-right-enter-active {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-left-leave-active,
.slide-right-leave-active {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
