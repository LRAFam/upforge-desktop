<template>
  <div class="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-orange-500/15">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded-md flex items-center justify-center bg-orange-500/15">
          <svg class="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-200">FACEIT Stats</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="p-1 text-gray-700 hover:text-gray-400 transition-colors rounded"
          title="Refresh"
          @click="loadConnection"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
        <button
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all bg-orange-500/15 text-orange-300 border border-orange-500/25 hover:bg-orange-500/25"
          @click="openWeb"
        >
          View on web →
        </button>
      </div>
    </div>

    <div v-if="loading" class="px-3.5 py-4 flex items-center gap-2">
      <div class="w-3 h-3 rounded-full border border-orange-500/30 border-t-orange-400 animate-spin" />
      <span class="text-xs text-gray-600">Loading FACEIT profile…</span>
    </div>

    <div v-else-if="fetchError" class="px-3.5 py-4 flex items-center justify-between gap-3">
      <p class="text-xs text-amber-400/90 leading-relaxed">Couldn't load FACEIT data — try refreshing.</p>
      <button
        class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300"
        @click="loadConnection"
      >
        Retry
      </button>
    </div>

    <div v-else-if="!connection?.connected" class="px-3.5 py-4 flex items-center justify-between gap-3">
      <p class="text-xs text-gray-500 leading-relaxed">
        Link your <strong class="text-gray-400 font-semibold">FACEIT username</strong> on the web to sync level, ELO, and match history.
      </p>
      <button
        class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/25"
        @click="openConnect"
      >
        Link FACEIT →
      </button>
    </div>

    <div v-else class="px-3.5 py-3 flex items-center gap-3">
      <img
        v-if="levelIconUrl"
        :src="levelIconUrl"
        class="w-10 h-10 object-contain flex-shrink-0"
        alt="FACEIT level"
      />
      <div
        v-else
        class="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold text-orange-400 flex-shrink-0 bg-orange-500/10 border border-orange-500/20"
      >
        CS2
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-black text-white truncate">{{ connection.nickname }}</div>
        <div class="flex gap-3 text-[10px] text-gray-500 mt-0.5">
          <span v-if="connection.level != null">
            Level <strong class="text-orange-300">{{ connection.level }}</strong>
          </span>
          <span v-if="connection.elo != null">
            <strong class="text-white">{{ connection.elo }}</strong> ELO
          </span>
        </div>
        <p v-if="!connection.has_auto_sync" class="text-[10px] text-gray-600 mt-1">
          Auto-sync on match end requires CS2 Pro — demo upload still works on all plans.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getFaceitLevelIconUrl, type Cs2FaceitConnection } from '../lib/cs2'

const loading = ref(true)
const fetchError = ref(false)
const connection = ref<Cs2FaceitConnection | null>(null)

const levelIconUrl = computed(() => getFaceitLevelIconUrl(connection.value?.level))

let refreshCleanup: (() => void) | null = null

async function loadConnection() {
  loading.value = true
  fetchError.value = false
  try {
    connection.value = await window.api.cs2.getFaceitConnection()
  } catch {
    connection.value = null
    fetchError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadConnection()
  refreshCleanup = window.api.on('dashboard:refresh', () => {
    loadConnection()
  })
})

onUnmounted(() => {
  refreshCleanup?.()
})

function openWeb() {
  window.api.cs2.openDashboard()
}

function openConnect() {
  window.api.cs2.openConnectFaceit()
}
</script>
