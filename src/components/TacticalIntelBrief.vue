<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoachingEvidence, TacticalIntelBrief } from '../lib/coaching-brief'
import { parseCoachingEvidence, severityLabel } from '../lib/coaching-brief'

const props = defineProps<{
  brief: TacticalIntelBrief
  compact?: boolean
  feedbackStatus?: 'idle' | 'sending' | 'sent' | 'error'
}>()

const emit = defineEmits<{
  seekEvidence: [evidence: CoachingEvidence]
  reportEvidence: [evidence: CoachingEvidence, reason: FeedbackReason]
}>()

type FeedbackReason = 'wrong_action' | 'wrong_player' | 'not_visible' | 'other'

const reportTargetKey = ref<string | null>(null)
const submittedEvidenceKey = ref<string | null>(null)

const feedbackReasons: Array<{ id: FeedbackReason; label: string }> = [
  { id: 'wrong_action', label: 'Wrong action' },
  { id: 'wrong_player', label: 'Wrong player' },
  { id: 'not_visible', label: 'Could not be seen' },
  { id: 'other', label: 'Other issue' },
]

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

const improvementRows = computed(() => dedupedImprovements.value.map((text) => ({
  text,
  parsed: parseCoachingEvidence(text),
})))

function evidenceKey(evidence: CoachingEvidence): string {
  return `${evidence.roundLabel}-${evidence.timeSeconds}-${evidence.text}`
}

function toggleReport(evidence: CoachingEvidence): void {
  const key = evidenceKey(evidence)
  reportTargetKey.value = reportTargetKey.value === key ? null : key
}

function submitReport(evidence: CoachingEvidence, reason: FeedbackReason): void {
  if (props.feedbackStatus === 'sending') return
  emit('reportEvidence', evidence, reason)
}

watch(
  () => props.feedbackStatus,
  (status) => {
    if (status !== 'sent' || !reportTargetKey.value) return
    submittedEvidenceKey.value = reportTargetKey.value
    reportTargetKey.value = null
  },
)
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
      <span class="text-[9px] font-semibold uppercase tracking-[0.2em] text-gray-600">AI synthesis</span>
    </div>

    <div class="px-3 py-2.5 space-y-2.5">
      <p
        v-if="brief.headline"
        class="font-semibold text-gray-100 leading-relaxed"
        :class="compact ? 'text-[11px]' : 'text-[13px]'"
      >{{ brief.headline }}</p>

      <div v-if="brief.evidence.length" class="space-y-1.5">
        <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Evidence</p>
        <ul class="space-y-1.5 overflow-y-auto scrollbar-hide pr-0.5" :class="compact ? 'max-h-44' : 'max-h-none'">
          <li
            v-for="(item, index) in brief.evidence"
            :key="`${item.roundLabel}-${item.timeLabel}-${index}`"
          >
            <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <button
                type="button"
                class="group w-full text-left"
                :title="`Jump to ${item.roundLabel} @ ${item.timeLabel}`"
                @click="emit('seekEvidence', item)"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="inline-flex items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-px text-[10px] font-bold tabular-nums text-red-200">
                    {{ item.roundLabel }}
                    <span class="text-red-300/70 font-mono">{{ item.timeLabel }}</span>
                  </span>
                  <span class="text-[9px] text-gray-600 group-hover:text-gray-400">Watch</span>
                </div>
                <p class="text-[11px] text-gray-400 leading-snug group-hover:text-gray-300">{{ item.text }}</p>
              </button>
              <button
                type="button"
                class="mt-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                :class="submittedEvidenceKey === evidenceKey(item)
                  ? 'bg-emerald-500/[0.08] text-emerald-300/80'
                  : 'text-gray-500 hover:bg-white/[0.04] hover:text-amber-300'"
                :disabled="submittedEvidenceKey === evidenceKey(item) || (feedbackStatus === 'sending' && reportTargetKey === evidenceKey(item))"
                @click="toggleReport(item)"
              >{{ submittedEvidenceKey === evidenceKey(item)
                ? 'Correction saved'
                : reportTargetKey === evidenceKey(item)
                  ? 'Cancel'
                  : 'Flag this moment' }}</button>
              <div v-if="reportTargetKey === evidenceKey(item)" class="mt-1.5 flex flex-wrap gap-1">
                <button
                  v-for="reason in feedbackReasons"
                  :key="reason.id"
                  type="button"
                  class="rounded-md border border-white/10 px-2 py-1.5 text-[10px] text-gray-400 hover:border-amber-500/30 hover:text-amber-200 disabled:opacity-50"
                  :disabled="feedbackStatus === 'sending'"
                  @click="submitReport(item, reason.id)"
                >{{ reason.label }}</button>
              </div>
              <p v-if="reportTargetKey === evidenceKey(item) && feedbackStatus === 'sending'" class="mt-1.5 text-[10px] text-gray-500">Saving correction…</p>
              <p v-else-if="reportTargetKey === evidenceKey(item) && feedbackStatus === 'error'" class="mt-1.5 text-[10px] text-red-300/80">Could not save this correction. Please try again.</p>
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="brief.fix"
        class="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2"
      >
        <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-400/90 mb-1">Fix</p>
        <p class="text-[12px] text-emerald-100/90 leading-snug">{{ brief.fix }}</p>
      </div>

      <div v-if="dedupedImprovements.length" class="space-y-1">
        <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Also work on</p>
        <ul class="space-y-1">
          <li
            v-for="(row, index) in improvementRows.slice(0, compact ? 2 : 3)"
            :key="`${index}-${row.text.slice(0, 24)}`"
            class="text-gray-500 leading-snug"
            :class="compact ? 'text-[11px]' : 'text-[12px]'"
          >
            <template v-if="row.parsed.evidence.length">
              <div
                v-for="evidence in row.parsed.evidence"
                :key="evidenceKey(evidence)"
                class="mb-1.5 border-l border-white/10 pl-2"
              >
                <button type="button" class="text-left hover:text-gray-300" @click="emit('seekEvidence', evidence)">
                  <span class="font-mono font-semibold text-red-300/85">{{ evidence.roundLabel }} {{ evidence.timeLabel }}</span>
                  <span> {{ evidence.text }}</span>
                </button>
                <button
                  type="button"
                  class="ml-2 rounded-md px-1.5 py-1 text-[10px] transition-colors"
                  :class="submittedEvidenceKey === evidenceKey(evidence)
                    ? 'text-emerald-300/80'
                    : 'text-gray-600 hover:bg-white/[0.04] hover:text-amber-300'"
                  :disabled="submittedEvidenceKey === evidenceKey(evidence) || (feedbackStatus === 'sending' && reportTargetKey === evidenceKey(evidence))"
                  @click="toggleReport(evidence)"
                >{{ submittedEvidenceKey === evidenceKey(evidence)
                  ? 'Saved'
                  : reportTargetKey === evidenceKey(evidence)
                    ? 'Cancel'
                    : 'Flag' }}</button>
                <div v-if="reportTargetKey === evidenceKey(evidence)" class="mt-1 flex flex-wrap gap-1">
                  <button
                    v-for="reason in feedbackReasons"
                    :key="reason.id"
                    type="button"
                    class="rounded-md border border-white/10 px-2 py-1.5 text-[10px] text-gray-400 hover:border-amber-500/30 hover:text-amber-200 disabled:opacity-50"
                    :disabled="feedbackStatus === 'sending'"
                    @click="submitReport(evidence, reason.id)"
                  >{{ reason.label }}</button>
                </div>
                <p v-if="reportTargetKey === evidenceKey(evidence) && feedbackStatus === 'sending'" class="mt-1 text-[10px] text-gray-500">Saving correction…</p>
                <p v-else-if="reportTargetKey === evidenceKey(evidence) && feedbackStatus === 'error'" class="mt-1 text-[10px] text-red-300/80">Could not save this correction. Please try again.</p>
              </div>
            </template>
            <div v-else class="flex gap-2">
              <span class="text-gray-700 flex-shrink-0">·</span>
              <span>{{ row.text }}</span>
            </div>
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
