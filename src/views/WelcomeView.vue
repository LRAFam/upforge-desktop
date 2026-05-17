<template>
  <div class="welcome-root">

    <!-- ─────────────── LEFT PANEL — Brand hero ─────────────── -->
    <div class="left-panel">
      <img src="../assets/upforge-bg.webp" alt="" class="lp-hero-img" />
      <div class="lp-overlay-top" />
      <div class="lp-overlay-bottom" />
      <div class="lp-overlay-right" />
      <div class="lp-orb lp-orb-1" />
      <div class="lp-orb lp-orb-2" />
      <div class="lp-top-bar" />

      <div class="lp-content">
        <!-- Logo + wordmark -->
        <div class="lp-brand">
          <div class="lp-logo-ring">
            <img src="../assets/upforge-logo.png" alt="UpForge" class="lp-logo-img" />
          </div>
          <div>
            <div class="lp-wordmark"><span class="lp-up">UP</span><span class="lp-forge">FORGE</span></div>
            <p class="lp-tagline">AI-Powered Game Coaching</p>
          </div>
        </div>

        <!-- Headline -->
        <div class="lp-headline-block">
          <h1 class="lp-headline">Level up every<br/><em>single match.</em></h1>
          <p class="lp-sub">Auto-records your games. Delivers AI coaching to your tray within minutes.</p>
        </div>

        <!-- Spacer -->
        <div style="flex:1" />

        <!-- Supported games -->
        <p class="lp-section-label">Supported Games</p>
        <div class="lp-game-cards">
          <div class="lp-game-card lp-game-valorant">
            <img src="../assets/games/valorant.jpg" alt="Valorant" class="lp-game-img" />
            <div class="lp-game-gradient" />
            <div class="lp-game-body">
              <span class="lp-game-name">Valorant</span>
              <span class="lp-badge lp-badge-live"><span class="lp-badge-dot" />Live</span>
            </div>
          </div>
          <div class="lp-game-card lp-game-deadlock">
            <img src="../assets/games/deadlock.jpg" alt="Deadlock" class="lp-game-img" />
            <div class="lp-game-gradient" />
            <div class="lp-game-body">
              <span class="lp-game-name">Deadlock</span>
              <span class="lp-badge lp-badge-waitlist">Waitlist</span>
            </div>
          </div>
          <div class="lp-game-card lp-game-cs2">
            <img src="../assets/games/cs2.jpg" alt="CS2" class="lp-game-img" />
            <div class="lp-game-gradient" />
            <div class="lp-game-body">
              <span class="lp-game-name">CS2</span>
              <span class="lp-badge lp-badge-live"><span class="lp-badge-dot" />Live</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─────────────── RIGHT PANEL — Steps ─────────────── -->
    <div class="right-panel">
      <!-- Grid background -->
      <div class="rp-grid" />
      <!-- Ambient glow tracks active step -->
      <div class="rp-glow" :class="`rp-glow--step${step}`" />

      <!-- Step indicator -->
      <div class="step-indicator">
        <div
          v-for="i in TOTAL_STEPS"
          :key="i"
          class="step-pip"
          :class="{ 'step-pip--active': i === step, 'step-pip--done': i < step }"
        >
          <span v-if="i < step" class="pip-check"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span v-else class="pip-num">{{ i }}</span>
        </div>
        <div class="step-track">
          <div class="step-fill" :style="{ width: ((step - 1) / (TOTAL_STEPS - 1) * 100) + '%' }" />
        </div>
      </div>
      <!-- Step labels -->
      <div class="step-labels">
        <span v-for="(label, i) in stepLabels" :key="i" class="step-label" :class="{ 'step-label--active': i + 1 === step }">{{ label }}</span>
      </div>

      <!-- Step content -->
      <div class="step-outer">

        <!-- ── Step 1: Features ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 1" key="1" class="step-content">
            <div class="step-header">
              <p class="step-eyebrow">Step 1 of 5</p>
              <h2 class="step-title">Everything's included.</h2>
              <p class="step-desc">Zero configuration — install and your next match is already being tracked.</p>
            </div>

            <div class="features-list">
              <div
                v-for="(feature, idx) in features"
                :key="feature.title"
                class="feature-card"
                :style="{ animationDelay: `${idx * 0.07}s` }"
              >
                <div class="feature-num">{{ String(idx + 1).padStart(2, '0') }}</div>
                <div class="feature-icon-wrap" :style="{ background: feature.iconBg, boxShadow: `0 0 16px ${feature.glow}` }">
                  <svg class="feature-icon-svg" :style="{ color: feature.iconColor }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" :d="feature.icon" />
                  </svg>
                </div>
                <div class="feature-text-block">
                  <p class="feature-title">{{ feature.title }}</p>
                  <p class="feature-text">{{ feature.text }}</p>
                </div>
                <div v-if="feature.shortcut" class="feature-shortcut">{{ feature.shortcut }}</div>
              </div>
            </div>

            <button class="btn-primary" @click="step = 2">
              Get Started
              <svg class="btn-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </Transition>

        <!-- ── Step 2: Sign In ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 2" key="2" class="step-content">
            <div class="step-header">
              <p class="step-eyebrow">Step 2 of 5</p>
              <h2 class="step-title">Sign in to UpForge.</h2>
              <p class="step-desc">Use your <span class="text-accent">upforge.gg</span> credentials — your coaching history will sync instantly.</p>
            </div>

            <form class="form-fields" @submit.prevent="handleLogin">
              <div class="field-group">
                <label class="field-label">Email</label>
                <div class="field-wrap">
                  <svg class="field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <input v-model="email" type="email" placeholder="you@example.com" autocomplete="email" required class="field-input" />
                </div>
              </div>
              <div class="field-group">
                <label class="field-label">Password</label>
                <div class="field-wrap">
                  <svg class="field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" required class="field-input" />
                  <button type="button" class="field-eye" @click="showPassword = !showPassword">
                    <svg v-if="!showPassword" class="eye-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    <svg v-else class="eye-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                  </button>
                </div>
              </div>

              <Transition name="error-fade">
                <div v-if="loginError" class="error-box">
                  <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p>{{ loginError }}</p>
                </div>
              </Transition>

              <button type="submit" class="btn-primary" :disabled="loginLoading">
                <svg v-if="loginLoading" class="btn-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>{{ loginLoading ? 'Signing in…' : 'Sign In' }}</span>
              </button>
            </form>

            <div class="form-footer">
              <span class="form-footer-text">No account? <button class="link-btn" @click="openSignup">Sign up free ↗</button></span>
              <button class="link-btn" @click="openForgotPassword">Forgot password?</button>
            </div>
            <button class="back-btn" @click="step = 1">← Back</button>
          </div>
        </Transition>

        <!-- ── Step 3: Mouse & Aim Setup ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 3" key="3" class="step-content">
            <div class="step-header">
              <p class="step-eyebrow">Step 3 of 5 — Aim calibration</p>
              <h2 class="step-title">Set your mouse settings.</h2>
              <p class="step-desc">UpForge uses these to calibrate the aim trainer to match your exact in-game feel.</p>
            </div>

            <!-- Game selector -->
            <div class="mouse-section">
              <p class="mouse-section-label">Game</p>
              <div class="game-btns">
                <button v-for="g in GAMES" :key="g.value" class="game-btn" :class="{ 'game-btn--active': trainerMouse.game === g.value }" @click="trainerMouse.game = (g.value as typeof trainerMouse.game)">
                  {{ g.label }}
                </button>
              </div>
            </div>

            <!-- DPI -->
            <div class="mouse-section">
              <div class="mouse-row-header">
                <p class="mouse-section-label">Mouse DPI</p>
                <input v-model.number="trainerMouse.dpi" type="number" min="100" max="32000" step="100" class="mouse-num-input" />
              </div>
              <div class="dpi-presets">
                <button v-for="d in DPI_PRESETS" :key="d" class="dpi-preset-btn" :class="{ 'dpi-preset-btn--active': trainerMouse.dpi === d }" @click="trainerMouse.dpi = d">{{ d }}</button>
              </div>
            </div>

            <!-- Sensitivity -->
            <div class="mouse-section">
              <div class="mouse-row-header">
                <p class="mouse-section-label">In-game Sensitivity</p>
                <input v-model.number="trainerMouse.sensitivity" type="number" min="0.01" max="20" step="0.01" class="mouse-num-input" />
              </div>
              <input v-model.number="trainerMouse.sensitivity" type="range" min="0.01" max="5" step="0.01" class="sens-slider" />
            </div>

            <!-- eDPI readout -->
            <div class="edpi-row">
              <div class="edpi-block">
                <span class="edpi-label">eDPI</span>
                <span class="edpi-value">{{ Math.round(trainerMouse.dpi * trainerMouse.sensitivity) }}</span>
                <span class="edpi-tag" :class="edpiTagClass">{{ edpiLabel }}</span>
              </div>
              <p class="edpi-note">eDPI = DPI × Sensitivity — the universal sensitivity standard</p>
            </div>

            <!-- Polling rate -->
            <div class="mouse-section">
              <p class="mouse-section-label">Polling Rate</p>
              <div class="polling-btns">
                <button v-for="r in POLLING_RATES" :key="r" class="dpi-preset-btn" :class="{ 'dpi-preset-btn--active': trainerMouse.pollingRate === r }" @click="trainerMouse.pollingRate = r">{{ r }}Hz</button>
              </div>
            </div>

            <button class="btn-primary" @click="saveMouseAndNext">
              Continue
              <svg class="btn-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
            <button class="back-btn" @click="step = 2">← Back</button>
          </div>
        </Transition>

        <!-- ── Step 4: Keybinds ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 4" key="4" class="step-content">
            <div class="step-header">
              <p class="step-eyebrow">Step 4 of 5 — Hotkeys</p>
              <h2 class="step-title">Your control shortcuts.</h2>
              <p class="step-desc">These global shortcuts work during any game. Customise or keep the defaults — you can always change them in Settings.</p>
            </div>

            <div class="keybind-list">
              <div v-for="kb in KEYBIND_DEFS" :key="kb.action" class="keybind-row">
                <div class="keybind-icon-wrap" :style="{ background: kb.iconBg }">
                  <svg class="keybind-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" :d="kb.icon" />
                  </svg>
                </div>
                <div class="keybind-info">
                  <p class="keybind-name">{{ kb.label }}</p>
                  <p class="keybind-desc">{{ kb.desc }}</p>
                </div>
                <button
                  class="keybind-key-btn"
                  :class="{ 'keybind-key-btn--listening': rebinding === kb.action }"
                  @click="startRebind(kb.action)"
                >
                  <span v-if="rebinding === kb.action" class="key-listen-text">Press a key…</span>
                  <kbd v-else class="key-badge">{{ hotkeys[kb.action] || kb.default }}</kbd>
                </button>
              </div>
            </div>

            <p v-if="rebinding" class="rebind-hint">Press any key to bind · <button class="link-btn" @click="cancelRebind">Cancel</button></p>

            <button class="btn-primary" :disabled="!!rebinding" @click="saveHotkeysAndNext">
              Continue
              <svg class="btn-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
            <button class="back-btn" @click="step = 3">← Back</button>
          </div>
        </Transition>

        <!-- ── Step 5: Folder ── -->
        <Transition name="step" mode="out-in">
          <div v-if="step === 5" key="5" class="step-content">
            <div class="step-header">
              <p class="step-eyebrow">Step 5 of 5 — Almost there</p>
              <h2 class="step-title">Where to save recordings?</h2>
              <p class="step-desc">Recordings are stored temporarily — automatically deleted once your AI analysis is ready (usually within 10 minutes).</p>
            </div>

            <div class="folder-box" @click="choosePath">
              <div class="folder-icon-wrap">
                <svg class="folder-icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
              </div>
              <div class="folder-info">
                <p class="folder-label">Save location</p>
                <p class="folder-path">{{ savePath || 'Default location' }}</p>
              </div>
              <span class="folder-change-btn">Change →</span>
            </div>

            <div class="info-row">
              <div class="info-dot" />
              <p class="info-text">Recordings auto-delete after analysis — your disk stays clean</p>
            </div>
            <div class="info-row">
              <div class="info-dot" />
              <p class="info-text">You need ~5 GB free per hour of gameplay</p>
            </div>

            <button class="btn-primary btn-start" @click="finishOnboarding">
              <svg class="btn-record-dot" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg>
              Start Recording
            </button>
            <button class="back-btn" @click="step = 4">← Back</button>
          </div>
        </Transition>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const TOTAL_STEPS = 5
const stepLabels = ['Features', 'Sign in', 'Mouse', 'Hotkeys', 'Storage']
const step = ref(1)
const email = ref('')
const password = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const showPassword = ref(false)
const savePath = ref('')

// Mouse setup state
const trainerMouse = ref({
  dpi: 800,
  game: 'valorant' as 'valorant' | 'cs2' | 'apex' | 'overwatch2' | 'custom',
  sensitivity: 0.5,
  fov: 103,
  rawInput: true,
  pollingRate: 1000 as 125 | 250 | 500 | 1000 | 2000 | 4000,
})
const DPI_PRESETS = [400, 800, 1600, 3200]
const POLLING_RATES = [125, 250, 500, 1000, 2000, 4000] as const
const GAMES = [
  { value: 'valorant', label: 'Valorant' },
  { value: 'cs2', label: 'CS2' },
  { value: 'apex', label: 'Apex' },
  { value: 'overwatch2', label: 'OW2' },
  { value: 'custom', label: 'Other' },
]
const edpiLabel = computed(() => {
  const e = trainerMouse.value.dpi * trainerMouse.value.sensitivity
  if (e < 400) return 'Very Low'
  if (e < 700) return 'Low'
  if (e < 1200) return 'Medium'
  if (e < 2000) return 'High'
  return 'Very High'
})
const edpiTagClass = computed(() => {
  const e = trainerMouse.value.dpi * trainerMouse.value.sensitivity
  if (e < 400) return 'edpi-tag--low'
  if (e < 700) return 'edpi-tag--low'
  if (e < 1200) return 'edpi-tag--mid'
  if (e < 2000) return 'edpi-tag--high'
  return 'edpi-tag--high'
})

// Keybinds state
type HotkeyAction = 'save-clip' | 'toggle-overlay' | 'take-screenshot'
const hotkeys = ref<Record<HotkeyAction, string>>({
  'save-clip': 'F9',
  'toggle-overlay': 'F10',
  'take-screenshot': 'F8',
})
const rebinding = ref<HotkeyAction | null>(null)
const KEYBIND_DEFS: { action: HotkeyAction; label: string; desc: string; default: string; icon: string; iconBg: string }[] = [
  {
    action: 'save-clip',
    label: 'Save Clip',
    desc: 'Save the last 30 seconds as a highlight',
    default: 'F9',
    icon: 'M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 8h11a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z',
    iconBg: 'rgba(255,70,85,0.12)',
  },
  {
    action: 'toggle-overlay',
    label: 'Toggle Overlay',
    desc: 'Show or hide the in-game stats overlay',
    default: 'F10',
    icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7',
    iconBg: 'rgba(168,85,247,0.12)',
  },
  {
    action: 'take-screenshot',
    label: 'Screenshot',
    desc: 'Capture and save the current frame',
    default: 'F8',
    icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
    iconBg: 'rgba(251,191,36,0.12)',
  },
]

let keyListener: ((e: KeyboardEvent) => void) | null = null

const features = [
  {
    icon: 'M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 8h11a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z',
    iconBg: 'rgba(239,68,68,0.12)',
    iconColor: '#ff4655',
    glow: 'rgba(239,68,68,0.15)',
    title: 'Automatic match recording',
    text: 'Detects your game and starts recording the moment your match begins',
    shortcut: null
  },
  {
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    iconBg: 'rgba(168,85,247,0.12)',
    iconColor: '#a855f7',
    glow: 'rgba(168,85,247,0.15)',
    title: 'AI coaching after every game',
    text: 'Top 3 improvements delivered to your tray within minutes of your final bullet',
    shortcut: null
  },
  {
    icon: 'M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
    iconBg: 'rgba(249,115,22,0.12)',
    iconColor: '#f97316',
    glow: 'rgba(249,115,22,0.15)',
    title: 'Highlight clip capture',
    text: 'Kill clips & aces saved automatically',
    shortcut: 'F9'
  },
  {
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    iconBg: 'rgba(20,184,166,0.12)',
    iconColor: '#14b8a6',
    glow: 'rgba(20,184,166,0.12)',
    title: 'Progress tracking',
    text: 'RR history, score trends and session summaries over time',
    shortcut: null
  }
]

onMounted(async () => {
  try {
    const settings = await window.api.settings.get() as { savePath: string; trainerMouse?: typeof trainerMouse.value }
    savePath.value = settings.savePath
    if (settings.trainerMouse) Object.assign(trainerMouse.value, settings.trainerMouse)
  } catch { /* defaults fine */ }
  try {
    const bindings = await window.api.clips.getHotkeys() as Partial<Record<HotkeyAction, string>>
    if (bindings) Object.assign(hotkeys.value, bindings)
  } catch { /* defaults fine */ }
})

onUnmounted(() => {
  cancelRebind()
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

async function saveMouseAndNext() {
  try {
    await window.api.settings.save({ trainerMouse: trainerMouse.value })
  } catch { /* non-critical */ }
  step.value = 4
}

function startRebind(action: HotkeyAction) {
  rebinding.value = action
  if (keyListener) window.removeEventListener('keydown', keyListener)
  keyListener = (e: KeyboardEvent) => {
    e.preventDefault()
    if (e.key === 'Escape') { cancelRebind(); return }
    const acc = keyEventToAccelerator(e)
    if (!acc) return
    hotkeys.value[action] = acc
    window.api.clips.setHotkey(action, acc).catch(() => {})
    cancelRebind()
  }
  window.addEventListener('keydown', keyListener, { once: true })
}

function cancelRebind() {
  rebinding.value = null
  if (keyListener) { window.removeEventListener('keydown', keyListener); keyListener = null }
}

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const skip = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock']
  if (skip.includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key
  parts.push(key)
  return parts.join('+')
}

async function saveHotkeysAndNext() {
  step.value = 5
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
/* ── Root ── */
.welcome-root {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #080e1a;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ═══════════════ LEFT PANEL ═══════════════ */
.left-panel {
  position: relative;
  flex: 1;
  background: #0a0f1c;
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: drag;
}

.lp-hero-img {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: center center;
  opacity: 0.55;
  z-index: 0;
  pointer-events: none;
}

.lp-overlay-top {
  position: absolute; top: 0; left: 0; right: 0; height: 220px;
  background: linear-gradient(180deg, #0a0f1c 0%, transparent 100%);
  z-index: 1; pointer-events: none;
}
.lp-overlay-bottom {
  position: absolute; bottom: 0; left: 0; right: 0; height: 180px;
  background: linear-gradient(0deg, #0a0f1c 0%, transparent 100%);
  z-index: 1; pointer-events: none;
}
.lp-overlay-right {
  position: absolute; top: 0; right: 0; bottom: 0; width: 80px;
  background: linear-gradient(270deg, #0a0f1c 0%, transparent 100%);
  z-index: 1; pointer-events: none;
}

.lp-top-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, #ff4655, #f97316, transparent);
  opacity: 0.8; z-index: 3;
}

.lp-orb {
  position: absolute; border-radius: 50%;
  pointer-events: none; filter: blur(60px);
}
.lp-orb-1 {
  width: 360px; height: 360px;
  background: radial-gradient(circle, rgba(239,68,68,0.2) 0%, transparent 65%);
  top: -120px; left: -80px;
  animation: lp-drift1 14s ease-in-out infinite alternate;
}
.lp-orb-2 {
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 65%);
  bottom: -60px; right: -40px;
  animation: lp-drift2 18s ease-in-out infinite alternate;
}
@keyframes lp-drift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(30px,25px) scale(1.08); } }
@keyframes lp-drift2 { from { transform: translate(0,0); } to { transform: translate(-20px,-15px); } }

.lp-content {
  position: relative; z-index: 2;
  display: flex; flex-direction: column;
  justify-content: space-between;
  flex: 1; padding: 22px 18px 20px;
  gap: 0;
}

/* Brand lockup */
.lp-brand {
  display: flex; align-items: center; gap: 10px;
}
.lp-logo-ring {
  width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(249,115,22,0.1));
  border: 1px solid rgba(239,68,68,0.2);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(239,68,68,0.1);
  flex-shrink: 0;
}
.lp-logo-img {
  height: 22px; width: auto;
  filter: drop-shadow(0 0 8px rgba(239,68,68,0.4));
}
.lp-wordmark { font-size: 14px; font-weight: 800; letter-spacing: -0.01em; line-height: 1; }
.lp-up    { color: #fff; }
.lp-forge { color: #ff4655; }
.lp-tagline { font-size: 9px; color: rgba(107,114,128,0.8); margin-top: 2px; letter-spacing: 0.04em; }

/* Headline */
.lp-headline-block { }
.lp-headline {
  font-size: 18px; font-weight: 700; line-height: 1.2;
  letter-spacing: -0.02em; color: #f9fafb; margin: 0 0 5px;
}
.lp-headline em {
  font-style: normal;
  background: linear-gradient(135deg, #ff4655 0%, #f97316 60%, #fbbf24 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.lp-sub { font-size: 10.5px; color: rgba(107,114,128,0.8); line-height: 1.5; margin: 0; }

.lp-spacer { flex: 1; }

/* Game cards */
.lp-section-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: rgba(75,85,99,0.8);
  margin-bottom: 6px;
}
.lp-game-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.lp-game-card {
  position: relative; height: 64px; border-radius: 9px;
  overflow: hidden; cursor: default;
  border: 1px solid rgba(255,255,255,0.07);
  transition: transform 0.2s ease, border-color 0.2s;
}
/* Valorant spans full width */
.lp-game-valorant { grid-column: 1 / -1; }
.lp-game-card:hover { transform: translateY(-2px); }
.lp-game-valorant { border-color: rgba(239,68,68,0.25); }
.lp-game-deadlock  { border-color: rgba(20,184,166,0.2); }
.lp-game-cs2       { border-color: rgba(249,115,22,0.2); }
.lp-game-img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: center;
}
.lp-game-gradient {
  position: absolute; inset: 0;
  background: linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 65%);
}
.lp-game-body {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 7px 9px;
  display: flex; align-items: center; justify-content: space-between;
}
.lp-game-name { font-size: 11px; font-weight: 700; color: #fff; }
.lp-badge {
  font-size: 8px; font-weight: 700; letter-spacing: 0.06em;
  padding: 2px 6px; border-radius: 99px;
  display: flex; align-items: center; gap: 3px;
}
.lp-badge-live {
  background: rgba(16,185,129,0.2); color: #10b981;
  border: 1px solid rgba(16,185,129,0.3);
}
.lp-badge-waitlist {
  background: rgba(249,115,22,0.15); color: #fb923c;
  border: 1px solid rgba(249,115,22,0.25);
}
.lp-badge-dot {
  width: 4px; height: 4px; border-radius: 50%;
  background: #10b981;
  animation: pulse-dot 1.8s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
}

/* ═══════════════ RIGHT PANEL ═══════════════ */
.right-panel {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 62px 32px 18px;
  position: relative; overflow: hidden;
  -webkit-app-region: no-drag;
}

/* Subtle grid */
.rp-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
}

/* Ambient glow that shifts per step */
.rp-glow {
  position: absolute; border-radius: 50%; filter: blur(120px);
  pointer-events: none; transition: all 1.2s cubic-bezier(0.16,1,0.3,1);
}
.rp-glow--step1 { width: 400px; height: 400px; top: -80px; right: -60px; background: radial-gradient(circle, rgba(239,68,68,0.09) 0%, transparent 65%); }
.rp-glow--step2 { width: 400px; height: 400px; top: 30%; right: -80px; background: radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 65%); }
.rp-glow--step3 { width: 360px; height: 360px; top: 20%; left: -40px; background: radial-gradient(circle, rgba(255,70,85,0.08) 0%, transparent 65%); }
.rp-glow--step4 { width: 380px; height: 380px; bottom: 0; right: -60px; background: radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 65%); }
.rp-glow--step5 { width: 400px; height: 400px; bottom: -60px; left: -60px; background: radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 65%); }

/* ── Step indicator ── */
.step-indicator {
  position: absolute; top: 16px; left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 0;
  z-index: 2;
}
.step-labels {
  position: absolute; top: 42px; left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 0;
  z-index: 2;
}
.step-label {
  font-size: 8px; font-weight: 600; color: rgba(75,85,99,0.5);
  text-transform: uppercase; letter-spacing: 0.06em;
  width: 58px; text-align: center;
  transition: color 0.3s ease;
}
.step-label--active { color: rgba(255,70,85,0.8); }
.step-track {
  position: absolute; top: 50%; left: 18px; right: 18px;
  height: 1px; background: rgba(255,255,255,0.07);
  transform: translateY(-50%); z-index: 0;
}
.step-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff4655, #f97316);
  transition: width 0.5s cubic-bezier(0.16,1,0.3,1);
}
.step-pip {
  position: relative; z-index: 1;
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700;
  background: #0d1525; border: 1px solid rgba(255,255,255,0.1);
  color: rgba(107,114,128,0.7);
  transition: all 0.35s ease;
  margin: 0 24px;
}
.step-pip--active {
  background: linear-gradient(135deg, #ff4655, #f97316);
  border-color: transparent; color: #fff;
  box-shadow: 0 0 14px rgba(239,68,68,0.4);
}
.step-pip--done {
  background: rgba(239,68,68,0.15);
  border-color: rgba(239,68,68,0.3); color: #ff4655;
}
.pip-check { font-size: 10px; }
.pip-num { font-size: 9px; }

/* ── Step outer ── */
.step-outer { width: 100%; max-width: 360px; position: relative; z-index: 1; }
.step-content { display: flex; flex-direction: column; gap: 10px; }

.step-eyebrow {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: #ff4655; margin: 0;
}
.step-header { display: flex; flex-direction: column; gap: 2px; }
.step-title { font-size: 18px; font-weight: 700; color: #f9fafb; margin: 0; letter-spacing: -0.02em; }
.step-desc { font-size: 11px; color: #4b5563; margin: 0; line-height: 1.4; }
.text-accent { color: #ff4655; }

/* ── Feature cards ── */
.features-list { display: flex; flex-direction: column; gap: 5px; }
.feature-card {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 9px;
  animation: card-enter 0.4s cubic-bezier(0.16,1,0.3,1) both;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}
.feature-card:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.09);
  transform: translateX(2px);
}
@keyframes card-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.feature-num {
  font-size: 10px; font-weight: 700; color: rgba(75,85,99,0.5);
  letter-spacing: 0.04em; min-width: 20px; text-align: center;
}
.feature-icon-wrap {
  width: 28px; height: 28px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.feature-icon-svg { width: 13px; height: 13px; }
.feature-text-block { flex: 1; min-width: 0; }
.feature-title { font-size: 12px; font-weight: 600; color: #e5e7eb; margin: 0 0 1px; }
.feature-text  { font-size: 11px; color: #4b5563; margin: 0; line-height: 1.35; }
.feature-shortcut {
  font-size: 10px; font-weight: 700;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: rgba(156,163,175,0.7);
  padding: 2px 7px; border-radius: 5px;
  flex-shrink: 0; font-family: monospace;
}

/* ── Primary button ── */
.btn-primary {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 9px 20px;
  background: linear-gradient(135deg, #ff4655, #f97316);
  color: #fff; font-size: 13px; font-weight: 700;
  border: none; border-radius: 9px; cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
  box-shadow: 0 4px 20px rgba(239,68,68,0.25);
  letter-spacing: 0.01em;
  -webkit-app-region: no-drag;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-arrow { width: 14px; height: 14px; }
.btn-spin  { width: 14px; height: 14px; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.btn-start { margin-top: 4px; }
.btn-record-dot {
  width: 8px; height: 8px; color: rgba(255,255,255,0.8);
  animation: pulse-dot 1.4s ease-in-out infinite;
}

/* ── Sign in form ── */
.form-fields { display: flex; flex-direction: column; gap: 10px; }
.field-group { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 0.03em; }
.field-wrap { position: relative; display: flex; align-items: center; }
.field-icon {
  position: absolute; left: 10px;
  width: 14px; height: 14px; color: #374151; pointer-events: none;
}
.field-input {
  width: 100%; padding: 9px 10px 9px 32px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #f9fafb;
  font-size: 12px; outline: none;
  transition: border-color 0.15s, background 0.15s;
  -webkit-app-region: no-drag;
}
.field-input::placeholder { color: #374151; }
.field-input:focus {
  border-color: rgba(239,68,68,0.4);
  background: rgba(255,255,255,0.06);
}
.field-eye {
  position: absolute; right: 8px;
  background: none; border: none; cursor: pointer;
  color: #374151; padding: 4px;
  transition: color 0.15s;
  -webkit-app-region: no-drag;
}
.field-eye:hover { color: #9ca3af; }
.eye-icon { width: 13px; height: 13px; }

.error-box {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 9px 12px;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 8px;
}
.error-icon { width: 12px; height: 12px; color: #f87171; flex-shrink: 0; margin-top: 1px; }
.error-box p { font-size: 11px; color: #f87171; margin: 0; line-height: 1.4; }

.form-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: -4px;
}
.form-footer-text { font-size: 11px; color: #4b5563; }
.link-btn {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: 11px; color: #ff4655; transition: color 0.15s;
  -webkit-app-region: no-drag;
}
.link-btn:hover { color: #fca5a5; }
.back-btn {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: 11px; color: #374151; transition: color 0.15s;
  text-align: left; -webkit-app-region: no-drag;
}
.back-btn:hover { color: #6b7280; }

/* ── Folder step ── */
.folder-box {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  -webkit-app-region: no-drag;
}
.folder-box:hover {
  background: rgba(255,255,255,0.045);
  border-color: rgba(255,255,255,0.12);
}
.folder-icon-wrap {
  width: 36px; height: 36px; border-radius: 8px;
  background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.folder-icon-svg { width: 16px; height: 16px; color: #22d3ee; }
.folder-info { flex: 1; min-width: 0; }
.folder-label { font-size: 10px; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 2px; }
.folder-path { font-size: 12px; color: #9ca3af; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.folder-change-btn { font-size: 11px; color: #4b5563; flex-shrink: 0; }

.info-row { display: flex; align-items: flex-start; gap: 8px; }
.info-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #10b981; margin-top: 4px; flex-shrink: 0;
}
.info-text { font-size: 11px; color: rgba(107,114,128,0.7); line-height: 1.4; margin: 0; }

/* ── Mouse setup step ── */
.mouse-section { display: flex; flex-direction: column; gap: 6px; }
.mouse-section-label { font-size: 10px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; }
.mouse-row-header { display: flex; align-items: center; justify-content: space-between; }
.mouse-num-input {
  width: 72px; padding: 4px 8px; text-align: right;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px; color: #f9fafb; font-size: 12px; font-weight: 600;
  outline: none; -webkit-app-region: no-drag;
  transition: border-color 0.15s;
}
.mouse-num-input:focus { border-color: rgba(255,70,85,0.4); }
.game-btns { display: flex; gap: 5px; flex-wrap: wrap; }
.game-btn {
  padding: 5px 11px; border-radius: 7px; font-size: 11px; font-weight: 600;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
  color: #4b5563; cursor: pointer; transition: all 0.15s;
  -webkit-app-region: no-drag;
}
.game-btn:hover { background: rgba(255,255,255,0.06); color: #9ca3af; }
.game-btn--active { background: rgba(255,70,85,0.1); border-color: rgba(255,70,85,0.3); color: #ff4655; }
.dpi-presets, .polling-btns { display: flex; gap: 5px; }
.dpi-preset-btn {
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: monospace;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
  color: #4b5563; cursor: pointer; transition: all 0.15s;
  -webkit-app-region: no-drag;
}
.dpi-preset-btn:hover { background: rgba(255,255,255,0.06); color: #9ca3af; }
.dpi-preset-btn--active { background: rgba(255,70,85,0.1); border-color: rgba(255,70,85,0.3); color: #ff4655; }
.sens-slider {
  width: 100%; height: 3px; cursor: pointer; accent-color: #ff4655;
  -webkit-app-region: no-drag;
}
.edpi-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 9px;
}
.edpi-block { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.edpi-label { font-size: 9px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.08em; }
.edpi-value { font-size: 20px; font-weight: 800; color: #f9fafb; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
.edpi-tag {
  font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 20px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.edpi-tag--low  { background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.2); color: #60a5fa; }
.edpi-tag--mid  { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.2); color: #34d399; }
.edpi-tag--high { background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.2);  color: #f87171; }
.edpi-note { font-size: 10px; color: #374151; line-height: 1.4; margin: 0; }

/* ── Transitions ── */
.step-enter-active { transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1); }
.step-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.step-enter-from   { opacity: 0; transform: translateX(20px); }
.step-leave-to     { opacity: 0; transform: translateX(-20px); }

.error-fade-enter-active, .error-fade-leave-active { transition: opacity 0.25s ease; }
.error-fade-enter-from, .error-fade-leave-to { opacity: 0; }

</style>
