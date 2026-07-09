<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { demoPendingElapsedLabel, demoSyncExplainer } from '../../lib/recording-demo-status'
import { cs2MapDisplayName } from '../../lib/cs2-maps'

const emit = defineEmits<{ 'demo-linked': [] }>()

const props = defineProps<{
  game: string
  map: string | null
  recordedAt: number
  recordingId: string | null
}>()

const router = useRouter()
const rescanning = ref(false)
const rescanMessage = ref<string | null>(null)

async function rescanDemo() {
  if (!props.recordingId || rescanning.value) return
  rescanning.value = true
  rescanMessage.value = null
  try {
    const result = await window.api.recordings.refreshDemoTimeline(props.recordingId)
    if (result.ok) {
      rescanMessage.value = 'Demo linked — timeline updated.'
      emit('demo-linked')
    } else {
      rescanMessage.value = result.analysisReadiness?.message ?? 'Demo not found yet — try again in a few minutes.'
    }
  } catch {
    rescanMessage.value = 'Scan failed — try again from the dashboard.'
  } finally {
    rescanning.value = false
  }
}

function openSettings() {
  void router.push('/settings?tab=recording')
}
</script>

<template>
  <aside class="vod-demo-pending flex w-72 flex-shrink-0 flex-col border-r border-white/[0.08] bg-[#0c0c0c]">
    <div class="border-b border-white/[0.06] px-4 py-3">
      <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300/90">Timeline waiting</p>
      <p class="mt-1 text-sm font-bold text-white leading-snug">
        {{ game === 'cs2' ? 'CS2 demo not linked yet' : 'Replay not linked yet' }}
      </p>
      <p v-if="map" class="mt-0.5 text-[11px] text-gray-500 uppercase">{{ cs2MapDisplayName(map) || map }}</p>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <p class="text-[11px] text-gray-400 leading-relaxed">
        Your recording plays normally on the right. {{ demoSyncExplainer(game) }}
      </p>
      <p class="text-[11px] text-gray-500 leading-relaxed">
        Typical wait: <span class="text-gray-300">5–15 minutes</span> after the match (up to 30 at peak).
      </p>
      <p class="text-[10px] text-gray-600">
        Waiting {{ demoPendingElapsedLabel(recordedAt) }} · keep UpForge open or play your next game
      </p>

      <div class="rounded-xl border border-blue-500/15 bg-blue-500/[0.06] px-3 py-3 space-y-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-blue-300/80">While you wait</p>
        <ul class="text-[10px] text-gray-500 space-y-1.5 list-disc pl-4 leading-relaxed">
          <li v-if="game === 'cs2'">Enable <code class="text-cyan-400/80">cl_demo_auto_recording 1</code> or download the replay in CS2</li>
          <li v-if="game === 'cs2'">Set your CS2 Steam name in Settings → Recording</li>
          <li v-if="game === 'cs2'">After 30+ min with no demo, restart Steam and rescan</li>
          <li v-else>Keep UpForge open — we'll link the replay when the game writes it</li>
        </ul>
      </div>

      <button
        type="button"
        class="w-full rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2.5 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        :disabled="!recordingId || rescanning"
        @click="rescanDemo"
      >
        {{ rescanning ? 'Scanning…' : 'Rescan for demo now' }}
      </button>
      <button
        type="button"
        class="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.07] transition-colors"
        @click="openSettings"
      >
        Settings → Recording
      </button>
      <p v-if="rescanMessage" class="text-[10px] leading-relaxed" :class="rescanMessage.includes('linked') ? 'text-emerald-400/90' : 'text-amber-300/90'">
        {{ rescanMessage }}
      </p>
    </div>
  </aside>
</template>
