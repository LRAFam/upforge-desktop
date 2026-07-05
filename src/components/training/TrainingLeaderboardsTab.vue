<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { TRAINER_SCENARIOS, type TrainerScenarioKey } from '../../lib/trainer-scenarios'
import { TRAINING_ARTWORK } from '../../lib/training-icons'
import type { TrainerLeaderboardEntry } from '../../env.d.ts'

const activeScenario = ref<TrainerScenarioKey>('flick')
const activePeriod = ref<'week' | 'month' | 'all'>('week')
const entries = ref<TrainerLeaderboardEntry[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    entries.value = await window.api.trainer.getLeaderboard(activeScenario.value, activePeriod.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([activeScenario, activePeriod], load)
</script>

<template>
  <div class="p-5 space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <select
        v-model="activeScenario"
        class="rounded-lg border border-white/[0.10] bg-black/30 px-3 py-2 text-[12px] font-semibold text-white"
      >
        <option v-for="s in TRAINER_SCENARIOS" :key="s.key" :value="s.key">{{ s.label }}</option>
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
