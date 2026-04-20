<template>
  <div class="px-3 py-3 space-y-4 overflow-y-auto">

    <!-- Account card -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Account</h3>
      <div v-if="user" class="flex items-center justify-between px-3 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
            <span class="text-xs font-bold text-red-400">{{ user.name?.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium truncate">{{ user.name }}</p>
            <p class="text-[11px] text-gray-500 truncate">{{ user.email }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 ml-2">
          <span class="text-[10px] px-2 py-0.5 rounded-full border capitalize"
            :class="user.tier === 'pro' ? 'border-yellow-500/30 text-yellow-500/80 bg-yellow-500/[0.08]' : user.tier === 'premium' ? 'border-red-500/30 text-red-400/80 bg-red-500/[0.08]' : 'border-white/[0.08] text-gray-500 bg-white/[0.03]'"
          >{{ user.tier }}</span>
          <button class="text-[11px] text-gray-600 hover:text-red-400 transition-colors" @click="handleLogout">Sign out</button>
        </div>
      </div>
    </section>

    <!-- Recording quality -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Recording</h3>
      <div class="space-y-2">
        <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-2">
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">Resolution</label>
            <select
              v-model="settings.resolution"
              class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            >
              <option value="1280x720">720p — Recommended</option>
              <option value="1920x1080">1080p — More detail</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">Bitrate</label>
            <select
              v-model="settings.bitrate"
              class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            >
              <option value="2M">2 Mbps — ~0.9 GB/hr</option>
              <option value="4M">4 Mbps — ~1.8 GB/hr (Standard)</option>
              <option value="6M">6 Mbps — ~2.7 GB/hr</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- Behaviour toggles -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Behaviour</h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl divide-y divide-white/[0.04]">
        <div v-for="toggle in toggles" :key="toggle.key" class="flex items-center justify-between px-3 py-2.5">
          <div>
            <p class="text-xs text-gray-300">{{ toggle.label }}</p>
            <p v-if="toggle.hint" class="text-[10px] text-gray-600 mt-0.5">{{ toggle.hint }}</p>
          </div>
          <button
            :class="['relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4', settings[toggle.key] ? 'bg-red-500' : 'bg-white/[0.1]']"
            @click="settings[toggle.key] = !settings[toggle.key]"
          >
            <span :class="['absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform', settings[toggle.key] ? 'translate-x-[18px]' : 'translate-x-[2px]']" />
          </button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <div class="pt-2 flex items-center justify-between px-0.5">
      <p class="text-[10px] text-gray-700">UpForge Desktop v0.1.0</p>
      <button class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors" @click="openSite">upforge.gg</button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const user = ref<{ name: string; email: string; tier: string } | null>(null)

const settings = reactive({
  resolution: '1280x720',
  bitrate: '4M',
  autoRecord: true,
  showPostGame: true,
  launchOnStartup: false
})

const toggles = [
  { key: 'autoRecord' as const, label: 'Auto-record on game launch', hint: null },
  { key: 'showPostGame' as const, label: 'Show post-game window', hint: 'Results popup after each match' },
  { key: 'launchOnStartup' as const, label: 'Launch on startup', hint: null }
]

onMounted(async () => {
  const s = await window.api.app.getStatus()
  user.value = s.user as { name: string; email: string; tier: string } | null
})

async function handleLogout() {
  await window.api.auth.logout()
  router.push('/login')
}

function openSite() {
  window.open('https://upforge.gg', '_blank')
}
</script>
