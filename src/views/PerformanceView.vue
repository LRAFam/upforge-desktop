<template>
  <div class="px-3 py-3 space-y-3">

    <!-- macOS notice -->
    <div
      v-if="platform && platform !== 'win32'"
      class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-gray-400 text-xs"
    >
      <span class="text-base">🖥️</span>
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
        <span v-else>⚡ Boost Performance</span>
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
            <span class="text-base flex-shrink-0">{{ item.icon }}</span>
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
            <span class="text-sm flex-shrink-0">
              {{ result.success ? '✅' : '⚠️' }}
            </span>
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
          <span class="flex-shrink-0 mt-0.5">ℹ️</span>
          <span>Some optimisations require administrator privileges. Try running UpForge as administrator for full boost.</span>
        </div>
      </div>

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

const loading = ref(false)
const boosted = ref(false)
const powerPlan = ref('')
const platform = ref('')
const results = ref<OptimizationResult[]>([])

const previewItems = [
  { icon: '⚡', name: 'Power Plan', description: 'Switch to High Performance for maximum CPU & GPU throughput' },
  { icon: '🎮', name: 'Xbox Game DVR', description: 'Disable background Game Bar capture — a major FPS killer in Valorant' },
  { icon: '🖥️', name: 'GPU Scheduling', description: 'Set GPU Priority 8 & SystemResponsiveness=0 so Windows favours your game' },
  { icon: '🟢', name: 'NVIDIA GPU', description: 'Force GPU to max performance mode, preventing mid-round clock drops' },
  { icon: '🧹', name: 'RAM Cleanup', description: 'Trim idle background processes to free memory for the game' },
  { icon: '🌐', name: 'Network Latency', description: 'Disable Nagle algorithm to reduce ping spikes' },
  { icon: '🔄', name: 'DNS Cache', description: 'Flush DNS to ensure fastest server connections' },
  { icon: '🗑️', name: 'Temp Files', description: 'Clean stale temp files to reduce I/O load' },
  { icon: '⬆️', name: 'Process Priority', description: 'Elevate game process to High priority for stable FPS' },
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
    // IPC unavailable (macOS dev, etc.)
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

onMounted(loadStatus)
</script>
