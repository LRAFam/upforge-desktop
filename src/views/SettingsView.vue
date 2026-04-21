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
              <p class="text-[10px] text-gray-500 truncate mt-px">
                <span v-if="user.riot_name">{{ user.riot_name }}#{{ user.riot_tag }}</span>
                <span v-else>{{ user.email }}</span>
              </p>
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
      <div v-else class="h-[72px] bg-white/[0.02] border border-white/[0.05] rounded-xl animate-pulse" />
    </section>

    <!-- Usage / quota -->
    <section v-if="user && (user as UserWithUsage).analyses_used !== undefined">
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Usage</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-1.5">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-gray-400">Analyses this month</span>
          <span class="text-gray-300 font-medium tabular-nums">
            {{ (user as UserWithUsage).analyses_used }} / {{ (user as UserWithUsage).analyses_limit }}
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
          <label class="block text-[11px] text-gray-500 mb-1.5">Record game modes</label>
          <div class="space-y-1.5">
            <label
              v-for="mode in GAME_MODES"
              :key="mode.value"
              class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
            >
              <div
                :class="[
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                  settings.recordedModes.includes(mode.value)
                    ? 'bg-red-500 border-red-500'
                    : 'bg-transparent border-white/[0.15]'
                ]"
                @click="toggleMode(mode.value)"
              >
                <svg v-if="settings.recordedModes.includes(mode.value)" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div>
                <span class="text-xs text-gray-300">{{ mode.label }}</span>
                <span class="text-[10px] text-gray-600 ml-1.5">{{ mode.hint }}</span>
              </div>
            </label>
          </div>
          <p class="text-[10px] text-gray-700 mt-1.5 px-0.5">Games in unselected modes will not be recorded.</p>
        </div>
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

        <!-- Storage usage -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[11px] text-gray-500">Storage used</p>
            <p class="text-[10px] text-gray-700 mt-0.5">
              {{ storageCount === 0 ? 'No recordings saved' : `${storageCount} file${storageCount === 1 ? '' : 's'} · ${formatBytes(storageBytes)}` }}
            </p>
          </div>
          <button
            class="px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-lg transition-colors flex-shrink-0"
            @click="openRecordingsFolder"
          >Open folder</button>
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
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4 overflow-hidden',
              settings[toggle.key] ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="toggle.key === 'launchOnStartup' ? toggleLaunchOnStartup() : toggleKey(toggle.key)"
          >
            <span
              :class="[
                'absolute top-[2px] left-0 w-[14px] h-[14px] bg-white rounded-full shadow transition-transform',
                settings[toggle.key] ? 'translate-x-[18px]' : 'translate-x-[2px]'
              ]"
            />
          </button>
        </div>
      </div>
    </section>

    <!-- Shortcut -->
    <section>
      <h3 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Shortcut</h3>
      <div class="flex items-center justify-between px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <span class="text-xs text-gray-400">Open / focus window</span>
        <div class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[10px] bg-white/[0.06] border border-white/[0.1] rounded text-gray-400">Ctrl</kbd>
          <span class="text-[10px] text-gray-600">+</span>
          <kbd class="px-1.5 py-0.5 text-[10px] bg-white/[0.06] border border-white/[0.1] rounded text-gray-400">Shift</kbd>
          <span class="text-[10px] text-gray-600">+</span>
          <kbd class="px-1.5 py-0.5 text-[10px] bg-white/[0.06] border border-white/[0.1] rounded text-gray-400">U</kbd>
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
      <Transition name="fade">
        <p v-if="updateMessage" class="text-[10px] text-gray-500 px-0.5">{{ updateMessage }}</p>
      </Transition>
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
  analyses_limit?: number
}

const router = useRouter()
const user = ref<UserWithUsage | null>(null)
const appVersion = ref(__APP_VERSION__)
const isDev = ref(false)
const checkingForUpdates = ref(false)
const updateMessage = ref('')
const savedVisible = ref(false)
const storageBytes = ref(0)
const storageCount = ref(0)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

const settings = reactive<AppSettings>({
  recordingQuality: '1080p',
  recordingBitrate: 6,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true,
  recordedModes: ['COMPETITIVE', 'PREMIER'],
  autoAnalyse: true,
  firstRun: false
})

const GAME_MODES = [
  { value: 'COMPETITIVE', label: 'Competitive', hint: 'Ranked' },
  { value: 'PREMIER', label: 'Premier', hint: 'Team queue' },
  { value: 'CLASSIC', label: 'Unrated', hint: 'Casual 5v5' },
  { value: 'SPIKERUSH', label: 'Spike Rush', hint: '' },
  { value: 'SWIFTPLAY', label: 'Swift Play', hint: '' },
  { value: 'DEATHMATCH', label: 'Deathmatch', hint: '' }
]

const toggles: Array<{ key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse'>; label: string; hint: string | null }> = [
  { key: 'launchOnStartup', label: 'Launch on startup', hint: null },
  { key: 'autoDelete', label: 'Auto-delete after upload', hint: 'Frees disk space once recording is uploaded' },
  { key: 'autoAnalyse', label: 'Auto-analyse after game', hint: 'Automatically upload and analyse once a game ends' }
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

function toggleKey(key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse'>): void {
  settings[key] = !settings[key]
  debouncedSave()
}

function toggleMode(value: string): void {
  const idx = settings.recordedModes.indexOf(value)
  if (idx === -1) {
    settings.recordedModes.push(value)
  } else {
    settings.recordedModes.splice(idx, 1)
  }
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
  updateMessage.value = ''
  try {
    const result = await window.api.updater.check() as { status: string; message: string } | undefined
    updateMessage.value = result?.message ?? 'Check complete'
  } catch {
    updateMessage.value = 'Could not check for updates'
  } finally {
    checkingForUpdates.value = false
    setTimeout(() => { updateMessage.value = '' }, 4000)
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function loadStorageUsage(): Promise<void> {
  try {
    const usage = await window.api.storage.getUsage()
    storageBytes.value = usage.bytes
    storageCount.value = usage.count
  } catch { /* ignore */ }
}

function openRecordingsFolder(): void {
  window.api.storage.openFolder()
}

onMounted(async () => {
  try {
    const [s, savedSettings] = await Promise.all([
      window.api.app.getStatus(),
      window.api.settings.get()
    ])
    isDev.value = s.isDev
    if (s.version) appVersion.value = s.version
    Object.assign(settings, savedSettings)
    // Use getStatus user as base
    if (s.user) user.value = s.user as UserWithUsage | null
    loadStorageUsage()
  } catch (err) {
    console.error('[Settings] Failed to load status:', err)
    try {
      const savedSettings = await window.api.settings.get()
      Object.assign(settings, savedSettings)
    } catch { /* ignore */ }
  }

  // Also load richer profile data (includes usage stats) independently
  try {
    const prof = await window.api.profile.get()
    if (prof?.user) {
      user.value = {
        name: prof.user.name,
        email: prof.user.email,
        tier: prof.user.tier,
        riot_name: prof.user.riot_name,
        riot_tag: prof.user.riot_tag,
        analyses_used: prof.user.analysis_stats?.total ?? 0,
        analyses_limit: prof.user.analysis_stats?.limit ?? 1
      }
    }
  } catch { /* profile load failure is non-critical */ }
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
