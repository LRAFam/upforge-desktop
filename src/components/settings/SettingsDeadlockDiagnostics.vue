<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

type DetectionStatus = Awaited<ReturnType<typeof window.api.deadlock.getDetectionStatus>>

const status = ref<DetectionStatus | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  status.value = await window.api.deadlock.getDetectionStatus()
}

function flag(ok: boolean): string {
  return ok ? 'text-teal-400' : 'text-amber-400/90'
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => { void refresh() }, 2000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="rounded-xl border border-teal-500/15 bg-black/20 p-3 space-y-3">
    <p class="text-xs font-semibold text-gray-300">Match detection diagnostics</p>
    <p class="text-[11px] text-gray-500 leading-relaxed">
      UpForge reads Deadlock match data from Steam&apos;s local cache — no launch options needed. Keep Steam open while you play.
    </p>

    <div v-if="status" class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
      <span class="text-gray-600">Phase</span>
      <span class="font-mono text-gray-300">{{ status.phase }}</span>
      <span class="text-gray-600">Steam cache active</span>
      <span :class="flag(status.logReceiving)">{{ status.logReceiving ? 'Yes' : 'No' }}</span>
      <span class="text-gray-600">Ready to record</span>
      <span :class="flag(status.readyToRecord)">{{ status.readyToRecord ? 'Yes' : 'No — waits for match' }}</span>
      <span class="text-gray-600">Replay on CDN</span>
      <span :class="flag(status.replayLive)">{{ status.replayLive ? 'Yes' : 'No' }}</span>
      <span v-if="status.activeMatchId" class="text-gray-600">Match ID</span>
      <span v-if="status.activeMatchId" class="font-mono text-gray-300">{{ status.activeMatchId }}</span>
      <span v-if="status.heroKey" class="text-gray-600">Hero</span>
      <span v-if="status.heroKey" class="font-mono text-gray-300 truncate">{{ status.heroKey }}</span>
    </div>

    <div v-if="status?.lastLogLine" class="text-[10px] text-gray-700 font-mono line-clamp-2">
      {{ status.lastLogLine }}
    </div>

    <div v-if="status?.replayDir" class="text-[10px] text-gray-600 font-mono truncate" :title="status.replayDir">
      Replays: {{ status.replayDir }}
    </div>
  </div>
</template>
