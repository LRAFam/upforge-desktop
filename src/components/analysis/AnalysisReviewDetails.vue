<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisDetailEnriched } from '../../lib/analysis-enrichment'
import { parseCoachingEvidence, type CoachingEvidence } from '../../lib/coaching-brief'

const props = defineProps<{
  detail: AnalysisDetailEnriched
}>()

const emit = defineEmits<{
  seekEvidence: [evidence: CoachingEvidence]
}>()

const hasContent = computed(() => Boolean(
  props.detail.summary
  || props.detail.pattern_insights.length
  || props.detail.behaviours.length
  || props.detail.category_scores.length
  || props.detail.key_strengths.length
  || props.detail.drill_recommendations.length
  || props.detail.timing_comparisons.length,
))

const insightByBehaviour = computed(() => new Map(
  props.detail.insights.map(item => [item.behaviour_id, item] as const),
))

const confidenceRows = computed(() => Object.entries(props.detail.confidence ?? {}))

function evidenceFromText(text: string): CoachingEvidence[] {
  return parseCoachingEvidence(text).evidence
}

function seekTiming(row: AnalysisDetailEnriched['timing_comparisons'][number]): void {
  if (typeof row.video_offset_ms !== 'number') return
  const seconds = Math.max(0, Math.floor(row.video_offset_ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  const round = typeof row.round === 'number' ? row.round : 0
  emit('seekEvidence', {
    roundNumber: Math.max(0, round - 1),
    roundLabel: round > 0 ? `R${round}` : 'Moment',
    timeLabel: `${minutes}:${String(remainder).padStart(2, '0')}`,
    timeSeconds: seconds,
    text: row.label,
  })
}
</script>

<template>
  <section v-if="hasContent" class="border-y border-white/[0.07]">
    <div class="px-1 py-2">
      <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Full review</p>
      <p class="mt-1 text-[10px] leading-relaxed text-gray-600">
        Match data and reviewed clips are shown separately from the headline synthesis.
      </p>
    </div>

    <details v-if="detail.summary" open class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Session summary <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <p class="pb-3 text-[11px] leading-relaxed text-gray-500">{{ detail.summary }}</p>
    </details>

    <details
      v-if="detail.coaching_diagnosis && detail.coaching_diagnosis !== detail.summary"
      class="group border-t border-white/[0.06]"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Full diagnosis <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <p class="pb-3 text-[11px] leading-relaxed text-gray-500">{{ detail.coaching_diagnosis }}</p>
    </details>

    <details v-if="detail.behaviours.length" class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Measured behaviours <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <div class="space-y-3 pb-3">
        <article v-for="behaviour in detail.behaviours" :key="behaviour.behaviour_id">
          <div class="flex items-center gap-2">
            <p class="text-[11px] font-medium text-gray-300">{{ behaviour.title || behaviour.behaviour_id.replace(/_/g, ' ') }}</p>
            <span v-if="behaviour.occurrences != null" class="text-[9px] text-gray-600">{{ behaviour.occurrences }}×</span>
            <span v-if="behaviour.confidence" class="text-[9px] text-gray-600">{{ behaviour.confidence }} confidence</span>
          </div>
          <p v-if="insightByBehaviour.get(behaviour.behaviour_id)?.text" class="mt-1 text-[10px] leading-relaxed text-gray-500">
            {{ insightByBehaviour.get(behaviour.behaviour_id)?.text }}
          </p>
          <div class="mt-1.5 flex flex-wrap gap-1">
            <template v-for="item in behaviour.evidence" :key="item">
              <button
                v-for="evidence in evidenceFromText(item)"
                :key="`${evidence.roundLabel}-${evidence.timeSeconds}`"
                type="button"
                class="border border-white/10 px-1.5 py-1 font-mono text-[9px] text-gray-400 hover:border-red-500/30 hover:text-red-200"
                @click="emit('seekEvidence', evidence)"
              >{{ evidence.roundLabel }} {{ evidence.timeLabel }}</button>
            </template>
          </div>
        </article>
      </div>
    </details>

    <details v-if="detail.pattern_insights.length" class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Recurring patterns <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <ul class="space-y-2 pb-3">
        <li v-for="pattern in detail.pattern_insights" :key="pattern" class="text-[10px] leading-relaxed text-gray-500">
          {{ pattern }}
        </li>
      </ul>
    </details>

    <details v-if="detail.category_scores.length" class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Category scores <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <div class="space-y-2 pb-3">
        <div v-for="category in detail.category_scores" :key="category.category">
          <div class="flex items-center justify-between gap-2 text-[10px]">
            <span class="capitalize text-gray-500">{{ category.category.replace(/_/g, ' ') }}</span>
            <span class="font-mono font-semibold text-gray-300">{{ category.score }}</span>
          </div>
          <p v-if="category.reasoning" class="mt-0.5 text-[9px] leading-relaxed text-gray-600">{{ category.reasoning }}</p>
        </div>
      </div>
    </details>

    <details v-if="detail.key_strengths.length" class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Strengths <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <ul class="space-y-2 pb-3">
        <li v-for="strength in detail.key_strengths" :key="strength" class="text-[10px] leading-relaxed text-gray-500">
          <template v-if="evidenceFromText(strength).length">
            <button type="button" class="text-left hover:text-gray-300" @click="emit('seekEvidence', evidenceFromText(strength)[0])">
              {{ strength }}
            </button>
          </template>
          <template v-else>{{ strength }}</template>
        </li>
      </ul>
    </details>

    <details v-if="detail.timing_comparisons.length" class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Timing comparisons <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <div class="space-y-2 pb-3">
        <button
          v-for="row in detail.timing_comparisons"
          :key="row.id"
          type="button"
          class="w-full text-left text-[10px] text-gray-500 hover:text-gray-300 disabled:cursor-default disabled:hover:text-gray-500"
          :disabled="typeof row.video_offset_ms !== 'number'"
          @click="seekTiming(row)"
        >
          <span class="text-gray-300">{{ row.label }}</span>
          · {{ row.player_label }} vs {{ row.reference_label }}
        </button>
      </div>
    </details>

    <details v-if="detail.drill_recommendations.length" class="group border-t border-white/[0.06]">
      <summary class="flex cursor-pointer list-none items-center justify-between py-2 text-[11px] font-semibold text-gray-300">
        Practice <span class="text-[9px] text-gray-600 group-open:rotate-180">▼</span>
      </summary>
      <div class="space-y-3 pb-3">
        <article v-for="(drill, index) in detail.drill_recommendations" :key="`${index}-${drill.title}`">
          <p class="text-[11px] font-medium text-emerald-200/85">{{ drill.title || 'Recommended practice' }}</p>
          <p v-if="drill.practice_mode" class="mt-0.5 text-[9px] uppercase tracking-wide text-gray-600">{{ drill.practice_mode.replace(/_/g, ' ') }}</p>
          <p v-if="drill.instructions" class="mt-1 text-[10px] leading-relaxed text-gray-500">{{ drill.instructions }}</p>
          <p v-if="drill.success_metric" class="mt-1 text-[9px] leading-relaxed text-gray-600">Target: {{ drill.success_metric }}</p>
        </article>
      </div>
    </details>

    <div v-if="confidenceRows.length || detail.observation_confidence" class="border-t border-white/[0.06] py-2 text-[9px] text-gray-600">
      <span v-if="detail.observation_confidence">Clip observation: {{ detail.observation_confidence }}</span>
      <span v-for="([key, value], index) in confidenceRows" :key="key">
        {{ detail.observation_confidence || index > 0 ? ' · ' : '' }}{{ key }}: {{ value }}
      </span>
    </div>
  </section>
</template>
