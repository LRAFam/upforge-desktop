<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePrimaryGame } from '../composables/usePrimaryGame'
import { useRosterHubBadge } from '../composables/useRosterHubBadge'
import { gameNavRoutes } from '../lib/game-modules'
import { resolveUnauthenticatedRoute } from '../lib/onboarding-gate'
import {
  analysesLeftSidebarLabel,
  analysesLeftSidebarTone,
} from '../lib/quota-display'
import { resolveSettingsCategory } from '../lib/settings-nav'
import { WEB_SIDEBAR_LINKS, openWebFeature } from '../lib/web-explore-links'
import type { ProfileData } from '../env.d.ts'
import upforgeIcon from '../assets/upforge-icon.webp'

const route = useRoute()
const router = useRouter()
const { primaryGame } = usePrimaryGame()
const { pendingReviewCount, setPendingReviewCount } = useRosterHubBadge()

const profileUser = ref<ProfileData['user'] | null>(null)
const signingOut = ref(false)

const displayName = computed(() =>
  profileUser.value?.name?.trim()
  || profileUser.value?.email?.trim()
  || 'Account',
)

const analysesLine = computed(() =>
  analysesLeftSidebarLabel(
    profileUser.value?.analysis_stats?.total,
    profileUser.value?.analysis_stats?.limit,
  ),
)

const analysesTone = computed(() =>
  analysesLeftSidebarTone(
    profileUser.value?.analysis_stats?.total,
    profileUser.value?.analysis_stats?.limit,
  ),
)

const analysesToneClass = computed(() => {
  switch (analysesTone.value) {
    case 'empty':
      return 'text-red-400'
    case 'low':
      return 'text-amber-400'
    default:
      return 'text-gray-500'
  }
})

interface NavItem {
  to: string
  label: string
  icon: 'home' | 'analytics' | 'drills' | 'demos' | 'matches' | 'cross' | 'recordings' | 'rosters'
  match?: (path: string) => boolean
}

const mainNav: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: 'home', match: p => p === '/dashboard' },
  { to: '/stats', label: 'Analytics', icon: 'analytics', match: p => p === '/stats' || p === '/performance' },
  { to: '/training', label: 'Drills', icon: 'drills', match: p => p.startsWith('/training') },
  { to: '/history', label: 'Matches', icon: 'matches', match: p => p === '/history' },
  { to: '/recordings', label: 'Recordings', icon: 'recordings', match: p => p === '/recordings' || p === '/vod-review' },
  { to: '/clips', label: 'Clips', icon: 'demos', match: p => p === '/clips' },
  { to: '/rosters', label: 'Rosters', icon: 'rosters', match: p => p === '/rosters' },
  { to: '/squad', label: 'Squad', icon: 'cross', match: p => p.startsWith('/squad') },
]

const visibleMainNav = computed(() => {
  const allowed = new Set(gameNavRoutes(primaryGame.value))
  return mainNav.filter(item => allowed.has(item.to))
})

const settingsActive = computed(() => {
  if (route.path !== '/settings') return false
  const tab = resolveSettingsCategory(route.query.tab)
  return tab !== 'account'
})

const accountActive = computed(() => {
  if (route.path !== '/settings') return false
  return resolveSettingsCategory(route.query.tab) === 'account'
})

function isActive(item: NavItem): boolean {
  if (item.match) return item.match(route.path)
  return route.path === item.to
}

function openWeb(path: string, embed: boolean) {
  void openWebFeature(path, embed)
}

function badgeFor(item: NavItem): number | null {
  if (item.to !== '/rosters') return null
  return pendingReviewCount.value > 0 ? pendingReviewCount.value : null
}

async function refreshAccount() {
  const p = await window.api.profile.get().catch(() => null)
  profileUser.value = p?.user ?? null
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefreshAccount() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refreshAccount()
  }, 400)
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await window.api.auth.logout()
    try {
      const s = await window.api.settings.get()
      await router.push(resolveUnauthenticatedRoute(s))
    } catch {
      await router.push('/login')
    }
  } finally {
    signingOut.value = false
  }
}

function openAccount() {
  router.push({ path: '/settings', query: { tab: 'account' } }).catch(() => {})
}

function openSettings() {
  router.push({ path: '/settings', query: { tab: 'recording' } }).catch(() => {})
}

const ipcCleanups: Array<() => void> = []

onMounted(() => {
  void refreshAccount()

  const on = window.api?.on
  if (on) {
    ipcCleanups.push(on('dashboard:refresh', () => { scheduleRefreshAccount() }))
    ipcCleanups.push(on('recordings:updated', () => { scheduleRefreshAccount() }))
  }

  if (!window.api?.coach?.getStudentHub) return
  void Promise.all([
    window.api.coach.getStudentHub().catch(() => null),
    window.api.coach.getReviewRequests?.().catch(() => []),
  ]).then(([hub, requests]) => {
    const student = hub?.stats?.pending_reviews ?? 0
    const coach = Array.isArray(requests)
      ? requests.filter((r) => {
          const status = (r as { status?: string }).status
          return status === 'pending' || status === 'in_progress'
        }).length
      : 0
    setPendingReviewCount(student + coach)
  })
})

onUnmounted(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  for (const off of ipcCleanups) off()
})
</script>

<template>
  <aside class="app-sidebar flex flex-col flex-shrink-0 w-[168px] border-r border-white/[0.08] bg-[#0f0f0f]/95">
    <div class="flex items-center justify-center px-4 py-4 border-b border-white/[0.06]">
      <img :src="upforgeIcon" alt="UpForge" class="h-10 w-10 object-contain rounded-xl" />
    </div>

    <nav class="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scroll-col">
      <RouterLink
        v-for="item in visibleMainNav"
        :key="`${item.to}-${item.label}`"
        :to="item.to"
        class="sidebar-link group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors"
        :class="isActive(item) ? 'text-white bg-red-500/[0.08]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'"
      >
        <span
          v-if="isActive(item)"
          class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-red-500"
        />
        <span class="flex h-5 w-5 flex-shrink-0 items-center justify-center opacity-80">
          <svg v-if="item.icon === 'home'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          <svg v-else-if="item.icon === 'analytics'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          <svg v-else-if="item.icon === 'drills'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-width="1.75"/><circle cx="12" cy="12" r="2" stroke-width="1.75"/><path stroke-linecap="round" stroke-width="1.75" d="M12 4V2M12 22v-2M4 12H2M22 12h-2"/></svg>
          <svg v-else-if="item.icon === 'demos'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6H16a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          <svg v-else-if="item.icon === 'matches'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <svg v-else-if="item.icon === 'recordings'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          <svg v-else-if="item.icon === 'rosters'" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 20v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM23 20v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <svg v-else class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
        </span>
        <span class="truncate flex-1">{{ item.label }}</span>
        <span
          v-if="badgeFor(item)"
          class="ml-auto min-w-[18px] h-[18px] px-1 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold tabular-nums flex items-center justify-center border border-amber-500/30"
        >
          {{ badgeFor(item) }}
        </span>
      </RouterLink>

      <div class="pt-3 mt-2 border-t border-white/[0.06]">
        <p class="px-3 mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gray-600">On the web</p>
        <button
          v-for="link in WEB_SIDEBAR_LINKS"
          :key="link.path"
          type="button"
          class="sidebar-link w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-violet-300/80 hover:text-violet-200 hover:bg-violet-500/[0.08] transition-colors text-left"
          @click="openWeb(link.path, link.embed)"
        >
          <svg class="h-4 w-4 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
          </svg>
          <span class="truncate">{{ link.label }}</span>
        </button>
      </div>
    </nav>

    <div class="px-2 py-3 border-t border-white/[0.06] space-y-2">
      <button
        type="button"
        class="sidebar-link w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors text-left"
        :class="settingsActive ? 'text-gray-300 bg-white/[0.04]' : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'"
        @click="openSettings"
      >
        <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        Settings
      </button>

      <div
        class="rounded-lg border px-2.5 py-2"
        :class="accountActive ? 'border-white/[0.12] bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'"
      >
        <button
          type="button"
          class="w-full text-left min-w-0 rounded-md hover:bg-white/[0.03] -mx-0.5 px-0.5 py-0.5 transition-colors"
          @click="openAccount"
        >
          <p class="truncate text-[11px] font-semibold text-gray-200">{{ displayName }}</p>
          <p class="truncate text-[10px] tabular-nums mt-0.5" :class="analysesToneClass">{{ analysesLine }}</p>
        </button>
        <button
          type="button"
          class="mt-2 w-full rounded-md px-2 py-1.5 text-[10px] font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
          :disabled="signingOut"
          @click.stop="signOut"
        >
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  box-shadow: 1px 0 0 rgba(255, 255, 255, 0.03);
}
</style>
