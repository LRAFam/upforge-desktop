<script setup lang="ts">
/**
 * UI v3 sidebar (board A · Feature map):
 * Coach · Matches (footage, clips, reviews) · Practice · Progress · Coaches · Students · Squad · Settings.
 * Coaches = getting coached by a person (/rosters, everyone). Students = coaching others (/students,
 * only accounts with a coach profile). Squad = the paid team plan (/squad, members only).
 * They are different features; never merge them. The nav doesn't change with the game: Practice,
 * Progress and Squad stay for every game (see v3AllowedRoutes).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { gameNavRoutes } from '../../lib/game-modules'
import { v3AllowedRoutes } from '../../lib/shell-v3'
import { analysesLeftSidebarLabel } from '../../lib/quota-display'
import { readCache, writeCache } from '../../lib/stale-cache'
import type { ProfileData } from '../../env.d.ts'
import UfIcon from './UfIcon.vue'
import WebLinksMenuV3 from './shell/WebLinksMenuV3.vue'
// Human coaching: one badge per job (Coaches = notes ready for you, Students = matches waiting for your notes).
import { useCoachBadges } from './roster-flow/useCoachBadges'
import { useCoachReplyWatch } from './roster-flow/useCoachReplyWatch'
import { showStudentsNav } from './roster-flow/roster-flow'
import type { UfIconName } from './uf-icons'

const route = useRoute()
const router = useRouter()
const { primaryGame } = usePrimaryGame()
// One cached source for the plan line, so it doesn't flicker or differ between screens.
const profileUser = ref<ProfileData['user'] | null>(readCache<ProfileData['user']>('sidebar:user')?.value ?? null)
const devMode = ref(false)
const { notesReady, needsNotes, coachProfile } = useCoachBadges()
useCoachReplyWatch()

interface Item { to: string; label: string; icon: UfIconName; match: (p: string) => boolean; needs?: string }
const items: Item[] = [
  { to: '/dashboard', label: 'Coach', icon: 'home', match: p => p === '/dashboard' },
  { to: '/recordings', label: 'Matches', icon: 'matches', match: p => ['/recordings', '/matches', '/history', '/vod-review', '/clips'].includes(p) },
  { to: '/training', label: 'Practice', icon: 'practice', match: p => p.startsWith('/training'), needs: '/training' },
  { to: '/stats', label: 'Progress', icon: 'progress', match: p => p === '/stats' },
  { to: '/rosters', label: 'Coaches', icon: 'chat', match: p => p === '/rosters' },
  { to: '/students', label: 'Students', icon: 'list', match: p => p === '/students' },
  { to: '/squad', label: 'Squad', icon: 'team', match: p => p.startsWith('/squad'), needs: '/squad' },
]
// Squad is a paid team plan: only members see it in the nav (non-members find it in Settings › Account).
const squadMember = ref<boolean>(readCache<boolean>('sidebar:squad-member')?.value ?? false)
const visible = computed(() => {
  const allowed = new Set(v3AllowedRoutes(gameNavRoutes(primaryGame.value)))
  return items.filter(i => (!i.needs || allowed.has(i.needs))
    && (i.to !== '/squad' || squadMember.value)
    && (i.to !== '/students' || showStudentsNav(coachProfile.value)))
})
function badge(to: string): number {
  if (to === '/rosters') return notesReady.value
  if (to === '/students') return needsNotes.value
  return 0
}
// Performance (PC booster) and cloud storage are settings-like tools, so they light up Settings.
const settingsOn = computed(() => ['/settings', '/performance', '/cloud-storage'].includes(route.path))
const planLine = computed(() => {
  const u = profileUser.value
  if (!u) return ''
  const tier = (u?.tier ?? 'free').toString()
  const name = tier === 'premium' ? 'Plus' : tier.charAt(0).toUpperCase() + tier.slice(1)
  return `${name} · ${analysesLeftSidebarLabel(u?.analysis_stats?.total, u?.analysis_stats?.limit)}`
})

function go(to: string, ev?: MouseEvent) {
  // Drop mouse focus so the clicked item doesn't keep a second "selected" ring after navigating.
  if (ev?.detail) (ev.currentTarget as HTMLElement | null)?.blur()
  router.push(to).catch(() => {})
}

onMounted(async () => {
  const [p, s, squad] = await Promise.all([
    window.api?.profile?.get().catch(() => null),
    window.api?.settings?.get().catch(() => null),
    window.api?.squad?.getTeam().catch(() => undefined),
  ])
  // Only a definite answer changes membership; a failed call keeps the cached value.
  if (squad !== undefined) { squadMember.value = !!squad?.team; writeCache('sidebar:squad-member', squadMember.value) }
  // A failed refresh keeps the last known plan instead of falling back to "Free · Usage unavailable".
  if (p?.user) { profileUser.value = p.user; writeCache('sidebar:user', p.user) }
  devMode.value = !!(s as { devModeEnabled?: boolean } | null)?.devModeEnabled
})

// Show or hide Developer as soon as dev mode is toggled in Settings, without a restart.
const stopSettingsWatch = window.api?.on?.('settings:changed', (...args: unknown[]) => {
  const s = args[0] as { devModeEnabled?: boolean } | undefined
  if (typeof s?.devModeEnabled === 'boolean') devMode.value = s.devModeEnabled
})
onUnmounted(() => { if (typeof stopSettingsWatch === 'function') stopSettingsWatch() })
</script>

<template>
  <nav class="uf-side" aria-label="Main">
    <button v-for="i in visible" :key="i.to" type="button" class="uf-side-item" :class="{ 'is-on': i.match(route.path) }"
      :aria-current="i.match(route.path) ? 'page' : undefined" @click="go(i.to, $event)">
      <UfIcon :name="i.icon" :size="17" />{{ i.label }}
      <span v-if="badge(i.to) > 0" class="uf-side-badge" :aria-label="i.to === '/students' ? `${badge(i.to)} need your notes` : `${badge(i.to)} with new notes`">{{ badge(i.to) }}</span>
    </button>
    <div style="margin-top: auto" />
    <!-- Web-only features for the current game (roadmap, lineups, guides…): one quiet menu. -->
    <WebLinksMenuV3 />
    <button v-if="devMode" type="button" class="uf-side-item" :class="{ 'is-on': route.path === '/dev' }" @click="go('/dev')">
      <UfIcon name="spark" :size="17" />Developer
    </button>
    <button v-if="devMode" type="button" class="uf-side-item" :class="{ 'is-on': route.path === '/overstep' }" @click="go('/overstep')">
      <UfIcon name="spark" :size="17" />Overstep
    </button>
    <button type="button" class="uf-side-item" :class="{ 'is-on': settingsOn }" @click="go('/settings', $event)">
      <UfIcon name="settings" :size="17" />Settings
    </button>
    <p v-if="planLine" class="uf-side-plan">{{ planLine }}</p>
  </nav>
</template>

<style scoped>
.uf-side { width: 188px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 14px 0; background: var(--uf-chrome); border-right: 1px solid var(--uf-line); }
.uf-side-item { display: flex; align-items: center; gap: 12px; height: 38px; padding: 0 16px; background: none; border: 0; color: var(--uf-muted); font: 500 15px/1 var(--uf-body); cursor: pointer; text-align: left; }
.uf-side-item:hover { color: var(--uf-bone); background: var(--uf-hover); }
.uf-side-item.is-on { color: var(--uf-bone); font-weight: 600; box-shadow: inset 2px 0 0 var(--uf-red); }
.uf-side-plan { margin: 0; padding: 10px 16px 4px; font-size: 12px; line-height: 1.5; color: var(--uf-faint); }
.uf-side-badge { margin-left: auto; min-width: 18px; padding: 2px 5px; background: var(--uf-bone); color: var(--uf-bg); font: 600 12px/1 var(--uf-body); text-align: center; border-radius: 1px; }
</style>
