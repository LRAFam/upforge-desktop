<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  captureBackendDescription,
  captureBackendOk,
  riotApiResult,
  sectionOpen,
  testRiotApi,
  testingRiotApi,
  toggleSection,
} = useSettings()
</script>

<template>
<section class="space-y-4">
<div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('system')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.5 6h3m-7.5 6h12m-9 6h6M4.5 6h.008v.008H4.5V6zm0 6h.008v.008H4.5V12zm0 6h.008v.008H4.5V18z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">System</p>
                <p class="text-xs text-gray-500">Diagnostics, updates, and match detection</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.system ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.system" class="space-y-3 border-t border-white/[0.09] p-4">
            <div class="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-200">Capture method</p>
                <p class="mt-1 text-xs" :class="captureBackendOk ? 'text-green-400/80' : 'text-yellow-400/80'">{{ captureBackendDescription }}</p>
              </div>
              <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="captureBackendOk ? 'bg-green-500' : 'bg-yellow-400'" />
            </div>

            <div class="rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-200">Match detection</p>
                  <p v-if="riotApiResult === null" class="mt-1 text-xs text-gray-500">Open Valorant and start a match, then test detection.</p>
                  <p v-else-if="riotApiResult.processRunning && riotApiResult.logGameMode" class="mt-1 truncate text-xs text-green-400/80">In-game · {{ riotApiResult.logGameMode }} (log)</p>
                  <p v-else-if="riotApiResult.processRunning && riotApiResult.gameMode" class="mt-1 truncate text-xs text-green-400/80">In-game · {{ riotApiResult.gameMode }} (api)</p>
                  <p v-else-if="riotApiResult.processRunning" class="mt-1 text-xs text-yellow-400/80">In-game process detected · mode unknown</p>
                  <p v-else class="mt-1 text-xs text-gray-500">Not in a match · process={{ riotApiResult.processRunning }}</p>
                </div>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" :disabled="testingRiotApi" @click="testRiotApi">{{ testingRiotApi ? 'Testing…' : 'Test' }}</button>
              </div>
            </div>
          </div>
        </div>
</section>
</template>
