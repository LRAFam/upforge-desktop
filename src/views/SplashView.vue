<template>
  <div class="splash-root">
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
          <img src="../assets/upforge-logo.png" alt="UpForge" class="logo-img" />
        </div>
        <div class="wordmark">
          <span class="wordmark-up">UP</span><span class="wordmark-forge">FORGE</span>
        </div>
        <p class="tagline">AI-Powered Valorant Coaching</p>
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

  on('updater:available', (_e: unknown, info: unknown) => {
    const v = (info as { version?: string })?.version
    statusText.value = `Downloading update${v ? ` ${v}` : ''}…`
    showProgress.value = true
    progress.value = 0
  })

  on('updater:progress', (_e: unknown, pct: unknown) => {
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
  background: linear-gradient(180deg, transparent 0%, #ef4444 30%, #f97316 70%, transparent 100%);
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
  width: 80px;
  height: 80px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(249,115,22,0.1) 100%);
  border: 1px solid rgba(239,68,68,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 0 1px rgba(239,68,68,0.08),
    0 0 40px rgba(239,68,68,0.12),
    inset 0 1px 0 rgba(255,255,255,0.06);
}
.logo-ring::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 23px;
  background: linear-gradient(135deg, rgba(239,68,68,0.3), transparent 50%);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  padding: 1px;
}

.logo-img {
  height: 44px;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 0 16px rgba(239,68,68,0.4));
}

.wordmark {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}
.wordmark-up   { color: #fff; }
.wordmark-forge { color: #ef4444; }

.tagline {
  font-size: 11px;
  font-weight: 500;
  color: rgba(156,163,175,0.6);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0;
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
  width: 280px;
}
.status-text {
  font-size: 11px;
  color: rgba(107,114,128,0.9);
  text-align: center;
  font-weight: 500;
  letter-spacing: 0.02em;
  min-height: 16px;
  margin: 0;
}

/* ── Progress bar (deterministic) ── */
.progress-area {
  width: 100%;
  height: 2px;
  position: relative;
}
.progress-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.05);
  border-radius: 99px;
  overflow: visible;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #f97316);
  border-radius: 99px;
  transition: width 0.5s cubic-bezier(0.16,1,0.3,1);
  box-shadow: 0 0 10px rgba(239,68,68,0.7);
}
.progress-tip {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background: #f97316;
  border-radius: 50%;
  filter: blur(3px);
  transition: left 0.5s cubic-bezier(0.16,1,0.3,1);
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
  width: 40%;
  background: linear-gradient(90deg, transparent, #ef4444, #f97316, transparent);
  border-radius: 99px;
  animation: loader-slide 1.6s ease-in-out infinite;
}
@keyframes loader-slide {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(350%); }
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

