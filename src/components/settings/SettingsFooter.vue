<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  appVersion,
  devModeActive,
  devTapCount,
  disableDevMode,
  handleVersionTap,
  installUpdate,
  isDev,
  openHelp,
  openSite,
  updatePhase,
  updateVersion,
} = useSettings()
</script>

<template>
  <div class="flex-shrink-0 border-t border-white/[0.07] bg-[#121212] px-4 py-2.5">
    <div class="flex items-center justify-between gap-3">
      <p class="cursor-default select-none text-[11px] text-gray-600" :class="{ 'text-amber-600': devTapCount > 0 && devTapCount < 5 }" @click="handleVersionTap">
        v{{ appVersion }}<span v-if="devTapCount > 0 && devTapCount < 5" class="ml-1 text-amber-600/60">({{ 5 - devTapCount }} more)</span>
      </p>
      <div class="flex items-center gap-3">
        <button
          v-if="!isDev && updatePhase === 'ready'"
          type="button"
          class="text-[11px] transition-colors hover:opacity-80"
          :style="{ color: 'var(--game-accent, #ef4444)' }"
          @click="installUpdate"
        >
          v{{ updateVersion }} ready · Restart
        </button>
        <button type="button" class="text-[11px] text-gray-500 transition-colors hover:text-gray-300" @click="openHelp">Get help</button>
        <button type="button" class="text-[11px] text-gray-500 transition-colors hover:text-gray-300" @click="openSite">upforge.gg</button>
      </div>
    </div>
    <div v-if="devModeActive" class="mt-2 flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/6 px-3 py-1.5">
      <div class="flex items-center gap-2">
        <div class="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <span class="text-[11px] font-medium text-amber-400/80">Developer mode enabled</span>
      </div>
      <button type="button" class="text-[11px] text-amber-600 transition-colors hover:text-amber-400" @click="disableDevMode">Disable</button>
    </div>
  </div>
</template>
