<template>
  <div class="px-3 py-3 space-y-3">

    <!-- macOS notice -->
    <div
      v-if="platform && platform !== 'win32'"
      class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-gray-400 text-xs"
    >
      <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
      <span>Performance boost is only available on Windows.</span>
    </div>

    <template v-else>

      <!-- Status card -->
      <div
        :class="[
          'rounded-xl border transition-all overflow-hidden',
          boosted
            ? 'bg-green-500/[0.07] border-green-500/25'
            : 'bg-white/[0.02] border-white/[0.05]'
        ]"
      >
        <div class="flex items-center gap-3 px-3 py-2.5">
          <div class="relative flex-shrink-0">
            <div :class="['w-2.5 h-2.5 rounded-full', boosted ? 'bg-green-400' : 'bg-gray-700']" />
            <div v-if="boosted" class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-60" />
          </div>
          <div class="flex-1 min-w-0">
            <p :class="['text-xs font-semibold', boosted ? 'text-green-300' : 'text-gray-400']">
              {{ boosted ? 'Boost Active' : 'Standard Mode' }}
            </p>
            <p class="text-[10px] text-gray-600 mt-0.5">
              Power plan: <span class="text-gray-400">{{ powerPlan || '—' }}</span>
            </p>
          </div>
          <button
            v-if="boosted"
            class="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-white/[0.07] hover:border-white/[0.15]"
            @click="restore"
            :disabled="loading"
          >
            Restore
          </button>
        </div>
      </div>

      <!-- Boost button -->
      <button
        v-if="!boosted"
        :disabled="loading"
        class="w-full py-2.5 rounded-xl font-semibold text-sm transition-all relative overflow-hidden
               bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400
               disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-red-900/30"
        @click="runBoost"
      >
        <span v-if="loading" class="flex items-center justify-center gap-2">
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Optimising…
        </span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Boost Performance
        </span>
      </button>

      <!-- What this does (pre-boost) -->
      <div v-if="!boosted && !results.length" class="space-y-1.5">
        <p class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold px-0.5">What gets optimised</p>
        <div class="space-y-1">
          <div
            v-for="item in previewItems"
            :key="item.name"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
          >
            <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="item.iconPath" />
            </svg>
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-300">{{ item.name }}</p>
              <p class="text-[10px] text-gray-600">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Results (post-boost) -->
      <div v-if="results.length" class="space-y-1.5">
        <p class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold px-0.5">Results</p>
        <div class="space-y-1">
          <div
            v-for="result in results"
            :key="result.name"
            :class="[
              'flex items-center gap-2.5 px-3 py-2 rounded-lg border',
              result.success
                ? 'bg-green-500/[0.05] border-green-500/20'
                : 'bg-white/[0.02] border-white/[0.05]'
            ]"
          >
            <!-- Success: check circle / Failure: warning triangle -->
            <svg v-if="result.success" class="w-3.5 h-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else class="w-3.5 h-3.5 flex-shrink-0 text-orange-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-gray-300">{{ result.name }}</p>
              <p :class="['text-[10px]', result.success ? 'text-gray-500' : 'text-orange-500/80']">
                {{ result.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Admin note if any failed -->
        <div
          v-if="hasAdminFailures"
          class="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/[0.06] border border-orange-500/20 text-[10px] text-orange-400/80 mt-1"
        >
          <svg class="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>Some optimisations require administrator privileges. Try running UpForge as administrator for full boost.</span>
        </div>
      </div>

      <!-- Diagnostics panel -->
      <div v-if="diagnostics" class="space-y-1.5">
        <div class="flex items-center justify-between px-0.5">
          <p class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">System Diagnostics</p>
          <button
            class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            @click="diagnostics = null"
          >dismiss</button>
        </div>

        <!-- Bottleneck badge -->
        <div
          v-if="diagnostics.bottleneck !== 'unknown'"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold',
            diagnostics.bottleneck === 'cpu'
              ? 'bg-orange-500/[0.08] border-orange-500/25 text-orange-300'
              : diagnostics.bottleneck === 'gpu'
              ? 'bg-yellow-500/[0.08] border-yellow-500/25 text-yellow-300'
              : 'bg-green-500/[0.07] border-green-500/20 text-green-300'
          ]"
        >
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>
            {{ diagnostics.bottleneck === 'cpu' ? 'CPU Bottleneck — CPU is limiting your FPS' :
               diagnostics.bottleneck === 'gpu' ? 'GPU Bottleneck — GPU is the limiting factor' :
               'Balanced — No clear bottleneck detected' }}
          </span>
        </div>

        <!-- Stat grid -->
        <div class="grid grid-cols-2 gap-1">
          <!-- GPU -->
          <div class="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
            <p class="text-[10px] text-gray-600 font-medium uppercase tracking-wide">GPU</p>
            <p class="text-xs text-gray-300 font-semibold truncate">{{ diagnostics.gpuName || '—' }}</p>
            <p class="text-[10px] text-gray-500">
              <span :class="diagnostics.gpuUsagePct > 85 ? 'text-yellow-400' : 'text-gray-400'">{{ diagnostics.gpuUsagePct }}%</span>
              usage · {{ diagnostics.gpuTempC > 0 ? diagnostics.gpuTempC + '°C' : '—' }}
            </p>
          </div>
          <!-- CPU -->
          <div class="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
            <p class="text-[10px] text-gray-600 font-medium uppercase tracking-wide">CPU</p>
            <p class="text-xs font-semibold" :class="diagnostics.cpuUsagePct > 80 ? 'text-orange-400' : 'text-gray-300'">{{ diagnostics.cpuUsagePct }}%</p>
            <p class="text-[10px] text-gray-500">{{ diagnostics.cpuSpeedMhz }} / {{ diagnostics.cpuMaxMhz }} MHz</p>
          </div>
          <!-- RAM -->
          <div class="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5 col-span-2">
            <p class="text-[10px] text-gray-600 font-medium uppercase tracking-wide">RAM</p>
            <div class="flex items-center gap-3">
              <p class="text-xs text-gray-300 font-semibold">{{ diagnostics.ramUsedMb }} / {{ diagnostics.ramTotalMb }} MB</p>
              <p class="text-[10px]" :class="!diagnostics.xmpEnabled ? 'text-orange-400' : 'text-gray-500'">
                {{ diagnostics.ramSpeedMhz }} MHz{{ !diagnostics.xmpEnabled ? ' — XMP may be off' : '' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Warnings -->
        <div v-if="diagnostics.warnings.length" class="space-y-1">
          <div
            v-for="(w, i) in diagnostics.warnings"
            :key="i"
            class="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/[0.06] border border-orange-500/20 text-[10px] text-orange-400/90"
          >
            <svg class="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span>{{ w }}</span>
          </div>
        </div>

        <!-- Top processes -->
        <div v-if="diagnostics.topProcesses.length" class="space-y-1">
          <p class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold px-0.5">Top CPU Processes</p>
          <div class="space-y-0.5">
            <div
              v-for="proc in diagnostics.topProcesses.slice(0, 5)"
              :key="proc.name"
              class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
            >
              <p class="text-[10px] text-gray-400 truncate max-w-[70%]">{{ proc.name }}</p>
              <p class="text-[10px] font-semibold" :class="proc.cpuPct > 10 ? 'text-orange-400' : 'text-gray-500'">{{ proc.cpuPct.toFixed(1) }}%</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Diagnostics button -->
      <button
        v-if="!diagnostics"
        :disabled="diagLoading"
        class="w-full py-2 rounded-xl text-xs font-medium transition-all
               bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.15]
               text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="runDiagnostics"
      >
        <span v-if="diagLoading" class="flex items-center justify-center gap-2">
          <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Analysing…
        </span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
          Run Diagnostics
        </span>
      </button>

      <!-- Admin tip (always show) -->
      <p class="text-[10px] text-gray-700 text-center px-2">
        For maximum effect, run UpForge as administrator
      </p>

    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface OptimizationResult {
  name: string
  success: boolean
  message: string
}

interface PerformanceStatus {
  boosted: boolean
  powerPlan: string
  platform: string
}

interface DiagnosticsReport {
  gpuName: string
  gpuUsagePct: number
  gpuTempC: number
  cpuUsagePct: number
  cpuSpeedMhz: number
  cpuMaxMhz: number
  ramUsedMb: number
  ramTotalMb: number
  ramSpeedMhz: number
  topProcesses: { name: string; cpuPct: number }[]
  xmpEnabled: boolean | null
  bottleneck: 'cpu' | 'gpu' | 'none' | 'unknown'
  warnings: string[]
}

const loading = ref(false)
const boosted = ref(false)
const powerPlan = ref('')
const platform = ref('')
const results = ref<OptimizationResult[]>([])
const diagnostics = ref<DiagnosticsReport | null>(null)
const diagLoading = ref(false)

// Heroicons outline paths (24px viewBox, stroke-based)
const previewItems = [
  {
    name: 'Power Plan',
    description: 'Switch to High Performance for maximum CPU & GPU throughput',
    iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  },
  {
    name: 'Xbox Game DVR',
    description: 'Disable background Game Bar capture — a major FPS killer in Valorant',
    iconPath: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z',
  },
  {
    name: 'GPU Scheduling',
    description: 'Set GPU Priority 8 & SystemResponsiveness=0 so Windows favours your game',
    iconPath: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z',
  },
  {
    name: 'NVIDIA GPU',
    description: 'Force GPU to max performance mode, preventing mid-round clock drops',
    iconPath: 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3',
  },
  {
    name: 'RAM Cleanup',
    description: 'Trim idle background processes to free memory for the game',
    iconPath: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  },
  {
    name: 'Network Latency',
    description: 'Disable Nagle algorithm to reduce ping spikes',
    iconPath: 'M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z',
  },
  {
    name: 'DNS Cache',
    description: 'Flush DNS to ensure fastest server connections',
    iconPath: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
  },
  {
    name: 'Temp Files',
    description: 'Clean stale temp files to reduce I/O load',
    iconPath: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  },
  {
    name: 'Process Priority',
    description: 'Elevate game process to High priority for stable FPS',
    iconPath: 'M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18',
  },
]

const hasAdminFailures = computed(() =>
  results.value.some((r) => !r.success && r.message.toLowerCase().includes('administrator'))
)

async function loadStatus() {
  try {
    const status = await window.api.performance.getStatus() as PerformanceStatus
    boosted.value = status.boosted
    powerPlan.value = status.powerPlan
    platform.value = status.platform
  } catch {
    platform.value = navigator.platform.toUpperCase().includes('MAC') ? 'darwin' : 'win32'
  }
}

async function runBoost() {
  loading.value = true
  results.value = []
  try {
    const res = await window.api.performance.boost() as OptimizationResult[]
    results.value = res
    const anySuccess = res.some((r) => r.success)
    if (anySuccess) boosted.value = true
    await loadStatus()
  } catch (err) {
    results.value = [{ name: 'Boost', success: false, message: String(err) }]
  } finally {
    loading.value = false
  }
}

async function restore() {
  loading.value = true
  try {
    const res = await window.api.performance.restore() as OptimizationResult[]
    results.value = res
    boosted.value = false
    await loadStatus()
  } catch (err) {
    results.value = [{ name: 'Restore', success: false, message: String(err) }]
  } finally {
    loading.value = false
  }
}

async function runDiagnostics() {
  diagLoading.value = true
  try {
    diagnostics.value = await window.api.performance.diagnostics() as DiagnosticsReport | null
  } catch {
    diagnostics.value = null
  } finally {
    diagLoading.value = false
  }
}

onMounted(loadStatus)
</script>

