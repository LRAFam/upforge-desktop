<script setup lang="ts">
import { ref } from 'vue'
import { uiV3 } from '../../lib/ui-v3'
import UfButton from '../v3/UfButton.vue'
import { useRouter } from 'vue-router'
import DemoAttachGuide from '../DemoAttachGuide.vue'
import DemoAttachPickerModal from '../shared/DemoAttachPickerModal.vue'
import { demoSyncExplainer } from '../../lib/recording-demo-status'
import { cs2MapDisplayName } from '../../lib/cs2-maps'

const emit = defineEmits<{ 'demo-linked': [] }>()

const props = defineProps<{
  game: string
  map: string | null
  recordedAt: number
  recordingId: string | null
}>()

const router = useRouter()
const pickerOpen = ref(false)
const statusMessage = ref<string | null>(null)

function openPicker() {
  if (!props.recordingId) return
  statusMessage.value = null
  pickerOpen.value = true
}

function onAttached() {
  pickerOpen.value = false
  statusMessage.value = 'Replay linked. The timeline and clips are updating.'
  emit('demo-linked')
}

function openSettings() {
  void router.push('/settings?tab=recording')
}
</script>

<template>
<template v-if="uiV3">
  <aside class="vod-demo-pending dp3">
    <div class="dp3-head">
      <span class="uf-label">Match data</span>
      <h2 class="uf-d4">{{ game === 'cs2' ? 'Attach your CS2 demo' : 'Match replay' }}</h2>
      <span v-if="map" class="uf-t4" style="text-transform: uppercase">{{ cs2MapDisplayName(map) || map }}</span>
    </div>
    <div class="dp3-body">
      <p class="uf-t2">You can watch your recording now. Attach the matching demo to enable AI coaching. {{ demoSyncExplainer(game) }}</p>
      <DemoAttachGuide :game="game" default-open />
      <div class="dp3-why">
        <span class="uf-label">Why attach</span>
        <p class="uf-t4">Kill timeline synced to your VOD</p>
        <p class="uf-t4">Event markers for reviewing your fights</p>
        <p v-if="game === 'cs2'" class="uf-t4">Set your CS2 Steam name in Recording settings</p>
      </div>
      <div class="dp3-actions">
        <UfButton variant="primary" :disabled="!recordingId" @click="openPicker">Choose matching demo</UfButton>
        <UfButton variant="link" @click="openSettings">Recording settings</UfButton>
      </div>
      <p v-if="statusMessage" role="status" class="uf-t4" style="color: var(--uf-win)">{{ statusMessage }}</p>
    </div>
    <DemoAttachPickerModal v-if="recordingId" :show="pickerOpen" :recording-id="recordingId" :game="game" :map="map" :recorded-at="recordedAt" @close="pickerOpen = false" @attached="onAttached" />
  </aside>
</template>
<template v-else>
  <aside class="vod-demo-pending flex w-72 flex-shrink-0 flex-col border-r border-white/[0.08] bg-[#0c0c0c]">
    <div class="border-b border-white/[0.06] px-4 py-3">
      <p class="text-[12px] font-bold uppercase tracking-[0.08em] text-blue-300/90">Match data</p>
      <p class="mt-1 text-sm font-bold text-white leading-snug">
        {{ game === 'cs2' ? 'Attach your CS2 demo' : 'Match replay' }}
      </p>
      <p v-if="map" class="mt-0.5 text-[13px] text-gray-400 uppercase">{{ cs2MapDisplayName(map) || map }}</p>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <p class="text-[13px] text-gray-400 leading-relaxed">
        You can watch your recording now. Attach the matching demo to enable AI coaching. {{ demoSyncExplainer(game) }}
      </p>

      <DemoAttachGuide :game="game" default-open />

      <div class="rounded-xl border border-blue-500/15 bg-blue-500/[0.06] px-3 py-3 space-y-2">
        <p class="text-[12px] font-semibold uppercase tracking-wide text-blue-300/80">Why attach?</p>
        <ul class="text-[12px] text-gray-400 space-y-1.5 list-disc pl-4 leading-relaxed">
          <li>Kill timeline synced to your VOD</li>
          <li>Event markers for reviewing your fights</li>
          <li v-if="game === 'cs2'">Set your CS2 Steam name in Recording settings</li>
        </ul>
      </div>

      <button
        type="button"
        class="w-full rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2.5 text-[13px] font-semibold text-blue-200 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        :disabled="!recordingId"
        @click="openPicker"
      >
        Choose matching demo
      </button>
      <button
        type="button"
        class="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] font-semibold text-gray-300 hover:bg-white/[0.07] transition-colors"
        @click="openSettings"
      >
        Recording settings
      </button>
      <p v-if="statusMessage" class="text-[12px] leading-relaxed text-emerald-400/90">
        {{ statusMessage }}
      </p>
    </div>

    <DemoAttachPickerModal
      v-if="recordingId"
      :show="pickerOpen"
      :recording-id="recordingId"
      :game="game"
      :map="map"
      :recorded-at="recordedAt"
      @close="pickerOpen = false"
      @attached="onAttached"
    />
  </aside>
</template>
</template>

<style scoped>
.dp3 { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--uf-line); background: var(--uf-bg); }
.dp3 p, .dp3 h2 { margin: 0; }
.dp3-head { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 16px; border-bottom: 1px solid var(--uf-line); }
.dp3-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; padding: 18px 20px; }
.dp3-why { display: flex; flex-direction: column; gap: 6px; padding-top: 14px; border-top: 1px solid var(--uf-line); }
.dp3-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
</style>
