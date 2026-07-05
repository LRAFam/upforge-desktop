<template>
  <div class="root">
    <img src="../assets/upforge-bg.webp" class="bg" alt="" />
    <div class="overlay" />
    <div class="vignette" />

    <div class="shell" :class="{ visible: mounted }">
      <aside class="story">
        <div class="accent-line" />
        <div class="story-inner">
          <div class="story-top">
            <div class="brand-mark">
              <div class="logo-halo" />
              <img src="../assets/upforge-icon.png" class="logo" alt="UpForge" />
            </div>
            <p class="eyebrow">Stop Guessing. Start Climbing.</p>
            <h2 class="story-title">
              AI coaching that <span class="story-accent">actually works</span>
            </h2>

            <ul class="features">
              <li class="feature">
                <span class="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                </span>
                <span class="feature-copy">
                  <strong>Auto-record &amp; coach</strong>
                  <span>Every match, zero setup</span>
                </span>
              </li>
              <li class="feature">
                <span class="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </span>
                <span class="feature-copy">
                  <strong>VOD &amp; clip analysis</strong>
                  <span>YouTube, Medal, or desktop capture</span>
                </span>
              </li>
              <li class="feature">
                <span class="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                </span>
                <span class="feature-copy">
                  <strong>Rank-ready insights</strong>
                  <span>Aim, utility, and game sense fixes</span>
                </span>
              </li>
            </ul>
          </div>

          <div class="story-bottom">
            <p class="pricing-line">
              3 free reports · no card needed · Plus <strong>5/mo</strong> · Pro <strong>15/mo</strong>
            </p>
            <div class="game-chips">
              <div v-for="g in games" :key="g.name" class="game-chip">
                <img :src="g.img" class="game-chip-img" :style="g.position ? { objectPosition: g.position } : undefined" :alt="g.name" />
                <span>{{ g.name }}</span>
              </div>
            </div>
            <div class="foot-live">
              <span class="pulse-dot" />
              <span>No card to start</span>
            </div>
          </div>
        </div>
      </aside>

      <main class="form-panel">
        <div class="form-wrap">
          <header class="form-head">
            <h1 class="form-title">Welcome <span class="title-accent">back</span></h1>
            <p class="form-sub">Sign in to sync coaching, clips, and aim training</p>
          </header>

          <form class="form" novalidate @submit.prevent="handleLogin">
            <div class="field">
              <label for="login-email">Email</label>
              <div class="iw">
                <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <input id="login-email" v-model="email" type="email" placeholder="your@email.com" autocomplete="email" required />
              </div>
            </div>

            <div class="field">
              <div class="field-row">
                <label for="login-password">Password</label>
                <button type="button" class="link-forgot" @click="openForgot">Forgot?</button>
              </div>
              <div class="iw">
                <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input id="login-password" v-model="password" :type="showPw ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" required />
                <button type="button" class="eye" :aria-label="showPw ? 'Hide password' : 'Show password'" tabindex="-1" @click="showPw = !showPw">
                  <svg v-if="!showPw" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
            </div>

            <Transition name="err">
              <div v-if="error" class="error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ error }}
              </div>
            </Transition>

            <button type="submit" class="btn-primary" :disabled="loading">
              {{ loading ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <div class="signup-row">
            <span>New to UpForge?</span>
            <button type="button" class="link-accent" @click="openSignup">Create account</button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import valorantImg from '../assets/games/valorant-card-bg.png'
import deadlockImg from '../assets/games/deadlock-card-bg.png'
import cs2Img from '../assets/games/cs2-card-bg.png'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showPw = ref(false)
const mounted = ref(false)

const games = [
  { name: 'Valorant', img: valorantImg, position: 'center 15%' },
  { name: 'Deadlock', img: deadlockImg, position: 'center 25%' },
  { name: 'CS2', img: cs2Img },
]

onMounted(() => requestAnimationFrame(() => { mounted.value = true }))

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.auth.login(email.value, password.value)
    if (result.ok) {
      const s = await window.api.app.getStatus()
      router.push(s.firstRun ? '/welcome' : '/dashboard')
    } else {
      error.value = (result as { error?: string }).error || 'Invalid email or password.'
    }
  } catch (e) {
    error.value = `Error: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function openSignup() { window.open('https://upforge.gg/register', '_blank') }
function openForgot() { window.open('https://upforge.gg/forgot-password', '_blank') }
</script>

<style scoped>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.root {
  --safe-top: 32px;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #fff;
  overflow: hidden;
  background: #080d16;
  -webkit-app-region: drag;
}

.story,
.form-panel,
.form,
.iw,
.btn-primary,
.game-chip,
.link-forgot,
.link-accent,
.eye {
  -webkit-app-region: no-drag;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: 0;
  filter: saturate(0.9) brightness(0.45);
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(105deg, rgba(8,13,22,.92) 0%, rgba(8,13,22,.78) 42%, rgba(12,18,32,.55) 100%);
  pointer-events: none;
}

.vignette {
  position: absolute;
  inset: 0;
  z-index: 1;
  box-shadow: inset 0 0 80px rgba(0,0,0,.3);
  pointer-events: none;
}

.shell {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  overflow: hidden;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity .45s cubic-bezier(.16,1,.3,1), transform .45s cubic-bezier(.16,1,.3,1);
}

.shell.visible { opacity: 1; transform: none; }

/* ── Left panel ── */
.story {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(10,15,26,.58);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-right: 1px solid rgba(255,255,255,.06);
}

.accent-line {
  height: 1px;
  flex-shrink: 0;
  background: linear-gradient(90deg, rgba(239,68,68,.65), rgba(239,68,68,.12), transparent);
}

.story-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  padding: calc(var(--safe-top) + 4px) 22px 18px;
  overflow: hidden;
}

.brand-mark {
  position: relative;
  display: inline-flex;
  margin-bottom: 14px;
}

.logo-halo {
  position: absolute;
  inset: 0;
  background: rgba(220,38,38,.22);
  filter: blur(18px);
  border-radius: 999px;
  transform: scale(1.5);
}

.logo {
  position: relative;
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(220,38,38,.4));
}

.eyebrow {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .13em;
  text-transform: uppercase;
  color: #ef4444;
  margin-bottom: 6px;
}

.story-title {
  font-size: 19px;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: -.02em;
  margin-bottom: 14px;
}

.story-accent { color: #f87171; }

.features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  background: rgba(255,255,255,.02);
  border: 1px solid rgba(255,255,255,.05);
}

.feature-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(239,68,68,.1);
  border: 1px solid rgba(239,68,68,.14);
  color: #f87171;
}

.feature-icon svg { width: 14px; height: 14px; }

.feature-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.feature-copy strong {
  font-size: 11px;
  font-weight: 800;
  color: #fff;
}

.feature-copy span {
  font-size: 10px;
  line-height: 1.35;
  color: rgba(156,163,175,.8);
}

.story-bottom {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,.06);
}

.pricing-line {
  font-size: 10px;
  line-height: 1.45;
  color: rgba(107,114,128,.95);
}

.pricing-line strong { color: #fff; font-weight: 700; }

.game-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.game-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 3px;
  border-radius: 8px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.06);
  font-size: 10px;
  font-weight: 700;
  color: rgba(209,213,219,.85);
}

.game-chip-img {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  object-fit: cover;
}

.foot-live {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: rgba(107,114,128,.9);
}

.pulse-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239,68,68,.5);
  animation: pulse 2s infinite;
}

/* ── Right panel ── */
.form-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--safe-top) 28px 20px;
  overflow: hidden;
}

.form-wrap {
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}

.form-head { margin-bottom: 18px; }

.form-title {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -.03em;
  line-height: 1.15;
  margin-bottom: 4px;
}

.title-accent {
  background: linear-gradient(90deg, #f87171, #dc2626);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.form-sub {
  font-size: 13px;
  color: rgba(107,114,128,.95);
}

.field { margin-bottom: 12px; text-align: left; }

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.field label {
  display: block;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .11em;
  text-transform: uppercase;
  color: rgba(75,85,99,.95);
  margin-bottom: 6px;
}

.field-row label { margin-bottom: 0; }

.iw { position: relative; }

.fi {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 15px;
  height: 15px;
  color: rgba(55,65,81,.95);
  pointer-events: none;
}

.iw input {
  width: 100%;
  padding: 10px 36px;
  background: #0a0f1a;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 11px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color .2s;
}

.iw input::placeholder { color: rgba(55,65,81,.95); }
.iw input:focus { border-color: rgba(239,68,68,.4); }

.eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: rgba(55,65,81,.95);
  display: flex;
}

.eye svg { width: 15px; height: 15px; }

.link-forgot {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  font-weight: 700;
  color: #ef4444;
  cursor: pointer;
  font-family: inherit;
}

.error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background: rgba(239,68,68,.1);
  border: 1px solid rgba(239,68,68,.2);
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.4;
  color: #f87171;
}

.error svg { width: 14px; height: 14px; flex-shrink: 0; }

.err-enter-active, .err-leave-active { transition: opacity .2s; }
.err-enter-from, .err-leave-to { opacity: 0; }

.btn-primary {
  width: 100%;
  padding: 11px 16px;
  margin-top: 2px;
  background: #dc2626;
  border: none;
  border-radius: 11px;
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
  font-family: inherit;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.btn-primary:hover:not(:disabled) { background: #ef4444; }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; }

.signup-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 12px;
  color: rgba(107,114,128,.9);
}

.link-accent {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  color: #f87171;
  cursor: pointer;
  font-family: inherit;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.45); }
  70% { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
}
</style>
