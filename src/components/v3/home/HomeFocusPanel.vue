<script setup lang="ts">
/** Focus column on Home: the one measured habit, its game slots and a manual "check my matches". */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { focusHeadline, focusSlots, focusSubline } from '../../../lib/focus'
import { createFocusCardState } from '../../../composables/useFocusCard'
import type { FocusResponse, FocusUpdate } from '../../../lib/focus'
import { readCache, writeCache } from '../../../lib/stale-cache'
import UfSkeleton from '../UfSkeleton.vue'
import { focusShareLine, focusStreak, focusStreakAchievements, focusStreakLine } from '../../../lib/ideas/focus-streak'
import { useAchievements } from '../../../composables/useAchievements'

const emit = defineEmits<{ latest: [FocusUpdate | null] }>()

const cached = readCache<FocusResponse>('focus')?.value ?? null
const state = createFocusCardState(window.api.app, { initial: cached?.success ? cached : null })
const fromSkeleton = !cached
const { data, loading, loadError, syncing, syncMessage, syncNow } = state
const focus = computed(() => data.value?.focus ?? null)
const slots = computed(() => (focus.value ? focusSlots(focus.value) : []))
const gameIndex = computed(() => Math.min((focus.value?.progress.games_played ?? 0) + 1, focus.value?.progress.games_required ?? 1))
const kicker = computed(() => {
  const f = focus.value
  if (!f) return 'Your focus'
  if (f.progress.status !== 'active') return `Focus · ${f.progress.status}`
  return `Focus · game ${gameIndex.value} of ${f.progress.games_required}`
})

// Focus streaks (P6): "3 games in a row on target", plus a badge through the existing achievements.
const streak = computed(() => focusStreak(focus.value))
const streakLine = computed(() => focusStreakLine(streak.value))
const achievements = useAchievements()
watch(streak, async (n) => {
  const ids = focusStreakAchievements(n)
  if (!ids.length) return
  await achievements.load()
  const fresh: string[] = []
  for (const id of ids) if (await achievements.unlock(id)) fresh.push(id)
  if (fresh.length) window.__ufAchievementUnlocked?.(fresh)
})

// "What I'm working on" (P6): copy the active focus as one line for LFG or Discord.
const shareLine = computed(() => focusShareLine(focus.value))
const copied = ref(false)
async function copyShare() {
  if (!shareLine.value) return
  try {
    await navigator.clipboard.writeText(shareLine.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* clipboard unavailable: the line stays visible in the title */ }
}

let off: (() => void) | null = null
onMounted(async () => {
  off = window.api.app.onFocusUpdated(payload => {
    state.applyUpdate(payload)
    emit('latest', payload)
    void state.load()
  })
  if (data.value) emit('latest', data.value.latest ?? null)
  await state.load()
  if (data.value?.success) writeCache('focus', data.value)
  emit('latest', data.value?.latest ?? null)
})
onUnmounted(() => {
  off?.()
  state.dispose()
})
</script>

<template>
  <section class="hf" aria-labelledby="hf-title">
    <p class="uf-label" :style="{ color: focus ? 'var(--uf-red)' : undefined }">{{ kicker }}</p>
    <template v-if="focus">
      <h2 id="hf-title" class="uf-d2 hf-title" :class="{ 'uf-reveal': fromSkeleton }">{{ focusHeadline(focus) }}</h2>
      <ol class="hf-slots" aria-label="Focus games">
        <li v-for="(s, i) in slots" :key="i" :class="`hf-slot hf-slot--${s}`"
          :aria-label="`Game ${i + 1}: ${s === 'pending' ? 'not played yet' : s === 'hit' ? 'target hit' : 'target missed'}`">
          <span class="uf-fill" :style="{ animationDelay: `${0.3 + i * 0.15}s` }" />
        </li>
      </ol>
      <p class="uf-t4 hf-sub">{{ focusSubline(focus) }}</p>
      <p v-if="streakLine" class="uf-t4 hf-streak" role="status">{{ streakLine }}</p>
      <button v-if="shareLine" type="button" class="uf-link hf-share" :title="shareLine" @click="copyShare">
        {{ copied ? 'Copied' : 'Copy what I\'m working on' }}
      </button>
    </template>
    <div v-else-if="loading" class="hf-skel" role="status" aria-label="Loading your focus">
      <UfSkeleton :w="220" :h="34" />
      <UfSkeleton :h="4" />
      <UfSkeleton :lines="2" />
    </div>
    <template v-else>
      <h2 id="hf-title" class="uf-t3">No focus yet</h2>
      <p class="uf-t4 hf-sub">With Valorant open, UpForge reads your recent matches and picks the habit costing you the most rounds. No recording needed.</p>
    </template>
    <p v-if="loadError && !data" class="uf-t4" role="alert">{{ loadError }}</p>
    <p v-else-if="loadError" class="uf-t4" role="status" style="color: var(--uf-faint)">Couldn't refresh your focus · showing the last one.</p>
    <div class="hf-sync">
      <button type="button" class="uf-link" :disabled="syncing" @click="syncNow()">{{ syncing ? 'Checking…' : 'Check my latest matches' }} </button>
      <span v-if="syncMessage" class="uf-t4" role="status">{{ syncMessage }}</span>
    </div>
  </section>
</template>

<style scoped>
.hf { display: flex; flex-direction: column; gap: 12px; }
.hf-title { margin: 0; }
.hf-streak { margin: 0; color: var(--uf-bone); font-weight: 600; }
.hf-share { align-self: flex-start; }
.hf-slots { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
.hf-slot { flex: 1; height: 4px; background: rgba(236, 232, 225, 0.12); }
.hf-slot > span { display: block; height: 4px; }
.hf-slot--hit > span { background: var(--uf-win); }
.hf-slot--miss > span { background: var(--uf-loss); }
.hf-sub { margin: 0; color: var(--uf-muted); line-height: 1.5; }
.hf-skel { display: flex; flex-direction: column; gap: 12px; }
.hf-sync { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
</style>
