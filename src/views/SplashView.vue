<template>
  <div class="splash-root">
    <!-- Hero image background -->
    <img src="../assets/upforge-bg.webp" alt="" class="hero-img" />
    <!-- Ambient background layers -->
    <div class="bg-mesh" />
    <div class="orb orb-1" />
    <div class="orb orb-2" />
    <div class="orb orb-3" />
    <div class="scanlines" />

    <!-- Left brand accent strip -->
    <div class="brand-strip" />

    <!-- Main content -->
    <div class="content" :class="{ visible: mounted }">
      <!-- Logo lockup -->
      <div class="logo-lockup">
        <div class="logo-ring">
          <div class="logo-halo" />
          <div class="logo-shimmer" />
          <img src="../assets/upforge-icon.png" alt="UpForge" class="logo-img" />
        </div>
        <p class="tagline">Competitive coaching platform &amp; marketplace</p>
      </div>

      <!-- Divider -->
      <div class="divider" />

      <!-- Status area -->
      <div class="status-wrap">
        <Transition name="status-fade" mode="out-in">
          <p :key="statusText" class="status-text">{{ statusText }}</p>
        </Transition>

        <div class="progress-area">
          <Transition name="bar-fade">
            <div v-if="showProgress" class="progress-track">
              <div class="progress-fill" :style="{ width: progress + '%' }" />
              <div class="progress-tip" :style="{ left: progress + '%' }" />
            </div>
          </Transition>
          <Transition name="bar-fade">
            <div v-if="!showProgress" class="loader-track">
              <div class="loader-bar" />
              <div class="loader-spinner-wrap">
                <svg class="loader-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="9" stroke-width="1.75" opacity="0.18" />
                  <path stroke-linecap="round" stroke-width="2" d="M12 3a9 9 0 017.5 4" />
                </svg>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Bottom meta -->
    <div class="meta">
      <span class="meta-badge">v{{ appVersion }}</span>
      <span class="meta-sep">·</span>
      <span class="meta-copy">upforge.gg</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const appVersion = ref('')
const statusText = ref('Checking for updates…')
const progress = ref(0)
const showProgress = ref(false)
const mounted = ref(false)

const handlers: Array<() => void> = []

function on(channel: string, fn: (...args: unknown[]) => void) {
  const off = window.api.on(channel, fn)
  handlers.push(off)
}

onMounted(async () => {
  // Trigger entrance animation after a single frame
  requestAnimationFrame(() => { mounted.value = true })

  try {
    const s = await window.api.app.getStatus()
    appVersion.value = s.version ?? ''
  } catch { /* ignore */ }

  on('updater:checking', () => {
    statusText.value = 'Checking for updates…'
    showProgress.value = false
  })

  on('updater:available', (info: unknown) => {
    const v = (info as { version?: string })?.version
    statusText.value = `Downloading update${v ? ` v${v}` : ''}…`
    showProgress.value = true
    progress.value = 0
  })

  on('updater:progress', (pct: unknown) => {
    const n = Math.round(Number(pct))
    progress.value = Number.isFinite(n) ? n : 0
    const display = progress.value > 0 ? `${progress.value}%` : '…'
    statusText.value = `Downloading update… ${display}`
  })

  on('updater:downloaded', () => {
    progress.value = 100
    statusText.value = 'Installing update…'
  })

  on('updater:not-available', () => {
    statusText.value = 'Launching…'
    showProgress.value = false
  })

  on('updater:error', () => {
    statusText.value = 'Launching…'
    showProgress.value = false
  })
})

onUnmounted(() => {
  for (const off of handlers) off()
})
</script>

<style scoped>
/* ── Root ── */
.splash-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #0a0f1c;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
  -webkit-app-region: drag;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ── Hero image ── */
.hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  opacity: 0.45;
  z-index: 0;
  pointer-events: none;
}

/* ── Background ── */
.bg-mesh {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(249,115,22,0.06) 0%, transparent 60%);
}

.orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.orb-1 {
  width: 520px; height: 520px;
  background: radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 65%);
  top: -200px; left: -120px;
  animation: drift1 14s ease-in-out infinite alternate;
  filter: blur(1px);
}
.orb-2 {
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(249,115,22,0.09) 0%, transparent 65%);
  bottom: -140px; right: -80px;
  animation: drift2 18s ease-in-out infinite alternate;
}
.orb-3 {
  width: 280px; height: 280px;
  background: radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 65%);
  top: 55%; left: 65%;
  animation: drift3 22s ease-in-out infinite alternate;
}

@keyframes drift1 {
  from { transform: translate(0,0) scale(1); }
  to   { transform: translate(50px,35px) scale(1.08); }
}
@keyframes drift2 {
  from { transform: translate(0,0); }
  to   { transform: translate(-35px,-25px) scale(1.06); }
}
@keyframes drift3 {
  from { transform: translate(0,0); }
  to   { transform: translate(-60px,50px); }
}

/* Subtle scanlines */
.scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(255,255,255,0.008) 3px,
    rgba(255,255,255,0.008) 4px
  );
  pointer-events: none;
}

/* Left brand accent strip */
.brand-strip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, transparent 0%, #ff4655 30%, #f97316 70%, transparent 100%);
  opacity: 0.7;
}

/* ── Content ── */
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  position: relative;
  z-index: 1;
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1);
}
.content.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Logo lockup ── */
.logo-lockup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-ring {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 18px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
  overflow: hidden;
  animation: logoRingPulse 3s ease-in-out infinite;
}
.logo-halo {
  position: absolute;
  inset: 12px;
  border-radius: 20px;
  background: radial-gradient(circle, rgba(239,68,68,0.18) 0%, rgba(249,115,22,0.08) 48%, transparent 72%);
  animation: haloPulse 2.6s ease-in-out infinite;
}
.logo-shimmer {
  position: absolute;
  inset: -40% 20%;
  transform: rotate(20deg) translateX(-120%);
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 45%, transparent 80%);
  animation: logoSweep 2.8s ease-in-out infinite;
}
.logo-img {
  position: relative;
  z-index: 1;
  height: 58px;
  width: 58px;
  object-fit: contain;
  filter: drop-shadow(0 0 18px rgba(239,68,68,0.45));
  animation: logoFloat 2.8s ease-in-out infinite;
}

.tagline {
  font-size: 11px;
  font-weight: 500;
  color: rgba(156,163,175,0.65);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin: 0;
  max-width: 280px;
  text-align: center;
  line-height: 1.5;
}

/* ── Divider ── */
.divider {
  width: 1px;
  height: 28px;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,0.08), transparent);
}

/* ── Status ── */
.status-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 300px;
  padding: 14px 16px 12px;
  border-radius: 18px;
  background: rgba(10,12,18,0.42);
  border: 1px solid rgba(255,255,255,0.06);
  animation: statusGlow 2.6s ease-in-out infinite;
}
.status-text {
  font-size: 11px;
  color: rgba(156,163,175,0.9);
  text-align: center;
  font-weight: 600;
  letter-spacing: 0.04em;
  min-height: 16px;
  margin: 0;
}
.status-text::after {
  content: '';
  display: block;
  width: 56px;
  height: 1px;
  margin: 8px auto 0;
  background: linear-gradient(90deg, transparent, rgba(239,68,68,0.45), rgba(249,115,22,0.45), transparent);
  animation: underlinePulse 1.8s ease-in-out infinite;
}

/* ── Progress bar (deterministic) ── */
.progress-area {
  width: 100%;
  height: 8px;
  position: relative;
}
.progress-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.05);
  border-radius: 99px;
  overflow: visible;
  animation: trackPulse 1.8s ease-in-out infinite;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff4655, #f97316, #ff4655);
  background-size: 200% 100%;
  border-radius: 99px;
  transition: width 0.5s cubic-bezier(0.16,1,0.3,1);
  box-shadow: 0 0 14px rgba(239,68,68,0.45);
  animation: barFlow 1.4s linear infinite;
}
.progress-tip {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(249,115,22,0.8) 35%, rgba(249,115,22,0.1) 80%);
  border-radius: 50%;
  filter: blur(1px);
  transition: left 0.5s cubic-bezier(0.16,1,0.3,1);
  animation: dotOrbit 1.2s ease-in-out infinite;
}

/* ── Indeterminate loader ── */
.loader-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.05);
  border-radius: 99px;
  overflow: hidden;
}
.loader-bar {
  height: 100%;
  width: 38%;
  background: linear-gradient(90deg, transparent, rgba(239,68,68,0.95), rgba(249,115,22,0.95), transparent);
  border-radius: 99px;
  animation: loaderOrbit 1.5s ease-in-out infinite;
}
.loader-spinner-wrap {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(10,10,10,0.8);
  border: 1px solid rgba(255,255,255,0.08);
  animation: loaderGlow 1.5s ease-in-out infinite, spinnerFloat 1.5s ease-in-out infinite;
}
.loader-spinner {
  width: 11px;
  height: 11px;
  color: #fca5a5;
  animation: loaderSpin 0.85s linear infinite;
}

@keyframes haloPulse {
  0%, 100% { opacity: 0.45; transform: scale(0.96); }
  50% { opacity: 0.9; transform: scale(1.02); }
}
@keyframes logoSweep {
  0% { transform: rotate(20deg) translateX(-120%); }
  55%, 100% { transform: rotate(20deg) translateX(180%); }
}
@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes logoRingPulse {
  0%, 100% { box-shadow: 0 18px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04); }
  50% { box-shadow: 0 18px 50px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.04); }
}
@keyframes statusGlow {
  0%, 100% { box-shadow: 0 0 0 rgba(239,68,68,0); }
  50% { box-shadow: 0 0 18px rgba(239,68,68,0.18); }
}
@keyframes underlinePulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.9; }
}
@keyframes trackPulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
@keyframes barFlow {
  0% { background-position: 200% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes dotOrbit {
  0% { transform: translate(-50%, -50%) scale(0.9); }
  50% { transform: translate(-50%, -50%) scale(1.15); }
  100% { transform: translate(-50%, -50%) scale(0.9); }
}
@keyframes loaderOrbit {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(350%); }
}
@keyframes loaderSpin {
  to { transform: rotate(360deg); }
}
@keyframes loaderGlow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes spinnerFloat {
  0%, 100% { transform: translateY(-50%); }
  50% { transform: translateY(calc(-50% - 1px)); }
}

/* ── Bottom meta ── */
.meta {
  position: absolute;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1;
}
.meta-badge {
  font-size: 10px;
  font-weight: 600;
  color: rgba(75,85,99,0.9);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 99px;
  letter-spacing: 0.04em;
}
.meta-sep, .meta-copy {
  font-size: 10px;
  color: rgba(75,85,99,0.5);
}

/* ── Transitions ── */
.status-fade-enter-active, .status-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.status-fade-enter-from { opacity: 0; transform: translateY(4px); }
.status-fade-leave-to   { opacity: 0; transform: translateY(-4px); }
.bar-fade-enter-active, .bar-fade-leave-active { transition: opacity 0.3s ease; }
.bar-fade-enter-from, .bar-fade-leave-to { opacity: 0; }
</style>

