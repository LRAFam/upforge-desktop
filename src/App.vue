<template>
  <div class="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
    <!-- Custom title bar -->
    <div
      class="drag-region flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0"
      :style="isMac ? 'padding-left: 80px' : ''"
    >
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 bg-gradient-to-br from-red-500 to-orange-600 rounded-md" />
        <span class="text-sm font-semibold">UpForge</span>
        <span v-if="status.recording" class="flex items-center gap-1 text-xs text-red-400 font-medium">
          <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          Recording
        </span>
      </div>
      <div v-if="!isMac" class="flex items-center gap-1">
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06] transition-colors text-gray-400 hover:text-white"
          @click="window.api.window.minimize()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
        </button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06] transition-colors text-gray-400 hover:text-white"
          @click="window.api.window.close()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Navigation (hidden on post-game route) -->
    <nav
      v-if="showNav"
      class="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0"
    >
      <RouterLink
        v-for="link in navLinks"
        :key="link.to"
        :to="link.to"
        class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
        :class="
          $route.path === link.to
            ? 'bg-white/[0.08] text-white'
            : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
        "
      >
        {{ link.label }}
      </RouterLink>
    </nav>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const isMac = navigator.platform.toUpperCase().includes('MAC')

const status = ref({ recording: false, currentGame: null as string | null })

const showNav = computed(() => route.path !== '/post-game' && route.path !== '/login')

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' }
]

onMounted(async () => {
  const s = await window.api.app.getStatus()
  status.value = s

  // Refresh recording state every 5s
  setInterval(async () => {
    const s = await window.api.app.getStatus()
    status.value = s
  }, 5000)
})
</script>
