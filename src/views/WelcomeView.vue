<template>
  <div class="flex flex-col h-full overflow-hidden relative">
    <!-- Background glow -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-red-600/[0.06] rounded-full blur-3xl" />
    </div>

    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-1.5 pt-4 flex-shrink-0">
      <div v-for="i in TOTAL_STEPS" :key="i" :class="[
        'rounded-full transition-all duration-300',
        i === step ? 'w-4 h-1.5 bg-red-500' : i < step ? 'w-1.5 h-1.5 bg-red-500/40' : 'w-1.5 h-1.5 bg-white/10'
      ]" />
    </div>

    <!-- Step content -->
    <div class="flex-1 flex flex-col items-center justify-center px-8 relative z-10 min-h-0">

      <!-- Step 1: Welcome -->
      <Transition name="step" mode="out-in">
        <div v-if="step === 1" key="1" class="w-full max-w-[280px] text-center space-y-5">
          <div class="w-14 h-14 mx-auto bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-500/25">
            <svg class="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <h1 class="text-lg font-bold tracking-tight">Welcome to UpForge</h1>
            <p class="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
              Auto-record every Valorant game and get AI coaching after each match — automatically.
            </p>
          </div>
          <div class="space-y-2 text-left">
            <div v-for="feature in features" :key="feature.text" class="flex items-start gap-2.5 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.05]">
              <div class="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" :class="feature.bg">
                <span class="text-xs">{{ feature.icon }}</span>
              </div>
              <div>
                <p class="text-[11px] font-medium text-gray-200">{{ feature.title }}</p>
                <p class="text-[10px] text-gray-600 leading-snug">{{ feature.text }}</p>
              </div>
            </div>
          </div>
          <button
            class="w-full py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-red-500/20"
            @click="step = 2"
          >
            Get Started →
          </button>
        </div>
      </Transition>

      <!-- Step 2: Sign In -->
      <Transition name="step" mode="out-in">
        <div v-if="step === 2" key="2" class="w-full max-w-[280px]">
          <div class="text-center mb-5">
            <h2 class="text-sm font-bold">Sign in to your account</h2>
            <p class="text-[11px] text-gray-500 mt-1">Use the same account as upforge.gg</p>
          </div>

          <form class="space-y-3" @submit.prevent="handleLogin">
            <div class="space-y-1">
              <label class="block text-[11px] font-medium text-gray-400 ml-0.5">Email</label>
              <input
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
                class="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all"
              />
            </div>
            <div class="space-y-1">
              <label class="block text-[11px] font-medium text-gray-400 ml-0.5">Password</label>
              <input
                v-model="password"
                type="password"
                placeholder="••••••••"
                autocomplete="current-password"
                required
                class="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all"
              />
            </div>
            <div v-if="loginError" class="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <svg class="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-[11px] text-red-400">{{ loginError }}</p>
            </div>
            <button
              type="submit"
              :disabled="loginLoading"
              class="w-full py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-red-500/20"
            >
              <span v-if="loginLoading" class="flex items-center justify-center gap-2">
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
              <span v-else>Sign In</span>
            </button>
          </form>

          <p class="text-center text-[11px] text-gray-600 mt-4">
            No account?
            <button class="text-red-400 hover:text-red-300 transition-colors" @click="openSignup">Sign up free ↗</button>
          </p>
          <button class="w-full mt-3 text-[11px] text-gray-700 hover:text-gray-500 transition-colors text-center" @click="step = 1">← Back</button>
        </div>
      </Transition>

      <!-- Step 3: Recording folder -->
      <Transition name="step" mode="out-in">
        <div v-if="step === 3" key="3" class="w-full max-w-[280px]">
          <div class="text-center mb-5">
            <div class="w-10 h-10 mx-auto bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center justify-center mb-3">
              <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
            </div>
            <h2 class="text-sm font-bold">Recording folder</h2>
            <p class="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Recordings are saved here temporarily, then deleted after upload.
            </p>
          </div>

          <div class="space-y-3">
            <div class="px-3 py-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl">
              <p class="text-[10px] text-gray-600 mb-0.5">Save location</p>
              <p class="text-[11px] text-gray-300 truncate">{{ savePath || 'Default location' }}</p>
            </div>

            <button
              class="w-full py-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-gray-400 hover:text-gray-200 text-xs rounded-xl transition-all"
              @click="choosePath"
            >
              Change folder
            </button>

            <div class="px-3 py-2.5 bg-green-500/[0.06] border border-green-500/20 rounded-xl flex items-start gap-2">
              <svg class="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
              <p class="text-[11px] text-green-400/80">Recordings are automatically deleted after your analysis is ready.</p>
            </div>

            <button
              class="w-full py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-red-500/20"
              @click="finishOnboarding"
            >
              Start Recording →
            </button>
          </div>
        </div>
      </Transition>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const TOTAL_STEPS = 3
const step = ref(1)

const email = ref('')
const password = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const savePath = ref('')

const features = [
  { icon: '🎮', bg: 'bg-red-500/10', title: 'Auto-detect games', text: 'Detects Valorant launch and starts recording instantly' },
  { icon: '🤖', bg: 'bg-purple-500/10', title: 'AI analysis after every game', text: 'Coaching report delivered minutes after the match ends' },
  { icon: '📊', bg: 'bg-cyan-500/10', title: 'Timeline-aware insights', text: 'Kill/death events guide smarter frame selection' }
]

onMounted(async () => {
  const settings = await window.api.settings.get() as { savePath: string }
  savePath.value = settings.savePath
})

async function handleLogin() {
  loginLoading.value = true
  loginError.value = ''
  const result = await window.api.auth.login(email.value, password.value)
  if ((result as { ok?: boolean }).ok) {
    step.value = 3
  } else {
    loginError.value = (result as { error?: string }).error || 'Login failed. Check your credentials.'
  }
  loginLoading.value = false
}

async function choosePath() {
  const chosen = await window.api.dialog.openDirectory()
  if (chosen) {
    savePath.value = chosen as string
    await window.api.settings.save({ savePath: chosen })
  }
}

async function finishOnboarding() {
  await window.api.settings.save({ firstRun: false })
  router.push('/dashboard')
}

function openSignup() {
  window.open('https://upforge.gg/register', '_blank')
}
</script>

<style scoped>
.step-enter-active,
.step-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
