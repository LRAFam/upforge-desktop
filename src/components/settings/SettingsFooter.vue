<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  appVersion,
  checkForUpdates,
  devModeActive,
  devTapCount,
  disableDevMode,
  handleVersionTap,
  installUpdate,
  isDev,
  openHelp,
  openSite,
  updatePercent,
  updatePhase,
  updateUpToDate,
  updateVersion,
} = useSettings()
</script>

<template>
  <div class="flex-shrink-0 space-y-2 border-t border-white/[0.07] bg-[#161616] px-3 pt-2 pb-3">
    <div class="flex items-center justify-between px-0.5">
      <p class="cursor-default select-none text-xs text-gray-700" :class="{ 'text-amber-600': devTapCount > 0 && devTapCount < 5 }" @click="handleVersionTap">
        UpForge Desktop v{{ appVersion }}<span v-if="devTapCount > 0 && devTapCount < 5" class="ml-1 text-amber-600/60">({{ 5 - devTapCount }} more)</span>
      </p>
      <div class="flex items-center gap-3">
        <template v-if="!isDev">
          <button v-if="updatePhase === 'idle' || updatePhase === 'checking'" class="text-xs transition-colors" :class="updatePhase === 'checking' ? 'cursor-default text-gray-500' : 'text-gray-600 hover:text-gray-400'" :disabled="updatePhase === 'checking'" @click="checkForUpdates">{{ updatePhase === 'checking' ? 'Checking...' : updateUpToDate ? 'Up to date' : 'Check for updates' }}</button>
          <span v-else-if="updatePhase === 'downloading'" class="text-xs text-amber-500/80">Downloading {{ updatePercent }}%</span>
          <button v-else-if="updatePhase === 'ready'" class="text-xs text-red-400 transition-colors hover:text-red-300" @click="installUpdate">v{{ updateVersion }} ready · Restart now</button>
        </template>
        <button class="text-xs text-gray-600 transition-colors hover:text-gray-400" @click="openHelp">Get help</button>
        <button class="text-xs text-gray-600 transition-colors hover:text-gray-400" @click="openSite">upforge.gg</button>
      </div>
    </div>
    <div v-if="devModeActive" class="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/6 px-3 py-2">
      <div class="flex items-center gap-2">
        <div class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        <span class="text-xs font-medium text-amber-400/80">Developer mode enabled</span>
      </div>
      <button class="text-xs text-amber-600 transition-colors hover:text-amber-400" @click="disableDevMode">Disable</button>
    </div>
  </div>
</template>
