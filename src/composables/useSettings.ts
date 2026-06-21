import { ref, computed, reactive, inject, provide, onMounted, onUnmounted, type InjectionKey } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { AppSettings } from '../env.d.ts'
import { PRIMARY_GAMES, type PrimaryGame } from '../lib/games'
import { getTierBadgeClass, getTierBadgeLabel, formatGameMode } from '../lib/valorant'
import { hasProAccess as proAccessForUser } from '../lib/subscription'
import { BADGE_PREVIEW_ITEMS, getBadgeIconUrl, getSubscriptionIconUrl } from '../lib/rank-assets'
import { isPaymentPastDue, openBillingPortal as requestBillingPortal } from '../lib/billing'

type UserWithUsage = {
  name: string
  email: string
  tier: string
  riot_name: string | null
  riot_tag: string | null
  deadlock_account_id?: number | null
  onboarding_target_rank?: string | null
  analyses_used?: number
  analyses_limit?: number | null
  archive_count?: number
  archive_limit?: number | null
  archive_remaining?: number | null
  archive_retention_days?: number | null
  stripe_subscription_status?: string | null
}

export const SETTINGS_KEY: InjectionKey<ReturnType<typeof createSettings>> = Symbol('settings')

export function provideSettings() {
  const ctx = createSettings()
  provide(SETTINGS_KEY, ctx)
  return ctx
}

export function useSettings() {
  const ctx = inject(SETTINGS_KEY)
  if (!ctx) throw new Error('useSettings() must be used within SettingsView')
  return ctx
}

function createSettings() {
  const router = useRouter()
  const route = useRoute()
  const user = ref<UserWithUsage | null>(null)
  const billingPortalLoading = ref(false)
  const billingMessage = ref('')
  const billingMessageError = ref(false)
  
  const paymentPastDue = computed(() => isPaymentPastDue(user.value?.stripe_subscription_status))
  
  const SETTINGS_TABS = [
    { id: 'general',   label: 'General',   icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' },
    { id: 'recording', label: 'Recording', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>' },
    { id: 'trainer',   label: 'Trainer',   icon: '<circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/>' },
    { id: 'system',    label: 'System',    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' },
  ] as const
  type SettingsTab = typeof SETTINGS_TABS[number]['id']
  const activeTab = ref<SettingsTab>('general')
  
  const appVersion = ref(__APP_VERSION__)
  const isDev = ref(false)
  const updatePhase = ref('idle')
  const updateVersion = ref<string | undefined>(undefined)
  const updatePercent = ref(0)
  const updateUpToDate = ref(false) // brief "Up to date" flash
  let upToDateTimer: ReturnType<typeof setTimeout> | null = null
  const savedToast = ref(false)
  const storageBytes = ref(0)
  const storageCount = ref(0)
  const freeDiskBytes = ref<number | null>(null)
  const storageBreakdown = ref({
    pendingCount: 0,
    pendingBytes: 0,
    cloudBackedCount: 0,
    cloudBackedBytes: 0,
    orphanCount: 0,
    orphanBytes: 0,
    legacyDuplicateBytes: 0,
  })
  const storageEstimate = ref<{
    estimatedGbPerMatch: number
    estimatedGbPerWeek: number
    assumedMatchesPerWeek: number
    recent: { bytesInPeriod: number; filesInPeriod: number; bytesPerDay: number; lookbackDays: number }
  } | null>(null)
  const storageBusy = ref(false)
  const storageMessage = ref('')
  const storageMessageError = ref(false)
  const storageUploadProgress = ref<{ current: number; total: number } | null>(null)
  const ffmpegOk = ref(true)
  const recordingBackend = ref<'obs'>('obs')
  const sectionOpen = reactive({
    account: true,
    usage: true,
    behavior: true,
    recordingCapture: true,
    audio: true,
    obs: true,
    mouseTrainer: true,
    crosshair: true,
    shortcuts: true,
    system: true,
  })
  const isMac = ref(navigator.userAgent.toLowerCase().includes('mac'))
  const audioStatus = ref<{ winAudioMode: string | false | null; audioEnabled: boolean } | null>(null)
  const fixingAudio = ref(false)
  const testingRiotApi = ref(false)
  const riotApiResult = ref<{ portOpen: boolean; gameMode: string | null; logGameMode: string | null; processRunning: boolean } | null>(null)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  const toastMessage = ref('')
  
  // ── Dev mode unlock (tap version 5×) ─────────────────────────────────────────
  const devModeActive = ref(false)
  const devTapCount = ref(0)
  let devTapTimer: ReturnType<typeof setTimeout> | null = null
  
  async function handleVersionTap() {
    if (devModeActive.value) return
    devTapCount.value++
    if (devTapTimer) clearTimeout(devTapTimer)
    if (devTapCount.value >= 5) {
      devTapCount.value = 0
      devModeActive.value = true
      await window.api.settings.save({ devModeEnabled: true })
      showToast('Developer mode enabled — check the nav bar')
    } else {
      devTapTimer = setTimeout(() => { devTapCount.value = 0 }, 3000)
    }
  }
  
  async function disableDevMode() {
    devModeActive.value = false
    await window.api.settings.save({ devModeEnabled: false })
    showToast('Developer mode disabled')
  }
  
  // ── OBS Integration ───────────────────────────────────────────────────────────
  type OBSStatus = {
    connected: boolean
    recording: boolean
    replayBufferActive: boolean
    outputPath: string | null
    lastError: string | null
    obsVersion: string | null
  }
  const obsStatus = ref<OBSStatus | null>(null)
  const obsConnecting = ref(false)
  const obsSetupRunning = ref(false)
  
  async function obsConnect() {
    obsConnecting.value = true
    try {
      await window.api.settings.save({
        obsEnabled: settings.obsEnabled,
        obsHost: settings.obsHost,
        obsPort: settings.obsPort,
        obsPassword: settings.obsPassword,
        obsReplayBufferSeconds: settings.obsReplayBufferSeconds,
        obsPreserveActiveScene: settings.obsPreserveActiveScene,
      })
      const result = await window.api.obs.connect()
      if (result.ok) {
        obsStatus.value = await window.api.obs.getStatus()
        const st = await window.api.app.getStatus().catch(() => null)
        if (st?.recordingBackend) recordingBackend.value = st.recordingBackend
        const setup = result.setup
        if (setup?.sceneCreated || setup?.inputCreated) {
          showToast(`Connected to OBS v${result.version ?? '?'} — UpForge scene created`)
        } else {
          showToast(`Connected to OBS v${result.version ?? '?'}`)
        }
      } else {
        showToast(`OBS connection failed: ${result.error ?? 'Unknown error'}`)
      }
    } finally {
      obsConnecting.value = false
    }
  }
  
  async function obsLaunchAndConnect() {
    obsConnecting.value = true
    try {
      await window.api.settings.save({
        obsHost: settings.obsHost,
        obsPort: settings.obsPort,
        obsPassword: settings.obsPassword,
        obsReplayBufferSeconds: settings.obsReplayBufferSeconds,
        obsPreserveActiveScene: settings.obsPreserveActiveScene,
      })
      const result = await window.api.obs.launchAndConnect()
      if (result.ok) {
        obsStatus.value = await window.api.obs.getStatus()
        showToast(result.alreadyConnected ? 'OBS already connected' : 'OBS launched and connected')
      } else {
        showToast(result.error ?? 'Could not launch or connect to OBS')
      }
    } finally {
      obsConnecting.value = false
    }
  }
  
  async function toggleFullMatchRecording(): Promise<void> {
    const next = settings.fullMatchRecording === false
    settings.fullMatchRecording = next
    await window.api.settings.save({ fullMatchRecording: next })
    await loadStorageUsage()
    showSaved()
  }
  
  async function obsSetupScene() {
    obsSetupRunning.value = true
    try {
      const result = await window.api.obs.setupScene()
      if (result.ok) {
        if (result.sceneCreated || result.inputCreated) {
          showToast('UpForge scene created in OBS')
        } else {
          showToast('UpForge scene is already configured')
        }
      } else {
        showToast(`Scene setup failed: ${result.error ?? 'Unknown error'}`)
      }
    } finally {
      obsSetupRunning.value = false
    }
  }
  
  async function obsDisconnect() {
    await window.api.obs.disconnect()
    obsStatus.value = await window.api.obs.getStatus()
    const st = await window.api.app.getStatus().catch(() => null)
    if (st?.recordingBackend) recordingBackend.value = st.recordingBackend
    showToast('Disconnected from OBS')
  }
  
  async function refreshObsStatus() {
    try {
      obsStatus.value = await window.api.obs.getStatus()
    } catch { /* not available */ }
  }
  
  // ── Hotkeys ──────────────────────────────────────────────────────────────────
  type HotkeyAction = 'save-clip' | 'toggle-overlay' | 'take-screenshot'
  const hotkeys = reactive<Record<HotkeyAction, string>>({ 'save-clip': 'F9', 'toggle-overlay': 'F10', 'take-screenshot': 'F8' })
  const hotkeyStatus = reactive<Record<HotkeyAction, boolean | null>>({ 'save-clip': null, 'toggle-overlay': null, 'take-screenshot': null })
  const rebinding = ref<HotkeyAction | null>(null)
  const conflictScanning = ref(false)
  const conflictResults = ref<{ found: Array<{ exe: string; name: string; fix: string }> } | null>(null)
  
  async function findConflict(): Promise<void> {
    conflictScanning.value = true
    conflictResults.value = null
    try {
      const result = await window.api.debug.findHotkeyConflict() as { supported: boolean; found: Array<{ exe: string; name: string; fix: string }> }
      conflictResults.value = result
    } finally {
      conflictScanning.value = false
    }
  }
  
  function formatKey(accelerator: string): string {
    return accelerator.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl')
  }
  
  function electronAccelerator(e: KeyboardEvent): string | null {
    const mods: string[] = []
    if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
    if (e.altKey) mods.push('Alt')
    if (e.shiftKey) mods.push('Shift')
    const key = e.key
    // Reject modifier-only presses
    if (['Control', 'Shift', 'Alt', 'Meta', 'Escape'].includes(key)) return null
    // Allow bare function keys; otherwise require at least one modifier
    const isFKey = /^F\d+$/.test(key)
    if (!isFKey && mods.length === 0) return null
    const keyName = key.length === 1 ? key.toUpperCase() : key
    return [...mods, keyName].join('+')
  }
  
  function startRebind(action: HotkeyAction): void {
    rebinding.value = action
  }
  
  async function handleKeydown(e: KeyboardEvent): Promise<void> {
    if (!rebinding.value) return
    e.preventDefault()
    if (e.key === 'Escape') { rebinding.value = null; return }
    const acc = electronAccelerator(e)
    if (!acc) return
    const action = rebinding.value
    rebinding.value = null
    const result = await window.api.clips.setHotkey(action, acc) as { ok: boolean }
    if (result.ok) {
      hotkeys[action] = acc
      // Re-fetch status to update registration indicator
      loadHotkeyStatus()
      showSaved()
    }
  }
  
  async function loadHotkeyStatus(): Promise<void> {
    try {
      const bindings = await window.api.clips.getHotkeys() as Record<HotkeyAction, string>
      Object.assign(hotkeys, bindings)
      const status = await window.api.clips.getHotkeyStatus() as { saveClipRegistered: boolean; toggleOverlayRegistered: boolean; screenshotRegistered: boolean }
      hotkeyStatus['save-clip'] = status.saveClipRegistered
      hotkeyStatus['toggle-overlay'] = status.toggleOverlayRegistered
      hotkeyStatus['take-screenshot'] = status.screenshotRegistered
    } catch { /* non-critical */ }
  }
  
  const cs2Detecting = ref(false)
  
  const settings = reactive<AppSettings>({
    primaryGame: 'valorant',
    recordingPreset: 'coaching',
    recordingQuality: '720p',
    recordingBitrate: 5,
    recordingFps: 30,
    audioEnabled: true,
    savePath: '',
    launchOnStartup: false,
    autoDelete: true,
    recordedModes: ['COMPETITIVE', 'PREMIER'],
    autoAnalyse: true,
    firstRun: false,
    captureMonitor: 'auto',
    pregameKillList: [],
    clipRetentionDays: 0,
    recordingRetentionDays: 14,
    fullMatchRecording: true,
    notificationSound: true,
    discordRichPresence: true,
    inGameFeedback: 'notifications',
    cachedEncoder: null,
    cachedUseDdagrab: null,
    devModeEnabled: false,
    obsEnabled: true,
    obsHost: 'localhost',
    obsPort: 4455,
    obsPassword: '',
    obsReplayBufferSeconds: 30,
    obsPreserveActiveScene: true,
    trainerMouse: {
      dpi: 800,
      game: 'valorant',
      sensitivity: 0.5,
      fov: 103,
      rawInput: true,
      pollingRate: 1000,
      movementSpeed: 6.75,
      trainerVolume: 80,
    },
    autoOpenBrowser: false,
    trainingConsent: false,
    crosshairSettings: {
      colorIndex: 1,
      customColor: '00FF6B',
      dotShow: true,
      dotRadius: 1.5,
      dotOpacity: 1.0,
      innerShow: true,
      innerThickness: 2,
      innerLength: 10,
      innerOffset: 4,
      innerOpacity: 1.0,
      outerShow: false,
      outerThickness: 2,
      outerLength: 5,
      outerOffset: 10,
      outerOpacity: 1.0,
      shadowShow: true,
    },
  })
  
  const GAME_MODES = [
    { value: 'COMPETITIVE', label: 'Competitive', hint: 'Ranked' },
    { value: 'PREMIER', label: 'Premier', hint: 'Team queue' },
    { value: 'CLASSIC', label: 'Unrated', hint: 'Casual 5v5' },
    { value: 'SPIKERUSH', label: 'Spike Rush', hint: '' },
    { value: 'SWIFTPLAY', label: 'Swift Play', hint: '' },
    { value: 'DEATHMATCH', label: 'Deathmatch', hint: 'Warm-up & practice' },
    { value: 'TEAMDEATHMATCH', label: 'Team Deathmatch', hint: 'HURM mode' }
  ]
  
  const toggles: Array<{ key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound' | 'autoOpenBrowser' | 'discordRichPresence'>; label: string; hint: string | null }> = [
    { key: 'launchOnStartup', label: 'Launch on startup', hint: null },
    { key: 'autoDelete', label: 'Auto-delete after upload', hint: 'Removes the local MP4 once uploaded — review from cloud anytime' },
    { key: 'autoAnalyse', label: 'Auto-analyse after game', hint: 'Upload and run AI coaching automatically when a match ends (uses analysis quota)' },
    { key: 'autoOpenBrowser', label: 'Open results in browser', hint: 'Opens the full web report when analysis completes — review in-app first with this off' },
    { key: 'notificationSound', label: 'Notification sound', hint: 'Play a sound with system notifications' },
    { key: 'discordRichPresence', label: 'Show status in Discord', hint: 'Friends see when you\'re recording or reviewing coaching — requires Discord desktop and Activity Status enabled' },
  ]
  
  const inGameFeedbackOptions: Array<{ value: AppSettings['inGameFeedback']; label: string; hint: string }> = [
    { value: 'notifications', label: 'Notifications', hint: 'Toast + beep — works in fullscreen' },
    { value: 'overlay', label: 'Overlay only', hint: 'Needs Windowed Fullscreen' },
    { value: 'all', label: 'Both', hint: 'Overlay + notifications' },
  ]
  
  async function setInGameFeedback(mode: AppSettings['inGameFeedback']): Promise<void> {
    settings.inGameFeedback = mode
    await window.api.settings.save({ inGameFeedback: mode })
    showSaved()
  }
  
  function toggleSection(section: keyof typeof sectionOpen): void {
    sectionOpen[section] = !sectionOpen[section]
  }
  
  const accountInitial = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'U')
  const accountRiotId = computed(() => {
    if (user.value?.riot_name) return `${user.value.riot_name}#${user.value.riot_tag}`
    return 'No Riot ID linked'
  })
  const accountSteamLinked = computed(() => !!user.value?.deadlock_account_id)
  const accountSteamStatus = computed(() =>
    accountSteamLinked.value ? 'Steam profile linked' : 'Steam not linked — search by display name on web',
  )
  const cs2FaceitLinked = ref(false)
  const cs2FaceitNickname = ref<string | null>(null)
  
  const accountCs2Hint = computed(() => {
    if (cs2FaceitLinked.value && cs2FaceitNickname.value) {
      return `FACEIT: ${cs2FaceitNickname.value}`
    }
    if (user.value?.onboarding_target_rank) {
      return `Goal: ${user.value.onboarding_target_rank} · link FACEIT on web`
    }
    return 'Link FACEIT username on web for match sync'
  })
  
  const storageSoftLimitBytes = 50 * 1024 * 1024 * 1024
  const LOW_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024
  const CRITICAL_FREE_DISK_BYTES = 500 * 1024 * 1024
  const storageUsagePercent = computed(() => Math.min(100, Math.round((storageBytes.value / storageSoftLimitBytes) * 100)))
  const storageSoftLimitLabel = computed(() => `${formatBytes(storageBytes.value)} of ${formatBytes(storageSoftLimitBytes)}`)
  const freeDiskLabel = computed(() => {
    if (freeDiskBytes.value == null) return null
    return formatBytes(freeDiskBytes.value)
  })
  const diskSpaceCritical = computed(() => freeDiskBytes.value != null && freeDiskBytes.value < CRITICAL_FREE_DISK_BYTES)
  const diskSpaceLow = computed(() => freeDiskBytes.value != null && freeDiskBytes.value < LOW_FREE_DISK_BYTES)
  const storageSummary = computed(() => {
    if (storageBytes.value === 0) {
      const free = freeDiskLabel.value
      return free ? `No UpForge media on disk · ${free} free` : 'No UpForge media on disk'
    }
    const local = `${formatBytes(storageBytes.value)} on disk`
    if (freeDiskLabel.value == null) return local
    return `${local} · ${freeDiskLabel.value} free`
  })
  
  const storageEstimateLabel = computed(() => {
    const est = storageEstimate.value
    if (!est) return ''
    if (settings.fullMatchRecording === false) {
      if (est.recent.bytesPerDay <= 0) return 'Clips-only mode — disk use depends on highlights saved in-game.'
      return `Clips-only · ~${formatBytes(est.recent.bytesPerDay)}/day recently (${est.recent.filesInPeriod} files in ${est.recent.lookbackDays}d)`
    }
    if (est.recent.bytesPerDay > 0) {
      return `~${formatBytes(est.recent.bytesPerDay)}/day recently · ~${est.estimatedGbPerWeek.toFixed(1)} GB/week at current pace`
    }
    return `~${est.estimatedGbPerMatch.toFixed(1)} GB per match · ~${est.estimatedGbPerWeek.toFixed(0)} GB/week (${est.assumedMatchesPerWeek} matches)`
  })
  
  const hasProAccess = computed(() => proAccessForUser(user.value))
  
  function hotkeyParts(accelerator: string): string[] {
    return formatKey(accelerator).split('+')
  }
  
  const usagePercent = computed(() => {
    const u = user.value as UserWithUsage | null
    if (!u?.analyses_limit) return 0
    return Math.min(100, Math.round((Math.max(0, u.analyses_used ?? 0) / u.analyses_limit) * 100))
  })
  
  const archiveUsagePercent = computed(() => {
    const u = user.value as UserWithUsage | null
    if (!u?.archive_limit) return 0
    return Math.min(100, Math.round(((u.archive_count ?? 0) / u.archive_limit) * 100))
  })
  
  const encoderLabel = computed(() => {
    const enc = settings.cachedEncoder
    if (!enc) return null
    if (enc.includes('nvenc')) return `${enc} · NVIDIA hardware`
    if (enc.includes('amf')) return `${enc} · AMD hardware`
    if (enc.includes('qsv')) return `${enc} · Intel QuickSync`
    if (enc.includes('videotoolbox')) return `${enc} · Apple hardware`
    if (enc === 'libx264') return 'libx264 · software encoding'
    return enc
  })
  
  const captureBackendOk = computed(() => !!obsStatus.value?.connected)
  
  const captureBackendDescription = computed(() => {
    return obsStatus.value?.connected
      ? `OBS WebSocket · ${obsStatus.value.obsVersion ?? 'connected'}`
      : 'OBS not connected — open Settings → Recording to connect'
  })
  
  // tierClass and formatMode are imported from valorant.ts (shared helpers)
  
  function showSaved(): void {
    toastMessage.value = ''
    savedToast.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { savedToast.value = false }, 2000)
  }
  
  function showToast(msg: string): void {
    toastMessage.value = msg
    savedToast.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { savedToast.value = false; toastMessage.value = '' }, 2500)
  }
  
  async function refreshRecordingBackendStatus(): Promise<void> {
    try {
      const st = await window.api.app.getStatus()
      if (st?.recordingBackend) recordingBackend.value = st.recordingBackend
      if (typeof st?.ffmpegOk === 'boolean') ffmpegOk.value = st.ffmpegOk
      const obs = await window.api.obs.getStatus()
      obsStatus.value = obs
    } catch { /* non-critical */ }
  }
  
  async function selectPrimaryGame(game: PrimaryGame): Promise<void> {
    if (settings.primaryGame === game) return
    settings.primaryGame = game
    settings.trainerMouse.game = game
    await window.api.settings.save({ primaryGame: game, trainerMouse: { ...toRaw(settings.trainerMouse) } })
    showSaved()
  }
  
  async function detectCs2DemoDir(): Promise<void> {
    cs2Detecting.value = true
    try {
      const { dir } = await window.api.cs2.detectDemoDir()
      if (dir) {
        settings.cs2DemoDir = dir
        await window.api.settings.save({ cs2DemoDir: dir })
        showSaved()
      } else {
        showToast('Could not find CS2 demo folder')
      }
    } finally {
      cs2Detecting.value = false
    }
  }
  
  async function browseCs2DemoDir(): Promise<void> {
    const dir = await window.api.dialog.openDirectory()
    if (dir) {
      settings.cs2DemoDir = dir
      await window.api.settings.save({ cs2DemoDir: dir })
      showSaved()
    }
  }
  
  function openCs2Analyze(): void {
    window.api.cs2.openAnalyze()
  }
  
  function debouncedSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      // toRaw strips Vue Proxy wrappers so arrays/objects serialize cleanly over IPC
      await window.api.settings.save(JSON.parse(JSON.stringify(toRaw(settings))))
      await refreshRecordingBackendStatus()
      showSaved()
    }, 500)
  }
  
  async function toggleTrainingConsent(): Promise<void> {
    settings.trainingConsent = !settings.trainingConsent
    await window.api.settings.save({ trainingConsent: settings.trainingConsent })
    showSaved()
  }
  
  function toggleKey(key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound' | 'autoOpenBrowser' | 'discordRichPresence'>): void {
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
  
  function setRecordingPreset(preset: 'coaching' | 'creator'): void {
    if (settings.recordingPreset === preset) return
    if (preset === 'creator' && !hasProAccess.value) {
      showToast('Creator recording requires Pro — upgrade to unlock')
      openUpgrade()
      return
    }
    settings.recordingPreset = preset
    if (preset === 'coaching') {
      settings.recordingQuality = '720p'
      settings.recordingBitrate = 5
      settings.recordingFps = 30
    } else {
      settings.recordingQuality = '1080p'
      settings.recordingBitrate = 10
      settings.recordingFps = 60
    }
    debouncedSave()
  }
  
  function toggleLaunchOnStartup(): void {
    settings.launchOnStartup = !settings.launchOnStartup
    debouncedSave()
  }
  
  function toggleAudio(): void {
    settings.audioEnabled = !settings.audioEnabled
    debouncedSave()
  }
  
  async function fixAudio(): Promise<void> {
    fixingAudio.value = true
    try {
      const result = await window.api.recorder.fixAudio()
      if (!audioStatus.value) audioStatus.value = { winAudioMode: result.winAudioMode, audioEnabled: settings.audioEnabled }
      else audioStatus.value.winAudioMode = result.winAudioMode
    } catch { /* non-critical */ }
    finally { fixingAudio.value = false }
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
    updatePhase.value = 'checking'
    updateUpToDate.value = false
    if (upToDateTimer) clearTimeout(upToDateTimer)
    try {
      const result = await window.api.updater.check()
      if (result?.status === 'up-to-date') {
        updatePhase.value = 'idle'
        updateUpToDate.value = true
        upToDateTimer = setTimeout(() => { updateUpToDate.value = false }, 3000)
      }
    } catch {
      updatePhase.value = 'idle'
    }
  }
  
  async function installUpdate(): Promise<void> {
    updatePhase.value = 'installing'
    await window.api.updater.install()
  }
  
  async function testRiotApi(): Promise<void> {
    testingRiotApi.value = true
    try {
      const result = await window.api.debug.testRiotApi() as { portOpen: boolean; gameMode: string | null; logGameMode: string | null; processRunning: boolean }
      riotApiResult.value = result
    } catch {
      riotApiResult.value = { portOpen: false, gameMode: null, logGameMode: null, processRunning: false }
    } finally {
      testingRiotApi.value = false
    }
  }
  
  function showBillingError(message: string): void {
    billingMessage.value = message
    billingMessageError.value = true
  }
  
  async function openBilling(): Promise<void> {
    if (billingPortalLoading.value) return
    billingPortalLoading.value = true
    billingMessage.value = ''
    billingMessageError.value = false
    try {
      const result = await requestBillingPortal()
      if (!result.ok) {
        billingMessage.value = result.error ?? 'Could not open billing portal.'
        billingMessageError.value = true
      }
    } finally {
      billingPortalLoading.value = false
    }
  }
  
  function openUpgrade(): void {
    window.open('https://upforge.gg/pricing', '_blank')
  }
  
  function openSite(): void {
    window.open('https://upforge.gg', '_blank')
  }
  
  function openHelp(): void {
    window.open('https://upforge.gg/help', '_blank')
  }
  
  function eDpiLabel(edpi: number): string {
    if (edpi < 200) return 'Very low'
    if (edpi < 400) return 'Low'
    if (edpi < 700) return 'Medium'
    if (edpi < 1200) return 'High'
    return 'Very high'
  }
  
  function eDpiLevelClass(edpi: number): string {
    if (edpi < 400) return 'bg-blue-500/20 text-blue-400'
    if (edpi < 700) return 'bg-green-500/20 text-green-400'
    if (edpi < 1200) return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-red-500/20 text-red-400'
  }
  
  function eDpiBarClass(edpi: number): string {
    if (edpi < 400) return 'bg-blue-500'
    if (edpi < 700) return 'bg-green-500'
    if (edpi < 1200) return 'bg-yellow-500'
    return 'bg-[#ff4655]'
  }
  
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  
  async function loadStorageUsage(): Promise<void> {
    try {
      const [usage, breakdown, estimate] = await Promise.all([
        window.api.storage.getUsage(),
        window.api.storage.getBreakdown(),
        window.api.storage.getEstimate(),
      ])
      storageBytes.value = usage.bytes
      storageCount.value = usage.count
      freeDiskBytes.value = usage.freeDiskBytes
      storageBreakdown.value = breakdown
      storageEstimate.value = estimate
    } catch { /* ignore */ }
  }
  
  async function purgeUntrackedRecordings(): Promise<void> {
    if (storageBusy.value || storageBreakdown.value.orphanCount === 0) return
    if (!window.confirm(
      `Remove ${storageBreakdown.value.orphanCount} untracked recording file(s) (${formatBytes(storageBreakdown.value.orphanBytes)})? These are not shown in your dashboard.`,
    )) return
  
    storageBusy.value = true
    storageMessage.value = ''
    storageMessageError.value = false
    try {
      const result = await window.api.storage.purgeOrphans()
      storageMessage.value = result.removed > 0
        ? `Freed ${formatBytes(result.freedBytes)} — removed ${result.removed} untracked file${result.removed === 1 ? '' : 's'}.`
        : 'No untracked files were removed.'
      storageMessageError.value = result.removed === 0
      await loadStorageUsage()
    } catch {
      storageMessage.value = 'Could not remove untracked files.'
      storageMessageError.value = true
    } finally {
      storageBusy.value = false
    }
  }
  
  async function purgeCloudBackedLocals(): Promise<void> {
    if (storageBusy.value || storageBreakdown.value.cloudBackedCount === 0) return
    storageBusy.value = true
    storageMessage.value = ''
    storageMessageError.value = false
    try {
      const result = await window.api.storage.purgeCloudBacked()
      storageMessage.value = result.removed > 0
        ? `Freed ${formatBytes(result.freedBytes)} — ${result.removed} local file${result.removed === 1 ? '' : 's'} removed. VODs still available from cloud.`
        : result.skipped > 0
          ? 'No local files could be removed — cloud copies may be unavailable.'
          : 'Nothing to remove.'
      storageMessageError.value = result.removed === 0
      await loadStorageUsage()
    } catch {
      storageMessage.value = 'Could not remove local files.'
      storageMessageError.value = true
    } finally {
      storageBusy.value = false
    }
  }
  
  async function uploadPendingToCloud(): Promise<void> {
    if (storageBusy.value || storageBreakdown.value.pendingCount === 0) return
    storageBusy.value = true
    storageMessage.value = ''
    storageMessageError.value = false
    storageUploadProgress.value = { current: 0, total: storageBreakdown.value.pendingCount }
    try {
      const result = await window.api.storage.uploadPending()
      if (!result.ok) {
        storageMessage.value = result.error
        storageMessageError.value = true
        return
      }
      if (result.stoppedEarly) {
        storageMessage.value = `Uploaded ${result.uploaded} — stopped: ${result.stopReason ?? 'analysis limit reached'}`
        storageMessageError.value = true
      } else if (result.uploaded > 0) {
        storageMessage.value = `Uploaded ${result.uploaded} recording${result.uploaded === 1 ? '' : 's'} to cloud and removed local copies.${result.failed > 0 ? ` ${result.failed} failed.` : ''}`
        storageMessageError.value = result.failed > 0
      } else {
        storageMessage.value = 'No recordings were uploaded.'
        storageMessageError.value = true
      }
      await loadStorageUsage()
    } catch {
      storageMessage.value = 'Upload failed — check your connection and try again.'
      storageMessageError.value = true
    } finally {
      storageBusy.value = false
      storageUploadProgress.value = null
    }
  }
  
  function openRecordingsFolder(): void {
    window.api.storage.openFolder()
  }
  
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
  
  onMounted(async () => {
    const tabQuery = route.query.tab
    if (tabQuery === 'recording' || tabQuery === 'general' || tabQuery === 'trainer' || tabQuery === 'system') {
      activeTab.value = tabQuery
    }
    window.addEventListener('keydown', handleKeydown)
    try {
      const [s, savedSettings] = await Promise.all([
        window.api.app.getStatus(),
        window.api.settings.get()
      ])
      isDev.value = s.isDev
      if (s.version) appVersion.value = s.version
      if (s.ffmpegOk !== undefined) ffmpegOk.value = s.ffmpegOk !== false
      if (s.recordingBackend) recordingBackend.value = s.recordingBackend
      Object.assign(settings, savedSettings)
      devModeActive.value = savedSettings.devModeEnabled ?? false
      // Use getStatus user as base
      if (s.user) user.value = { ...(s.user as UserWithUsage) }
      try {
        const authUser = await window.api.auth.refreshUser() as UserWithUsage | null
        if (authUser) user.value = { ...user.value, ...authUser }
      } catch { /* non-critical */ }
      if (settings.primaryGame === 'cs2') {
        try {
          const faceit = await window.api.cs2.getFaceitConnection()
          cs2FaceitLinked.value = !!faceit?.connected
          cs2FaceitNickname.value = faceit?.nickname ?? null
        } catch { /* optional */ }
      }
      loadStorageUsage()
      loadHotkeyStatus()
      window.api.on('storage:upload-progress', (...args: unknown[]) => {
        const data = args[0] as { current: number; total: number } | null
        storageUploadProgress.value = data
      })
      window.api.on('recordings:updated', () => { void loadStorageUsage() })
    } catch (err) {
      console.error('[Settings] Failed to load status:', err)
      try {
        const savedSettings = await window.api.settings.get()
        Object.assign(settings, savedSettings)
      } catch { /* ignore */ }
    }
  
    // Also load richer profile data (includes usage stats) independently
    try {
      const audioSt = await window.api.recorder.getAudioStatus()
      audioStatus.value = audioSt
      // If detection hasn't run yet (app just started), auto-trigger it so the UI isn't stuck on null
      if (audioSt.winAudioMode === null && (navigator.userAgent.includes('Windows') || isMac.value)) {
        fixAudio()
      }
    } catch { /* non-critical */ }
  
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
          analyses_limit: prof.user.analysis_stats?.limit
            ?? (prof.user.is_admin || prof.user.tier === 'admin' ? null : 1),
          archive_count: prof.user.archive_stats?.count ?? 0,
          archive_limit: prof.user.archive_stats?.limit ?? null,
          archive_remaining: prof.user.archive_stats?.remaining ?? null,
          archive_retention_days: prof.user.archive_stats?.retention_days ?? null,
          stripe_subscription_status: prof.user.stripe_subscription_status ?? null,
        }
      }
    } catch { /* profile load failure is non-critical */ }
  
    // Load OBS status (non-critical)
    refreshObsStatus()
  
    // Hydrate update state and listen for live events
    try {
      const us = await window.api.updater.getState()
      updatePhase.value = us.phase
      updateVersion.value = us.version
      updatePercent.value = us.percent ?? 0
    } catch { /* ignore */ }
    const updaterCleanups = [
      window.api.on('updater:checking', () => { updatePhase.value = 'checking' }),
      window.api.on('updater:available', (...args: unknown[]) => {
        const info = args[0] as { version?: string } | undefined
        updatePhase.value = 'available'
        updateVersion.value = info?.version
      }),
      window.api.on('updater:progress', (...args: unknown[]) => {
        updatePhase.value = 'downloading'
        updatePercent.value = typeof args[0] === 'number' ? args[0] : 0
      }),
      window.api.on('updater:downloaded', (...args: unknown[]) => {
        const info = args[0] as { version?: string } | undefined
        updatePhase.value = 'ready'
        updateVersion.value = info?.version
      }),
      window.api.on('updater:not-available', () => { updatePhase.value = 'idle' }),
      window.api.on('updater:error', () => { updatePhase.value = 'idle' }),
    ]
    ;(window as Window & { _settingsUpdaterCleanups?: (() => void)[] })._settingsUpdaterCleanups = updaterCleanups
  })

  return {
    CRITICAL_FREE_DISK_BYTES,
    GAME_MODES,
    HotkeyAction,
    LOW_FREE_DISK_BYTES,
    OBSStatus,
    SETTINGS_TABS,
    SettingsTab,
    accountCs2Hint,
    accountInitial,
    accountRiotId,
    accountSteamLinked,
    accountSteamStatus,
    activeTab,
    appVersion,
    archiveUsagePercent,
    audioStatus,
    billingMessage,
    billingMessageError,
    billingPortalLoading,
    browseCs2DemoDir,
    captureBackendDescription,
    captureBackendOk,
    changeSavePath,
    checkForUpdates,
    conflictResults,
    conflictScanning,
    cs2Detecting,
    cs2FaceitLinked,
    cs2FaceitNickname,
    debouncedSave,
    detectCs2DemoDir,
    devModeActive,
    devTapCount,
    devTapTimer,
    disableDevMode,
    diskSpaceCritical,
    diskSpaceLow,
    eDpiBarClass,
    eDpiLabel,
    eDpiLevelClass,
    electronAccelerator,
    encoderLabel,
    ffmpegOk,
    findConflict,
    fixAudio,
    fixingAudio,
    formatBytes,
    formatKey,
    freeDiskBytes,
    freeDiskLabel,
    handleKeydown,
    handleLogout,
    handleVersionTap,
    hasProAccess,
    hotkeyParts,
    hotkeyStatus,
    hotkeys,
    inGameFeedbackOptions,
    installUpdate,
    isDev,
    isMac,
    loadHotkeyStatus,
    loadStorageUsage,
    obsConnect,
    obsConnecting,
    obsDisconnect,
    obsLaunchAndConnect,
    obsSetupRunning,
    obsSetupScene,
    obsStatus,
    openBilling,
    openCs2Analyze,
    openHelp,
    openRecordingsFolder,
    openSite,
    openUpgrade,
    paymentPastDue,
    purgeCloudBackedLocals,
    purgeUntrackedRecordings,
    rebinding,
    recordingBackend,
    refreshObsStatus,
    refreshRecordingBackendStatus,
    riotApiResult,
    saveTimer,
    savedToast,
    sectionOpen,
    selectPrimaryGame,
    setInGameFeedback,
    setRecordingPreset,
    settings,
    showBillingError,
    showSaved,
    showToast,
    startRebind,
    storageBreakdown,
    storageBusy,
    storageBytes,
    storageCount,
    storageEstimate,
    storageEstimateLabel,
    storageMessage,
    storageMessageError,
    storageSoftLimitBytes,
    storageSoftLimitLabel,
    storageSummary,
    storageUploadProgress,
    storageUsagePercent,
    testRiotApi,
    testingRiotApi,
    toastMessage,
    toastTimer,
    toggleAudio,
    toggleFullMatchRecording,
    toggleKey,
    toggleLaunchOnStartup,
    toggleMode,
    toggleSection,
    toggleTrainingConsent,
    toggles,
    upToDateTimer,
    updatePercent,
    updatePhase,
    updateUpToDate,
    updateVersion,
    uploadPendingToCloud,
    usagePercent,
    user,
    router,
    route,
  }
}
