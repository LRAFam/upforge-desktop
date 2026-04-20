<template>
  <div class="px-4 py-4 space-y-6">
    <h2 class="text-sm font-semibold">Settings</h2>

    <!-- Account -->
    <section class="space-y-3">
      <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider">Account</h3>
      <div v-if="user" class="px-3 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">{{ user.name }}</p>
            <p class="text-xs text-gray-500">{{ user.email }}</p>
            <p class="text-xs text-gray-500 capitalize mt-0.5">{{ user.tier }} tier</p>
          </div>
          <button
            class="text-xs text-red-400 hover:text-red-300 transition-colors"
            @click="handleLogout"
          >
            Sign out
          </button>
        </div>
      </div>
    </section>

    <!-- Recording quality -->
    <section class="space-y-3">
      <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider">Recording</h3>
      <div class="space-y-2">
        <div>
          <label class="block text-xs text-gray-400 mb-1.5">Resolution</label>
          <select
            v-model="settings.resolution"
            class="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
          >
            <option value="1280x720">720p (Recommended)</option>
            <option value="1920x1080">1080p</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1.5">Bitrate</label>
          <select
            v-model="settings.bitrate"
            class="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
          >
            <option value="2M">2 Mbps (Low — ~0.9GB/hr)</option>
            <option value="4M">4 Mbps (Standard — ~1.8GB/hr)</option>
            <option value="6M">6 Mbps (High — ~2.7GB/hr)</option>
          </select>
        </div>
      </div>
    </section>

    <!-- Behaviour -->
    <section class="space-y-3">
      <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider">Behaviour</h3>
      <div class="space-y-2">
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-sm text-gray-300">Auto-record on game launch</span>
          <button
            :class="[
              'relative w-9 h-5 rounded-full transition-colors',
              settings.autoRecord ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="settings.autoRecord = !settings.autoRecord"
          >
            <span
              :class="[
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                settings.autoRecord ? 'translate-x-4' : 'translate-x-0.5'
              ]"
            />
          </button>
        </label>
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-sm text-gray-300">Show post-game window</span>
          <button
            :class="[
              'relative w-9 h-5 rounded-full transition-colors',
              settings.showPostGame ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="settings.showPostGame = !settings.showPostGame"
          >
            <span
              :class="[
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                settings.showPostGame ? 'translate-x-4' : 'translate-x-0.5'
              ]"
            />
          </button>
        </label>
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-sm text-gray-300">Launch on startup</span>
          <button
            :class="[
              'relative w-9 h-5 rounded-full transition-colors',
              settings.launchOnStartup ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="settings.launchOnStartup = !settings.launchOnStartup"
          >
            <span
              :class="[
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                settings.launchOnStartup ? 'translate-x-4' : 'translate-x-0.5'
              ]"
            />
          </button>
        </label>
      </div>
    </section>

    <!-- App info -->
    <section class="pt-2 border-t border-white/[0.06]">
      <p class="text-xs text-gray-600">UpForge Desktop v0.1.0</p>
      <button
        class="text-xs text-gray-500 hover:text-gray-300 underline mt-1"
        @click="openSite"
      >upforge.gg</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const user = ref<{ name: string; email: string; tier: string } | null>(null)

const settings = ref({
  resolution: '1280x720',
  bitrate: '4M',
  autoRecord: true,
  showPostGame: true,
  launchOnStartup: false
})

onMounted(async () => {
  const s = await window.api.app.getStatus()
  user.value = s.user
})

async function handleLogout() {
  await window.api.auth.logout()
  router.push('/login')
}

function openSite() {
  window.open('https://upforge.gg', '_blank')
}
</script>
