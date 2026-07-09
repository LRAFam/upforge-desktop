<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import DemoAttachGuide from '../DemoAttachGuide.vue'
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
const attaching = ref(false)
const scanning = ref(false)
const statusMessage = ref<string | null>(null)

async function attachDemo() {
  if (!props.recordingId || attaching.value) return
  attaching.value = true
  statusMessage.value = null
  try {
    const result = await window.api.recordings.attachDemo(props.recordingId)
    if (result.ok) {
      statusMessage.value = 'Demo linked — timeline and clips updated.'
      emit('demo-linked')
    } else if (result.error !== 'Cancelled') {
      statusMessage.value = result.error ?? 'Could not read demo — check your Steam name in Settings.'
    }
  } catch {
    statusMessage.value = 'Attach failed — try again from the dashboard.'
  } finally {
    attaching.value = false
  }
}

async function scanFolder() {
  if (!props.recordingId || scanning.value) return
  scanning.value = true
  statusMessage.value = null
  try {
    const result = await window.api.recordings.refreshDemoTimeline(props.recordingId)
    if (result.ok) {
      statusMessage.value = 'Demo found in folder — timeline updated.'
      emit('demo-linked')
    } else {
      statusMessage.value = result.analysisReadiness?.message ?? 'No demo in your replay folder yet.'
    }
  } catch {
    statusMessage.value = 'Scan failed — try attaching the file manually.'
  } finally {
    scanning.value = false
  }
}

function openSettings() {
  void router.push('/settings?tab=recording')
}
</script>

<template>
  <aside class="vod-demo-pending flex w-72 flex-shrink-0 flex-col border-r border-white/[0.08] bg-[#0c0c0c]">
    <div class="border-b border-white/[0.06] px-4 py-3">
      <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300/90">Optional demo</p>
      <p class="mt-1 text-sm font-bold text-white leading-snug">
        {{ game === 'cs2' ? 'Attach CS2 demo' : 'Attach replay' }}
      </p>
      <p v-if="map" class="mt-0.5 text-[11px] text-gray-500 uppercase">{{ cs2MapDisplayName(map) || map }}</p>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <p class="text-[11px] text-gray-400 leading-relaxed">
        Your recording plays normally on the right. {{ demoSyncExplainer(game) }}
      </p>

      <DemoAttachGuide :game="game" default-open />

      <div class="rounded-xl border border-blue-500/15 bg-blue-500/[0.06] px-3 py-3 space-y-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-blue-300/80">Why attach?</p>
        <ul class="text-[10px] text-gray-500 space-y-1.5 list-disc pl-4 leading-relaxed">
          <li>Kill timeline synced to your VOD</li>
          <li>Auto highlight clips (multikills, clutches)</li>
          <li v-if="game === 'cs2'">Set your CS2 Steam name in Settings → Recording</li>
        </ul>
      </div>

      <button
        type="button"
        class="w-full rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2.5 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        :disabled="!recordingId || attaching"
        @click="attachDemo"
      >
        {{ attaching ? 'Attaching…' : 'Choose .dem file…' }}
      </button>
      <button
        type="button"
        class="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.07] transition-colors disabled:opacity-50"
        :disabled="!recordingId || scanning"
        @click="scanFolder"
      >
        {{ scanning ? 'Scanning…' : 'Scan replay folder' }}
      </button>
      <button
        type="button"
        class="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.07] transition-colors"
        @click="openSettings"
      >
        Settings → Recording
      </button>
      <p v-if="statusMessage" class="text-[10px] leading-relaxed" :class="statusMessage.includes('linked') || statusMessage.includes('found') ? 'text-emerald-400/90' : 'text-amber-300/90'">
        {{ statusMessage }}
      </p>
    </div>
  </aside>
</template>
