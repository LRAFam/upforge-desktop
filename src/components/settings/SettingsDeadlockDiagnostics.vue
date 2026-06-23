<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

type DetectionStatus = Awaited<ReturnType<typeof window.api.deadlock.getDetectionStatus>>

const status = ref<DetectionStatus | null>(null)
const condebugMsg = ref<string | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  status.value = await window.api.deadlock.getDetectionStatus()
}

async function ensureCondebug() {
  busy.value = true
  condebugMsg.value = null
  try {
    const res = await window.api.deadlock.ensureCondebug()
    if (res.ok && res.alreadyConfigured) {
      condebugMsg.value = '-condebug is set in Steam. Restart Deadlock if the log is not updating.'
    } else if (res.ok && res.needsGameRestart) {
      condebugMsg.value = 'Added -condebug — fully restart Deadlock once.'
    } else if (res.error) {
      condebugMsg.value = res.error
    }
  } finally {
    busy.value = false
    await refresh()
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs font-semibold text-gray-300">Match detection diagnostics</p>
      <button
        type="button"
        class="text-[10px] font-medium text-teal-400/80 hover:text-teal-300"
        :disabled="busy"
        @click="ensureCondebug"
      >
        {{ busy ? '…' : 'Fix -condebug' }}
      </button>
    </div>

    <p v-if="condebugMsg" class="text-[11px] text-teal-300/80 leading-relaxed">{{ condebugMsg }}</p>

    <div v-if="status" class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
      <span class="text-gray-600">Phase</span>
      <span class="font-mono text-gray-300">{{ status.phase }}</span>
      <span class="text-gray-600">Log receiving</span>
      <span :class="flag(status.logReceiving)">{{ status.logReceiving ? 'Yes' : 'No' }}</span>
      <span class="text-gray-600">Log growing</span>
      <span :class="flag(status.logGrowing)">{{ status.logGrowing ? 'Yes' : 'No' }}</span>
      <span class="text-gray-600">Ready to record</span>
      <span :class="flag(status.readyToRecord)">{{ status.readyToRecord ? 'Yes' : 'No' }}</span>
      <span class="text-gray-600">Replay writing</span>
      <span :class="flag(status.replayLive)">{{ status.replayLive ? 'Yes' : 'No' }}</span>
      <span v-if="status.mapName" class="text-gray-600">Map</span>
      <span v-if="status.mapName" class="font-mono text-gray-300 truncate">{{ status.mapName }}</span>
      <span v-if="status.heroKey" class="text-gray-600">Hero</span>
      <span v-if="status.heroKey" class="font-mono text-gray-300 truncate">{{ status.heroKey }}</span>
      <span v-if="status.liveKills || status.liveDeaths" class="text-gray-600">K / D (log)</span>
      <span v-if="status.liveKills || status.liveDeaths" class="text-gray-300">{{ status.liveKills }} / {{ status.liveDeaths }}</span>
    </div>

    <div v-if="status?.logPath" class="text-[10px] text-gray-600 font-mono truncate" :title="status.logPath">
      Log: {{ status.logPath }}
    </div>
    <div v-if="status?.lastLogLine" class="text-[10px] text-gray-700 font-mono line-clamp-2" :title="status.lastLogLine">
      Last: {{ status.lastLogLine }}
    </div>

    <div v-if="status?.logCandidates?.length" class="pt-1 border-t border-white/[0.06]">
      <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">Console.log candidates</p>
      <div class="space-y-0.5 max-h-24 overflow-y-auto">
        <div
          v-for="c in status.logCandidates"
          :key="c.path"
          class="text-[9px] font-mono truncate"
          :class="c.path === status.logPath ? 'text-teal-400/90' : 'text-gray-700'"
          :title="c.path"
        >
          {{ fmtBytes(c.size) }} — {{ c.path }}
        </div>
      </div>
    </div>
  </div>
</template>
