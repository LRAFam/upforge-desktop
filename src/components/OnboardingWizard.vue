<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center"
      style="background: rgba(7,11,18,0.97); background-image: radial-gradient(ellipse 80% 60% at 50% 20%, rgba(255,70,85,0.08) 0%, transparent 60%)"
    >
      <!-- Numbered progress indicator -->
      <div class="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-0">
        <template v-for="i in 4" :key="i">
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 relative z-10"
            :class="i < step
              ? 'bg-[#ff4655]/20 text-[#ff4655] border border-[#ff4655]/40'
              : i === step
                ? 'bg-[#ff4655] text-white shadow-[0_0_12px_rgba(255,70,85,0.5)]'
                : 'bg-white/[0.06] text-gray-600 border border-white/[0.08]'"
          >
            <svg v-if="i < step" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span v-else>{{ i }}</span>
          </div>
          <div
            v-if="i < 4"
            class="w-8 h-px transition-all duration-500"
            :class="i < step ? 'bg-[#ff4655]/40' : 'bg-white/[0.07]'"
          />
        </template>
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
      <div class="w-full max-w-md mx-6 rounded-2xl border border-white/[0.08] bg-[#090e17] shadow-[0_40px_100px_rgba(0,0,0,0.95)] overflow-hidden relative">
        <!-- Top accent bar -->
        <div class="h-px bg-gradient-to-r from-transparent via-[#ff4655]/70 to-transparent" />

        <!-- Slide container -->
        <div class="relative overflow-hidden">
          <Transition :name="slideDir">
            <!-- Step 1: Welcome -->
            <div v-if="step === 1" key="step1" class="px-7 pt-9 pb-7">
              <!-- Header -->
              <div class="flex items-center gap-3.5 mb-7">
                <img src="../assets/upforge-logo.png" alt="UpForge" class="w-12 h-12 rounded-2xl ring-1 ring-[#ff4655]/25 shadow-[0_0_24px_rgba(255,70,85,0.2)]" />
                <div>
                  <h2 class="text-xl font-black text-white leading-tight">Welcome to <span class="text-[#ff4655]">UpForge</span></h2>
                  <p class="text-[11px] text-gray-500 mt-0.5">AI-powered coaching for competitive gamers</p>
                </div>
              </div>

              <!-- 2x2 Feature grid -->
              <div class="grid grid-cols-2 gap-2.5 mb-7">
                <!-- Auto-Record -->
                <div class="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.10] hover:border-[#ff4655]/20 hover:bg-[#ff4655]/[0.02] transition-all duration-200 cursor-default">
                  <div class="w-7 h-7 rounded-lg bg-[#ff4655]/10 border border-[#ff4655]/15 flex items-center justify-center mb-3">
                    <svg class="w-3.5 h-3.5 text-[#ff4655]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" stroke-width="1.5"/>
                      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>
                    </svg>
                  </div>
                  <div class="text-xs font-bold text-white mb-0.5">Auto-Record</div>
                  <div class="text-[10px] text-gray-500 leading-relaxed">Every match captured automatically</div>
                </div>

                <!-- AI Coaching -->
                <div class="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.10] hover:border-purple-500/20 hover:bg-purple-500/[0.02] transition-all duration-200 cursor-default">
                  <div class="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/15 flex items-center justify-center mb-3">
                    <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                    </svg>
                  </div>
                  <div class="text-xs font-bold text-white mb-0.5">AI Coaching</div>
                  <div class="text-[10px] text-gray-500 leading-relaxed">Claude analyzes every game you play</div>
                </div>

                <!-- Progress Tracking -->
                <div class="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.10] hover:border-blue-500/20 hover:bg-blue-500/[0.02] transition-all duration-200 cursor-default">
                  <div class="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center mb-3">
                    <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                  </div>
                  <div class="text-xs font-bold text-white mb-0.5">Progress Tracking</div>
                  <div class="text-[10px] text-gray-500 leading-relaxed">Rank trends and weekly reports</div>
                </div>

                <!-- Aim Training -->
                <div class="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.10] hover:border-green-500/20 hover:bg-green-500/[0.02] transition-all duration-200 cursor-default">
                  <div class="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/15 flex items-center justify-center mb-3">
                    <svg class="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </div>
                  <div class="text-xs font-bold text-white mb-0.5">Aim Training</div>
                  <div class="text-[10px] text-gray-500 leading-relaxed">Custom drills from your weaknesses</div>
                </div>
              </div>

              <button
                class="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff4655] to-[#f97316] text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,70,85,0.3)]"
                @click="nextStep"
              >
                Get Started
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
              <p class="text-center text-[10px] text-gray-600 mt-3">Takes less than 2 minutes to set up</p>
            </div>

            <!-- Step 2: Game Setup -->
            <div v-else-if="step === 2" key="step2" class="px-7 pt-8 pb-7">
              <p class="text-[10px] font-bold text-[#ff4655] uppercase tracking-widest mb-1.5">Step 1 of 3</p>
              <h2 class="text-xl font-black text-white mb-1 leading-tight">Choose your game</h2>
              <p class="text-xs text-gray-500 mb-5">Pick your primary game for AI coaching.</p>

              <div class="space-y-2.5 mb-7">
                <button
                  v-for="game in GAMES"
                  :key="game.id"
                  class="relative w-full h-[72px] rounded-xl overflow-hidden transition-all duration-200 focus:outline-none block text-left"
                  :class="selectedGame === game.id
                    ? 'ring-2 ring-[#ff4655] ring-offset-1 ring-offset-[#090e17]'
                    : 'ring-1 ring-white/[0.07] hover:ring-white/[0.18]'"
                  @click="selectedGame = game.id"
                >
                  <img :src="game.img" :alt="game.name" class="absolute inset-0 w-full h-full object-cover" />
                  <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />
                  <div v-if="selectedGame === game.id" class="absolute inset-0 bg-[#ff4655]/10" />

                  <div class="absolute inset-0 flex items-center px-4 justify-between">
                    <div class="flex items-center gap-3">
                      <!-- Radio circle -->
                      <div
                        class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        :class="selectedGame === game.id ? 'border-[#ff4655] bg-[#ff4655]' : 'border-white/25 bg-black/30'"
                      >
                        <svg v-if="selectedGame === game.id" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <div>
                        <div class="text-sm font-black text-white">{{ game.name }}</div>
                        <div class="text-[10px] text-gray-400">{{ game.desc }}</div>
                      </div>
                    </div>
                    <span v-if="game.live" class="flex items-center gap-1 text-[9px] font-bold text-green-400 bg-black/60 backdrop-blur px-2.5 py-1 rounded-full">
                      <span class="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />Live
                    </span>
                    <span v-else class="text-[9px] font-bold text-amber-400 bg-black/60 backdrop-blur px-2.5 py-1 rounded-full">Coming Soon</span>
                  </div>
                </button>
              </div>

              <button
                class="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff4655] to-[#f97316] text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,70,85,0.3)]"
                @click="nextStep"
              >
                Next
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            <!-- Step 3: Sensitivity Setup -->
            <div v-else-if="step === 3" key="step3" class="px-7 pt-8 pb-7">
              <p class="text-[10px] font-bold text-[#ff4655] uppercase tracking-widest mb-1.5">Step 2 of 3</p>
              <h2 class="text-xl font-black text-white mb-1 leading-tight">Sensitivity Setup</h2>
              <p class="text-xs text-gray-500 mb-5">Match your in-game settings for accurate aim training calibration.</p>

              <!-- DPI -->
              <div class="mb-4">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Mouse DPI</label>
                <div class="grid grid-cols-4 gap-1.5 mb-2">
                  <button
                    v-for="preset in DPI_PRESETS"
                    :key="preset"
                    class="py-1.5 rounded-lg border text-xs font-bold transition-all"
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
                  class="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-[#ff4655]/40 focus:bg-white/[0.06] transition-all placeholder-gray-700"
                  placeholder="Custom DPI…"
                />
              </div>

              <!-- In-game sensitivity -->
              <div class="mb-5">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">In-Game Sensitivity</label>
                <input
                  v-model.number="sensitivity"
                  type="number"
                  min="0.01"
                  max="20"
                  step="0.01"
                  class="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-[#ff4655]/40 focus:bg-white/[0.06] transition-all placeholder-gray-700"
                  placeholder="e.g. 0.4"
                />
              </div>

              <!-- eDPI display -->
              <div v-if="edpi > 0" class="flex items-center justify-between px-4 py-3.5 rounded-xl border mb-6 bg-white/[0.02]" :class="edpiBorderClass">
                <div>
                  <div class="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Effective DPI</div>
                  <div class="text-2xl font-black text-white mt-0.5 tabular-nums">{{ edpi }}</div>
                </div>
                <div class="text-right">
                  <span class="text-xs font-bold px-3 py-1.5 rounded-full border" :class="edpiLabelClass">{{ edpiLabel }}</span>
                  <p class="text-[9px] text-gray-600 mt-1.5 max-w-[110px]">{{ edpiAdvice }}</p>
                </div>
              </div>

              <button
                class="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff4655] to-[#f97316] text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,70,85,0.3)]"
                @click="nextStep"
              >
                Next
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            <!-- Step 4: Ready -->
            <div v-else-if="step === 4" key="step4" class="px-7 pt-9 pb-7">
              <!-- Success icon -->
              <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ff4655]/20 to-orange-500/10 border border-[#ff4655]/25 flex items-center justify-center mb-5 shadow-[0_0_32px_rgba(255,70,85,0.18)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ff4655" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 class="text-xl font-black text-white mb-1 leading-tight">You're all set!</h2>
              <p class="text-xs text-gray-500 mb-5">Here's what we configured for you:</p>

              <!-- Configured summary -->
              <div class="space-y-2 mb-5">
                <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.09]">
                  <div class="w-4 h-4 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="w-2 h-2"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span class="text-xs text-gray-400">Primary game: <span class="text-white font-bold capitalize">{{ selectedGame }}</span></span>
                </div>
                <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.09]">
                  <div class="w-4 h-4 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="w-2 h-2"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span class="text-xs text-gray-400">Sensitivity: <span class="text-white font-bold">{{ dpi }} DPI · {{ sensitivity }} sens</span> <span class="text-gray-600">(eDPI {{ edpi }})</span></span>
                </div>
              </div>

              <!-- Hotkeys -->
              <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Hotkeys</p>
              <div class="space-y-1.5 mb-7">
                <div
                  v-for="hk in HOTKEYS"
                  :key="hk.key"
                  class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.09]"
                >
                  <span class="px-2 py-0.5 rounded-md bg-white/[0.07] border border-white/10 text-xs font-black text-white font-mono min-w-[36px] text-center tracking-wider">{{ hk.key }}</span>
                  <span class="text-xs text-gray-300">{{ hk.action }}</span>
                </div>
              </div>

              <button
                :disabled="saving"
                class="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff4655] to-[#f97316] text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-60 shadow-[0_4px_20px_rgba(255,70,85,0.3)]"
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
import valorantImg from '../assets/games/valorant.jpg'
import cs2Img from '../assets/games/cs2.jpg'
import deadlockImg from '../assets/games/deadlock.jpg'

const emit = defineEmits<{ complete: [] }>()

defineProps<{ alreadyCompleted?: boolean }>()

const step = ref(1)
const slideDir = ref<'slide-left' | 'slide-right'>('slide-left')
const saving = ref(false)

const selectedGame = ref<'valorant' | 'cs2' | 'deadlock'>('valorant')
const dpi = ref(800)
const sensitivity = ref(0.4)

const GAMES = [
  { id: 'valorant' as const, name: 'Valorant', img: valorantImg, live: true, desc: 'Full AI coaching & VOD analysis' },
  { id: 'cs2' as const, name: 'CS2', img: cs2Img, live: true, desc: 'Match analysis & aim coaching' },
  { id: 'deadlock' as const, name: 'Deadlock', img: deadlockImg, live: false, desc: 'Support coming soon' },
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

const edpiAdvice = computed(() => {
  const e = edpi.value
  if (e <= 0) return ''
  if (e <= 300) return 'Pro-level sensitivity'
  if (e <= 600) return 'Great for most players'
  if (e <= 1000) return 'Consider going lower'
  return 'Very high — try reducing'
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
