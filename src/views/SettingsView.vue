<template>
  <div class="px-3 py-3 space-y-4 overflow-y-auto">

    <!-- Account card -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Account</h3>
      <div v-if="user" class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
        <div class="flex items-center justify-between px-3 py-3">
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
            <span
              class="text-[10px] px-2 py-0.5 rounded-full border capitalize"
              :class="tierClass(user.tier)"
            >{{ user.tier || 'free' }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 border-t border-white/[0.04]">
          <button
            class="flex-1 text-[11px] text-gray-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg py-1.5 transition-colors"
            @click="openBilling"
          >Manage subscription</button>
          <button
            class="text-[11px] text-gray-600 hover:text-red-400 transition-colors px-3 py-1.5"
            @click="handleLogout"
          >Sign out</button>
        </div>
      </div>
      <div v-else class="h-16 bg-white/[0.02] border border-white/[0.05] rounded-xl animate-pulse" />
    </section>

    <!-- Usage / quota -->
    <section v-if="user && (user as UserWithUsage).analyses_used !== undefined">
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Usage</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-1.5">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-gray-400">Analyses this month</span>
          <span class="text-gray-300 font-medium tabular-nums">
            {{ (user as UserWithUsage).analyses_used }} / {{ (user as UserWithUsage).analyses_limit ?? '∞' }}
          </span>
        </div>
        <div v-if="(user as UserWithUsage).analyses_limit" class="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all"
            :style="{ width: usagePercent + '%' }"
          />
        </div>
      </div>
    </section>

    <!-- Recording settings -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Recording</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-3">
        <div>
          <label class="block text-[11px] text-gray-500 mb-1">Quality</label>
          <select
            v-model="settings.recordingQuality"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            @change="debouncedSave"
          >
            <option value="720p">720p — Recommended</option>
            <option value="1080p">1080p — More detail</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] text-gray-500 mb-1">Bitrate</label>
          <select
            v-model.number="settings.recordingBitrate"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            @change="debouncedSave"
          >
            <option :value="4">4 Mbps — ~1.8 GB/hr</option>
            <option :value="6">6 Mbps — ~2.7 GB/hr (Default)</option>
            <option :value="8">8 Mbps — ~3.6 GB/hr</option>
            <option :value="12">12 Mbps — ~5.4 GB/hr</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] text-gray-500 mb-1">Save location</label>
          <div class="flex gap-1.5">
            <input
              :value="settings.savePath"
              readonly
              class="flex-1 min-w-0 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-gray-400 cursor-default truncate"
            />
            <button
              class="px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-lg transition-colors flex-shrink-0"
              @click="changeSavePath"
            >Change</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Behaviour toggles -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Behaviour</h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl divide-y divide-white/[0.04]">
        <div
          v-for="toggle in toggles"
          :key="toggle.key"
          class="flex items-center justify-between px-3 py-2.5"
        >
          <div>
            <p class="text-xs text-gray-300">{{ toggle.label }}</p>
            <p v-if="toggle.hint" class="text-[10px] text-gray-600 mt-0.5">{{ toggle.hint }}</p>
          </div>
          <button
            :class="[
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4',
              settings[toggle.key] ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="toggle.key === 'launchOnStartup' ? toggleLaunchOnStartup() : toggleKey(toggle.key)"
          >
            <span
              :class="[
                'absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform',
                settings[toggle.key] ? 'translate-x-[18px]' : 'translate-x-[2px]'
              ]"
            />
          </button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <div class="pt-1 space-y-2">
      <div class="flex items-center justify-between px-0.5">
        <p class="text-[10px] text-gray-700">UpForge Desktop v{{ appVersion }}</p>
        <div class="flex items-center gap-3">
          <button
            v-if="!isDev"
            class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            :disabled="checkingForUpdates"
            @click="checkForUpdates"
          >{{ checkingForUpdates ? 'Checking...' : 'Check for updates' }}</button>
          <button class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors" @click="openHelp">Get help</button>
          <button class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors" @click="openSite">upforge.gg</button>
        </div>
      </div>
    </div>

    <!-- Saved toast -->
    <Transition name="fade">
      <div
        v-if="savedVisible"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/[0.08] border border-white/[0.1] rounded-full text-[11px] text-gray-300 pointer-events-none"
      >
        ✓ Saved
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { AppSettings } from '../env.d.ts'

type UserWithUsage = {
  name: string
  email: string
  tier: string
  riot_name: string | null
  riot_tag: string | null
  analyses_used?: number
  analyses_limit?: number | null
}

const router = useRouter()
const user = ref<UserWithUsage | null>(null)
const appVersion = ref('0.1.0')
const isDev = ref(false)
const checkingForUpdates = ref(false)
const savedVisible = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

const settings = reactive<AppSettings>({
  recordingQuality: '1080p',
  recordingBitrate: 6,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true,
  firstRun: false
})

const toggles: Array<{ key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete'>; label: string; hint: string | null }> = [
  { key: 'launchOnStartup', label: 'Launch on startup', hint: null },
  { key: 'autoDelete', label: 'Auto-delete after upload', hint: 'Frees disk space once recording is uploaded' }
]

const usagePercent = computed(() => {
  const u = user.value as UserWithUsage | null
  if (!u?.analyses_used || !u?.analyses_limit) return 0
  return Math.min(100, Math.round((u.analyses_used / u.analyses_limit) * 100))
})

function tierClass(tier: string): string {
  switch (tier?.toLowerCase()) {
    case 'pro': return 'border-purple-500/30 text-purple-400 bg-purple-500/[0.08]'
    case 'elite': return 'border-yellow-500/30 text-yellow-500 bg-yellow-500/[0.08]'
    case 'premium': return 'border-red-500/30 text-red-400 bg-red-500/[0.08]'
    default: return 'border-white/[0.08] text-gray-500 bg-white/[0.03]'
  }
}

function showSaved(): void {
  savedVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { savedVisible.value = false }, 1500)
}

function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await window.api.settings.save({ ...settings })
    showSaved()
  }, 500)
}

function toggleKey(key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete'>): void {
  settings[key] = !settings[key]
  debouncedSave()
}

function toggleLaunchOnStartup(): void {
  settings.launchOnStartup = !settings.launchOnStartup
  debouncedSave()
}

async function changeSavePath(): Promise<void> {
  const dir = await window.api.dialog.openDirectory()
  if (dir) {
    settings.savePath = dir
    debouncedSave()
  }
}

async function handleLogout(): Promise<void> {
  await window.api.auth.logout()
  router.push('/login')
}

async function checkForUpdates(): Promise<void> {
  checkingForUpdates.value = true
  try {
    await window.api.updater.check()
  } finally {
    setTimeout(() => { checkingForUpdates.value = false }, 2000)
  }
}

function openBilling(): void {
  window.open('https://upforge.gg/billing', '_blank')
}

function openSite(): void {
  window.open('https://upforge.gg', '_blank')
}

function openHelp(): void {
  window.open('https://upforge.gg/help', '_blank')
}

onMounted(async () => {
  const [s, savedSettings] = await Promise.all([
    window.api.app.getStatus(),
    window.api.settings.get()
  ])
  user.value = s.user as UserWithUsage | null
  appVersion.value = s.version ?? '0.1.0'
  isDev.value = s.isDev
  Object.assign(settings, savedSettings)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
