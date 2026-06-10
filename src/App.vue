<template>
  <div class="relative h-screen bg-[#111111] text-white flex flex-col overflow-hidden select-none">
    <!-- Subtle branded background texture -->
    <img src="./assets/upforge-bg.webp" alt="" class="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-[0.045] select-none" />
    <Transition name="busy-bar">
      <div v-if="busyActive" class="pointer-events-none absolute inset-x-0 top-0 z-50 h-[2px] bg-white/[0.04]">
        <div
          class="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-red-500 bg-[length:200%_100%] animate-[busy-shimmer_1.2s_linear_infinite] shadow-[0_0_14px_rgba(239,68,68,0.45)] transition-all duration-300"
          :style="{ width: `${busyBarWidth}%` }"
        />
      </div>
    </Transition>

    <!-- Title bar -->
    <div
      v-if="showTitleBar"
      class="drag-region relative flex items-center justify-between flex-shrink-0 px-3 border-b border-white/[0.09] bg-[#161616]/95 backdrop-blur-xl"
      :style="isMac ? 'height:44px; padding-left:80px' : 'height:44px'"
    >
      <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/70 to-orange-500/70" />
      <div class="flex items-center gap-2.5">
        <!-- Logo with red glow halo -->
        <div class="relative flex-shrink-0">
          <div class="absolute inset-0 rounded-full bg-red-500/25 blur-md scale-150 pointer-events-none" />
          <img src="./assets/upforge-logo.png" alt="UpForge" class="relative h-5 w-auto object-contain" />
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
      <div v-if="riotId && !isMac && !isPostGameRoute" class="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
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

    <!-- Update banner (download progress + ready to install) -->
    <Transition name="update-banner">
      <div
        v-if="appUpdatePhase === 'available' || appUpdatePhase === 'downloading' || appUpdatePhase === 'ready'"
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
          <span class="text-amber-100/90 truncate" :title="obsError ?? undefined">
            {{ obsError || 'OBS not connected — matches won\'t record until you set it up.' }}
          </span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            :disabled="obsConnecting"
            class="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors font-medium disabled:opacity-50"
            @click="connectObsFromBanner"
          >{{ obsConnecting ? 'Connecting…' : 'Connect OBS' }}</button>
          <button
            class="px-2.5 py-1 rounded-lg border border-white/[0.10] bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors font-medium"
            @click="openObsSettings"
          >Settings</button>
        </div>
      </div>
    </Transition>

    <!-- Navigation (hidden on post-game / login) -->
    <nav
      v-if="showNav"
      class="relative flex items-center gap-2 px-3 py-1.5 flex-shrink-0 border-b border-white/[0.09] bg-[#161616]/90 backdrop-blur-md"
    >
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
      <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide">
        <RouterLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="relative flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-all duration-150"
          :class="
            $route.path === link.to
              ? 'text-white bg-red-500/[0.10] shadow-[inset_0_0_0_1px_rgba(255,70,85,0.22)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
          "
        >
          <component :is="'svg'" class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-html="link.iconPath" />
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span>{{ link.label }}</span>
            <span v-if="link.to === '/clips' && clipCountAvailable && clipCount > 0" class="inline-flex min-w-[18px] items-center justify-center rounded-full border border-red-500/20 bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-300">{{ clipCount }}</span>
            <span v-else-if="link.to === '/clips' && hasClipIndicator" class="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
          </span>
        </RouterLink>
      </div>

      <div class="flex flex-shrink-0 items-center gap-2 border-l border-white/[0.10] pl-2">
        <RouterLink
          v-if="devNavLink"
          :to="devNavLink.to"
          class="rounded-lg px-2.5 py-2 text-[11px] font-medium transition-all duration-150"
          :class="
            $route.path === devNavLink.to
              ? 'text-amber-300 bg-amber-500/10'
              : 'text-amber-600 hover:text-amber-400 hover:bg-white/[0.03]'
          "
        >
          {{ devNavLink.label }}
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
          title="Account settings"
        >
          <div class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-red-500/20">
            <img v-if="userAvatarUrl" :src="userAvatarUrl" :alt="userDisplayName" class="h-full w-full object-cover" @error="userAvatarUrl = ''" />
            <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-red-500/25 to-orange-500/20 text-[10px] font-bold text-red-300">{{ userInitial }}</div>
          </div>
          <div class="hidden sm:flex flex-col leading-none">
            <span class="text-[10px] font-semibold text-gray-300 truncate max-w-[120px]">{{ userDisplayName }}</span>
            <span class="text-[9px] text-gray-600">Settings</span>
          </div>
        </RouterLink>
      </div>
    </nav>

    <!-- Content — key forces remount when the signed-in account changes -->
    <main
      class="main-content flex-1 min-h-0"
      :class="isVodReviewRoute ? 'overflow-hidden' : 'overflow-y-auto'"
    >
      <RouterView :key="sessionUserKey" />
    </main>

    <!-- First-run onboarding wizard -->
    <OnboardingWizard
      v-if="showOnboarding"
      :already-completed="onboardingWasComplete"
      @complete="handleOnboardingComplete"
    />

    <!-- Achievement toast manager -->
    <AchievementManager />

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
import OnboardingWizard from './components/OnboardingWizard.vue'
import AchievementManager from './components/AchievementManager.vue'
import type { ClipRecord, ProfileData } from './env.d.ts'

const route = useRoute()
const router = useRouter()

const isMac = navigator.platform.toUpperCase().includes('MAC')
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
/** Bumps on login/logout/account switch so route views reload user-scoped data. */
const sessionUserKey = ref('guest')

const showObsBanner = computed(() =>
  showNav.value &&
  route.path !== '/vod-review' &&
  !showOnboarding.value &&
  obsConnected.value === false &&
  !status.value.recording
)

const showTitleBar = computed(() =>
  route.path !== '/overlay' && route.path !== '/splash'
)

const isPostGameRoute = computed(() => route.path.startsWith('/post-game'))
const isVodReviewRoute = computed(() => route.path === '/vod-review')

const showNav = computed(() =>
  !route.path.startsWith('/post-game') &&
  route.path !== '/login' &&
  route.path !== '/welcome' &&
  route.path !== '/splash' &&
  route.path !== '/overlay'
)

const navLinks = [
  { to: '/dashboard', label: 'Dashboard', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>' },
  { to: '/training', label: 'Training', iconPath: '<circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/>' },
  { to: '/clips', label: 'Clips', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>' },
  { to: '/squad', label: 'Squad', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>' },
  { to: '/stats', label: 'Stats', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>' },
  { to: '/history', label: 'History', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
  { to: '/performance', label: 'Performance', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>' },
  { to: '/settings', label: 'Settings', iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' },
]

const devNavLink = computed(() =>
  (isAdmin.value || devModeEnabled.value) ? { to: '/dev', label: 'Developer' } : null
)

const appUpdatePhase = ref<string>('idle')
const appUpdateVersion = ref<string | undefined>(undefined)
const appUpdatePercent = ref(0)
let statusInterval: ReturnType<typeof setInterval> | null = null
let navBusyTimer: ReturnType<typeof setTimeout> | null = null

const userDisplayName = computed(() => riotId.value || userName.value || 'UpForge User')
const userInitial = computed(() => userDisplayName.value.trim().charAt(0).toUpperCase() || 'U')

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
    const clips = await window.api.clips.get() as ClipRecord[]
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

router.afterEach(() => {
  if (navBusyTimer) clearTimeout(navBusyTimer)
  navBusyTimer = setTimeout(() => { isNavigating.value = false }, 220)
  loadClipSummary().catch(() => {})
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
    devModeEnabled.value = settings.devModeEnabled ?? false
    if (!settings.onboardingComplete && settings.firstRun === false) {
      showOnboarding.value = true
    } else {
      onboardingWasComplete.value = true
    }
  } catch { /* ignore */ }

  await Promise.all([loadClipSummary(), loadUserProfile()])
  const initialUserId = (status.value as { user?: { id?: number } }).user?.id
  sessionUserKey.value = initialUserId != null ? `user-${initialUserId}` : 'guest'

  try {
    const obs = await window.api.obs.getStatus()
    obsConnected.value = obs.connected
    if (!obs.connected && obs.lastError) obsError.value = obs.lastError
  } catch { /* ignore */ }

  const obsCleanup = window.api.on('obs:connection-changed', (...args: unknown[]) => {
    const data = args[0] as { connected?: boolean; error?: string | null } | undefined
    if (data && typeof data.connected === 'boolean') {
      obsConnected.value = data.connected
      obsConnecting.value = false
      obsError.value = data.connected ? null : (data.error ?? obsError.value)
    }
  })
  ;(window as Window & { _obsCleanup?: () => void })._obsCleanup = obsCleanup

  // Hydrate update state and listen for live updates
  try {
    const us = await window.api.updater.getState()
    appUpdatePhase.value = us.phase
    appUpdateVersion.value = us.version
    appUpdatePercent.value = us.percent ?? 0
  } catch { /* ignore */ }
  const updaterCleanups = [
    window.api.on('updater:checking', () => { appUpdatePhase.value = 'checking' }),
    window.api.on('updater:available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      appUpdatePhase.value = 'available'
      appUpdateVersion.value = info?.version
    }),
    window.api.on('updater:progress', (...args: unknown[]) => {
      appUpdatePhase.value = 'downloading'
      appUpdatePercent.value = typeof args[0] === 'number' ? args[0] : 0
    }),
    window.api.on('updater:downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      appUpdatePhase.value = 'ready'
      appUpdateVersion.value = info?.version
    }),
    window.api.on('updater:not-available', () => { appUpdatePhase.value = 'idle' }),
    window.api.on('updater:error', () => { appUpdatePhase.value = 'idle' }),
  ]
  ;(window as Window & { _updaterCleanups?: (() => void)[] })._updaterCleanups = updaterCleanups

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
      if (s.user?.name) userName.value = s.user.name
      if (s.user?.is_admin) isAdmin.value = true
    } catch { /* ignore */ }
  }, 5000)

  const clipsCleanup = window.api.on('clips:new', async (...args: unknown[]) => {
    const clipIds = args[0] as string[] | undefined
    hasClipIndicator.value = (clipIds?.length ?? 0) > 0 || hasClipIndicator.value
    await loadClipSummary()
  })
  ;(window as Window & { _clipsCleanup?: () => void })._clipsCleanup = clipsCleanup

  const sessionCleanup = window.api.on('session:user-changed', (...args: unknown[]) => {
    const payload = args[0] as { userId?: number | null } | undefined
    void applySessionUser(payload?.userId ?? null)
  })
  ;(window as Window & { _sessionCleanup?: () => void })._sessionCleanup = sessionCleanup

  const authExpiredCleanup = window.api.on('auth:session-expired', () => {
    void applySessionUser(null)
    router.push('/login').catch(() => {})
  })
  ;(window as Window & { _authExpiredCleanup?: () => void })._authExpiredCleanup = authExpiredCleanup

  // Navigate to a tab when the main process requests it (e.g. from post-game "View Clips" button)
  const navCleanup = window.api.on('app:navigate', (...args: unknown[]) => {
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
  window.api.window.openPostGame?.()
}

function closeWindow() {
  window.api.window.close()
}

function minimizeWindow() {
  window.api.window.minimize()
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
  } catch (e) {
    obsError.value = e instanceof Error ? e.message : 'Could not connect to OBS'
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
