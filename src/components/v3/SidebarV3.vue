<script setup lang="ts">
/**
 * UI v3 sidebar (board A · Feature map):
 * Coach · Matches (footage, clips, reviews) · Practice · Progress · Coaches · Squad · Settings.
 * Coaches = coach rosters (/rosters, every game). Squad = the paid team plan (/squad, members only,
 * Valorant only as shipped). They are different features; never merge them.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { gameNavRoutes } from '../../lib/game-modules'
import { analysesLeftSidebarLabel } from '../../lib/quota-display'
import { readCache, writeCache } from '../../lib/stale-cache'
import type { ProfileData } from '../../env.d.ts'
import UfIcon from './UfIcon.vue'
// Roster flow: Coaches badge (unopened coach replies + open coach requests) and coach-reply notifications.
import { useRosterHubBadge } from '../../composables/useRosterHubBadge'
import { useCoachReplyWatch } from './roster-flow/useCoachReplyWatch'
import type { UfIconName } from './uf-icons'

const route = useRoute()
const router = useRouter()
const { primaryGame } = usePrimaryGame()
// One cached source for the plan line, so it doesn't flicker or differ between screens.
const profileUser = ref<ProfileData['user'] | null>(readCache<ProfileData['user']>('sidebar:user')?.value ?? null)
const devMode = ref(false)
const { pendingReviewCount } = useRosterHubBadge()
useCoachReplyWatch()

interface Item { to: string; label: string; icon: UfIconName; match: (p: string) => boolean; needs?: string }
const items: Item[] = [
  { to: '/dashboard', label: 'Coach', icon: 'home', match: p => p === '/dashboard' },
  { to: '/recordings', label: 'Matches', icon: 'matches', match: p => ['/recordings', '/matches', '/history', '/vod-review', '/clips'].includes(p) },
  { to: '/training', label: 'Practice', icon: 'practice', match: p => p.startsWith('/training'), needs: '/training' },
  { to: '/stats', label: 'Progress', icon: 'progress', match: p => p === '/stats' },
  { to: '/rosters', label: 'Coaches', icon: 'chat', match: p => p === '/rosters' },
  { to: '/squad', label: 'Squad', icon: 'team', match: p => p.startsWith('/squad'), needs: '/squad' },
]
// Squad is a paid team plan: only members see it in the nav (non-members find it in Settings › Account).
const squadMember = ref<boolean>(readCache<boolean>('sidebar:squad-member')?.value ?? false)
const visible = computed(() => {
  const allowed = new Set(gameNavRoutes(primaryGame.value))
  return items.filter(i => (!i.needs || allowed.has(i.needs)) && (i.to !== '/squad' || squadMember.value))
})
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
</script>

<template>
  <nav class="uf-side" aria-label="Main">
    <button v-for="i in visible" :key="i.to" type="button" class="uf-side-item" :class="{ 'is-on': i.match(route.path) }"
      :aria-current="i.match(route.path) ? 'page' : undefined" @click="go(i.to, $event)">
      <UfIcon :name="i.icon" :size="17" />{{ i.label }}
      <span v-if="i.to === '/rosters' && pendingReviewCount > 0" class="uf-side-badge" :aria-label="`${pendingReviewCount} waiting`">{{ pendingReviewCount }}</span>
    </button>
    <div style="margin-top: auto" />
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
