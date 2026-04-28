<template>
  <div class="splash">
    <div class="splash-inner">
      <!-- Logo -->
      <div class="logo-wrap">
        <img src="../assets/upforge-logo.png" alt="UpForge" class="logo" />
      </div>

      <!-- Status area -->
      <div class="status-area">
        <p class="status-text">{{ statusText }}</p>

        <!-- Progress bar — shown during download -->
        <div v-if="showProgress" class="progress-track">
          <div class="progress-fill" :style="{ width: progress + '%' }" />
        </div>

        <!-- Spinner dots — shown while checking / launching -->
        <div v-else class="dots">
          <span v-for="i in 3" :key="i" class="dot" :style="{ animationDelay: `${(i - 1) * 0.18}s` }" />
        </div>
      </div>

      <p class="version">v{{ appVersion }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const appVersion = ref('')
const statusText = ref('Checking for updates…')
const progress = ref(0)
const showProgress = ref(false)

const handlers: Array<{ channel: string; fn: (...args: unknown[]) => void }> = []

function on(channel: string, fn: (...args: unknown[]) => void) {
  window.api.on(channel, fn)
  handlers.push({ channel, fn })
}

onMounted(async () => {
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
  for (const { channel, fn } of handlers) {
    window.api.off(channel, fn)
  }
})
</script>

<style scoped>
.splash {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #0a0a0a;
  color: #fff;
  user-select: none;
  -webkit-app-region: drag;
  overflow: hidden;
}

.splash-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  width: 340px;
}

.logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 72px;
  width: auto;
  object-fit: contain;
  opacity: 0.95;
}

.status-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.status-text {
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  min-height: 18px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 99px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #f87171);
  border-radius: 99px;
  transition: width 0.3s ease;
}

.dots {
  display: flex;
  gap: 7px;
  align-items: center;
  height: 4px;
}

.dot {
  width: 5px;
  height: 5px;
  background: #4b5563;
  border-radius: 50%;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.version {
  font-size: 11px;
  color: #374151;
  font-weight: 400;
  letter-spacing: 0.05em;
}
</style>
