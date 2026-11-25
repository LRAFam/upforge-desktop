<script setup lang="ts">
/**
 * Title-bar notifications inbox (v3): bell + unread count + a short list.
 * Reads the coach poller's cached /api/notifications answer over IPC (no extra API calls).
 * Clicking an item marks it read and opens it in the app or on upforge.gg (see inboxTarget).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UfIcon from '../UfIcon.vue'
import { groupInbox, inboxAge, inboxDisplay, inboxTarget, type InboxGroup, type InboxSnapshot } from './notification-inbox'
import { openWebFeature } from '../../../lib/web-explore-links'
import { openAnalysisInApp } from '../../../lib/open-analysis-in-app'

const router = useRouter()
const snap = ref<InboxSnapshot | null>(null)
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

async function refresh(): Promise<void> {
  try {
    const next = await window.api?.notifications?.inbox()
    if (next !== undefined) snap.value = next
  } catch { /* keep the last answer */ }
  now.value = Date.now()
}

// Repeats of the same event show once with a count; each row names its match (see inboxDisplay).
const groups = computed(() => groupInbox(snap.value?.items ?? []))

function markLocally(ids: readonly number[]): void {
  if (!snap.value) return
  const set = new Set(ids)
  const newlyRead = snap.value.items.filter(n => set.has(n.id) && !n.read).length
  snap.value = {
    ...snap.value,
    unreadCount: Math.max(0, snap.value.unreadCount - newlyRead),
    items: snap.value.items.map(n => (set.has(n.id) ? { ...n, read: true } : n)),
  }
}

async function openItem(group: InboxGroup): Promise<void> {
  open.value = false
  const item = group.item
  const unreadIds = group.ids.filter(id => snap.value?.items.some(n => n.id === id && !n.read))
  if (unreadIds.length) {
    void Promise.all(unreadIds.map(id => window.api.notifications.markRead(id))).then(() => refresh()).catch(() => null)
    markLocally(unreadIds)
  }
  const target = inboxTarget(item)
  if (target?.kind === 'app') await router.push({ path: target.path, query: target.query }).catch(() => {})
  else if (target?.kind === 'analysis') await openAnalysisInApp(router, target.analysisId, { source: 'desktop_bell' })
  else if (target?.kind === 'web') await openWebFeature(target.path)
}

const markingAll = ref(false)
async function markAllRead(): Promise<void> {
  if (!snap.value?.unreadCount || markingAll.value) return
  markingAll.value = true
  try {
    const res = await window.api.notifications.markAllRead().catch(() => null)
    // Clears unread beyond the listed 20 too.
    if (res?.ok && snap.value) snap.value = { ...snap.value, unreadCount: 0, items: snap.value.items.map(n => ({ ...n, read: true })) }
  } finally {
    markingAll.value = false
    void refresh()
  }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void refresh()
}
function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') open.value = false }
function onDown(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => {
  void refresh()
  // The poller updates its cache every minute; re-reading it is a cheap local IPC call.
  timer = setInterval(() => { void refresh() }, 60_000)
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousedown', onDown, true)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousedown', onDown, true)
})
</script>

<template>
  <div ref="root" class="uf-bell-wrap -webkit-no-drag">
    <button type="button" class="uf-bell" aria-haspopup="dialog" :aria-expanded="open"
      :aria-label="snap?.unreadCount ? `Notifications, ${snap.unreadCount} unread` : 'Notifications'" @click="toggle">
      <UfIcon name="bell" :size="16" />
      <span v-if="snap?.unreadCount" class="uf-bell-count">{{ snap.unreadCount > 9 ? '9+' : snap.unreadCount }}</span>
    </button>
    <div v-if="open" class="uf-bell-menu uf-rise" role="dialog" aria-label="Notifications">
      <div class="uf-bell-head">
        <p class="uf-label">Notifications<template v-if="snap?.unreadCount"> · {{ snap.unreadCount }} unread</template></p>
        <button v-if="snap?.unreadCount" type="button" class="uf-link uf-t4" :disabled="markingAll" @click="markAllRead">{{ markingAll ? 'Marking…' : 'Mark all read' }}</button>
      </div>
      <p v-if="!snap" class="uf-t4">Checking for notifications…</p>
      <p v-else-if="!snap.items.length" class="uf-t4">No notifications yet.</p>
      <ul v-else class="uf-bell-list">
        <li v-for="g in groups" :key="g.key">
          <button type="button" class="uf-bell-row" :class="{ 'is-unread': g.unread }" @click="openItem(g)">
            <span class="uf-bell-text">
              <span class="uf-t3"><span v-if="g.unread" class="uf-bell-sr">Unread: </span>{{ inboxDisplay(g.item, now).title }}<template v-if="g.count > 1"> ×{{ g.count }}</template></span>
              <span v-if="inboxDisplay(g.item, now).message" class="uf-t4">{{ inboxDisplay(g.item, now).message }}</span>
            </span>
            <span class="uf-t4 uf-bell-age">
              <span v-if="g.unread" class="uf-bell-new">New</span>
              {{ inboxAge(g.item.createdAt, now) }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.uf-bell-wrap { position: relative; align-self: stretch; display: flex; }
.uf-bell { position: relative; width: 36px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-muted); cursor: pointer; }
.uf-bell:hover, .uf-bell[aria-expanded='true'] { color: var(--uf-bone); background: var(--uf-hover); }
.uf-bell-count { position: absolute; top: 8px; right: 4px; min-width: 15px; padding: 2px 3px; background: var(--uf-red); color: #fff; font: 600 10px/1 var(--uf-body); text-align: center; border-radius: 1px; }
.uf-bell-menu { position: absolute; top: 44px; right: 0; width: 340px; max-height: 440px; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; background: var(--uf-bg); border: 1px solid var(--uf-line-2); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5); z-index: 40; }
.uf-bell-menu p { margin: 0; }
.uf-bell-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.uf-bell-row { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 9px 0 9px 10px; background: none; border: 0; border-top: 1px solid var(--uf-line); text-align: left; cursor: pointer; box-shadow: inset 2px 0 0 transparent; }
.uf-bell-row:hover { background: var(--uf-hover); }
.uf-bell-row.is-unread { box-shadow: inset 2px 0 0 var(--uf-red); }
.uf-bell-row:not(.is-unread) .uf-t3 { color: var(--uf-muted); }
.uf-bell-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uf-bell-text .uf-t4 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.uf-bell-age { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; color: var(--uf-faint); padding-right: 4px; }
.uf-bell-new { color: var(--uf-red); font-weight: 600; }
.uf-bell-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.uf-bell-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
