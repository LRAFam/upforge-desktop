<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DuelFailureDiagnostics } from '../../lib/duel-diagnostics'
import {
  diagnosticsSummary,
  duelSeekMs,
  formatDebugReport,
  formatMomentVisionLine,
  momentClipUploaded,
  momentHasVisionSignal,
} from '../../lib/duel-diagnostics'

const props = defineProps<{
  diagnostics: DuelFailureDiagnostics
  recordingId?: string | null
}>()

const copied = ref(false)

const summary = computed(() => diagnosticsSummary(props.diagnostics))

const rows = computed(() =>
  props.diagnostics.moments.map((moment) => ({
    key: moment.moment_id ?? `r${moment.round}-${moment.video_offset_ms}`,
    round: moment.round,
    callout: moment.callout && moment.callout !== 'Unknown' ? moment.callout : null,
    confidence: moment.confidence ?? 'unknown',
    hasVision: momentHasVisionSignal(moment),
    hasClip: momentClipUploaded(moment),
    seekMs: duelSeekMs(moment),
    line: formatMomentVisionLine(moment),
    moment,
  })),
)

async function viewInVod(seekMs: number | null) {
  if (!props.recordingId) return
  await window.api.app.openVodReview(props.recordingId, seekMs ?? undefined)
}

async function copyDebugReport() {
  try {
    await navigator.clipboard.writeText(formatDebugReport(props.diagnostics))
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <div class="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-3 text-left">
    <div class="flex items-start justify-between gap-2">
      <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-400/90">
        Fight footage debug
      </p>
      <button
        type="button"
        class="text-[10px] font-semibold text-gray-500 hover:text-gray-300 transition-colors"
        @click="copyDebugReport"
      >
        {{ copied ? 'Copied' : 'Copy report' }}
      </button>
    </div>
    <p class="mt-1.5 text-[11px] text-gray-300 leading-relaxed">
      {{ summary }}
    </p>
    <p class="mt-1 text-[10px] text-gray-500 leading-relaxed">
      Timeline sync can look correct while Gemini still rejects a clip (spectator cam, blank extract, or no peek/crosshair read).
      Use <span class="text-gray-400">View in VOD</span> to check each death window matches what was sent for review.
    </p>

    <ul class="mt-3 space-y-2 max-h-56 overflow-y-auto pr-0.5">
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
          <div class="flex items-center gap-2 flex-shrink-0">
            <span
              class="text-[9px] uppercase tracking-wide"
              :class="row.hasClip ? 'text-blue-400/80' : 'text-gray-600'"
            >
              {{ row.hasClip ? 'clip' : 'no clip' }}
            </span>
            <span
              class="text-[9px] uppercase tracking-wide"
              :class="row.hasVision ? 'text-emerald-400/90' : 'text-amber-400/80'"
            >
              {{ row.hasVision ? row.confidence : 'no signal' }}
            </span>
          </div>
        </div>
        <p class="mt-1 text-[11px] leading-snug" :class="row.hasVision ? 'text-gray-300' : 'text-gray-500'">
          {{ row.line }}
        </p>
        <button
          v-if="recordingId && row.seekMs != null"
          type="button"
          class="mt-1.5 text-[10px] font-semibold text-cyan-400/90 hover:text-cyan-300 transition-colors"
          @click="viewInVod(row.seekMs)"
        >
          View in VOD
        </button>
      </li>
    </ul>
  </div>
</template>
