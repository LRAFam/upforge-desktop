<script setup lang="ts">
/**
 * The focus loop on the dashboard: one measured habit, checked automatically after each
 * match from Riot match history (no recording needed), plus the latest coach notes.
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { focusHeadline, focusSlots, focusSubline, focusTransitionText, pct } from '../../lib/focus'
import { createFocusCardState } from '../../composables/useFocusCard'

const state = createFocusCardState(window.api.app)
const { data, loading, loadError, syncing, syncMessage, syncNow } = state
const latest = computed(() => data.value?.latest ?? null)

const focus = computed(() => data.value?.focus ?? null)
const notes = computed(() => latest.value?.report?.notes ?? null)
const transition = computed(() => focusTransitionText(latest.value))
const slots = computed(() => (focus.value ? focusSlots(focus.value) : []))
const trend = computed(() => {
  const key = focus.value?.metric
  if (!key) return []
  return (data.value?.history ?? []).map(h => h.metrics[key]).filter((v): v is number => typeof v === 'number').slice(-10)
})
const EVENT_LABELS: Record<string, string> = {
  created: 'New focus from your last match',
  checked: 'Checked against your last match',
  achieved: 'Focus achieved',
  missed: 'Focus missed',
}
const eventLabel = computed(() =>
  latest.value?.account?.is_main === false
    ? 'Alt-account game: coached, not counted for your focus'
    : EVENT_LABELS[latest.value?.focus_event ?? ''] ?? '')

let off: (() => void) | null = null
onMounted(() => {
  off = window.api.app.onFocusUpdated(payload => {
    state.applyUpdate(payload)
    void state.load()
  })
  void state.load()
})
onUnmounted(() => {
  off?.()
  state.dispose()
})
</script>

<template>
  <section class="focus-card" aria-labelledby="focus-title">
    <div class="focus-head">
      <p class="focus-kicker">Your focus</p>
      <span v-if="eventLabel" class="focus-event">{{ eventLabel }}</span>
    </div>

    <template v-if="focus">
      <h2 id="focus-title" class="focus-title">{{ focusHeadline(focus) }}</h2>
      <p class="focus-sub">{{ focusSubline(focus) }}</p>
      <p v-if="transition" class="focus-transition">{{ transition }}</p>

      <ol class="focus-slots" aria-label="Next games">
        <li v-for="(s, i) in slots" :key="i" :class="`slot slot--${s}`"
          :aria-label="`Game ${i + 1}: ${s === 'pending' ? 'not played yet' : s === 'hit' ? 'target hit' : 'target missed'}`">
          <span aria-hidden="true">{{ s === 'hit' ? '✓' : s === 'miss' ? '✕' : i + 1 }}</span>
          <small v-if="focus.checks[i]">{{ pct(focus.checks[i].value) }}</small>
        </li>
      </ol>

      <div v-if="trend.length > 1" class="focus-trend" aria-label="Recent matches">
        <span v-for="(v, i) in trend" :key="i" class="bar"
          :class="{ 'bar--ok': focus.better === 'lower' ? v <= focus.target : v >= focus.target }"
          :style="{ height: `${Math.max(8, Math.min(100, v * 100 * (focus.better === 'lower' ? 2 : 1)))}%` }"
          :title="pct(v)" />
        <span class="trend-target" :style="{ bottom: `${Math.min(100, focus.target * 100 * (focus.better === 'lower' ? 2 : 1))}%` }" />
      </div>

      <div v-if="notes?.headline || notes?.next_action" class="focus-notes">
        <p v-if="notes.headline" class="notes-headline">{{ notes.headline.text }}</p>
        <p v-if="notes.next_action" class="notes-next"><strong>Next game:</strong> {{ notes.next_action.text }}</p>
      </div>
      <p v-else class="focus-notes-empty">Coach notes aren’t available for this match.</p>
    </template>

    <h2 v-else-if="loading" id="focus-title" class="focus-title">Loading your focus…</h2>
    <h2 v-else-if="loadError" id="focus-title" class="focus-title">Your focus is temporarily unavailable</h2>
    <template v-else>
      <h2 id="focus-title" class="focus-title">Get your first focus, no recording needed</h2>
      <p class="focus-sub">With Valorant open, UpForge reads your recent matches, finds the habit costing you most rounds, and checks it after every game.</p>
    </template>

    <div class="focus-actions">
      <button type="button" class="btn-ghost" :disabled="syncing" @click="syncNow">
        {{ syncing ? 'Checking matches…' : 'Check my latest matches' }}
      </button>
      <span v-if="syncMessage" class="focus-msg" role="status">{{ syncMessage }}</span>
    </div>
    <p v-if="loadError" class="focus-msg" role="alert">{{ loadError }}</p>
  </section>
</template>

<style scoped>
.focus-card {
  padding: 16px 18px;
  border-radius: 12px;
  background: rgb(255 255 255 / 0.03);
  border: 1px solid rgb(255 255 255 / 0.08);
}
.focus-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.focus-kicker {
  font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #ff4655;
}
.focus-event { font-size: 11px; color: rgb(156 163 175); }
.focus-title { margin-top: 6px; font-size: 18px; font-weight: 900; color: #fff; line-height: 1.25; }
.focus-sub { margin-top: 4px; font-size: 13px; color: rgb(156 163 175); }
.focus-transition { margin-top: 6px; font-size: 12px; color: rgb(209 213 219); }
.focus-notes-empty { margin-top: 12px; font-size: 12px; color: rgb(156 163 175); }
.focus-slots { display: flex; gap: 8px; margin-top: 12px; }
.slot {
  display: grid; place-items: center; width: 52px; height: 44px; border-radius: 8px;
  font-weight: 900; font-size: 14px; border: 1px solid rgb(255 255 255 / 0.1); color: rgb(107 114 128);
}
.slot small { font-size: 10px; font-weight: 700; }
.slot--hit { background: rgb(58 214 195 / 0.15); border-color: rgb(58 214 195 / 0.5); color: #3ad6c3; }
.slot--miss { background: rgb(255 70 85 / 0.12); border-color: rgb(255 70 85 / 0.45); color: #ff4655; }
.focus-trend {
  position: relative; display: flex; align-items: flex-end; gap: 3px; height: 44px; margin-top: 12px;
}
.bar { flex: 1; max-width: 14px; border-radius: 2px 2px 0 0; background: rgb(255 70 85 / 0.6); }
.bar--ok { background: rgb(58 214 195 / 0.7); }
.trend-target { position: absolute; left: 0; right: 0; border-top: 1px dashed rgb(58 214 195 / 0.7); }
.focus-notes { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgb(255 255 255 / 0.06); font-size: 13px; }
.notes-headline { color: #fff; font-weight: 700; }
.notes-next { margin-top: 4px; color: rgb(209 213 219); }
.focus-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.focus-msg { font-size: 12px; color: rgb(156 163 175); }
</style>
