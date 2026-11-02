<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { TRAINER_SCENARIOS, type TrainerScenarioKey } from '../../lib/trainer-scenarios'
import { TRAINING_ARTWORK } from '../../lib/training-icons'
import type { ProfileData, TrainerLeaderboardEntry } from '../../env.d.ts'
import { playerIdentity, type PlayerIdentity } from '../../lib/player-identity'
import { readCache } from '../../lib/stale-cache'
import PlayerAvatar from '../v3/identity/PlayerAvatar.vue'
import { uiV3 } from '../../lib/ui-v3'
import UfTabs from '../v3/UfTabs.vue'
import UfSkeleton from '../v3/UfSkeleton.vue'
import EmptyArt from '../v3/empty/EmptyArt.vue'
import { isBest, leaderboardYouRow, type LeaderboardYouRow } from '../v3/practice/practice-session-v3'
import { trainingTimestamp } from '../../lib/training-result-metrics'
import '../v3/practice/practice-v3.css'

const PERIOD_TABS = [{ key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'all', label: 'All time' }]

const activeScenario = ref<TrainerScenarioKey>('flick')
const activePeriod = ref<'week' | 'month' | 'all'>('week')
const difficulty = ref('medium')
const durationSeconds = ref(60)
const entries = ref<TrainerLeaderboardEntry[]>([])
const loading = ref(false)
const you = ref<LeaderboardYouRow | null>(null)
let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const rows = await window.api.trainer.getLeaderboard(activeScenario.value, activePeriod.value, difficulty.value, durationSeconds.value)
    if (seq !== loadSeq) return
    entries.value = rows
    you.value = uiV3.value ? await loadYou(rows) : null
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

/** UI v3: when you're not in the rows, your own best for the same settings (read-only history call). */
async function loadYou(rows: TrainerLeaderboardEntry[]): Promise<LeaderboardYouRow | null> {
  if (rows.some(e => e.is_current_user)) return null
  try {
    const h = await window.api.trainer.getHistory({
      scenario: activeScenario.value, difficulty: difficulty.value, duration_seconds: durationSeconds.value,
      scoring_version: 2, before: new Date().toISOString(),
    })
    if (!h) return null
    return leaderboardYouRow(rows, h.sessions, activePeriod.value, Date.now(), 50, trainingTimestamp)
  } catch {
    return null
  }
}

/** UI v3 rows: player card → letter, with the rank icon (same identity model as everywhere). */
function rowIdentity(e: TrainerLeaderboardEntry): PlayerIdentity {
  return playerIdentity({ name: e.name, playerCardId: e.player_card_id, rank: e.current_rank })
}
/** Your own identity for the "You" row (profile Home cached, refreshed read-only). */
const meStats = ref(readCache<ProfileData | null>('home:profile')?.value?.latest_stats ?? null)
const meIdentity = computed(() => playerIdentity({
  name: 'You', playerCardId: meStats.value?.player_card_id,
  agent: meStats.value?.most_played_agent, rank: meStats.value?.current_rank,
}))

onMounted(load)
onMounted(async () => {
  if (!uiV3.value) return
  const p = await window.api?.profile?.get().catch(() => null) as ProfileData | null | undefined
  if (p?.latest_stats) meStats.value = p.latest_stats
})
watch([activeScenario, activePeriod, difficulty, durationSeconds], load)
</script>

<template>
  <!-- UI v3 (legacy markup below, unchanged) -->
  <div v-if="uiV3" class="uf-lb">
    <div class="uf-lb-filters uf-rise">
      <label class="uf-lb-field"><span class="uf-t4">Drill</span>
        <select v-model="activeScenario" class="uf-pselect uf-lb-select">
          <option v-for="s in TRAINER_SCENARIOS" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
      </label>
      <label class="uf-lb-field"><span class="uf-t4">Difficulty</span>
        <select v-model="difficulty" class="uf-pselect uf-lb-select" style="text-transform: capitalize">
          <option v-for="d in ['easy', 'medium', 'hard', 'pro']" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label class="uf-lb-field"><span class="uf-t4">Length</span>
        <select v-model="durationSeconds" class="uf-pselect uf-lb-select">
          <option v-for="seconds in [30, 60, 90, 120, 180]" :key="seconds" :value="seconds">{{ seconds }}s</option>
        </select>
      </label>
      <UfTabs :items="PERIOD_TABS" :model-value="activePeriod" size="filter" label="Leaderboard period" class="uf-lb-period"
        @update:model-value="activePeriod = $event as 'week' | 'month' | 'all'" />
    </div>
    <p class="uf-t4" style="margin: 0">Only runs since the scoring update on 24 Sep 2026 count. Older runs stay in your history.</p>

    <ol v-if="loading && !entries.length" class="uf-lb-rows" aria-busy="true" aria-label="Loading leaderboard">
      <li v-for="i in 6" :key="i"><UfSkeleton :w="36" :h="26" /><UfSkeleton :w="32" :h="32" /><span class="uf-lb-name"><UfSkeleton w="34%" :h="15" /><UfSkeleton w="22%" :h="13" /></span><UfSkeleton :w="40" :h="26" /></li>
    </ol>
    <EmptyArt v-else-if="!entries.length" size="section" :art="TRAINING_ARTWORK.leaderboardEmpty"
      title="No scores yet this period" text="Finish a drill with these settings to appear here." />
    <ol v-else class="uf-lb-rows uf-rise uf-d1s" :class="{ 'uf-refreshing': loading }">
      <li v-for="e in entries" :key="`${e.user_id}-${e.rank}`" :class="{ me: e.is_current_user }">
        <span class="uf-d4 uf-lb-rank" :style="isBest(e.rank) ? 'color: var(--uf-gold)' : 'color: var(--uf-faint)'">
          <span v-if="isBest(e.rank)" aria-hidden="true">★</span>{{ e.rank }}
        </span>
        <PlayerAvatar :identity="rowIdentity(e)" :size="32" badge />
        <span class="uf-lb-name">
          <span class="uf-t3">{{ e.name }}<span v-if="e.tag" style="color: var(--uf-faint); font-weight: 400">#{{ e.tag }}</span>
            <span v-if="e.is_current_user" class="uf-label" style="color: var(--uf-red); margin-left: 8px">You</span>
          </span>
          <span class="uf-t4 uf-num">{{ e.accuracy_pct }}% accuracy · {{ e.avg_reaction_ms }}ms to hit</span>
        </span>
        <span class="uf-d4">{{ e.score }}</span>
      </li>
    </ol>
    <div v-if="you && !loading" class="uf-lb-you uf-rise uf-d2s" aria-label="Your position">
      <span class="uf-d4 uf-lb-rank" style="color: var(--uf-faint)">—</span>
      <PlayerAvatar :identity="meIdentity" :size="32" badge />
      <span class="uf-lb-name">
        <span class="uf-t3">You</span>
        <span class="uf-t4">{{ you.note }}</span>
      </span>
      <span class="uf-d4" :style="you.score == null ? 'color: var(--uf-faint)' : undefined">{{ you.score ?? '—' }}</span>
    </div>
  </div>

  <template v-else>
  <div class="p-5 space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <select
        v-model="activeScenario"
        class="rounded-lg border border-white/[0.10] bg-black/30 px-3 py-2 text-[12px] font-semibold text-white"
      >
        <option v-for="s in TRAINER_SCENARIOS" :key="s.key" :value="s.key">{{ s.label }}</option>
      </select>
      <select v-model="difficulty" aria-label="Difficulty" class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">
        <option v-for="d in ['easy', 'medium', 'hard', 'pro']" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="durationSeconds" aria-label="Drill duration" class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">
        <option v-for="seconds in [30, 60, 90, 120, 180]" :key="seconds" :value="seconds">{{ seconds }}s</option>
      </select>
      <div class="flex rounded-lg border border-white/[0.10] overflow-hidden">
        <button
          v-for="p in (['week', 'month', 'all'] as const)"
          :key="p"
          type="button"
          class="px-3 py-2 text-[11px] font-bold uppercase transition-colors"
          :class="activePeriod === p ? 'bg-red-500/15 text-red-300' : 'text-gray-500 hover:text-gray-300'"
          @click="activePeriod = p"
        >{{ p }}</button>
      </div>
    </div>

    <p class="text-xs text-gray-500">Updated scoring only. Legacy runs remain in your history.</p>
    <div v-if="loading" class="dash-panel py-12 text-center text-[12px] text-gray-500">Loading leaderboard…</div>

    <div v-else-if="!entries.length" class="dash-panel py-10 text-center">
      <img
        :src="TRAINING_ARTWORK.leaderboardEmpty"
        alt=""
        aria-hidden="true"
        class="mx-auto h-28 w-28 object-contain opacity-80 mb-4"
      />
      <p class="text-sm font-semibold text-gray-400">No scores yet this period</p>
      <p class="text-[11px] text-gray-600 mt-1">Complete a drill to appear on the board.</p>
    </div>

    <div v-else class="dash-panel overflow-hidden divide-y divide-white/[0.06]">
      <div
        v-for="e in entries"
        :key="`${e.user_id}-${e.rank}`"
        class="flex items-center gap-3 px-4 py-3"
        :class="e.is_current_user ? 'bg-red-500/[0.06]' : ''"
      >
        <span
          class="w-8 text-center text-[12px] font-black tabular-nums flex-shrink-0"
          :class="e.rank <= 3 ? 'text-amber-300' : 'text-gray-500'"
        >{{ e.rank }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-semibold text-white truncate">
            {{ e.name }}<span v-if="e.tag" class="text-gray-500">#{{ e.tag }}</span>
            <span v-if="e.is_current_user" class="ml-1 text-[9px] font-bold uppercase text-red-400">You</span>
          </p>
          <p class="text-[10px] text-gray-600 tabular-nums">{{ e.accuracy_pct }}% acc · {{ e.avg_reaction_ms }}ms</p>
        </div>
        <span class="text-lg font-black tabular-nums text-white">{{ e.score }}</span>
      </div>
    </div>
  </div>
  </template>
</template>

<style scoped>
.uf-lb { display: flex; flex-direction: column; gap: 16px; padding: 14px 12px 32px; max-width: 920px; }
.uf-lb-filters { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.uf-lb-field { display: flex; flex-direction: column; gap: 6px; }
.uf-lb-select { width: auto; min-width: 140px; }
.uf-lb-period { margin-left: auto; }
.uf-lb-rows { list-style: none; margin: 0; padding: 0; }
.uf-lb-rows li { display: flex; align-items: center; gap: 18px; padding: 12px 12px 12px 10px; border-top: 1px solid var(--uf-line); border-left: 2px solid transparent; }
.uf-lb-rows li.me { border-left-color: var(--uf-red); background: var(--uf-raised); }
.uf-lb-rank { width: 48px; flex: none; display: inline-flex; gap: 4px; align-items: baseline; }
.uf-lb-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.uf-lb-you { display: flex; align-items: center; gap: 18px; padding: 12px 12px 12px 10px; border-top: 1px solid var(--uf-line-2); border-left: 2px solid var(--uf-red); background: var(--uf-raised); }
</style>
