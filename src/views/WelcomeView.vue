<template>
  <div class="welcome-root">

    <!-- ─────────────── LEFT PANEL — Brand hero ─────────────── -->
    <div class="left-panel">
      <!-- Background orbs -->
      <div class="lp-orb lp-orb-1" />
      <div class="lp-orb lp-orb-2" />
      <div class="lp-orb lp-orb-3" />
      <div class="noise" />

      <!-- Top edge accent -->
      <div class="lp-top-bar" />

      <div class="lp-content">
        <img src="../assets/upforge-logo.png" alt="UpForge" class="lp-logo" />
        <h1 class="lp-headline">Level up every<br/><em>single match.</em></h1>
        <p class="lp-sub">
          Auto-records your Valorant games. Delivers AI coaching<br/>in your tray within minutes of your final bullet.
        </p>

        <!-- Stat pills -->
        <div class="lp-pills">
          <div class="pill">
            <span class="pill-value">3</span>
            <span class="pill-label">improvements per match</span>
          </div>
          <div class="pill">
            <span class="pill-value">100%</span>
            <span class="pill-label">automated</span>
          </div>
        </div>
      </div>

      <!-- Bottom wordmark -->
      <p class="lp-wordmark">upforge.gg</p>
    </div>

    <!-- ─────────────── RIGHT PANEL — Steps ─────────────── -->
    <div class="right-panel">
      <!-- Step dots -->
      <div class="step-dots">
        <div
          v-for="i in TOTAL_STEPS"
          :key="i"
          class="step-dot"
          :class="{
            'step-dot--active': i === step,
            'step-dot--done': i < step
          }"
        />
      </div>

      <!-- Step content -->
      <div class="step-outer">

        <!-- ── Step 1: Features ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 1" key="1" class="step-content">
            <div class="step-header">
              <h2 class="step-title">What you get</h2>
              <p class="step-desc">Everything you need to get better — zero configuration required.</p>
            </div>

            <div class="features-list">
              <div
                v-for="(feature, idx) in features"
                :key="feature.title"
                class="feature-card"
                :style="{ animationDelay: `${idx * 0.08}s` }"
              >
                <div class="feature-icon" :class="feature.iconBg">
                  <svg class="w-4 h-4" :class="feature.iconColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="feature.icon" />
                  </svg>
                </div>
                <div>
                  <p class="feature-title">{{ feature.title }}</p>
                  <p class="feature-text">{{ feature.text }}</p>
                </div>
              </div>
            </div>

            <button class="btn-primary mt-6" @click="step = 2">
              Get Started
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </Transition>

        <!-- ── Step 2: Sign In ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 2" key="2" class="step-content">
            <div class="step-header">
              <h2 class="step-title">Sign in</h2>
              <p class="step-desc">Use the same credentials as <span class="text-gray-300">upforge.gg</span></p>
            </div>

            <form class="form-fields" @submit.prevent="handleLogin">
              <div class="field-group">
                <label class="field-label">Email</label>
                <input
                  v-model="email"
                  type="email"
                  placeholder="you@example.com"
                  autocomplete="email"
                  required
                  class="field-input"
                />
              </div>
              <div class="field-group">
                <label class="field-label">Password</label>
                <div class="relative">
                  <input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    required
                    class="field-input pr-9"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                    @click="showPassword = !showPassword"
                  >
                    <svg v-if="!showPassword" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                  </button>
                </div>
              </div>

              <Transition name="error-fade">
                <div v-if="loginError" class="error-box">
                  <svg class="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p>{{ loginError }}</p>
                </div>
              </Transition>

              <button type="submit" class="btn-primary" :disabled="loginLoading">
                <svg v-if="loginLoading" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>{{ loginLoading ? 'Signing in…' : 'Sign In' }}</span>
              </button>
            </form>

            <div class="form-footer">
              <span class="text-gray-600 text-[11px]">No account?
                <button class="text-red-400 hover:text-red-300 transition-colors" @click="openSignup">Sign up free ↗</button>
              </span>
              <button class="text-[11px] text-gray-600 hover:text-gray-400 transition-colors" @click="openForgotPassword">Forgot password?</button>
            </div>
            <button class="back-btn" @click="step = 1">← Back</button>
          </div>
        </Transition>

        <!-- ── Step 3: Folder ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 3" key="3" class="step-content">
            <div class="step-header">
              <div class="step-icon-wrap">
                <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
              </div>
              <h2 class="step-title">Recording folder</h2>
              <p class="step-desc">Recordings save here, then delete automatically once your AI analysis is ready.</p>
            </div>

            <div class="folder-box" @click="choosePath">
              <svg class="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
              <span class="folder-path">{{ savePath || 'Default location' }}</span>
              <span class="folder-change">Change</span>
            </div>

            <div class="info-box">
              <svg class="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
              <p class="text-[11px] text-green-400/80 leading-snug">Recordings are deleted after upload — typically within 10 minutes of your game ending.</p>
            </div>

            <button class="btn-primary mt-2" @click="finishOnboarding">
              Start Recording
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </Transition>

      </div>
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
const showPassword = ref(false)
const savePath = ref('')

const features = [
  {
    icon: 'M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 8h11a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z',
    iconBg: 'icon-bg-red',
    iconColor: 'text-red-400',
    title: 'Automatic match recording',
    text: 'Detects Valorant and starts the moment your match begins'
  },
  {
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    iconBg: 'icon-bg-purple',
    iconColor: 'text-purple-400',
    title: 'AI coaching after every game',
    text: 'Top 3 improvements delivered to your tray within minutes'
  },
  {
    icon: 'M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
    iconBg: 'icon-bg-orange',
    iconColor: 'text-orange-400',
    title: 'Highlight clip capture',
    text: 'Kill clips & aces saved automatically — F9 to bookmark moments'
  },
  {
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    iconBg: 'icon-bg-cyan',
    iconColor: 'text-cyan-400',
    title: 'Progress tracking',
    text: 'RR history, score trends and session summaries over time'
  }
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
function openForgotPassword() {
  window.open('https://upforge.gg/forgot-password', '_blank')
}
</script>

<style scoped>
/* ── Layout ── */
.welcome-root {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #080808;
  user-select: none;
}

/* ── Left panel ── */
.left-panel {
  position: relative;
  width: 340px;
  flex-shrink: 0;
  background: #0c0c0c;
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: drag;
}

.lp-top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #ef4444, #f97316, transparent);
  opacity: 0.8;
  z-index: 2;
}

.lp-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(70px);
}
.lp-orb-1 {
  width: 360px; height: 360px;
  background: radial-gradient(circle, rgba(239,68,68,0.22) 0%, transparent 65%);
  top: -120px; left: -80px;
  animation: lp-drift1 14s ease-in-out infinite alternate;
}
.lp-orb-2 {
  width: 240px; height: 240px;
  background: radial-gradient(circle, rgba(249,115,22,0.14) 0%, transparent 65%);
  bottom: -60px; right: -60px;
  animation: lp-drift2 18s ease-in-out infinite alternate;
}
.lp-orb-3 {
  width: 180px; height: 180px;
  background: radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 65%);
  top: 45%; left: 40%;
  animation: lp-drift3 22s ease-in-out infinite alternate;
}
@keyframes lp-drift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(30px,25px) scale(1.08); } }
@keyframes lp-drift2 { from { transform: translate(0,0); } to { transform: translate(-20px,-15px); } }
@keyframes lp-drift3 { from { transform: translate(0,0); } to { transform: translate(-40px,30px); } }

.noise {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
  pointer-events: none;
}

.lp-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  padding: 40px 32px 32px;
  gap: 20px;
}

.lp-logo {
  height: 36px;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 0 16px rgba(239,68,68,0.3));
}

.lp-headline {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #f9fafb;
  margin: 0;
}
.lp-headline em {
  font-style: normal;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 60%, #fbbf24 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lp-sub {
  font-size: 12px;
  color: rgba(156,163,175,0.7);
  line-height: 1.65;
  margin: 0;
}

.lp-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.pill {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  gap: 2px;
}
.pill-value {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #ef4444, #f97316);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}
.pill-label {
  font-size: 10px;
  color: #4b5563;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lp-wordmark {
  position: relative;
  z-index: 1;
  font-size: 11px;
  color: #1f2937;
  padding: 0 32px 20px;
  margin: 0;
  letter-spacing: 0.04em;
  font-weight: 500;
}

/* ── Right panel ── */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 40px;
  position: relative;
  -webkit-app-region: no-drag;
}

.step-dots {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  align-items: center;
}
.step-dot {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: rgba(255,255,255,0.08);
  transition: all 0.3s ease;
}
.step-dot--active {
  width: 20px;
  background: linear-gradient(90deg, #ef4444, #f97316);
}
.step-dot--done {
  background: rgba(239,68,68,0.35);
}

.step-outer {
  width: 100%;
  max-width: 340px;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Step header ── */
.step-header {
  margin-bottom: 20px;
}
.step-icon-wrap {
  width: 40px;
  height: 40px;
  background: rgba(6,182,212,0.1);
  border: 1px solid rgba(6,182,212,0.2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.step-title {
  font-size: 18px;
  font-weight: 700;
  color: #f9fafb;
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}
.step-desc {
  font-size: 11.5px;
  color: #4b5563;
  margin: 0;
  line-height: 1.5;
}

/* ── Feature cards ── */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.feature-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 14px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  animation: card-enter 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes card-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.feature-card:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.09);
}

.feature-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.icon-bg-red    { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.15); }
.icon-bg-purple { background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.15); }
.icon-bg-orange { background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.15); }
.icon-bg-cyan   { background: rgba(6,182,212,0.1);  border: 1px solid rgba(6,182,212,0.15); }

.feature-title {
  font-size: 11.5px;
  font-weight: 600;
  color: #e5e7eb;
  margin: 0 0 2px;
}
.feature-text {
  font-size: 10.5px;
  color: #4b5563;
  line-height: 1.4;
  margin: 0;
}

/* ── Forms ── */
.form-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field-label {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  padding-left: 2px;
}
.field-input {
  width: 100%;
  padding: 9px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  font-size: 12px;
  color: #f9fafb;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
  font-family: inherit;
  box-sizing: border-box;
}
.field-input::placeholder { color: #374151; }
.field-input:focus {
  border-color: rgba(239,68,68,0.4);
  background: rgba(255,255,255,0.06);
}

.error-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px;
  font-size: 11px;
  color: #f87171;
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.back-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 0;
  transition: color 0.15s;
}
.back-btn:hover { color: #6b7280; }

/* ── Folder ── */
.folder-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: background 0.15s, border-color 0.15s;
}
.folder-box:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.12);
}
.folder-path {
  flex: 1;
  font-size: 11px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-change {
  font-size: 10px;
  color: #4b5563;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(34,197,94,0.05);
  border: 1px solid rgba(34,197,94,0.15);
  border-radius: 10px;
  margin-bottom: 10px;
}

/* ── CTA button ── */
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 11px 20px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  box-shadow: 0 4px 20px rgba(239,68,68,0.25);
  font-family: inherit;
}
.btn-primary:hover   { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:active  { transform: translateY(0); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.mt-6 { margin-top: 24px; }
.mt-2 { margin-top: 8px; }

/* ── Transitions ── */
.step-enter-active, .step-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.step-enter-from { opacity: 0; transform: translateX(20px); }
.step-leave-to   { opacity: 0; transform: translateX(-20px); }

.error-fade-enter-active, .error-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.error-fade-enter-from { opacity: 0; transform: translateY(-4px); }
.error-fade-leave-to   { opacity: 0; }
</style>

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
          <div class="flex items-center justify-center">
            <img src="../assets/upforge-logo.png" alt="UpForge" class="h-10 w-auto object-contain" />
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
                <svg class="w-3.5 h-3.5" :class="feature.iconColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="feature.iconPath" />
                </svg>
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
              <div class="relative">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  required
                  class="w-full px-3 py-2 pr-9 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all"
                />
                <button
                  type="button"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                  @click="showPassword = !showPassword"
                >
                  <svg v-if="!showPassword" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                  </svg>
                </button>
              </div>
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

          <div class="flex items-center justify-between mt-4">
            <p class="text-[11px] text-gray-600">
              No account?
              <button class="text-red-400 hover:text-red-300 transition-colors" @click="openSignup">Sign up free ↗</button>
            </p>
            <button class="text-[11px] text-gray-600 hover:text-gray-400 transition-colors" @click="openForgotPassword">Forgot password?</button>
          </div>
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
const showPassword = ref(false)
const savePath = ref('')

const features = [
  {
    bg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    iconPath: 'M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 8h11a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z',
    title: 'Records every competitive match',
    text: 'Detects Valorant automatically — no buttons, no setup, just play'
  },
  {
    bg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
    iconPath: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    title: 'AI coaching after every game',
    text: 'Your top 3 improvements delivered in your tray within minutes'
  },
  {
    bg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-400',
    iconPath: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    title: 'Track your progress over time',
    text: 'See your score trend, win streak, and improvement history at a glance'
  }
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
function openForgotPassword() {
  window.open('https://upforge.gg/forgot-password', '_blank')
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
