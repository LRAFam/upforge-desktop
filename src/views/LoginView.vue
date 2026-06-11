<template>
  <div class="root">
    <img src="../assets/upforge-bg.webp" class="bg" alt="" />
    <div class="overlay" />
    <div class="orb orb-1" />
    <div class="orb orb-2" />
    <div class="orb orb-3" />
    <div class="particles" />

    <div class="center">
      <div class="card" :class="{ visible: mounted }">

        <!-- Logo -->
        <img src="../assets/upforge-icon.png" class="logo" alt="UpForge" />

        <!-- Header -->
        <div class="form-header">
          <h2>Welcome back</h2>
          <p>Sign in to continue</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleLogin">
          <div class="field">
            <label>Email</label>
            <div class="iw">
              <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <input v-model="email" type="email" placeholder="you@example.com" autocomplete="email" required />
            </div>
          </div>
          <div class="field">
            <label>Password</label>
            <div class="iw">
              <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              <input v-model="password" :type="showPw ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" required />
              <button type="button" class="eye" @click="showPw = !showPw" tabindex="-1">
                <svg v-if="!showPw" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
              </button>
            </div>
          </div>

          <Transition name="err">
            <div v-if="error" class="error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {{ error }}
            </div>
          </Transition>

          <button type="submit" :disabled="loading" class="btn" :class="{ loading }">
            <span class="btn-shimmer" aria-hidden="true" />
            <span class="btn-content">
              <svg v-if="loading" class="spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity=".22"/><path fill="currentColor" d="M12 3a9 9 0 017.794 4.5l-3.032 1.75A5.5 5.5 0 0012 6.5V3z" opacity=".9"/></svg>
              <span>{{ loading ? 'Signing in' : 'Sign In' }}</span>
              <svg v-if="!loading" class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            </span>
          </button>
        </form>

        <div class="form-links">
          <button @click="openForgot">Forgot password?</button>
          <span>·</span>
          <button @click="openSignup" class="accent inline-action">
            <span>Create account</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 17L17 7m0 0H9m8 0v8"/></svg>
          </button>
        </div>

        <!-- Supported games -->
        <div class="games-wrap">
          <p class="games-label">Supported Games</p>
          <div class="games">
            <div class="game">
              <img src="../assets/games/valorant.jpg" class="game-img" style="object-position:center 15%" />
              <div class="game-scrim" />
              <div class="game-foot">
                <span class="game-name">Valorant</span>
                <span class="chip live"><i class="pulse" />LIVE</span>
              </div>
            </div>
            <div class="game">
              <img src="../assets/games/deadlock.jpg" class="game-img" style="object-position:center 25%" />
              <div class="game-scrim" />
              <div class="game-foot">
                <span class="game-name">Deadlock</span>
                <span class="chip live"><i class="pulse" />LIVE</span>
              </div>
            </div>
            <div class="game">
              <img src="../assets/games/cs2.jpg" class="game-img" />
              <div class="game-scrim" />
              <div class="game-foot">
                <span class="game-name">CS2</span>
                <span class="chip live"><i class="pulse" />LIVE</span>
              </div>
            </div>
          </div>
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
const showPw = ref(false)
const mounted = ref(false)

onMounted(() => requestAnimationFrame(() => { mounted.value = true }))

async function handleLogin() {
  loading.value = true; error.value = ''
  try {
    const result = await window.api.auth.login(email.value, password.value)
    if (result.ok) {
      const s = await window.api.app.getStatus()
      router.push(s.firstRun ? '/welcome' : '/dashboard')
    }
    else { error.value = (result as any).error || 'Invalid email or password.' }
  } catch (e) {
    error.value = `Error: ${e instanceof Error ? e.message : String(e)}`
  } finally { loading.value = false }
}

function openSignup() { window.open('https://upforge.gg/register', '_blank') }
function openForgot()  { window.open('https://upforge.gg/forgot-password', '_blank') }
</script>

<style scoped>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.root {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #fff;
  overflow: hidden;
  background: radial-gradient(circle at top, rgba(239,68,68,.12), transparent 42%), #0a0a0a;
}

.root::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255,255,255,.018) 0%, transparent 35%, rgba(255,255,255,.018) 70%, transparent 100%);
  mix-blend-mode: screen;
  opacity: .65;
  animation: sweep 16s linear infinite;
  z-index: 1;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: 0;
  transform: scale(1.04);
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(circle at top, rgba(239,68,68,.12), transparent 34%),
    radial-gradient(circle at bottom right, rgba(249,115,22,.10), transparent 30%),
    linear-gradient(180deg, rgba(5,6,8,.3) 0%, rgba(5,6,8,.68) 48%, rgba(5,6,8,.9) 100%);
}

.orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(26px);
  opacity: .65;
  z-index: 1;
  animation: float 12s ease-in-out infinite;
}

.orb-1 {
  width: 320px;
  height: 320px;
  top: -60px;
  left: -40px;
  background: rgba(239,68,68,.18);
}

.orb-2 {
  width: 240px;
  height: 240px;
  right: 10%;
  top: 18%;
  background: rgba(249,115,22,.12);
  animation-delay: -4s;
}

.orb-3 {
  width: 360px;
  height: 360px;
  right: -80px;
  bottom: -120px;
  background: rgba(239,68,68,.12);
  animation-delay: -8s;
}

.particles {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: .35;
  background-image:
    radial-gradient(circle at 20% 25%, rgba(255,255,255,.2) 0 1px, transparent 1.5px),
    radial-gradient(circle at 80% 18%, rgba(255,255,255,.18) 0 1px, transparent 1.5px),
    radial-gradient(circle at 70% 65%, rgba(255,255,255,.18) 0 1px, transparent 1.5px),
    radial-gradient(circle at 35% 78%, rgba(255,255,255,.16) 0 1px, transparent 1.5px),
    radial-gradient(circle at 58% 42%, rgba(255,255,255,.14) 0 1px, transparent 1.5px);
  background-size: 180px 180px;
  animation: drift 18s linear infinite;
}

.center {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.card {
  width: 360px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1);
}

.card.visible { opacity: 1; transform: none; }

.card::before {
  content: '';
  position: absolute;
  inset: -44px -44px;
  background: linear-gradient(180deg, rgba(10,10,10,.62), rgba(12,12,12,.84));
  backdrop-filter: blur(52px);
  -webkit-backdrop-filter: blur(52px);
  border-radius: 32px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 20px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04);
  z-index: -1;
}

.card::after {
  content: '';
  position: absolute;
  inset: -44px -44px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(239,68,68,.75), rgba(249,115,22,.65), transparent);
  z-index: -1;
}

.logo {
  width: 76px;
  height: 76px;
  object-fit: contain;
  filter: drop-shadow(0 0 24px rgba(239,68,68,.55));
  margin-bottom: 16px;
  flex-shrink: 0;
}

.form-header { margin-bottom: 18px; }
.form-header h2 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -.03em;
  margin-bottom: 3px;
  line-height: 1.1;
}
.form-header p { font-size: 11.5px; color: rgba(156,163,175,.62); }

form { width: 100%; }

.field { margin-bottom: 10px; text-align: left; }
.field label {
  display: block;
  margin-bottom: 4px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: rgba(156,163,175,.5);
}

.iw { position: relative; }
.fi {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 13px;
  height: 13px;
  color: rgba(107,114,128,.4);
  pointer-events: none;
}

.iw input {
  width: 100%;
  padding: 9px 32px 9px 28px;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 9px;
  color: #fff;
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition: border-color .2s, background .2s, box-shadow .2s;
}

.iw input::placeholder { color: rgba(107,114,128,.35); }

.iw input:focus {
  border-color: rgba(239,68,68,.45);
  background: rgba(255,255,255,.09);
  box-shadow: 0 0 0 3px rgba(239,68,68,.08);
}

.eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: rgba(107,114,128,.4);
  display: flex;
  transition: color .15s;
}

.eye:hover { color: rgba(156,163,175,.7); }
.eye svg { width: 13px; height: 13px; }

.error {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  margin-bottom: 8px;
  background: rgba(239,68,68,.08);
  border: 1px solid rgba(239,68,68,.2);
  border-radius: 8px;
  font-size: 11.5px;
  color: #f87171;
  text-align: left;
}

.error svg { width: 13px; height: 13px; flex-shrink: 0; }
.err-enter-active, .err-leave-active { transition: opacity .2s, transform .2s; }
.err-enter-from { opacity: 0; transform: translateY(-4px); }
.err-leave-to { opacity: 0; }

.btn {
  width: 100%;
  margin-top: 6px;
  padding: 0;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #ef4444, #f97316);
  border: none;
  border-radius: 11px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: -.01em;
  box-shadow: 0 8px 30px rgba(239,68,68,.3);
  transition: opacity .15s, transform .15s, box-shadow .15s;
}

.btn:hover:not(:disabled) {
  opacity: .96;
  transform: translateY(-1px);
  box-shadow: 0 12px 34px rgba(239,68,68,.4);
}

.btn:active:not(:disabled) { transform: none; }
.btn:disabled { opacity: .72; cursor: not-allowed; }

.btn-content {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 11px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,.08) 32%, rgba(255,255,255,.28) 48%, transparent 62%);
  transform: translateX(-120%);
}

.btn.loading .btn-shimmer { animation: buttonShimmer 1.2s linear infinite; }

.arrow { width: 14px; height: 14px; }
.spin { width: 14px; height: 14px; animation: spin .8s linear infinite; }

.form-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 12px;
}

.form-links button {
  background: none;
  border: none;
  padding: 0;
  font-size: 11.5px;
  color: rgba(107,114,128,.55);
  cursor: pointer;
  font-family: inherit;
  transition: color .15s;
}

.form-links button:hover { color: rgba(209,213,219,.8); }
.form-links button.accent { color: rgba(239,68,68,.65); }
.form-links button.accent:hover { color: #fca5a5; }
.form-links span { font-size: 11.5px; color: rgba(75,85,99,.4); }
.inline-action { display: inline-flex; align-items: center; gap: 5px; }
.inline-action svg { width: 11px; height: 11px; }

.games-wrap { margin-top: 18px; width: 100%; }
.games-label {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(107,114,128,.4);
  margin-bottom: 7px;
  text-align: center;
}

.games { display: flex; gap: 7px; }

.game {
  flex: 1;
  position: relative;
  border-radius: 9px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.07);
  transition: border-color .2s, transform .25s;
}

.game:hover { border-color: rgba(255,255,255,.15); transform: translateY(-2px); }

.game-img {
  width: 100%;
  height: 64px;
  object-fit: cover;
  display: block;
  transition: transform .4s;
}

.game:hover .game-img { transform: scale(1.06); }

.game-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgba(7,11,18,.88) 0%, transparent 55%);
}

.game-foot {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 5px 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.game-name { font-size: 10px; font-weight: 800; }

.chip {
  font-size: 7px;
  font-weight: 800;
  letter-spacing: .07em;
  padding: 2px 4px;
  border-radius: 99px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.chip.live { background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.25); color: #34d399; }

.pulse {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #34d399;
  animation: pulse 2s infinite;
  display: inline-block;
}

@keyframes sweep {
  0% { transform: translate3d(-8%, 0, 0); }
  50% { transform: translate3d(8%, 0, 0); }
  100% { transform: translate3d(-8%, 0, 0); }
}

@keyframes float {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(0, -18px, 0) scale(1.04); }
}

@keyframes drift {
  0% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0); }
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes buttonShimmer { to { transform: translateX(140%); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
</style>
