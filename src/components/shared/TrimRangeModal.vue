<script setup lang="ts">
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
</script>

<template>
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
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="loading"
            class="flex-1 py-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white text-[12px] font-bold transition-all disabled:opacity-50"
            @click="emit('confirm')"
          >{{ loading ? 'Trimming…' : confirmLabel }}</button>
          <button
            type="button"
            class="flex-1 py-2 rounded-xl text-gray-600 hover:text-gray-400 text-[12px] transition-colors border border-white/[0.07]"
            @click="emit('close')"
          >Cancel</button>
        </div>
      </div>
    </div>
  </Transition>
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
