<template>
  <div class="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-orange-500/15">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded-md flex items-center justify-center bg-orange-500/15">
          <svg class="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-200">CS2 match demos</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded-md hover:bg-white/[0.05]"
          @click="openFolder"
        >Open folder</button>
        <button
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all bg-orange-500/15 text-orange-300 border border-orange-500/25 hover:bg-orange-500/25"
          @click="openDashboard"
        >View on web →</button>
      </div>
    </div>

    <!-- Setup checklist -->
    <div class="px-3.5 py-3 border-b border-orange-500/10 space-y-2.5">
      <p class="text-[11px] text-gray-400 leading-relaxed">
        UpForge reads your match demo after each game. Enable auto-record or download the GOTV replay in CS2 — demos usually appear in <span class="text-gray-300">5–15 minutes</span> (up to 30 at peak).
      </p>
      <div class="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Add to autoexec.cfg</p>
        <code class="block text-[11px] font-mono text-orange-200/90 leading-relaxed">cl_demo_auto_recording 1</code>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-white/[0.10] bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.07] transition-colors"
          @click="copyAutoexec"
        >{{ copied ? 'Copied!' : 'Copy command' }}</button>
        <button
          :disabled="detecting"
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-orange-500/20 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
          @click="detectFolder"
        >{{ detecting ? 'Detecting…' : 'Detect demo folder' }}</button>
      </div>
      <p v-if="demoDir" class="text-[10px] text-gray-600 font-mono truncate" :title="demoDir">
        Demo folder: {{ demoDir }}
      </p>
      <p v-else-if="detectError" class="text-[10px] text-amber-400/80">{{ detectError }}</p>
    </div>

    <div v-if="loading" class="px-3.5 py-4 flex items-center gap-2">
      <div class="w-3 h-3 rounded-full border border-orange-500/30 border-t-orange-400 animate-spin" />
      <span class="text-xs text-gray-600">Scanning for demos…</span>
    </div>

    <div v-else-if="!result.exists" class="px-3.5 py-4">
      <p class="text-xs text-gray-500 leading-relaxed">
        No CS2 demo folder found yet. Install CS2 via Steam on this PC, or set a custom path in Settings → Recording.
      </p>
      <button class="mt-3 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors" @click="openAnalyze">
        Upload a demo manually → upforge.gg/cs2/analyze
      </button>
    </div>

    <div v-else-if="result.files.length === 0" class="px-3.5 py-4">
      <p class="text-xs text-gray-500">No .dem files yet. Play a match with auto-recording enabled, then come back.</p>
    </div>

    <div v-else class="divide-y divide-white/[0.03]">
      <div
        v-for="file in result.files"
        :key="file.path"
        class="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/[0.02] transition-colors group"
      >
        <div class="w-1.5 h-1.5 rounded-full bg-orange-500/50 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-medium text-gray-300 truncate">{{ file.name }}</p>
          <p class="text-[10px] text-gray-600">{{ formatSize(file.sizeBytes) }} · {{ formatAge(file.modifiedAt) }}</p>
        </div>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-orange-400 hover:text-orange-300 px-2 py-0.5 rounded border border-orange-500/20 hover:border-orange-500/40"
          @click="openAnalyze"
        >Analyze</button>
      </div>
    </div>

    <div v-if="result.exists && result.files.length > 0" class="px-3.5 py-2 border-t border-white/[0.03]">
      <p class="text-[10px] text-gray-700">
        Demos upload automatically when a match ends. Full reports live at
        <span class="text-orange-600">upforge.gg/cs2</span>
      </p>
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

const AUTOEXEC_LINE = 'cl_demo_auto_recording 1'

const loading = ref(true)
const detecting = ref(false)
const copied = ref(false)
const demoDir = ref<string | null>(null)
const detectError = ref('')
const result = ref<{ files: DemFile[]; dir: string | null; exists: boolean }>({
  files: [],
  dir: null,
  exists: false,
})

async function refresh() {
  loading.value = true
  try {
    result.value = await window.api.cs2.listDemos()
    demoDir.value = result.value.dir
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})

async function detectFolder() {
  detecting.value = true
  detectError.value = ''
  try {
    const { dir } = await window.api.cs2.detectDemoDir()
    if (dir) {
      demoDir.value = dir
      const current = await window.api.settings.get()
      await window.api.settings.save({ cs2DemoDir: dir })
      await refresh()
    } else {
      detectError.value = 'Could not find CS2 — is Steam installed on this PC?'
    }
  } finally {
    detecting.value = false
  }
}

async function copyAutoexec() {
  try {
    await navigator.clipboard.writeText(AUTOEXEC_LINE)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    detectError.value = 'Could not copy — select the command manually.'
  }
}

function openFolder() {
  window.api.cs2.openDemosFolder()
}

function openAnalyze() {
  window.api.cs2.openAnalyze()
}

function openDashboard() {
  window.api.cs2.openDashboard()
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
