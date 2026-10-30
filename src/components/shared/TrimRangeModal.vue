<script setup lang="ts">
import { computed } from 'vue'
import UfDialog from '../v3/UfDialog.vue'
import UfButton from '../v3/UfButton.vue'
import { uiV3 } from '../../lib/ui-v3'
import { formatTrimTime, nudgeTrimEnd, nudgeTrimStart, trimRangePercent, TRIM_MIN_GAP } from '../../lib/shell-v3'

const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  duration: number
  startSec: number
  endSec: number
  loading?: boolean
  error?: string | null
  confirmLabel?: string
  hint?: string | null
}>(), {
  title: 'Trim',
  loading: false,
  error: null,
  confirmLabel: 'Trim',
  hint: null,
})

const emit = defineEmits<{
  close: []
  confirm: []
  'update:startSec': [number]
  'update:endSec': [number]
}>()

function formatDuration(secs: number, precise = false): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const total = precise ? Math.round(secs * 10) / 10 : Math.floor(secs)
  const m = Math.floor(total / 60)
  const s = precise ? (total % 60).toFixed(1) : String(Math.floor(total % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function nudgeStart(delta: number) {
  const next = Math.round(Math.max(0, Math.min(props.endSec - 0.5, props.startSec + delta)) * 10) / 10
  emit('update:startSec', next)
}

function nudgeEnd(delta: number) {
  const next = Math.round(Math.max(props.startSec + 0.5, Math.min(props.duration, props.endSec + delta)) * 10) / 10
  emit('update:endSec', next)
}

// v3: same clamps as nudgeStart/nudgeEnd above, via tested helpers.
const keep = computed(() => trimRangePercent(props.startSec, props.endSec, props.duration))
function v3Start(delta: number) { emit('update:startSec', nudgeTrimStart(props.startSec, props.endSec, delta)) }
function v3End(delta: number) { emit('update:endSec', nudgeTrimEnd(props.startSec, props.endSec, props.duration, delta)) }
function onRange(which: 'start' | 'end', e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (which === 'start') emit('update:startSec', v)
  else emit('update:endSec', v)
}
</script>

<template>
  <UfDialog v-if="uiV3" :open="show" :title="title" kicker="Keep the part that matters" :width="480" @close="emit('close')">
    <p class="uf-t4" style="margin: 0">
      Original <span class="uf-num" style="color: var(--uf-muted)">{{ formatTrimTime(duration, true) }}</span>
      · New <span class="uf-num" style="color: var(--uf-bone)">{{ formatTrimTime(endSec - startSec, true) }}</span>
    </p>
    <p v-if="hint" class="uf-dialog-warn">{{ hint }}</p>

    <div class="uf-trim-bar" aria-hidden="true">
      <div class="uf-trim-keep" :style="{ left: keep.left + '%', width: keep.width + '%' }" />
    </div>

    <div class="uf-trim-row">
      <div class="uf-trim-row-head">
        <label class="uf-label" for="uf-trim-start">Start</label>
        <div class="uf-trim-stepper">
          <button type="button" aria-label="Start back 0.1 seconds" @click="v3Start(-0.1)">−</button>
          <output class="uf-t3 uf-num" for="uf-trim-start">{{ formatTrimTime(startSec, true) }}</output>
          <button type="button" aria-label="Start forward 0.1 seconds" @click="v3Start(0.1)">+</button>
        </div>
      </div>
      <input id="uf-trim-start" class="uf-trim-range" type="range" :value="startSec" :min="0" :max="endSec - TRIM_MIN_GAP" step="0.1" @input="onRange('start', $event)" />
    </div>
    <div class="uf-trim-row">
      <div class="uf-trim-row-head">
        <label class="uf-label" for="uf-trim-end">End</label>
        <div class="uf-trim-stepper">
          <button type="button" aria-label="End back 0.1 seconds" @click="v3End(-0.1)">−</button>
          <output class="uf-t3 uf-num" for="uf-trim-end">{{ formatTrimTime(endSec, true) }}</output>
          <button type="button" aria-label="End forward 0.1 seconds" @click="v3End(0.1)">+</button>
        </div>
      </div>
      <input id="uf-trim-end" class="uf-trim-range" type="range" :value="endSec" :min="startSec + TRIM_MIN_GAP" :max="duration" step="0.1" @input="onRange('end', $event)" />
    </div>
    <p v-if="error" class="uf-dialog-error" role="alert">{{ error }}</p>

    <template #actions>
      <button type="button" class="uf-link" style="margin-right: auto" @click="emit('close')">Cancel</button>
      <UfButton variant="primary" :disabled="loading" @click="emit('confirm')">{{ loading ? 'Trimming…' : confirmLabel }}</UfButton>
    </template>
  </UfDialog>
<template v-else>
  <Transition name="modal-pop">
    <div
      v-if="show"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md"
      @click.self="emit('close')"
    >
      <div class="relative w-[380px] bg-[#111116] border border-white/[0.10] rounded-2xl p-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
        <h3 class="text-sm font-bold text-white mb-1">{{ title }}</h3>
        <p class="text-xs text-gray-500 mb-4">
          Original duration:
          <span class="text-gray-400 font-mono">{{ formatDuration(duration, true) }}</span>
          · New duration:
          <span class="text-red-400 font-mono">{{ formatDuration(endSec - startSec, true) }}</span>
        </p>
        <p v-if="hint" class="text-xs text-amber-400/90 mb-3">{{ hint }}</p>

        <div class="relative h-8 mb-4 bg-white/[0.04] rounded-lg overflow-hidden border border-white/[0.10]">
          <div
            class="absolute top-0 bottom-0 bg-red-500/20 border-x border-red-500/40 transition-all"
            :style="{
              left: (startSec / duration * 100) + '%',
              width: ((endSec - startSec) / duration * 100) + '%',
            }"
          />
          <div
            class="absolute top-1 text-[9px] font-mono text-red-400 pointer-events-none"
            :style="{ left: 'calc(' + (startSec / duration * 100) + '% + 4px)' }"
          >{{ formatDuration(startSec, true) }}</div>
          <div
            class="absolute top-1 text-[9px] font-mono text-red-400 pointer-events-none"
            :style="{ right: 'calc(' + ((1 - endSec / duration) * 100) + '% + 4px)' }"
          >{{ formatDuration(endSec, true) }}</div>
        </div>

        <div class="space-y-3 mb-4">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs text-gray-500">Start</label>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                  @click="nudgeStart(-0.1)"
                >−</button>
                <span class="text-xs font-mono text-white w-16 text-center">{{ formatDuration(startSec, true) }}</span>
                <button
                  type="button"
                  class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                  @click="nudgeStart(0.1)"
                >+</button>
              </div>
            </div>
            <input
              :value="startSec"
              type="range"
              :min="0"
              :max="endSec - 0.5"
              step="0.1"
              class="w-full h-1 appearance-none bg-white/[0.08] rounded-full outline-none accent-red-500 cursor-pointer"
              @input="emit('update:startSec', Number(($event.target as HTMLInputElement).value))"
            />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs text-gray-500">End</label>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                  @click="nudgeEnd(-0.1)"
                >−</button>
                <span class="text-xs font-mono text-white w-16 text-center">{{ formatDuration(endSec, true) }}</span>
                <button
                  type="button"
                  class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                  @click="nudgeEnd(0.1)"
                >+</button>
              </div>
            </div>
            <input
              :value="endSec"
              type="range"
              :min="startSec + 0.5"
              :max="duration"
              step="0.1"
              class="w-full h-1 appearance-none bg-white/[0.08] rounded-full outline-none accent-red-500 cursor-pointer"
              @input="emit('update:endSec', Number(($event.target as HTMLInputElement).value))"
            />
          </div>
          <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn-ghost"
            @click="emit('close')"
          >Cancel</button>
          <button
            type="button"
            :disabled="loading"
            class="btn-primary"
            @click="emit('confirm')"
          >{{ loading ? 'Trimming…' : confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
</template>

<style scoped>
.modal-pop-enter-active,
.modal-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.modal-pop-enter-from,
.modal-pop-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
