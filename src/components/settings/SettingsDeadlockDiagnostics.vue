<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { uiV3 } from '../../lib/ui-v3'

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
  <div v-if="uiV3" class="uf-inset">
    <div class="uf-set-row-text">
      <p class="uf-t3">Match detection diagnostics</p>
      <p class="uf-t4">UpForge reads Deadlock match data from Steam&apos;s local cache — no launch options needed. Keep Steam open while you play.</p>
    </div>
    <dl v-if="status" class="uf-dl">
      <dt>Phase</dt><dd class="uf-mono">{{ status.phase }}</dd>
      <dt>Steam cache active</dt><dd :class="status.logReceiving ? 'is-ok' : 'is-warn'">{{ status.logReceiving ? 'Yes' : 'No' }}</dd>
      <dt>Ready to record</dt><dd :class="status.readyToRecord ? 'is-ok' : 'is-warn'">{{ status.readyToRecord ? 'Yes' : 'No — waits for match' }}</dd>
      <dt>Replay on CDN</dt><dd :class="status.replayLive ? 'is-ok' : 'is-warn'">{{ status.replayLive ? 'Yes' : 'No' }}</dd>
      <template v-if="status.activeMatchId"><dt>Match ID</dt><dd class="uf-mono">{{ status.activeMatchId }}</dd></template>
      <template v-if="status.heroKey"><dt>Hero</dt><dd class="uf-mono">{{ status.heroKey }}</dd></template>
    </dl>
    <p v-if="status?.lastLogLine" class="uf-mono">{{ status.lastLogLine }}</p>
    <p v-if="status?.replayDir" class="uf-mono" :title="status.replayDir">Replays: {{ status.replayDir }}</p>
  </div>
  <div v-else class="rounded-xl border border-teal-500/15 bg-black/20 p-3 space-y-3">
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
