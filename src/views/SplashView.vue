<template>
  <div class="splash-root">
    <!-- Animated background orbs -->
    <div class="orb orb-1" />
    <div class="orb orb-2" />
    <div class="orb orb-3" />

    <!-- Noise texture overlay -->
    <div class="noise" />

    <!-- Content -->
    <div class="content" :class="{ visible: mounted }">
      <!-- Logo -->
      <div class="logo-wrap">
        <img src="../assets/upforge-logo.png" alt="UpForge" class="logo" />
        <div class="logo-glow" />
      </div>

      <!-- Tagline -->
      <p class="tagline">AI Coaching for Valorant Players</p>

      <!-- Status + progress -->
      <div class="status-wrap">
        <Transition name="status-fade" mode="out-in">
          <p :key="statusText" class="status-text">{{ statusText }}</p>
        </Transition>

        <div class="progress-area">
          <!-- Download progress bar -->
          <Transition name="bar-fade">
            <div v-if="showProgress" class="progress-track">
              <div class="progress-fill" :style="{ width: progress + '%' }" />
              <div class="progress-glow" :style="{ left: progress + '%' }" />
            </div>
          </Transition>

          <!-- Idle pulse dots -->
          <Transition name="bar-fade">
            <div v-if="!showProgress" class="dots">
              <span v-for="i in 3" :key="i" class="dot" :style="{ animationDelay: `${(i - 1) * 0.22}s` }" />
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Version -->
    <p class="version">v{{ appVersion }}</p>
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
.splash-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #080808;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
  -webkit-app-region: drag;
}

/* ── Background orbs ── */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
}
.orb-1 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(239,68,68,0.18) 0%, transparent 70%);
  top: -120px;
  left: -80px;
  animation: drift1 12s ease-in-out infinite alternate;
}
.orb-2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%);
  bottom: -60px;
  right: -40px;
  animation: drift2 15s ease-in-out infinite alternate;
}
.orb-3 {
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%);
  top: 50%;
  left: 60%;
  animation: drift3 18s ease-in-out infinite alternate;
}

@keyframes drift1 {
  from { transform: translate(0, 0) scale(1); }
  to   { transform: translate(40px, 30px) scale(1.1); }
}
@keyframes drift2 {
  from { transform: translate(0, 0) scale(1); }
  to   { transform: translate(-30px, -20px) scale(1.05); }
}
@keyframes drift3 {
  from { transform: translate(0, 0); }
  to   { transform: translate(-50px, 40px); }
}

/* Subtle noise texture */
.noise {
  position: absolute;
  inset: 0;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
  pointer-events: none;
}

/* ── Content ── */
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 1;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
.content.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Logo ── */
.logo-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo {
  height: 60px;
  width: auto;
  object-fit: contain;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0 20px rgba(239,68,68,0.25));
}
.logo-glow {
  position: absolute;
  width: 180px;
  height: 60px;
  background: radial-gradient(ellipse, rgba(239,68,68,0.2) 0%, transparent 70%);
  filter: blur(20px);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* ── Tagline ── */
.tagline {
  font-size: 12px;
  font-weight: 500;
  color: rgba(156,163,175,0.7);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0;
}

/* ── Status ── */
.status-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 260px;
}
.status-text {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  font-weight: 500;
  min-height: 16px;
  margin: 0;
}

/* ── Progress ── */
.progress-area {
  width: 100%;
  height: 3px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.progress-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.06);
  border-radius: 99px;
  overflow: visible;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #f97316);
  border-radius: 99px;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  box-shadow: 0 0 8px rgba(239,68,68,0.6);
}
.progress-glow {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: rgba(239,68,68,0.8);
  border-radius: 50%;
  filter: blur(4px);
  transition: left 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Dots ── */
.dots {
  position: absolute;
  display: flex;
  gap: 6px;
  align-items: center;
}
.dot {
  width: 4px;
  height: 4px;
  background: #374151;
  border-radius: 50%;
  animation: dot-pulse 1.1s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.75); }
  40%            { opacity: 1;   transform: scale(1); }
}

/* ── Version ── */
.version {
  position: absolute;
  bottom: 14px;
  right: 18px;
  font-size: 10px;
  color: #1f2937;
  font-weight: 500;
  letter-spacing: 0.04em;
  margin: 0;
}

/* ── Status text transition ── */
.status-fade-enter-active, .status-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.status-fade-enter-from { opacity: 0; transform: translateY(4px); }
.status-fade-leave-to   { opacity: 0; transform: translateY(-4px); }

.bar-fade-enter-active, .bar-fade-leave-active {
  transition: opacity 0.2s ease;
}
.bar-fade-enter-from, .bar-fade-leave-to { opacity: 0; }
</style>

