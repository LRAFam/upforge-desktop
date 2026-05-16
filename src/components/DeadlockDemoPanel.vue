<template>
  <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.05]">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded-md flex items-center justify-center" style="background:rgba(20,184,166,0.15)">
          <svg class="w-3 h-3 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-200">Deadlock Replays</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded-md hover:bg-white/[0.05]"
          @click="openFolder"
        >
          Open folder
        </button>
        <button
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
          style="background:rgba(20,184,166,0.12);color:#2dd4bf;border:1px solid rgba(20,184,166,0.2)"
          @click="openAnalyze"
        >
          Analyze on Web →
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-3.5 py-4 flex items-center gap-2">
      <div class="w-3 h-3 rounded-full border border-teal-500/30 border-t-teal-400 animate-spin" />
      <span class="text-xs text-gray-600">Scanning for replays…</span>
    </div>

    <!-- No replay folder -->
    <div v-else-if="!result.exists" class="px-3.5 py-4">
      <p class="text-xs text-gray-500 leading-relaxed">
        No Deadlock replay folder found. Play a match first — replays are saved automatically at<br>
        <span class="font-mono text-gray-600 text-[10px]">%LOCALAPPDATA%\Deadlock\game\deadlock\replays\</span>
      </p>
      <button
        class="mt-3 text-xs font-medium text-teal-400 hover:text-teal-300 transition-colors"
        @click="openAnalyze"
      >
        Upload a demo manually → upforge.gg/deadlock/analyze
      </button>
    </div>

    <!-- Empty folder -->
    <div v-else-if="result.files.length === 0" class="px-3.5 py-4">
      <p class="text-xs text-gray-500">No .dem files found yet. Play a match and come back.</p>
    </div>

    <!-- File list -->
    <div v-else class="divide-y divide-white/[0.03]">
      <div
        v-for="file in result.files"
        :key="file.path"
        class="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/[0.02] transition-colors group"
      >
        <div class="w-1.5 h-1.5 rounded-full bg-teal-500/40 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-medium text-gray-300 truncate">{{ file.name }}</p>
          <p class="text-[10px] text-gray-600">{{ formatSize(file.sizeBytes) }} · {{ formatAge(file.modifiedAt) }}</p>
        </div>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-teal-400 hover:text-teal-300 px-2 py-0.5 rounded border border-teal-500/20 hover:border-teal-500/40"
          title="Open upforge.gg/deadlock/analyze to upload this file"
          @click="openAnalyze"
        >
          Analyze
        </button>
      </div>
    </div>

    <!-- Footer note -->
    <div v-if="result.exists && result.files.length > 0" class="px-3.5 py-2 border-t border-white/[0.03]">
      <p class="text-[10px] text-gray-700">Upload .dem files at <span class="text-teal-600">upforge.gg/deadlock/analyze</span> for AI coaching</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface DemFile {
  name: string
  path: string
  sizeBytes: number
  modifiedAt: number
}

const loading = ref(true)
const result = ref<{ files: DemFile[]; dir: string; exists: boolean }>({
  files: [],
  dir: '',
  exists: false,
})

onMounted(async () => {
  result.value = await window.api.deadlock.listReplays()
  loading.value = false
})

function openFolder() {
  window.api.deadlock.openReplaysFolder()
}

function openAnalyze() {
  window.api.deadlock.openAnalyze()
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatAge(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
</script>
