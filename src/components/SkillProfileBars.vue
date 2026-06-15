<script setup lang="ts">
import { computed } from 'vue'
import { buildSkillScores, type SkillProfileSnapshot } from '../lib/skill-profile'

const props = defineProps<{
  profile: SkillProfileSnapshot | null | undefined
  previous?: SkillProfileSnapshot | null
  rankName?: string | null
  compact?: boolean
}>()

const skills = computed(() =>
  buildSkillScores(props.profile, {
    rankName: props.rankName,
    previous: props.previous,
  }),
)

const hasData = computed(
  () => (props.profile?.gamesAnalysed ?? 0) >= 1,
)

function barColor(score: number): string {
  if (score >= 75) return 'bg-emerald-400'
  if (score >= 55) return 'bg-amber-400'
  return 'bg-red-400'
}

function trendLabel(trend: number | null): string | null {
  if (trend == null || trend === 0) return null
  return `${trend > 0 ? '+' : ''}${trend}`
}
</script>

<template>
  <div v-if="hasData" class="rounded-xl border border-white/[0.10] bg-white/[0.02] overflow-hidden">
    <div class="px-3.5 py-2.5 border-b border-white/[0.07] flex items-center justify-between">
      <span class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Skill profile</span>
      <span class="text-[9px] text-gray-600 tabular-nums">{{ profile?.gamesAnalysed ?? 0 }} matches</span>
    </div>

    <div class="px-3.5 py-3 space-y-2.5" :class="compact ? 'space-y-2' : 'space-y-2.5'">
      <div v-for="skill in skills" :key="skill.id" class="flex items-center gap-2.5">
        <span class="w-[5.5rem] flex-shrink-0 text-[10px] text-gray-400 truncate">{{ skill.label }}</span>
        <div class="flex-1 relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            class="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            :class="barColor(skill.score)"
            :style="{ width: `${skill.score}%` }"
          />
          <div
            v-if="skill.benchmark != null"
            class="absolute top-0 bottom-0 w-px bg-white/40"
            :style="{ left: `${skill.benchmark}%` }"
            :title="`Rank average: ${skill.benchmark}`"
          />
        </div>
        <div class="w-10 flex-shrink-0 text-right">
          <span class="text-[10px] font-bold tabular-nums text-gray-200">{{ skill.score }}</span>
          <span
            v-if="trendLabel(skill.trend)"
            class="block text-[8px] font-semibold tabular-nums"
            :class="(skill.trend ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'"
          >{{ trendLabel(skill.trend) }}</span>
        </div>
      </div>
    </div>

    <p v-if="rankName && skills.some(s => s.benchmark != null)" class="px-3.5 pb-2.5 text-[9px] text-gray-600">
      White tick = average for {{ rankName }} players (HS% reference on Crosshair)
    </p>
  </div>
</template>
