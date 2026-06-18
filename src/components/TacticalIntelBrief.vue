<script setup lang="ts">
import { computed } from 'vue'
import type { CoachingEvidence, TacticalIntelBrief } from '../lib/coaching-brief'
import { severityLabel } from '../lib/coaching-brief'

const props = defineProps<{
  brief: TacticalIntelBrief
  compact?: boolean
}>()

const emit = defineEmits<{
  seekEvidence: [evidence: CoachingEvidence]
}>()

const hasStructuredContent = computed(
  () => Boolean(props.brief.headline || props.brief.evidence.length || props.brief.fix),
)

const severityClasses = computed(() => {
  switch (props.brief.severity) {
    case 'critical':
      return 'bg-red-500/15 border-red-500/35 text-red-200'
    case 'high':
    case 'warning':
      return 'bg-amber-500/12 border-amber-500/30 text-amber-200'
    case 'moderate':
      return 'bg-yellow-500/10 border-yellow-500/25 text-yellow-100'
    case 'low':
      return 'bg-white/[0.06] border-white/10 text-gray-400'
    default:
      return 'bg-red-500/10 border-red-500/25 text-red-300'
  }
})

const dedupedImprovements = computed(() => {
  const headline = props.brief.headline.toLowerCase()
  return props.brief.improvements.filter(
    item => item && !headline.includes(item.toLowerCase().slice(0, 40)),
  )
})
</script>

<template>
  <div
    v-if="hasStructuredContent || brief.improvements.length"
    class="vod-intel-brief rounded-xl border border-white/[0.08] bg-black/35 overflow-hidden"
    :class="compact ? 'text-[10px]' : ''"
  >
    <div class="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
      <span
        v-if="brief.severity"
        class="inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]"
        :class="severityClasses"
      >{{ severityLabel(brief.severity) }}</span>
      <span
        v-else-if="brief.source === 'heatmap'"
        class="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500"
      >Pattern</span>
      <span class="text-[9px] font-semibold uppercase tracking-[0.2em] text-gray-600">Coach note</span>
    </div>

    <div class="px-3 py-2.5 space-y-2.5">
      <p
        v-if="brief.headline"
        class="text-[12px] font-semibold text-gray-100 leading-relaxed"
        :class="compact ? 'text-[11px]' : ''"
      >{{ brief.headline }}</p>

      <div v-if="brief.evidence.length" class="space-y-1.5">
        <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Evidence</p>
        <ul class="space-y-1.5 max-h-44 overflow-y-auto scrollbar-hide pr-0.5">
          <li
            v-for="(item, index) in brief.evidence"
            :key="`${item.roundLabel}-${item.timeLabel}-${index}`"
          >
            <button
              type="button"
              class="group w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 transition-colors hover:border-red-500/25 hover:bg-red-500/[0.06]"
              :title="`Jump to ${item.roundLabel} @ ${item.timeLabel}`"
              @click="emit('seekEvidence', item)"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="inline-flex items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-px text-[10px] font-bold tabular-nums text-red-200">
                  {{ item.roundLabel }}
                  <span class="text-red-300/70 font-mono">{{ item.timeLabel }}</span>
                </span>
                <span class="text-[9px] text-gray-600 group-hover:text-gray-400">Jump</span>
              </div>
              <p class="text-[11px] text-gray-400 leading-snug group-hover:text-gray-300">{{ item.text }}</p>
            </button>
          </li>
        </ul>
      </div>

      <div
        v-if="brief.fix"
        class="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2"
      >
        <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-400/90 mb-1">Fix</p>
        <p class="text-[11px] text-emerald-100/90 leading-snug">{{ brief.fix }}</p>
      </div>

      <div v-if="dedupedImprovements.length" class="space-y-1">
        <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Also work on</p>
        <ul class="space-y-1">
          <li
            v-for="(item, index) in dedupedImprovements.slice(0, compact ? 2 : 3)"
            :key="`${index}-${item.slice(0, 24)}`"
            class="flex gap-2 text-[11px] text-gray-500 leading-snug"
          >
            <span class="text-gray-700 flex-shrink-0">·</span>
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div v-if="brief.tags.length" class="flex flex-wrap gap-1 pt-0.5">
        <span
          v-for="tag in brief.tags.slice(0, 4)"
          :key="tag"
          class="text-[9px] font-semibold px-1.5 py-px rounded border border-white/[0.08] bg-white/[0.03] text-gray-500 uppercase tracking-wide"
        >{{ tag.replace(/_/g, ' ') }}</span>
      </div>
    </div>
  </div>
</template>
