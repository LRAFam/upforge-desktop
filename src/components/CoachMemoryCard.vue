<script setup lang="ts">
import { computed } from 'vue'
import { buildCoachMemoryLine, type SkillProfileSnapshot } from '../lib/skill-profile'

const props = defineProps<{
  profile: SkillProfileSnapshot | null | undefined
  focusAreas?: Array<{ category: string; text: string }>
}>()

const memory = computed(() =>
  buildCoachMemoryLine(props.profile, props.focusAreas),
)
</script>

<template>
  <div
    v-if="memory"
    class="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-transparent px-3.5 py-3"
  >
    <p class="text-[10px] font-bold uppercase tracking-widest text-violet-300/80 mb-1.5">Your coach</p>
    <p class="text-xs text-gray-300 leading-relaxed">
      I've watched <span class="font-bold text-white tabular-nums">{{ memory.gamesAnalysed }}</span> of your games.
    </p>
    <p v-if="memory.improving" class="text-[11px] text-gray-400 mt-2 leading-relaxed">
      <span class="text-emerald-400 font-semibold">Improving:</span>
      {{ memory.improving.label }} — down from {{ memory.improving.before }} to {{ memory.improving.after }} mentions recently.
    </p>
    <p v-if="memory.focusNext" class="text-[11px] text-gray-300 mt-2 leading-relaxed">
      <span class="text-violet-300 font-semibold">Next:</span> {{ memory.focusNext }}
    </p>
  </div>
</template>
