<template>
  <div class="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden select-none">
    <!-- Title bar -->
    <div
      v-if="showTitleBar"
      class="drag-region flex items-center justify-between flex-shrink-0 px-3 border-b border-white/[0.05]"
      :style="isMac ? 'height:40px; padding-left:80px' : 'height:40px'"
    >
      <div class="flex items-center gap-2">
        <img src="./assets/upforge-logo.png" alt="UpForge" class="h-4 w-auto object-contain flex-shrink-0" />
        <span v-if="appVersion" class="text-[10px] text-gray-600 font-normal ml-0.5">v{{ appVersion }}</span>
        <span v-if="status.recording" class="flex items-center gap-1 ml-1">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span class="text-[10px] text-red-400 font-medium">REC</span>
        </span>
      </div>

      <!-- User identity (center when not recording) -->
      <div v-if="riotId && !isMac" class="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
        <span class="text-[10px] text-gray-500 font-medium">{{ riotId }}</span>
      </div>

      <!-- Windows-only window controls -->
      <div v-if="!isMac" class="flex items-center -webkit-no-drag">
        <button
          class="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          @click="minimizeWindow()"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-width="2.5" d="M5 12h14"/>
          </svg>
        </button>
        <button
          class="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-red-500/80 transition-colors"
          @click="closeWindow()"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Navigation (hidden on post-game / login) -->
    <nav
      v-if="showNav"
      class="flex items-center gap-0.5 px-3 pt-2 pb-0 flex-shrink-0"
    >
      <RouterLink
        v-for="link in navLinks"
        :key="link.to"
        :to="link.to"
        class="px-3 py-1.5 text-xs font-medium transition-all duration-150"
        :class="
          $route.path === link.to
            ? 'text-white relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-red-500 after:to-orange-500'
            : 'text-gray-500 hover:text-gray-300'
        "
      >
        {{ link.label }}
      </RouterLink>
      <!-- Developer link (shown only when dev mode is unlocked) -->
      <RouterLink
        v-if="devNavLink"
        :to="devNavLink.to"
        class="px-3 py-1.5 text-xs font-medium transition-all duration-150 ml-auto"
        :class="
          $route.path === devNavLink.to
            ? 'text-amber-400 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-amber-500'
            : 'text-amber-600 hover:text-amber-400'
        "
      >
        {{ devNavLink.label }}
      </RouterLink>
    </nav>

    <!-- Content -->
    <main class="flex-1 overflow-y-auto mt-1">
      <RouterView />
    </main>

    <!-- First-run onboarding wizard -->
    <OnboardingWizard
      v-if="showOnboarding"
      :already-completed="onboardingWasComplete"
      @complete="handleOnboardingComplete"
    />

    <!-- Dev toolbar (dev mode only, always visible) -->
    <div v-if="isDev" class="flex items-center gap-2 px-3 py-1.5 border-t border-yellow-500/20 bg-yellow-500/[0.03] flex-shrink-0">
      <span class="text-[10px] text-yellow-500/60 font-mono uppercase tracking-wider">Dev</span>
      <button
        class="px-2 py-0.5 text-[10px] text-yellow-400/80 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 rounded border border-yellow-500/20 transition-colors"
        @click="simulateGame"
      >Simulate Valorant</button>
      <button
        class="px-2 py-0.5 text-[10px] text-yellow-400/80 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 rounded border border-yellow-500/20 transition-colors"
        @click="openPostGame"
      >Post-game UI</button>
      <span v-if="simStatus" class="text-[10px] text-yellow-500/50 ml-1">{{ simStatus }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDesktopRecording } from './composables/useDesktopRecording'
import OnboardingWizard from './components/OnboardingWizard.vue'

const route = useRoute()
const router = useRouter()

// Initialise renderer-side MediaRecorder bridge — always active while app is running
useDesktopRecording()

const isMac = navigator.platform.toUpperCase().includes('MAC')
const status = ref({ recording: false, currentGame: null as string | null })
const isDev = ref(false)
const devModeEnabled = ref(false)
const isAdmin = ref(false)
const appVersion = ref(__APP_VERSION__)
const simStatus = ref('')
const riotId = ref<string | null>(null)
const showOnboarding = ref(false)
const onboardingWasComplete = ref(false)

const showTitleBar = computed(() =>
  route.path !== '/overlay' && route.path !== '/splash'
)

const showNav = computed(() =>
  !route.path.startsWith('/post-game') &&
  route.path !== '/login' &&
  route.path !== '/welcome' &&
  route.path !== '/splash' &&
  route.path !== '/overlay'
)

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/training', label: 'Training' },
  { to: '/clips', label: 'Clips' },
  { to: '/squad', label: 'Squad' },
  { to: '/performance', label: 'Performance' },
  { to: '/settings', label: 'Settings' }
]

const devNavLink = computed(() =>
  (isAdmin.value || devModeEnabled.value) ? { to: '/dev', label: 'Developer' } : null
)

let statusInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    const s = await window.api.app.getStatus()
    status.value = s
    isDev.value = (s as Record<string, unknown>).isDev as boolean
    if (s.version) appVersion.value = s.version
    if (s.user?.riot_name) riotId.value = `${s.user.riot_name}#${s.user.riot_tag}`
    if (s.user?.is_admin) isAdmin.value = true
  } catch {
    // IPC failed — appVersion stays as compile-time constant
  }
  try {
    const settings = await window.api.settings.get()
    devModeEnabled.value = settings.devModeEnabled ?? false
    if (!settings.onboardingComplete) {
      showOnboarding.value = true
    } else {
      onboardingWasComplete.value = true
    }
  } catch { /* ignore */ }

  // React to settings changes (e.g. dev mode toggled in Settings)
  const settingsCleanup = window.api.on('settings:changed', (...args: unknown[]) => {
    const s = args[0] as { devModeEnabled?: boolean } | undefined
    if (s && typeof s.devModeEnabled === 'boolean') devModeEnabled.value = s.devModeEnabled
  })
  ;(window as Window & { _settingsCleanup?: () => void })._settingsCleanup = settingsCleanup
  statusInterval = setInterval(async () => {
    if (document.hidden) return // skip while game is running fullscreen
    try {
      const s = await window.api.app.getStatus()
      status.value = s
      if (s.user?.riot_name) riotId.value = `${s.user.riot_name}#${s.user.riot_tag}`
      if (s.user?.is_admin) isAdmin.value = true
    } catch { /* ignore */ }
  }, 5000)

  // Navigate to a tab when the main process requests it (e.g. from post-game "View Clips" button)
  const navCleanup = window.api.on('app:navigate', (...args: unknown[]) => {
    const path = args[0] as string
    if (path) router.push(path).catch(() => {})
  })
  ;(window as Window & { _appNavCleanup?: () => void })._appNavCleanup = navCleanup
})

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
  const navCleanup = (window as Window & { _appNavCleanup?: () => void })._appNavCleanup
  navCleanup?.()
  delete (window as Window & { _appNavCleanup?: () => void })._appNavCleanup
  const settingsCleanup = (window as Window & { _settingsCleanup?: () => void })._settingsCleanup
  settingsCleanup?.()
  delete (window as Window & { _settingsCleanup?: () => void })._settingsCleanup
})

async function simulateGame() {
  simStatus.value = 'Simulating...'
  await window.api.dev.simulateGame('valorant', 8000)
  simStatus.value = 'Done'
  setTimeout(() => simStatus.value = '', 3000)
}

function openPostGame() {
  window.api.window.openPostGame?.()
}

function closeWindow() {
  window.api.window.close()
}

function minimizeWindow() {
  window.api.window.minimize()
}

function handleOnboardingComplete() {
  showOnboarding.value = false
  router.push('/training').catch(() => {})
}
</script>
