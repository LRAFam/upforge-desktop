<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatRelativeTime } from '../../lib/dashboard-match-row'
import { cs2MapDisplayName } from '../../lib/cs2-maps'
import {
  recordingHintLabel,
  type DemoPreviewAssessment,
  type RecordingDemoHint,
} from '../../lib/demo-preview-match'
import type { RankedDemoCandidate } from '../../lib/demo-recording-match'

type DemoPreview = NonNullable<Awaited<ReturnType<typeof window.api.recordings.previewDemo>>['preview']>

const props = defineProps<{
  show: boolean
  recordingId: string
  game: string
  map: string | null
  recordedAt: number
}>()

const emit = defineEmits<{
  close: []
  attached: []
}>()

const loading = ref(false)
const attaching = ref(false)
const error = ref<string | null>(null)
const candidates = ref<RankedDemoCandidate[]>([])
const recordingHint = ref<RecordingDemoHint | null>(null)
const selectedPath = ref<string | null>(null)

const previewLoading = ref(false)
const preview = ref<DemoPreview | null>(null)
const assessment = ref<DemoPreviewAssessment | null>(null)
const previewError = ref<string | null>(null)
const previewCache = new Map<string, { preview: DemoPreview | null; assessment: DemoPreviewAssessment | null }>()

const mapLabel = computed(() => {
  if (!props.map) return props.game === 'cs2' ? 'CS2 match' : 'Deadlock match'
  return props.game === 'cs2' ? (cs2MapDisplayName(props.map) || props.map) : props.map
})

const recordedLabel = computed(() => formatRelativeTime(new Date(props.recordedAt).toISOString()))

const vodHintLabel = computed(() => {
  if (!recordingHint.value) return null
  return recordingHintLabel(recordingHint.value, props.game)
})

const recommended = computed(() => candidates.value.find((c) => c.recommended) ?? null)

const previewMapLabel = computed(() => {
  if (!preview.value?.map) return 'Unknown map'
  return props.game === 'cs2'
    ? (cs2MapDisplayName(preview.value.map) || preview.value.map)
    : preview.value.map
})

const assessmentTone = computed(() => {
  const confidence = assessment.value?.confidence
  if (confidence === 'strong') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
  if (confidence === 'possible') return 'border-blue-500/25 bg-blue-500/10 text-blue-200'
  if (confidence === 'mismatch') return 'border-red-500/25 bg-red-500/10 text-red-200'
  return 'border-white/10 bg-white/[0.04] text-gray-300'
})

async function loadCandidates() {
  loading.value = true
  error.value = null
  previewCache.clear()
  preview.value = null
  assessment.value = null
  previewError.value = null
  try {
    const result = await window.api.recordings.listDemoCandidates(props.recordingId)
    recordingHint.value = result.recordingHint
    if (result.error && !result.candidates.length) {
      error.value = result.error
      candidates.value = []
      selectedPath.value = null
      return
    }
    candidates.value = result.candidates
    selectedPath.value = result.candidates.find((c) => c.recommended)?.path
      ?? result.candidates[0]?.path
      ?? null
  } catch {
    error.value = 'Could not scan replay folders.'
    candidates.value = []
    selectedPath.value = null
  } finally {
    loading.value = false
  }
}

async function loadPreview(path: string | null) {
  preview.value = null
  assessment.value = null
  previewError.value = null
  if (!path) return

  const cached = previewCache.get(path)
  if (cached) {
    preview.value = cached.preview
    assessment.value = cached.assessment
    return
  }

  previewLoading.value = true
  try {
    const result = await window.api.recordings.previewDemo(props.recordingId, path)
    previewCache.set(path, { preview: result.preview, assessment: result.assessment })
    preview.value = result.preview
    assessment.value = result.assessment
    previewError.value = result.error ?? result.preview?.error ?? null
  } catch {
    previewError.value = 'Preview failed — try another file.'
  } finally {
    previewLoading.value = false
  }
}

watch(() => props.show, (open) => {
  if (open) void loadCandidates()
})

watch(selectedPath, (path) => {
  void loadPreview(path)
})

async function confirmAttach() {
  if (!selectedPath.value || attaching.value) return
  if (assessment.value?.confidence === 'mismatch') {
    error.value = 'This replay looks like a different map — pick another file or use Browse.'
    return
  }
  attaching.value = true
  error.value = null
  try {
    const result = await window.api.recordings.attachDemo(props.recordingId, selectedPath.value)
    if (result.ok) {
      emit('attached')
      emit('close')
    } else if (result.error !== 'Cancelled') {
      error.value = result.error ?? 'Could not read this replay.'
    }
  } catch {
    error.value = 'Attach failed — try another file.'
  } finally {
    attaching.value = false
  }
}

async function browseOther() {
  const result = await window.api.recordings.attachDemo(props.recordingId)
  if (result.ok) {
    emit('attached')
    emit('close')
  } else if (result.error && result.error !== 'Cancelled') {
    error.value = result.error
  }
}

function openFolder() {
  if (props.game === 'cs2') {
    void window.api.cs2.openDemosFolder()
    return
  }
  void window.api.deadlock.openReplaysFolder()
}

function selectDemo(path: string) {
  selectedPath.value = path
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSavedAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function rowClass(fit: RankedDemoCandidate['fit'], selected: boolean): string {
  if (selected) return 'border-blue-400/40 bg-blue-500/10'
  if (fit === 'best') return 'border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]'
  if (fit === 'unlikely') return 'border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90'
  return 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]'
}
</script>

<template>
  <Transition name="modal-pop">
    <div
      v-if="show"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      @click.self="emit('close')"
    >
      <div class="relative w-full max-w-4xl bg-[#111116] border border-white/[0.10] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[min(90vh,760px)]">
        <div class="px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300/90">Match replay to VOD</p>
          <h3 class="text-base font-bold text-white mt-1">{{ mapLabel }}</h3>
          <p class="text-[11px] text-gray-500 mt-0.5">
            Recorded {{ recordedLabel }}
            <span v-if="vodHintLabel" class="text-gray-600">· your VOD: {{ vodHintLabel }}</span>
          </p>
        </div>

        <div class="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div class="border-b lg:border-b-0 lg:border-r border-white/[0.08] px-4 py-4 overflow-y-auto min-h-[220px]">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Local replays</p>

            <div v-if="loading" class="flex items-center gap-2 py-8 justify-center text-xs text-gray-500">
              <div class="w-3.5 h-3.5 rounded-full border border-blue-400/30 border-t-blue-300 animate-spin" />
              Scanning folders…
            </div>

            <div v-else-if="!candidates.length" class="py-6 text-center space-y-2">
              <p class="text-sm text-gray-300">No replay files found yet</p>
              <p class="text-[11px] text-gray-500 leading-relaxed">
                Download the match in-game, then rescan.
              </p>
            </div>

            <div v-else class="space-y-2">
              <button
                v-for="demo in candidates"
                :key="demo.path"
                type="button"
                class="w-full text-left rounded-xl border px-3 py-2.5 transition-colors"
                :class="rowClass(demo.fit, selectedPath === demo.path)"
                @click="selectDemo(demo.path)"
              >
                <div class="flex items-start gap-2.5">
                  <div
                    class="mt-0.5 w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center"
                    :class="selectedPath === demo.path ? 'border-blue-400 bg-blue-500/30' : 'border-white/20'"
                  >
                    <div v-if="selectedPath === demo.path" class="w-1.5 h-1.5 rounded-full bg-blue-300" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <p class="text-[11px] font-semibold text-gray-100 truncate">{{ demo.name }}</p>
                      <span
                        v-if="demo.recommended"
                        class="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                      >Likely</span>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-0.5">{{ demo.timingDetail }}</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div class="px-4 py-4 overflow-y-auto min-h-[220px] bg-black/20">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Preview</p>

            <div v-if="!selectedPath" class="py-10 text-center text-[11px] text-gray-600">
              Select a replay to preview kills and score
            </div>

            <div v-else-if="previewLoading" class="flex items-center gap-2 py-10 justify-center text-xs text-gray-500">
              <div class="w-3.5 h-3.5 rounded-full border border-blue-400/30 border-t-blue-300 animate-spin" />
              Parsing replay…
            </div>

            <div v-else-if="preview?.ok" class="space-y-3">
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                <p class="text-sm font-bold text-white">{{ previewMapLabel }}</p>
                <p class="text-[11px] text-gray-400 mt-1">
                  <span class="text-gray-200 font-semibold">{{ preview.allyScore }}–{{ preview.enemyScore }}</span>
                  <span v-if="preview.won != null" class="ml-2" :class="preview.won ? 'text-emerald-400' : 'text-red-400'">
                    {{ preview.won ? 'Win' : 'Loss' }}
                  </span>
                  <span v-if="preview.kills != null" class="ml-2 font-mono">{{ preview.kills }}/{{ preview.deaths }}/{{ preview.assists }}</span>
                  <span v-if="preview.rounds" class="text-gray-600 ml-1">· {{ preview.rounds }} rounds</span>
                </p>
                <p v-if="preview.playerName" class="text-[10px] text-gray-600 mt-1">Player: {{ preview.playerName }}</p>
              </div>

              <div
                v-if="assessment"
                class="rounded-xl border px-3.5 py-3"
                :class="assessmentTone"
              >
                <p class="text-[11px] font-semibold">{{ assessment.headline }}</p>
                <ul v-if="assessment.details.length" class="mt-1.5 space-y-1">
                  <li
                    v-for="(line, index) in assessment.details"
                    :key="index"
                    class="text-[10px] leading-relaxed opacity-90"
                  >{{ line }}</li>
                </ul>
              </div>

              <div v-if="preview.killHighlights.length" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Your kills (sample)</p>
                <ul class="space-y-1">
                  <li
                    v-for="(kill, index) in preview.killHighlights"
                    :key="`${kill.round}-${index}`"
                    class="text-[10px] text-gray-400 font-mono"
                  >{{ kill.label }}</li>
                </ul>
              </div>
            </div>

            <div v-else class="py-8 text-center space-y-2">
              <p class="text-sm text-amber-300/90">{{ previewError || preview?.error || 'Could not preview this replay' }}</p>
              <p class="text-[10px] text-gray-600">Check your Steam name in Settings → Recording, or try another file.</p>
            </div>
          </div>
        </div>

        <div class="px-5 py-4 border-t border-white/[0.08] flex-shrink-0 space-y-2">
          <p v-if="error" class="text-[11px] text-amber-300/90 leading-relaxed">{{ error }}</p>
          <p v-else-if="recommended && candidates.length > 1" class="text-[10px] text-gray-600 leading-relaxed">
            Flick through the list — preview updates on the right. Attach when the stats match what you remember.
          </p>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="flex-1 min-w-[140px] rounded-lg px-3 py-2.5 text-[11px] font-semibold text-white bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/25 transition-colors disabled:opacity-50"
              :disabled="!selectedPath || attaching || loading || previewLoading || assessment?.confidence === 'mismatch'"
              @click="confirmAttach"
            >
              {{ attaching ? 'Attaching…' : 'Use this replay' }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2.5 text-[11px] font-semibold text-gray-300 border border-white/10 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
              :disabled="loading"
              @click="loadCandidates"
            >
              Rescan
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2.5 text-[11px] font-semibold text-gray-400 border border-white/10 hover:bg-white/[0.05] transition-colors"
              @click="openFolder"
            >
              Open folder
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200 transition-colors"
              @click="browseOther"
            >
              Browse…
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2.5 text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors ml-auto"
              @click="emit('close')"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-pop-enter-active,
.modal-pop-leave-active {
  transition: opacity 0.18s ease;
}
.modal-pop-enter-from,
.modal-pop-leave-to {
  opacity: 0;
}
</style>
