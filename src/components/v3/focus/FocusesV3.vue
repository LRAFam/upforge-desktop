<script setup lang="ts">
/**
 * "Your focuses": everything the player is working on in one game, with a way to add one of the
 * habits the game measures (with the suggested target or their own) and to drop one.
 * Works for every game with a focus loop (Valorant, League, Deadlock).
 *
 * While there is no list (first load, signed out, or a server without /api/focuses) the `fallback`
 * slot renders instead: screens put their older single-focus block there, so an older server
 * changes nothing.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readCache, writeCache } from '../../../lib/stale-cache'
import {
  addBlockedLine, canAddFocus, focusGoal, focusOriginLabel, focusProgressLine, focusSlots, isShareUnit, optionLine,
  parseTargetInput, refusalText, targetInputValue,
  type FocusItem, type FocusOption, type FocusesResult, type FocusesState,
} from '../../../lib/focuses'
import { focusStreakAchievements } from '../../../lib/ideas/focus-streak'
import { useAchievements } from '../../../composables/useAchievements'

const props = withDefaults(defineProps<{
  game: string
  heading?: string
  /** The screen already shows the newest focus in detail above this list (Home): leave it out here. */
  skipNewest?: boolean
  /** Also list focuses that ended recently (achieved, missed, dropped). */
  showRecent?: boolean
}>(), { heading: 'Your focuses', skipNewest: false, showRecent: false })
const emit = defineEmits<{ changed: [] }>()

const cacheKey = computed(() => `focuses:${props.game}`)
const state = ref<FocusesState | null>(readCache<FocusesState>(cacheKey.value)?.value ?? null)
const busy = ref(false)
const error = ref<string | null>(null)
const picking = ref(false)
const ownTargetFor = ref<string | null>(null)
const targetText = ref('')
const targetError = ref(false)
const confirmDropId = ref<number | null>(null)

function apply(res: FocusesResult | null | undefined, game: string): boolean {
  if (!res || game !== props.game) return false
  if (res.ok) {
    const { ok: _ok, ...next } = res
    state.value = next
    writeCache(cacheKey.value, next)
    return true
  }
  if (res.state) state.value = res.state
  // No list on this server: never show a stale one from an earlier sign-in.
  if (res.error === 'unavailable' || res.error === 'unsupported_game') state.value = null
  return false
}
async function load(): Promise<void> {
  const game = props.game
  apply(await window.api?.app?.listFocuses?.(game).catch(() => null), game)
}

const newestId = computed(() => Math.max(0, ...(state.value?.focuses ?? []).map(f => f.id)))
const shown = computed<FocusItem[]>(() => (state.value?.focuses ?? []).filter(f => !(props.skipNewest && f.id === newestId.value)))
const canAdd = computed(() => canAddFocus(state.value))
const blocked = computed(() => addBlockedLine(state.value))
const recent = computed<FocusItem[]>(() => (props.showRecent ? (state.value?.recent ?? []).slice(0, 3) : []))

// Streak badges for League and Deadlock (Valorant's come from the Home focus panel, so they are never unlocked twice).
const achievements = useAchievements()
watch(() => state.value?.streak, async (n) => {
  if (props.game === 'valorant' || typeof n !== 'number') return
  const ids = focusStreakAchievements(n)
  if (!ids.length) return
  await achievements.load()
  const fresh: string[] = []
  for (const id of ids) if (await achievements.unlock(id)) fresh.push(id)
  if (fresh.length) window.__ufAchievementUnlocked?.(fresh)
})

function closePicker(): void {
  picking.value = false
  ownTargetFor.value = null
  targetError.value = false
}
async function add(option: FocusOption, target: number | null = null): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  const game = props.game
  const res = await window.api?.app?.addFocus?.(game, option.metric, target).catch(() => null)
  busy.value = false
  if (apply(res, game)) { closePicker(); emit('changed') } else error.value = refusalText(res && !res.ok ? res.error : null)
}
function openOwnTarget(option: FocusOption): void {
  ownTargetFor.value = ownTargetFor.value === option.metric ? null : option.metric
  targetText.value = targetInputValue(option)
  targetError.value = false
}
function addWithOwnTarget(option: FocusOption): void {
  const target = parseTargetInput(targetText.value, option)
  targetError.value = target == null
  if (target != null) void add(option, target)
}
async function drop(focus: FocusItem): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  const game = props.game
  const res = await window.api?.app?.dropFocus?.(focus.id).catch(() => null)
  busy.value = false
  confirmDropId.value = null
  if (apply(res, game)) { emit('changed'); return }
  error.value = refusalText(res && !res.ok ? res.error : null)
  // It may have finished on its own in the meantime: show what the server has now.
  void load()
}

let stopUpdates: (() => void) | null = null
onMounted(() => {
  void load()
  // Checks land when a match syncs: keep the progress current.
  stopUpdates = window.api?.app?.onFocusUpdated?.(() => { void load() }) ?? null
})
onBeforeUnmount(() => { stopUpdates?.() })
watch(() => props.game, () => {
  state.value = readCache<FocusesState>(cacheKey.value)?.value ?? null
  error.value = null
  confirmDropId.value = null
  closePicker()
  void load()
})
</script>

<template>
  <slot v-if="!state" name="fallback" />
  <section v-else class="fz" :aria-label="heading">
    <div class="fz-head">
      <p class="uf-label">{{ heading }}</p>
      <span class="uf-t4">{{ state.focuses.length }} of {{ state.max_active }} in use</span>
    </div>

    <ul v-if="shown.length" class="fz-list">
      <li v-for="f in shown" :key="f.id" class="fz-item">
        <div class="fz-title">
          <span class="uf-t3">{{ f.label }}</span>
          <span class="uf-t4 fz-goal">{{ focusGoal(f) }}</span>
        </div>
        <ol class="fz-slots" :aria-label="`${f.label}: focus games`">
          <li v-for="(s, i) in focusSlots(f)" :key="i" :class="`fz-slot fz-slot--${s}`"
            :aria-label="`Game ${i + 1}: ${s === 'pending' ? 'not played yet' : s === 'hit' ? 'on target' : 'missed'}`" />
        </ol>
        <p class="uf-t4 fz-sub">{{ focusProgressLine(f) }}</p>
        <p v-if="f.practice" class="uf-t4 fz-sub">Practice: {{ f.practice }}</p>
        <p class="uf-t4 fz-foot">
          <span>{{ focusOriginLabel(f) }}</span>
          <template v-if="confirmDropId === f.id">
            <span>Drop this focus?</span>
            <button type="button" class="uf-link" :disabled="busy" @click="drop(f)">Yes, drop it</button>
            <button type="button" class="uf-link" @click="confirmDropId = null">Keep it</button>
          </template>
          <button v-else type="button" class="uf-link" :aria-label="`Drop the focus: ${f.label}`" @click="confirmDropId = f.id">Drop</button>
        </p>
      </li>
    </ul>
    <p v-else-if="!skipNewest" class="uf-t4 fz-sub">No focus yet. Your coach sets the first one from your recent matches, or you can pick one.</p>

    <button v-if="canAdd && !picking" type="button" class="uf-link fz-add" @click="picking = true">Add a focus</button>
    <p v-else-if="blocked && !picking" class="uf-t4 fz-sub">{{ blocked }}</p>

    <div v-if="picking && state.options.length" class="fz-picker">
      <p class="uf-t4 fz-sub">Pick what to work on. It is checked against your next ranked games.</p>
      <ul class="fz-list">
        <li v-for="o in state.options" :key="o.metric" class="fz-item">
          <span class="uf-t3">{{ o.label }}</span>
          <span class="uf-t4 fz-sub">{{ optionLine(o) }}</span>
          <div class="fz-actions">
            <button type="button" class="uf-btn-secondary" :disabled="busy" :aria-label="`Add the focus: ${o.label}`" @click="add(o)">Add</button>
            <button type="button" class="uf-link" :aria-expanded="ownTargetFor === o.metric" @click="openOwnTarget(o)">Set my own target</button>
          </div>
          <form v-if="ownTargetFor === o.metric" class="fz-own" @submit.prevent="addWithOwnTarget(o)">
            <label class="uf-t4" :for="`fz-target-${o.metric}`">{{ o.better === 'lower' ? 'At most' : 'At least' }}</label>
            <input :id="`fz-target-${o.metric}`" v-model="targetText" class="fz-input" inputmode="decimal" autocomplete="off" :aria-invalid="targetError">
            <span v-if="isShareUnit(o.unit)" class="uf-t4">%</span>
            <button type="submit" class="uf-btn-secondary" :disabled="busy">Add with this target</button>
            <p v-if="targetError" class="uf-t4 fz-warn" role="alert">Type a number that is {{ o.better === 'lower' ? 'lower' : 'higher' }} than where you are now.</p>
          </form>
        </li>
      </ul>
      <button type="button" class="uf-link" @click="closePicker">Close</button>
    </div>

    <p v-if="error" class="uf-t4 fz-warn" role="alert">{{ error }}</p>

    <div v-if="recent.length" class="fz-recent">
      <p class="uf-label">Recently ended</p>
      <ul class="fz-list">
        <li v-for="f in recent" :key="f.id" class="fz-item">
          <span class="uf-t3">{{ f.label }}</span>
          <span class="uf-t4 fz-sub">{{ focusProgressLine(f) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.fz { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.fz-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.fz-head > * { margin: 0; }
.fz-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.fz-item { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-top: 1px solid var(--uf-line); min-width: 0; }
.fz-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.fz-goal { color: var(--uf-bone); white-space: nowrap; }
.fz-slots { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
.fz-slot { flex: 1; height: 4px; background: rgba(236, 232, 225, 0.12); }
.fz-slot--hit { background: var(--uf-win); }
.fz-slot--miss { background: var(--uf-loss); }
.fz-sub { margin: 0; color: var(--uf-muted); line-height: 1.5; }
.fz-foot { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; color: var(--uf-faint); }
.fz-add { align-self: flex-start; }
.fz-picker { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.fz-picker .fz-list { align-self: stretch; }
.fz-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.fz-own { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fz-own > p { flex-basis: 100%; margin: 0; }
.fz-input { width: 72px; height: 34px; padding: 0 8px; background: var(--uf-raised); border: 1px solid var(--uf-line-2); color: var(--uf-bone); font: inherit; }
.fz-input[aria-invalid="true"] { border-color: var(--uf-gold); }
.fz-warn { margin: 0; color: var(--uf-gold); }
.fz-recent { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; }
.fz-recent > p { margin: 0; }
</style>
