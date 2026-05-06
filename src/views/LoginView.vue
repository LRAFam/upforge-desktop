<template>
  <div class="login-root">
    <!-- Left brand panel -->
    <div class="brand-panel">
      <div class="brand-bg" />
      <div class="brand-orb brand-orb-1" />
      <div class="brand-orb brand-orb-2" />
      <div class="brand-lines" />

      <div class="brand-content">
        <!-- Logo -->
        <div class="brand-logo">
          <img src="../assets/upforge-logo.png" alt="UpForge" class="brand-logo-img" />
        </div>

        <div class="brand-wordmark">
          <span class="brand-up">UP</span><span class="brand-forge">FORGE</span>
        </div>
        <p class="brand-sub">AI-Powered Valorant Coaching</p>

        <!-- Feature list -->
        <ul class="feature-list">
          <li v-for="f in features" :key="f.text" class="feature-item">
            <span class="feature-dot" />
            <span>{{ f.text }}</span>
          </li>
        </ul>
      </div>

      <!-- Bottom decoration -->
      <div class="brand-footer">
        <span class="brand-footer-text">upforge.gg</span>
      </div>
    </div>

    <!-- Right form panel -->
    <div class="form-panel">
      <div class="form-inner" :class="{ visible: mounted }">
        <h2 class="form-title">Welcome back</h2>
        <p class="form-subtitle">Sign in to your UpForge account</p>

        <form class="form" @submit.prevent="handleLogin">
          <!-- Email -->
          <div class="field">
            <label class="field-label">Email</label>
            <div class="input-wrap">
              <svg class="input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <input
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
                class="input"
              />
            </div>
          </div>

          <!-- Password -->
          <div class="field">
            <label class="field-label">Password</label>
            <div class="input-wrap">
              <svg class="input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                autocomplete="current-password"
                required
                class="input"
              />
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

          <!-- Error -->
          <Transition name="err-fade">
            <div v-if="error" class="error-box">
              <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span>{{ error }}</span>
            </div>
          </Transition>

          <!-- Submit -->
          <button type="submit" :disabled="loading" class="submit-btn">
            <span v-if="loading" class="btn-loading">
              <svg class="spinner" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Signing in…
            </span>
            <span v-else class="btn-label">
              Sign In
              <svg class="btn-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </span>
          </button>
        </form>

        <!-- Links -->
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

const features = [
  { text: 'Automatic match recording' },
  { text: 'AI-powered kill analysis' },
  { text: 'Pro coaching breakdowns' },
  { text: 'VOD review timeline' },
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
/* ── Root ── */
.login-root {
  display: flex;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ── Left brand panel ── */
.brand-panel {
  position: relative;
  width: 46%;
  flex-shrink: 0;
  background: #080a0f;
  border-right: 1px solid rgba(239,68,68,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.brand-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 100% 70% at 30% 20%, rgba(239,68,68,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 80% 60% at 80% 90%, rgba(249,115,22,0.08) 0%, transparent 60%);
}

.brand-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.brand-orb-1 {
  width: 340px; height: 340px;
  background: radial-gradient(circle, rgba(239,68,68,0.14) 0%, transparent 65%);
  top: -80px; left: -80px;
  animation: borb1 12s ease-in-out infinite alternate;
}
.brand-orb-2 {
  width: 240px; height: 240px;
  background: radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 65%);
  bottom: -60px; right: -40px;
  animation: borb2 16s ease-in-out infinite alternate;
}
@keyframes borb1 { from { transform: scale(1); } to { transform: scale(1.1) translate(20px,15px); } }
@keyframes borb2 { from { transform: scale(1); } to { transform: scale(1.08) translate(-15px,-10px); } }

/* Diagonal lines decoration */
.brand-lines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 40px,
    rgba(239,68,68,0.025) 40px,
    rgba(239,68,68,0.025) 41px
  );
}

.brand-content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 32px 28px;
  justify-content: center;
}

.brand-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(249,115,22,0.12) 100%);
  border: 1px solid rgba(239,68,68,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 0 24px rgba(239,68,68,0.15);
}
.brand-logo-img {
  height: 28px;
  width: auto;
  filter: drop-shadow(0 0 10px rgba(239,68,68,0.5));
}

.brand-wordmark {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  margin-bottom: 6px;
}
.brand-up    { color: #fff; }
.brand-forge { color: #ef4444; }

.brand-sub {
  font-size: 11px;
  color: rgba(156,163,175,0.5);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 28px;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: rgba(156,163,175,0.7);
  font-weight: 500;
}
.feature-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ef4444, #f97316);
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(239,68,68,0.5);
}

.brand-footer {
  position: relative;
  z-index: 1;
  padding: 14px 28px;
  border-top: 1px solid rgba(255,255,255,0.04);
}
.brand-footer-text {
  font-size: 10px;
  color: rgba(75,85,99,0.6);
  letter-spacing: 0.04em;
}

/* ── Right form panel ── */
.form-panel {
  flex: 1;
  background: #0d0f14;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.form-inner {
  width: 100%;
  max-width: 300px;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
}
.form-inner.visible {
  opacity: 1;
  transform: translateY(0);
}

.form-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}
.form-subtitle {
  font-size: 12px;
  color: rgba(107,114,128,0.8);
  margin: 0 0 24px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Fields ── */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(156,163,175,0.7);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: rgba(107,114,128,0.6);
  pointer-events: none;
  flex-shrink: 0;
}
.input {
  width: 100%;
  padding: 9px 36px 9px 32px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  font-size: 12px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.input::placeholder { color: rgba(107,114,128,0.5); }
.input:focus {
  border-color: rgba(239,68,68,0.4);
  background: rgba(255,255,255,0.06);
  box-shadow: 0 0 0 3px rgba(239,68,68,0.08);
}

.pw-toggle {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: rgba(107,114,128,0.5);
  transition: color 0.15s;
  display: flex;
  align-items: center;
}
.pw-toggle:hover { color: rgba(156,163,175,0.8); }
.pw-icon { width: 14px; height: 14px; }

/* ── Error ── */
.error-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 8px;
  font-size: 11px;
  color: #f87171;
}
.error-icon { width: 14px; height: 14px; flex-shrink: 0; }
.err-fade-enter-active, .err-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.err-fade-enter-from { opacity: 0; transform: translateY(-4px); }
.err-fade-leave-to   { opacity: 0; }

/* ── Submit button ── */
.submit-btn {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px rgba(239,68,68,0.25);
  font-family: inherit;
  letter-spacing: -0.01em;
  margin-top: 4px;
}
.submit-btn:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(239,68,68,0.35);
}
.submit-btn:active:not(:disabled) { transform: translateY(0); }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-label, .btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-arrow { width: 14px; height: 14px; }
.spinner { width: 14px; height: 14px; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Links ── */
.form-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: rgba(107,114,128,0.7);
  cursor: pointer;
  transition: color 0.15s;
  font-family: inherit;
}
.link-btn:hover { color: rgba(156,163,175,0.9); }
.link-signup { color: rgba(239,68,68,0.7); }
.link-signup:hover { color: #f87171; }
.link-sep { font-size: 11px; color: rgba(75,85,99,0.4); }
</style>

