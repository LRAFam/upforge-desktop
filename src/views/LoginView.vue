<template>
  <div class="login-root">
    <!-- Left brand panel — hero image background -->
    <div class="brand-panel">
      <!-- Hero image -->
      <img src="../assets/hero-agents.webp" alt="" class="hero-img" />
      <!-- Gradient overlays -->
      <div class="hero-overlay-top" />
      <div class="hero-overlay-bottom" />
      <div class="hero-overlay-right" />
      <!-- Grid texture -->
      <div class="grid-bg" />

      <div class="brand-content">
        <!-- Logo lockup -->
        <div class="brand-header">
          <div class="brand-logo-ring">
            <img src="../assets/upforge-logo.png" alt="UpForge" class="brand-logo-img" />
          </div>
          <div>
            <div class="brand-wordmark">
              <span class="brand-up">UP</span><span class="brand-forge">FORGE</span>
            </div>
            <p class="brand-sub">AI-Powered Game Coaching</p>
          </div>
        </div>

        <!-- Spacer pushes game cards down -->
        <div class="brand-spacer" />

        <!-- Game cards with real imagery -->
        <div class="section-label">Supported Games</div>
        <div class="game-cards">
          <div class="game-card game-valorant">
            <img src="../assets/games/valorant.jpg" alt="Valorant" class="game-img" />
            <div class="game-gradient" />
            <div class="game-card-body">
              <span class="game-name">Valorant</span>
              <span class="game-badge game-badge-live">
                <span class="badge-dot badge-dot-live" />Live
              </span>
            </div>
          </div>

          <div class="game-card game-deadlock">
            <img src="../assets/games/deadlock.jpg" alt="Deadlock" class="game-img" />
            <div class="game-gradient" />
            <div class="game-card-body">
              <span class="game-name">Deadlock</span>
              <span class="game-badge game-badge-soon">
                <span class="badge-dot badge-dot-soon" />Coming Soon
              </span>
            </div>
          </div>
        </div>

        <!-- Shortcuts -->
        <div class="section-label" style="margin-top:12px">Shortcuts</div>
        <div class="shortcuts">
          <div v-for="s in shortcuts" :key="s.key" class="shortcut">
            <kbd class="key">{{ s.key }}</kbd>
            <span class="shortcut-label">{{ s.label }}</span>
          </div>
        </div>
      </div>

      <div class="brand-footer">
        <span class="footer-url">upforge.gg</span>
      </div>
    </div>

    <!-- Right form panel -->
    <div class="form-panel">
      <div class="form-inner" :class="{ visible: mounted }">
        <h2 class="form-title">Welcome back</h2>
        <p class="form-subtitle">Sign in to your UpForge account</p>

        <form class="form" @submit.prevent="handleLogin">
          <div class="field">
            <label class="field-label">Email</label>
            <div class="input-wrap">
              <svg class="input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <input v-model="email" type="email" placeholder="you@example.com" autocomplete="email" required class="input" />
            </div>
          </div>

          <div class="field">
            <label class="field-label">Password</label>
            <div class="input-wrap">
              <svg class="input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" required class="input" />
              <button type="button" class="pw-toggle" @click="showPassword = !showPassword">
                <svg v-if="!showPassword" class="pw-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="pw-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <Transition name="err-fade">
            <div v-if="error" class="error-box">
              <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span>{{ error }}</span>
            </div>
          </Transition>

          <button type="submit" :disabled="loading" class="submit-btn">
            <span v-if="loading" class="btn-inner">
              <svg class="spinner" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Signing in…
            </span>
            <span v-else class="btn-inner">
              Sign In
              <svg class="btn-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </span>
          </button>
        </form>

        <div class="form-links">
          <button class="link-btn" @click="openForgotPassword">Forgot password?</button>
          <span class="link-sep">·</span>
          <button class="link-btn link-signup" @click="openSignup">Create account ↗</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
const mounted = ref(false)

const shortcuts = [
  { key: 'F8', label: 'Screenshot' },
  { key: 'F9', label: 'Save clip' },
  { key: 'F10', label: 'Toggle overlay' },
]

onMounted(() => { requestAnimationFrame(() => { mounted.value = true }) })

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.auth.login(email.value, password.value)
    if (result.ok) {
      router.push('/dashboard')
    } else {
      error.value = (result as { error?: string }).error || 'Login failed. Check your credentials.'
    }
  } catch (err) {
    error.value = `Error: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    loading.value = false
  }
}

function openSignup() { window.open('https://upforge.gg/register', '_blank') }
function openForgotPassword() { window.open('https://upforge.gg/forgot-password', '_blank') }
</script>

<style scoped>
.login-root {
  display: flex;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ── Left brand panel ── */
.brand-panel {
  position: relative;
  width: 50%;
  flex-shrink: 0;
  background: #080c14;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Hero image — full bleed, positioned top-right like website */
.hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0.45;
}

/* Gradient overlays matching homepage */
.hero-overlay-top {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(8,12,20,0.85) 0%, transparent 100%);
  z-index: 1;
}
.hero-overlay-bottom {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 60%;
  background: linear-gradient(0deg, rgba(8,12,20,0.95) 0%, rgba(8,12,20,0.7) 50%, transparent 100%);
  z-index: 1;
}
.hero-overlay-right {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 40%;
  background: linear-gradient(270deg, rgba(8,12,20,0.9) 0%, transparent 100%);
  z-index: 1;
}

/* Subtle grid */
.grid-bg {
  position: absolute;
  inset: 0;
  z-index: 2;
  opacity: 0.12;
  background-image:
    linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* Content sits above overlays */
.brand-content {
  position: relative;
  z-index: 3;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 22px 22px 14px;
}

/* ── Header ── */
.brand-header {
  display: flex;
  align-items: center;
  gap: 11px;
}
.brand-logo-ring {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(249,115,22,0.15));
  border: 1px solid rgba(239,68,68,0.35);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 0 18px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.08);
}
.brand-logo-img {
  height: 21px; width: auto;
  filter: drop-shadow(0 0 8px rgba(239,68,68,0.6));
}
.brand-wordmark {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  margin-bottom: 2px;
}
.brand-up    { color: #fff; }
.brand-forge { color: #ef4444; }
.brand-sub {
  font-size: 9.5px;
  color: rgba(156,163,175,0.55);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.brand-spacer { flex: 1; }

/* ── Section label ── */
.section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(107,114,128,0.7);
  margin-bottom: 8px;
}

/* ── Game cards with real images ── */
.game-cards {
  display: flex;
  gap: 8px;
  margin-bottom: 0;
}

.game-card {
  flex: 1;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  transition: border-color 0.25s, transform 0.2s;
  cursor: default;
}
.game-card:hover { transform: translateY(-1px); }

.game-valorant { border-color: rgba(239,68,68,0.25); }
.game-valorant:hover { border-color: rgba(239,68,68,0.5); }
.game-deadlock { border-color: rgba(20,184,166,0.2); }
.game-deadlock:hover { border-color: rgba(20,184,166,0.45); }

.game-img {
  width: 100%;
  height: 72px;
  object-fit: cover;
  object-position: center;
  display: block;
  transition: transform 0.3s;
}
.game-card:hover .game-img { transform: scale(1.04); }

.game-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgba(8,12,20,0.85) 0%, rgba(8,12,20,0.2) 55%, transparent 100%);
}

.game-card-body {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.game-name {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.game-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 99px;
}
.game-badge-live {
  background: rgba(16,185,129,0.15);
  border: 1px solid rgba(16,185,129,0.25);
  color: #34d399;
}
.game-badge-soon {
  background: rgba(20,184,166,0.12);
  border: 1px solid rgba(20,184,166,0.22);
  color: #2dd4bf;
}
.badge-dot { width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; }
.badge-dot-live { background: #34d399; box-shadow: 0 0 4px rgba(52,211,153,0.7); }
.badge-dot-soon { background: #2dd4bf; animation: blink 2s infinite; }
@keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.35; } }

/* ── Shortcuts ── */
.shortcuts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.shortcut {
  display: flex;
  align-items: center;
  gap: 6px;
}
.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 20px;
  padding: 0 6px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-bottom: 2px solid rgba(255,255,255,0.18);
  border-radius: 5px;
  font-size: 9px;
  font-weight: 700;
  color: rgba(209,213,219,0.9);
  font-family: 'SF Mono', 'Fira Code', monospace;
  letter-spacing: 0.02em;
}
.shortcut-label {
  font-size: 10px;
  color: rgba(107,114,128,0.75);
}

/* ── Footer ── */
.brand-footer {
  position: relative;
  z-index: 3;
  padding: 10px 22px;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.footer-url {
  font-size: 9.5px;
  color: rgba(75,85,99,0.5);
  letter-spacing: 0.04em;
}

/* ── Right form panel ── */
.form-panel {
  flex: 1;
  background: #0d1117;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 28px;
  border-left: 1px solid rgba(255,255,255,0.05);
}

.form-inner {
  width: 100%;
  max-width: 290px;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
}
.form-inner.visible { opacity: 1; transform: translateY(0); }

.form-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}
.form-subtitle {
  font-size: 12px;
  color: rgba(107,114,128,0.7);
  margin: 0 0 22px;
}

.form { display: flex; flex-direction: column; gap: 13px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label {
  font-size: 10px;
  font-weight: 700;
  color: rgba(156,163,175,0.6);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.input-wrap { position: relative; display: flex; align-items: center; }
.input-icon {
  position: absolute; left: 10px;
  width: 13px; height: 13px;
  color: rgba(107,114,128,0.5);
  pointer-events: none;
}
.input {
  width: 100%;
  padding: 9px 34px 9px 30px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  font-size: 12px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.input::placeholder { color: rgba(107,114,128,0.4); }
.input:focus {
  border-color: rgba(239,68,68,0.4);
  background: rgba(255,255,255,0.06);
  box-shadow: 0 0 0 3px rgba(239,68,68,0.07);
}

.pw-toggle {
  position: absolute; right: 10px;
  background: none; border: none; padding: 0;
  cursor: pointer; color: rgba(107,114,128,0.4);
  transition: color 0.15s; display: flex; align-items: center;
}
.pw-toggle:hover { color: rgba(156,163,175,0.7); }
.pw-icon { width: 13px; height: 13px; }

.error-box {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 11px;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 7px;
  font-size: 11px; color: #f87171;
}
.error-icon { width: 13px; height: 13px; flex-shrink: 0; }
.err-fade-enter-active, .err-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.err-fade-enter-from { opacity: 0; transform: translateY(-4px); }
.err-fade-leave-to   { opacity: 0; }

.submit-btn {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  border: none; border-radius: 8px;
  color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px rgba(239,68,68,0.22);
  font-family: inherit; margin-top: 2px;
}
.submit-btn:hover:not(:disabled) {
  opacity: 0.92; transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(239,68,68,0.32);
}
.submit-btn:active:not(:disabled) { transform: translateY(0); }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-inner { display: flex; align-items: center; justify-content: center; gap: 6px; }
.btn-arrow { width: 13px; height: 13px; }
.spinner { width: 13px; height: 13px; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.form-links {
  display: flex; align-items: center;
  justify-content: center; gap: 8px; margin-top: 14px;
}
.link-btn {
  background: none; border: none; padding: 0;
  font-size: 11px; color: rgba(107,114,128,0.6);
  cursor: pointer; transition: color 0.15s; font-family: inherit;
}
.link-btn:hover { color: rgba(156,163,175,0.9); }
.link-signup { color: rgba(239,68,68,0.6); }
.link-signup:hover { color: #f87171; }
.link-sep { font-size: 11px; color: rgba(75,85,99,0.4); }
</style>
