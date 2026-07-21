<template>
  <div
    class="relative h-screen bg-[#111111] text-white flex flex-col overflow-hidden select-none"
    :style="cssVars"
  >
    <!-- Subtle branded background texture -->
    <img src="./assets/upforge-bg.webp" alt="" class="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-[0.045] select-none" />
    <Transition name="busy-bar">
      <div v-if="busyActive && route.path !== '/splash'" class="pointer-events-none absolute inset-x-0 top-0 z-50 h-[2px] bg-white/[0.04]">
        <div
          class="h-full rounded-full bg-[length:200%_100%] animate-[busy-shimmer_1.2s_linear_infinite] transition-all duration-300"
          :class="`shadow-[0_0_14px_rgba(${theme.rgb},0.45)]`"
          :style="{ width: `${busyBarWidth}%`, backgroundImage: `linear-gradient(90deg, ${theme.hexColor}, ${secondaryAccent}, ${theme.hexColor})` }"
        />
      </div>
    </Transition>

    <!-- Title bar -->
    <div
      v-if="showTitleBar"
      class="drag-region relative flex items-center justify-between flex-shrink-0 px-3 border-b border-white/[0.09] bg-[#161616]/95 backdrop-blur-xl"
      :style="isMac ? 'height:44px; padding-left:80px' : 'height:44px'"
    >
      <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r" :class="theme.chromeGradient" />
      <div class="flex items-center gap-2.5">
        <!-- Logo with red glow halo -->
        <div class="relative flex-shrink-0">
          <div class="absolute inset-0 rounded-full blur-md scale-150 pointer-events-none" :style="{ backgroundColor: `rgba(${theme.rgb}, 0.25)` }" />
          <img src="./assets/upforge-logo.webp" alt="UpForge" class="relative h-5 w-auto object-contain" />
        </div>
        <div class="flex items-center gap-2">
          <div class="flex flex-col leading-none">
            <span class="text-[11px] font-semibold tracking-[0.18em] text-gray-200 uppercase">UpForge</span>
            <span class="text-[9px] text-gray-500 font-medium">{{ isPostGameRoute ? 'Post-game' : 'Desktop' }}</span>
          </div>
          <span v-if="status.recording" class="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 shadow-[0_0_16px_rgba(239,68,68,0.12)]">
            <span class="relative flex h-2.5 w-2.5 items-center justify-center">
              <span class="absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500/30 animate-ping" />
              <span class="relative h-1.5 w-1.5 rounded-full bg-red-400" />
            </span>
            <span class="text-[10px] font-semibold tracking-[0.14em] text-red-300 uppercase">Recording</span>
          </span>
        </div>
      </div>

      <!-- User identity (center when not recording) — hidden on compact post-game window -->
      <div v-if="titleBarIdentity && !isMac && !isPostGameRoute" class="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
        <span class="text-[10px] text-gray-500 font-medium">{{ titleBarIdentity }}</span>
      </div>

      <!-- Windows-only window controls (Electron preload required) -->
      <div v-if="!isMac && desktopApiAvailable" class="flex items-center -webkit-no-drag">
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

    <!-- Update banner (download progress + ready to install) -->
    <Transition name="update-banner">
      <div
        v-if="route.path !== '/splash' && (appUpdatePhase === 'available' || appUpdatePhase === 'downloading' || appUpdatePhase === 'ready')"
        :class="[
          'flex items-center justify-between px-3 py-1.5 flex-shrink-0 text-xs',
          appUpdatePhase === 'ready'
            ? 'bg-gradient-to-r from-red-500/10 to-orange-500/10 border-b border-red-500/20'
            : 'bg-white/[0.02] border-b border-white/[0.07]'
        ]"
      >
        <div class="flex items-center gap-2 min-w-0">
          <div
            v-if="appUpdatePhase === 'downloading'"
            class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0"
          />
          <div
            v-else-if="appUpdatePhase === 'available'"
            class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0"
          />
          <svg
            v-else
            class="w-3 h-3 text-red-400 flex-shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          <span
            v-if="appUpdatePhase === 'downloading'"
            class="text-gray-400 truncate"
          >Downloading update{{ appUpdateVersion ? ` v${appUpdateVersion}` : '' }}… {{ appUpdatePercent > 0 ? `${Math.round(appUpdatePercent)}%` : '' }}</span>
          <span v-else-if="appUpdatePhase === 'available'" class="text-gray-400 truncate">
            Update{{ appUpdateVersion ? ` v${appUpdateVersion}` : '' }} available — downloading in background
          </span>
          <span v-else class="text-gray-300 truncate">
            UpForge{{ appUpdateVersion ? ` v${appUpdateVersion}` : '' }} is ready to install
          </span>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0 ml-3">
          <!-- Download progress bar -->
          <div v-if="appUpdatePhase === 'downloading'" class="w-20 h-1 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              class="h-full bg-amber-400 rounded-full transition-all duration-300"
              :style="{ width: `${appUpdatePercent}%` }"
            />
          </div>
          <!-- Restart button -->
          <button
            v-else
            class="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-colors font-medium"
            @click="installUpdate"
          >Restart now</button>
        </div>
      </div>
    </Transition>

    <!-- OBS setup banner — shown as soon as we detect OBS is not connected -->
    <Transition name="update-banner">
      <div
        v-if="showObsBanner"
        class="flex items-center justify-between gap-3 px-3 py-2 flex-shrink-0 bg-amber-500/[0.08] border-b border-amber-500/25 text-xs"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
          <span class="text-amber-100/90 truncate" :title="obsBannerMessage">
            {{ obsBannerMessage }}
          </span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            :disabled="obsConnecting"
            class="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors font-medium disabled:opacity-50"
            @click="launchObsFromBanner"
          >{{ obsConnecting ? 'Starting…' : 'Launch OBS' }}</button>
          <button
            :disabled="obsConnecting"
            class="px-2.5 py-1 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15 transition-colors font-medium disabled:opacity-50"
            @click="connectObsFromBanner"
          >{{ obsConnecting ? 'Connecting…' : 'Connect' }}</button>
          <button
            class="px-2.5 py-1 rounded-lg border border-white/[0.10] bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors font-medium"
            @click="openObsSettings"
          >Settings</button>
        </div>
      </div>
    </Transition>

    <!-- App shell: sidebar + content (replaces top nav) -->
    <div class="relative z-10 flex flex-1 min-h-0">
      <AppSidebar v-if="showNav" />
      <div class="flex flex-1 min-h-0 flex-col min-w-0">
        <main
          class="main-content flex flex-1 min-h-0 flex-col"
          :class="isFullHeightView ? 'overflow-hidden' : 'overflow-y-auto'"
        >
          <RouterView v-slot="{ Component }" :key="sessionUserKey">
            <component
              :is="Component"
              :class="isFullHeightView ? 'flex flex-1 min-h-0 flex-col' : undefined"
            />
          </RouterView>
        </main>
      </div>
    </div>

    <!-- First-run onboarding wizard -->
    <OnboardingWizard
      v-if="showOnboarding"
      :already-completed="onboardingWasComplete"
      @complete="handleOnboardingComplete"
    />

    <!-- Achievement toast manager -->
    <AchievementManager />

    <!-- Dev toolbar (dev mode only, always visible) -->
    <div v-if="isDev && route.path !== '/login'" class="flex items-center gap-2 px-3 py-1.5 border-t border-yellow-500/20 bg-yellow-500/[0.03] flex-shrink-0">
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OnboardingWizard from './components/OnboardingWizard.vue'
import AchievementManager from './components/AchievementManager.vue'
import AppSidebar from './components/AppSidebar.vue'
import { usePrimaryGame } from './composables/usePrimaryGame'
import { useGameTheme } from './composables/useGameTheme'
import { gameNavRoutes } from './lib/game-modules'
import { getDesktopApi, hasDesktopApi } from './lib/desktop-api'
import type { ClipRecord, ProfileData } from './env.d.ts'

const route = useRoute()
const router = useRouter()
const { primaryGame, isValorant, loadFromSettings, applyFromSettings } = usePrimaryGame()
const { theme, cssVars } = useGameTheme()

/** Secondary accent for busy-bar gradient (orange for Valorant, muted variant for others). */
const secondaryAccent = computed(() => {
  if (primaryGame.value === 'valorant') return '#f97316'
  if (primaryGame.value === 'cs2') return '#fbbf24'
  return '#06b6d4'
})

const isMac = navigator.platform.toUpperCase().includes('MAC')
const desktopApiAvailable = hasDesktopApi()
const status = ref({ recording: false, currentGame: null as string | null })
const isDev = ref(false)
const devModeEnabled = ref(false)
const isAdmin = ref(false)
const appVersion = ref(__APP_VERSION__)
const simStatus = ref('')
const riotId = ref<string | null>(null)
const userName = ref<string | null>(null)
const userAvatarUrl = ref('')
const clipCount = ref(0)
const clipCountAvailable = ref(false)
const hasClipIndicator = ref(false)
const isNavigating = ref(false)
const showOnboarding = ref(false)
const onboardingWasComplete = ref(false)
const obsConnected = ref<boolean | null>(null)
const obsConnecting = ref(false)
const obsError = ref<string | null>(null)
const obsProcessRunning = ref<boolean | null>(null)
/** Bumps on login/logout/account switch so route views reload user-scoped data. */
const sessionUserKey = ref('guest')

const showObsBanner = computed(() =>
  showNav.value &&
  route.path !== '/vod-review' &&
  !showOnboarding.value &&
  obsConnected.value === false &&
  !status.value.recording
)

const obsBannerMessage = computed(() => {
  if (obsError.value) return obsError.value
  if (obsProcessRunning.value === true) {
    return 'OBS is open but not connected — it may have crashed. Click Launch OBS and UpForge will restart it.'
  }
  return 'OBS not connected — matches won\'t record until you set it up.'
})

const showTitleBar = computed(() =>
  route.path !== '/overlay' && route.path !== '/splash' && route.path !== '/login'
)

const isPostGameRoute = computed(() => route.path.startsWith('/post-game'))
const isFullHeightView = computed(() =>
  ['/vod-review', '/dashboard', '/training', '/history', '/clips', '/stats', '/squad', '/performance', '/settings', '/login'].includes(route.path),
)

const showNav = computed(() =>
  !route.path.startsWith('/post-game') &&
  route.path !== '/login' &&
  route.path !== '/welcome' &&
  route.path !== '/splash' &&
  route.path !== '/overlay'
)

const devNavLink = computed(() =>
  (isAdmin.value || devModeEnabled.value) ? { to: '/dev', label: 'Developer' } : null
)

const appUpdatePhase = ref<string>('idle')
const appUpdateVersion = ref<string | undefined>(undefined)
const appUpdatePercent = ref(0)
let statusInterval: ReturnType<typeof setInterval> | null = null
let navBusyTimer: ReturnType<typeof setTimeout> | null = null
let lastClipSummaryAt = 0

const userDisplayName = computed(() => userName.value || riotId.value || 'UpForge User')
const userInitial = computed(() => userDisplayName.value.trim().charAt(0).toUpperCase() || 'U')
const titleBarIdentity = computed(() => {
  if (isValorant.value && riotId.value) return riotId.value
  if (!isValorant.value && userName.value) return `${userName.value} · ${primaryGame.value.toUpperCase()}`
  return riotId.value
})

const busyActive = computed(() =>
  isNavigating.value || ['checking', 'downloading', 'installing'].includes(appUpdatePhase.value)
)

const busyBarWidth = computed(() => {
  if (appUpdatePhase.value === 'downloading') return Math.max(10, Math.min(100, appUpdatePercent.value || 12))
  if (appUpdatePhase.value === 'installing') return 96
  if (appUpdatePhase.value === 'checking') return 22
  return isNavigating.value ? 64 : 0
})

async function installUpdate() {
  appUpdatePhase.value = 'installing'
  await window.api.updater.install()
}

async function loadClipSummary() {
  try {
    const clips = await window.api.clips.get({ game: primaryGame.value }) as ClipRecord[]
    clipCount.value = clips.length
    clipCountAvailable.value = true
    hasClipIndicator.value = clips.length > 0
  } catch {
    clipCountAvailable.value = false
  }
}

async function loadUserProfile() {
  try {
    const profile = await window.api.profile.get() as ProfileData | null
    userName.value = profile?.user?.name ?? userName.value
    if (profile?.latest_stats?.player_card_id) {
      userAvatarUrl.value = `https://media.valorant-api.com/playercards/${profile.latest_stats.player_card_id}/smallart.png`
      return
    }
  } catch {
    // ignore
  }
  userAvatarUrl.value = ''
}

async function applySessionUser(userId: number | null) {
  sessionUserKey.value = userId != null ? `user-${userId}` : 'guest'
  if (userId == null) {
    riotId.value = null
    userName.value = null
    userAvatarUrl.value = ''
    isAdmin.value = false
    clipCount.value = 0
    clipCountAvailable.value = false
    hasClipIndicator.value = false
    return
  }
  try {
    const s = await window.api.app.getStatus()
    status.value = s
    if (s.user?.riot_name) riotId.value = `${s.user.riot_name}#${s.user.riot_tag}`
    else riotId.value = null
    if (s.user?.name) userName.value = s.user.name
    if (s.user?.is_admin) isAdmin.value = true
    else isAdmin.value = false
  } catch {
    // ignore
  }
  await Promise.all([loadClipSummary(), loadUserProfile()])
}

router.beforeEach((to, from, next) => {
  if (to.fullPath !== from.fullPath) {
    isNavigating.value = true
    if (navBusyTimer) clearTimeout(navBusyTimer)
  }
  next()
})

router.afterEach((to) => {
  if (navBusyTimer) clearTimeout(navBusyTimer)
  navBusyTimer = setTimeout(() => { isNavigating.value = false }, 220)
  // The sidebar clip badge doesn't change between routes — re-listing every clip
  // on each navigation taxed every tab switch. Throttle to once/15s; clip create
  // still refreshes the count via its own listener below.
  if (Date.now() - lastClipSummaryAt > 15_000) {
    lastClipSummaryAt = Date.now()
    loadClipSummary().catch(() => {})
  }
  if (to.path !== '/overlay' && to.path !== '/splash' && window.api?.window?.applyLayout) {
    window.api.window.applyLayout(to.path).catch(() => {})
  }
})

watch(primaryGame, () => {
  if (!showNav.value) return
  const allowed = gameNavRoutes(primaryGame.value)
  if (!allowed.includes(route.path)) {
    router.push('/dashboard').catch(() => {})
  }
})

router.onError(() => {
  if (navBusyTimer) clearTimeout(navBusyTimer)
  isNavigating.value = false
})

onMounted(async () => {
  try {
    const s = await window.api.app.getStatus()
    status.value = s
    isDev.value = (s as Record<string, unknown>).isDev as boolean
    if (s.version) appVersion.value = s.version
    if (s.user?.riot_name) riotId.value = `${s.user.riot_name}#${s.user.riot_tag}`
    if (s.user?.name) userName.value = s.user.name
    if (s.user?.is_admin) isAdmin.value = true
  } catch {
    // IPC failed — appVersion stays as compile-time constant
  }
  try {
    const settings = await window.api.settings.get()
    applyFromSettings(settings)
    devModeEnabled.value = settings.devModeEnabled ?? false
    if (!settings.onboardingComplete && settings.firstRun === false) {
      showOnboarding.value = true
    } else {
      onboardingWasComplete.value = true
    }
  } catch { /* ignore */ }

  await Promise.all([loadClipSummary(), loadUserProfile(), loadFromSettings()])
  const initialUserId = (status.value as { user?: { id?: number } }).user?.id
  sessionUserKey.value = initialUserId != null ? `user-${initialUserId}` : 'guest'

  try {
    const obs = await window.api.obs.getStatus()
    obsConnected.value = obs.connected
    if (!obs.connected && obs.lastError) obsError.value = obs.lastError
    const proc = await window.api.obs.getProcessState()
    obsProcessRunning.value = proc.processRunning
    if (!obs.connected && proc.processRunning && !obs.lastError && !obsError.value) {
      obsError.value = null
    }
  } catch { /* ignore */ }

  const api = getDesktopApi()
  if (!api) return

  const obsCleanup = api.on('obs:connection-changed', (...args: unknown[]) => {
    const data = args[0] as { connected?: boolean; error?: string | null } | undefined
    if (data && typeof data.connected === 'boolean') {
      obsConnected.value = data.connected
      obsConnecting.value = false
      obsError.value = data.connected ? null : (data.error ?? obsError.value)
      void window.api.obs.getProcessState()
        .then((proc) => { obsProcessRunning.value = proc.processRunning })
        .catch(() => {})
    }
  })
  ;(window as Window & { _obsCleanup?: () => void })._obsCleanup = obsCleanup

  // Hydrate update state and listen for live updates
  try {
    const us = await api.updater.getState()
    appUpdatePhase.value = us.phase
    appUpdateVersion.value = us.version
    appUpdatePercent.value = us.percent ?? 0
  } catch { /* ignore */ }
  const updaterCleanups = [
    api.on('updater:checking', () => { appUpdatePhase.value = 'checking' }),
    api.on('updater:available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      appUpdatePhase.value = 'available'
      appUpdateVersion.value = info?.version
    }),
    api.on('updater:progress', (...args: unknown[]) => {
      appUpdatePhase.value = 'downloading'
      appUpdatePercent.value = typeof args[0] === 'number' ? args[0] : 0
    }),
    api.on('updater:downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      appUpdatePhase.value = 'ready'
      appUpdateVersion.value = info?.version
    }),
    api.on('updater:not-available', () => { appUpdatePhase.value = 'idle' }),
    api.on('updater:error', () => { appUpdatePhase.value = 'idle' }),
  ]
  ;(window as Window & { _updaterCleanups?: (() => void)[] })._updaterCleanups = updaterCleanups

  // React to settings changes (e.g. dev mode toggled in Settings)
  const settingsCleanup = api.on('settings:changed', (...args: unknown[]) => {
    const s = args[0] as { devModeEnabled?: boolean; primaryGame?: string; trainerMouse?: { game?: string } } | undefined
    if (!s) return
    if (typeof s.devModeEnabled === 'boolean') devModeEnabled.value = s.devModeEnabled
    applyFromSettings(s)
  })
  ;(window as Window & { _settingsCleanup?: () => void })._settingsCleanup = settingsCleanup
  statusInterval = setInterval(async () => {
    if (document.hidden) return // skip while game is running fullscreen
    try {
      const s = await api.app.getStatus()
      status.value = s
      if (s.user?.riot_name) riotId.value = `${s.user.riot_name}#${s.user.riot_tag}`
      if (s.user?.name) userName.value = s.user.name
      if (s.user?.is_admin) isAdmin.value = true
    } catch { /* ignore */ }
  }, 5000)

  const clipsCleanup = api.on('clips:new', async (...args: unknown[]) => {
    const clipIds = args[0] as string[] | undefined
    hasClipIndicator.value = (clipIds?.length ?? 0) > 0 || hasClipIndicator.value
    await loadClipSummary()
  })
  ;(window as Window & { _clipsCleanup?: () => void })._clipsCleanup = clipsCleanup

  const sessionCleanup = api.on('session:user-changed', (...args: unknown[]) => {
    const payload = args[0] as { userId?: number | null } | undefined
    void applySessionUser(payload?.userId ?? null)
  })
  ;(window as Window & { _sessionCleanup?: () => void })._sessionCleanup = sessionCleanup

  const authExpiredCleanup = api.on('auth:session-expired', () => {
    void applySessionUser(null)
    router.push('/login').catch(() => {})
  })
  ;(window as Window & { _authExpiredCleanup?: () => void })._authExpiredCleanup = authExpiredCleanup

  // Navigate to a tab when the main process requests it (e.g. from post-game "View Clips" button)
  const navCleanup = api.on('app:navigate', (...args: unknown[]) => {
    const payload = args[0]
    if (typeof payload === 'string' && payload) {
      router.push(payload).catch(() => {})
    } else if (payload && typeof payload === 'object' && 'path' in payload) {
      const { path, query } = payload as { path: string; query?: Record<string, string> }
      if (path) router.push({ path, query }).catch(() => {})
    }
  })
  ;(window as Window & { _appNavCleanup?: () => void })._appNavCleanup = navCleanup
})

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
  if (navBusyTimer) clearTimeout(navBusyTimer)
  const navCleanup = (window as Window & { _appNavCleanup?: () => void })._appNavCleanup
  navCleanup?.()
  delete (window as Window & { _appNavCleanup?: () => void })._appNavCleanup
  const settingsCleanup = (window as Window & { _settingsCleanup?: () => void })._settingsCleanup
  settingsCleanup?.()
  delete (window as Window & { _settingsCleanup?: () => void })._settingsCleanup
  const clipsCleanup = (window as Window & { _clipsCleanup?: () => void })._clipsCleanup
  clipsCleanup?.()
  delete (window as Window & { _clipsCleanup?: () => void })._clipsCleanup
  const sessionCleanup = (window as Window & { _sessionCleanup?: () => void })._sessionCleanup
  sessionCleanup?.()
  delete (window as Window & { _sessionCleanup?: () => void })._sessionCleanup
  const authExpiredCleanup = (window as Window & { _authExpiredCleanup?: () => void })._authExpiredCleanup
  authExpiredCleanup?.()
  delete (window as Window & { _authExpiredCleanup?: () => void })._authExpiredCleanup
  const updaterCleanups = (window as Window & { _updaterCleanups?: (() => void)[] })._updaterCleanups
  updaterCleanups?.forEach(fn => fn())
  delete (window as Window & { _updaterCleanups?: (() => void)[] })._updaterCleanups
  const obsCleanup = (window as Window & { _obsCleanup?: () => void })._obsCleanup
  obsCleanup?.()
  delete (window as Window & { _obsCleanup?: () => void })._obsCleanup
})

async function simulateGame() {
  simStatus.value = 'Simulating...'
  await window.api.dev.simulateGame('valorant', 8000)
  simStatus.value = 'Done'
  setTimeout(() => simStatus.value = '', 3000)
}

function openPostGame() {
  getDesktopApi()?.window?.openPostGame?.()
}

function closeWindow() {
  getDesktopApi()?.window?.close()
}

function minimizeWindow() {
  getDesktopApi()?.window?.minimize()
}

async function connectObsFromBanner() {
  obsConnecting.value = true
  obsError.value = null
  try {
    const result = await window.api.obs.connect()
    if (result.ok) {
      obsConnected.value = true
      obsError.value = null
    } else {
      obsError.value = result.error ?? 'Could not connect to OBS'
    }
    const proc = await window.api.obs.getProcessState().catch(() => null)
    if (proc) obsProcessRunning.value = proc.processRunning
  } catch (e) {
    obsError.value = e instanceof Error ? e.message : 'Could not connect to OBS'
  } finally {
    obsConnecting.value = false
  }
}

async function launchObsFromBanner() {
  obsConnecting.value = true
  obsError.value = null
  try {
    const result = await window.api.obs.launchAndConnect()
    if (result.ok) {
      obsConnected.value = true
      obsError.value = null
    } else {
      obsError.value = result.error ?? 'Could not launch or connect to OBS'
    }
    const proc = await window.api.obs.getProcessState().catch(() => null)
    if (proc) obsProcessRunning.value = proc.processRunning
  } catch (e) {
    obsError.value = e instanceof Error ? e.message : 'Could not launch OBS'
  } finally {
    obsConnecting.value = false
  }
}

function openObsSettings() {
  router.push({ path: '/settings', query: { tab: 'recording' } }).catch(() => {})
}

function handleOnboardingComplete() {
  showOnboarding.value = false
  window.api.obs.getStatus()
    .then((obs) => { obsConnected.value = obs.connected })
    .catch(() => {})
  router.push('/dashboard').catch(() => {})
}
</script>


<style scoped>
.update-banner-enter-active,
.update-banner-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.update-banner-enter-from,
.update-banner-leave-to {
  max-height: 0;
  opacity: 0;
}
.update-banner-enter-to,
.update-banner-leave-from {
  max-height: 40px;
  opacity: 1;
}

.busy-bar-enter-active,
.busy-bar-leave-active {
  transition: opacity 0.2s ease;
}

.busy-bar-enter-from,
.busy-bar-leave-to {
  opacity: 0;
}

.drag-region {
  -webkit-app-region: drag;
}

.-webkit-no-drag {
  -webkit-app-region: no-drag;
}

@keyframes busy-shimmer {
  0% { background-position: 200% 50%; }
  100% { background-position: 0% 50%; }
}
</style>
