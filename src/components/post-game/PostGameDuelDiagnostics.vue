<script setup lang="ts">
import { computed } from 'vue'
import type { DuelFailureDiagnostics } from '../../lib/duel-diagnostics'
import {
  diagnosticsSummary,
  formatMomentVisionLine,
  momentHasVisionSignal,
} from '../../lib/duel-diagnostics'

const props = defineProps<{
  diagnostics: DuelFailureDiagnostics
}>()

const summary = computed(() => diagnosticsSummary(props.diagnostics))

const rows = computed(() =>
  props.diagnostics.moments.map((moment) => ({
    key: moment.moment_id ?? `r${moment.round}-${moment.video_offset_ms}`,
    round: moment.round,
    callout: moment.callout && moment.callout !== 'Unknown' ? moment.callout : null,
    confidence: moment.confidence ?? 'unknown',
    hasVision: momentHasVisionSignal(moment),
    line: formatMomentVisionLine(moment),
  })),
)
</script>

<template>
  <div class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-left">
    <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">
      Clip review details
    </p>
    <p class="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
      {{ summary }}
    </p>

    <ul class="mt-3 space-y-2 max-h-44 overflow-y-auto pr-0.5">
      <li
        v-for="row in rows"
        :key="row.key"
        class="rounded-lg border px-2.5 py-2"
        :class="row.hasVision
          ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
          : 'border-white/[0.06] bg-black/20'"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-semibold text-gray-300">
            R{{ row.round }}<span v-if="row.callout" class="text-gray-500"> · {{ row.callout }}</span>
          </span>
          <span
            class="text-[9px] uppercase tracking-wide"
            :class="row.hasVision ? 'text-emerald-400/90' : 'text-gray-600'"
          >
            {{ row.hasVision ? row.confidence : 'no signal' }}
          </span>
        </div>
        <p class="mt-1 text-[11px] leading-snug" :class="row.hasVision ? 'text-gray-300' : 'text-gray-500'">
          {{ row.line }}
        </p>
      </li>
    </ul>
  </div>
</template>
