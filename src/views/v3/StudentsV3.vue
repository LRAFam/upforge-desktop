<script setup lang="ts">
/**
 * Students (UI v3): coaching others — only for accounts with a coach profile (the nav item is
 * hidden for everyone else; a direct visit by a non-coach goes to Coaches). Owns the coach-side
 * `useCoachRoster` instance and renders CoachRosterV3. Getting coached stays on Coaches (/rosters).
 * Not Squad. Refreshes on focus and every minute while visible; no refresh button.
 */
import { onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CoachRosterV3 from '../../components/v3/coaches/CoachRosterV3.vue'
import { coachRosterKey, useCoachRoster } from '../../components/rosters/useCoachRoster'
import { useCoachBadges } from '../../components/v3/roster-flow/useCoachBadges'

const router = useRouter()
const { setNeedsNotes, setCoachProfile } = useCoachBadges()
const toast = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function flashToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3200)
}

const roster = useCoachRoster({ active: true }, ((e: 'loaded' | 'toast', payload: { pendingCount: number } | string) => {
  if (e === 'toast') flashToast(payload as string)
  else setNeedsNotes((payload as { pendingCount: number }).pendingCount)
}) as Parameters<typeof useCoachRoster>[1])
provide(coachRosterKey, roster)

// A clean "no coach profile" answer: hide Students and show Coaches instead.
watch(roster.noCoach, (none) => {
  if (!none) { setCoachProfile(true); return }
  setCoachProfile(false)
  router.replace('/rosters').catch(() => {})
})
watch(() => roster.settings.value, (s) => { if (s) setCoachProfile(true) })

const POLL_MS = 60_000
onMounted(() => {
  const onFocus = () => { if (!roster.loading.value) void roster.load() }
  window.addEventListener('focus', onFocus)
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible' && !roster.loading.value && !roster.saving.value) void roster.load()
  }, POLL_MS)
  onUnmounted(() => {
    clearInterval(poll)
    window.removeEventListener('focus', onFocus)
    if (toastTimer) clearTimeout(toastTimer)
  })
})
</script>

<template>
  <div class="uf-students">
    <div class="uf-students-pad">
      <CoachRosterV3 />
    </div>
    <Transition name="uf-toast">
      <div v-if="toast" class="uf-toast" role="status"><span class="uf-dot" />{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.uf-students { position: relative; height: 100%; overflow-y: auto; background: var(--uf-bg); }
.uf-students-pad { padding: 22px 40px 40px; }
.uf-toast { position: fixed; right: 24px; bottom: 24px; z-index: 90; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--uf-raised); border-left: 2px solid var(--uf-win); color: var(--uf-bone); font: 600 15px/1 var(--uf-body); pointer-events: none; }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--uf-win); }
.uf-toast-enter-active, .uf-toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.uf-toast-enter-from, .uf-toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) { .uf-toast-enter-active, .uf-toast-leave-active { transition: none; } }
</style>
