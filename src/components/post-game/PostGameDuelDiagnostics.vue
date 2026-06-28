<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DuelFailureDiagnostics } from '../../lib/duel-diagnostics'
import {
  diagnosticsSummary,
  duelSeekMs,
  duelWindowForMoment,
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
const previewLoadingKey = ref<string | null>(null)
const previewError = ref<string | null>(null)
const previewPath = ref<string | null>(null)
const previewLabel = ref<string | null>(null)

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
    window: duelWindowForMoment(moment),
    line: formatMomentVisionLine(moment),
    moment,
  })),
)

function previewVideoSrc(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/')
    ? encodeURI(`file://${normalized}`)
    : encodeURI(`file:///${normalized}`)
}

async function viewInVod(seekMs: number | null) {
  if (!props.recordingId) return
  await window.api.app.openVodReview(props.recordingId, seekMs ?? undefined)
}

async function previewDuelClip(row: (typeof rows.value)[number]) {
  if (!props.recordingId) return
  previewLoadingKey.value = row.key
  previewError.value = null
  previewPath.value = null
  previewLabel.value = `R${row.round}${row.callout ? ` · ${row.callout}` : ''}`
  try {
    const result = await window.api.recordings.previewDuelWindow(props.recordingId, {
      windowStartMs: row.window.startMs,
      windowEndMs: row.window.endMs,
      momentId: row.moment.moment_id ?? row.key,
    })
    if (!result.ok) {
      previewError.value = result.error
      return
    }
    previewPath.value = result.path
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : 'Could not extract duel preview'
  } finally {
    previewLoadingKey.value = null
  }
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
      Use <span class="text-gray-400">Preview duel clip</span> to see the exact window we try to send for review.
    </p>

    <div
      v-if="previewPath || previewError"
      class="mt-3 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2"
    >
      <p v-if="previewLabel" class="text-[10px] font-semibold text-gray-400 mb-1.5">
        Duel clip preview — {{ previewLabel }}
      </p>
      <video
        v-if="previewPath"
        :src="previewVideoSrc(previewPath)"
        class="w-full rounded-md bg-black aspect-video"
        controls
        autoplay
        playsinline
      />
      <p v-if="previewError" class="text-[11px] text-amber-400/90 leading-snug">
        {{ previewError }}
      </p>
    </div>

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
        <div v-if="recordingId" class="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            v-if="row.seekMs != null"
            type="button"
            class="text-[10px] font-semibold text-cyan-400/90 hover:text-cyan-300 transition-colors"
            @click="viewInVod(row.seekMs)"
          >
            View in VOD
          </button>
          <button
            type="button"
            class="text-[10px] font-semibold text-amber-400/90 hover:text-amber-300 transition-colors disabled:opacity-50"
            :disabled="previewLoadingKey === row.key"
            @click="previewDuelClip(row)"
          >
            {{ previewLoadingKey === row.key ? 'Extracting…' : 'Preview duel clip' }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
