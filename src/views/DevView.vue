<template>
  <div class="h-full flex flex-col bg-[#0e0e10] text-white overflow-hidden">
    <!-- Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06]">
      <div class="flex items-center gap-2.5">
        <span class="text-sm font-semibold text-white">Developer Panel</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase tracking-widest">Admin</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          :disabled="loading"
          @click="refresh"
        >
          <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-amber-600 hover:text-amber-400 hover:bg-amber-500/[0.08] transition-colors"
          @click="copyReport"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          Copy Report
        </button>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">

      <!-- Loading -->
      <div v-if="loading && !diag" class="flex items-center justify-center h-40 text-gray-600 text-sm">
        Loading diagnostics…
      </div>

      <template v-if="diag">

        <!-- App Info -->
        <DevSection title="App">
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <DevRow label="Version" :value="diag.app.version" />
            <DevRow label="Platform" :value="diag.app.platform" />
            <DevRow label="Arch" :value="diag.app.arch" />
            <DevRow label="Electron" :value="diag.app.electronVersion" />
            <DevRow label="Node" :value="diag.app.nodeVersion" />
            <DevRow label="Dev build" :value="diag.app.isDev" />
          </div>
        </DevSection>

        <!-- Riot API -->
        <DevSection title="Riot Local API">
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <DevRow label="Lockfile found" :value="diag.riot.lockfileFound" badge />
            <DevRow label="Access token" :value="diag.riot.accessTokenPresent" badge />
            <DevRow label="Entitlements token" :value="diag.riot.entitlementsTokenPresent" badge />
            <DevRow label="Match data active" :value="diag.riot.matchDataActive" badge />
            <DevRow label="Region" :value="diag.riot.region" />
            <DevRow label="Player" :value="playerDisplay" />
            <DevRow label="Match ID" :value="diag.riot.currentMatchId ? diag.riot.currentMatchId.slice(0, 16) + '…' : null" />
            <DevRow label="Session state" :value="diag.riot.lastSessionLoopState" />
            <DevRow label="Circuit breaker" :value="diag.riot.circuitBreakerOpen ? 'OPEN' : 'closed'" :warn="diag.riot.circuitBreakerOpen" />
            <DevRow label="CB failures" :value="diag.riot.sessionStateFailures" />
            <DevRow label="Client version" :value="diag.riot.clientVersion" class="col-span-2" />
          </div>
          <div v-if="riotInterpretation" class="mt-2.5 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20 text-xs text-red-400 leading-relaxed">
            ⚠️ {{ riotInterpretation }}
          </div>
        </DevSection>

        <!-- Recording -->
        <DevSection title="Recording">
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <DevRow label="Active" :value="diag.recording.active" badge />
            <DevRow label="Duration" :value="diag.recording.active ? formatDuration(diag.recording.duration) : '—'" />
            <DevRow label="Last path" :value="diag.recording.lastPath ?? '—'" class="col-span-2 truncate" />
            <DevRow label="Last size" :value="diag.recording.lastSizeMb > 0 ? diag.recording.lastSizeMb.toFixed(1) + ' MB' : '—'" />
            <DevRow label="Last error" :value="diag.recording.lastError ?? '—'" :warn="!!diag.recording.lastError" />
          </div>
        </DevSection>

        <!-- Last Match -->
        <DevSection title="Last Match">
          <div v-if="!diag.lastMatch" class="text-xs text-gray-600 italic">No match recorded this session.</div>
          <template v-else>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <DevRow label="Time" :value="formatTime(diag.lastMatch.timestamp)" />
              <DevRow label="Map" :value="diag.lastMatch.map ?? '—'" />
              <DevRow label="Agent" :value="diag.lastMatch.agent ?? '—'" />
              <DevRow label="Mode" :value="diag.lastMatch.gameMode" />
              <DevRow label="Recording length" :value="formatDuration(diag.lastMatch.recordingDuration)" />
              <DevRow label="File size" :value="diag.lastMatch.fileSizeMb > 0 ? diag.lastMatch.fileSizeMb.toFixed(1) + ' MB' : '—'" />
              <DevRow label="Kills in timeline" :value="diag.lastMatch.killsInTimeline" />
              <DevRow label="Clips extracted" :value="diag.lastMatch.clipsExtracted" />
              <DevRow label="Match ID" :value="diag.lastMatch.matchId ? diag.lastMatch.matchId.slice(0, 16) + '…' : null" />
              <DevRow label="Details status" :value="diag.lastMatch.matchDetailsStatus" class="col-span-2" />
            </div>
            <div v-if="clipInterpretation" class="mt-2.5 px-3 py-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 text-xs text-amber-400 leading-relaxed">
              ℹ️ {{ clipInterpretation }}
            </div>
          </template>
        </DevSection>

        <!-- Clips -->
        <DevSection title="Clip Store">
          <DevRow label="Total clips" :value="diag.clips.total" />
        </DevSection>

        <!-- Tools -->
        <DevSection title="Tools">
          <div class="flex flex-wrap gap-2">
            <button
              class="px-3 py-1.5 rounded-lg text-xs bg-white/[0.05] hover:bg-white/[0.09] text-gray-300 hover:text-white transition-colors"
              :disabled="testingRiot"
              @click="testRiotApi"
            >{{ testingRiot ? 'Testing…' : 'Test Riot API' }}</button>
            <button
              class="px-3 py-1.5 rounded-lg text-xs bg-white/[0.05] hover:bg-white/[0.09] text-gray-300 hover:text-white transition-colors"
              @click="findHotkeyConflicts"
            >Find Hotkey Conflicts</button>
          </div>
          <div v-if="toolResult" class="mt-2 px-3 py-2 rounded-lg bg-gray-900 border border-white/[0.06] text-xs text-gray-300 font-mono whitespace-pre-wrap">{{ toolResult }}</div>
        </DevSection>

        <!-- Activity Log -->
        <DevSection title="Activity Log" :count="diag.activityLog.length">
          <div v-if="!diag.activityLog.length" class="text-xs text-gray-600 italic">No activity this session.</div>
          <div v-else class="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-white/10 pr-1">
            <div
              v-for="(entry, i) in [...diag.activityLog].reverse()"
              :key="i"
              class="flex gap-2 text-xs py-0.5"
            >
              <span class="flex-shrink-0 text-gray-600 font-mono tabular-nums">{{ formatTime(entry.time) }}</span>
              <span class="text-gray-400">{{ entry.message }}</span>
            </div>
          </div>
        </DevSection>

      </template>

      <!-- Error -->
      <div v-if="error" class="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        Failed to load diagnostics: {{ error }}
      </div>
    </div>

    <!-- Auto-refresh indicator -->
    <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 border-t border-white/[0.04] bg-[#0a0a0b]">
      <span class="text-[10px] text-gray-700">Auto-refreshing every 5s</span>
      <span v-if="lastRefreshed" class="text-[10px] text-gray-700">Last: {{ lastRefreshed }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

type DiagData = Awaited<ReturnType<typeof window.api.dev.getDiagnostics>>

const diag = ref<DiagData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const lastRefreshed = ref('')
const testingRiot = ref(false)
const toolResult = ref<string | null>(null)
let refreshInterval: ReturnType<typeof setInterval> | null = null

// Guard — redirect if dev mode not enabled
onMounted(async () => {
  try {
    const settings = await window.api.settings.get()
    if (!settings.devModeEnabled) {
      router.replace('/settings')
      return
    }
  } catch { /* allow through */ }
  await refresh()
  refreshInterval = setInterval(refresh, 5000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

async function refresh() {
  loading.value = true
  error.value = null
  try {
    diag.value = await window.api.dev.getDiagnostics()
    const now = new Date()
    lastRefreshed.value = now.toLocaleTimeString()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

// ── Computed ─────────────────────────────────────────────────────────────────

const playerDisplay = computed(() => {
  if (!diag.value) return null
  const { playerName, playerTag } = diag.value.riot
  if (playerName && playerTag) return `${playerName}#${playerTag}`
  return playerName ?? null
})

const riotInterpretation = computed((): string | null => {
  if (!diag.value) return null
  const r = diag.value.riot
  if (!r.lockfileFound) return 'Lockfile not found — Riot Client may not be running, or this is a non-Windows environment.'
  if (!r.accessTokenPresent || !r.entitlementsTokenPresent) return 'Auth tokens missing — Valorant may not be fully signed in.'
  if (!r.region) return 'Region not detected — try starting a match or relaunching Valorant.'
  return null
})

const clipInterpretation = computed((): string | null => {
  if (!diag.value?.lastMatch) return null
  const m = diag.value.lastMatch
  if (m.killsInTimeline === 0) {
    switch (m.matchDetailsStatus) {
      case 'no_match_id': return 'Match ID was null — the match details API was never called. Clips require a matchId from the in-game WebSocket or CoreGame API.'
      case 'no_region': return 'Region was not detected when the match ended. Match details require a known region to construct the API URL.'
      case 'no_auth': return 'Auth tokens (accessToken / entitlementsToken) were missing at match end. Clips cannot be extracted without Riot auth.'
      case 'fetch_failed': return 'Match details fetch was attempted but returned no kill timeline. The API may have returned an error or empty data.'
      default: return 'Kill timeline is empty — clips were not extracted.'
    }
  }
  if (m.clipsExtracted === 0) return `${m.killsInTimeline} kills were tracked but 0 clips were extracted. Check recording path and videoOffsetMs values.`
  return null
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms) return '0s'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

// ── Tools ─────────────────────────────────────────────────────────────────────

async function testRiotApi() {
  testingRiot.value = true
  toolResult.value = null
  try {
    const result = await window.api.debug.testRiotApi()
    toolResult.value = JSON.stringify(result, null, 2)
  } catch (err: unknown) {
    toolResult.value = `Error: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    testingRiot.value = false
  }
}

async function findHotkeyConflicts() {
  toolResult.value = 'Searching for conflicts…'
  try {
    const result = await window.api.debug.findHotkeyConflict()
    if (!result.supported) {
      toolResult.value = 'Hotkey conflict detection not supported on this platform.'
    } else if (!result.found.length) {
      toolResult.value = 'No hotkey conflicts found.'
    } else {
      toolResult.value = result.found.map((f) => `${f.name} (${f.exe})\n  Fix: ${f.fix}`).join('\n\n')
    }
  } catch (err: unknown) {
    toolResult.value = `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function copyReport() {
  if (!diag.value) return
  const report = buildReport()
  await navigator.clipboard.writeText(report)
}

function buildReport(): string {
  if (!diag.value) return 'No data'
  const d = diag.value
  const lines: string[] = [
    `UpForge Desktop v${d.app.version} — Debug Report`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== APP ===',
    `Platform: ${d.app.platform} ${d.app.arch}`,
    `Electron: ${d.app.electronVersion} / Node: ${d.app.nodeVersion}`,
    `Dev build: ${d.app.isDev}`,
    '',
    '=== RIOT LOCAL API ===',
    `Lockfile: ${d.riot.lockfileFound}`,
    `Access token: ${d.riot.accessTokenPresent}`,
    `Entitlements token: ${d.riot.entitlementsTokenPresent}`,
    `Region: ${d.riot.region ?? 'null'}`,
    `Player: ${playerDisplay.value ?? 'unknown'}`,
    `Match data active: ${d.riot.matchDataActive}`,
    `Current match ID: ${d.riot.currentMatchId ?? 'null'}`,
    `Session state: ${d.riot.lastSessionLoopState}`,
    `Circuit breaker: ${d.riot.circuitBreakerOpen ? 'OPEN' : 'closed'} (failures: ${d.riot.sessionStateFailures})`,
    `Client version: ${d.riot.clientVersion}`,
    '',
    '=== RECORDING ===',
    `Active: ${d.recording.active}`,
    `Last path: ${d.recording.lastPath ?? 'none'}`,
    `Last size: ${d.recording.lastSizeMb.toFixed(1)} MB`,
    `Last error: ${d.recording.lastError ?? 'none'}`,
  ]
  if (d.lastMatch) {
    const m = d.lastMatch
    lines.push(
      '',
      '=== LAST MATCH ===',
      `Time: ${new Date(m.timestamp).toISOString()}`,
      `Map: ${m.map ?? 'unknown'} / Agent: ${m.agent ?? 'unknown'} / Mode: ${m.gameMode}`,
      `Recording: ${formatDuration(m.recordingDuration)} / ${m.fileSizeMb.toFixed(1)} MB`,
      `Kills in timeline: ${m.killsInTimeline}`,
      `Clips extracted: ${m.clipsExtracted}`,
      `Match ID: ${m.matchId ?? 'null'}`,
      `Details status: ${m.matchDetailsStatus}`,
    )
    if (clipInterpretation.value) lines.push(`Interpretation: ${clipInterpretation.value}`)
  }
  lines.push(
    '',
    '=== ACTIVITY LOG ===',
    ...d.activityLog.map(e => `[${new Date(e.time).toISOString()}] ${e.message}`),
  )
  return lines.join('\n')
}
</script>

<!-- Reusable sub-components defined inline -->
<script lang="ts">
import { defineComponent, h } from 'vue'

export const DevSection = defineComponent({
  props: { title: String, count: Number },
  setup(props, { slots }) {
    return () => h('div', { class: 'rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden' }, [
      h('div', { class: 'flex items-center justify-between px-3.5 py-2 border-b border-white/[0.05] bg-white/[0.02]' }, [
        h('span', { class: 'text-[11px] font-semibold text-gray-500 uppercase tracking-widest' }, props.title),
        props.count !== undefined ? h('span', { class: 'text-[10px] text-gray-700' }, String(props.count)) : null,
      ]),
      h('div', { class: 'px-3.5 py-2.5' }, slots.default?.()),
    ])
  },
})

export const DevRow = defineComponent({
  props: { label: String, value: [String, Number, Boolean, null] as unknown as () => string | number | boolean | null | undefined, badge: Boolean, warn: Boolean },
  setup(props) {
    return () => {
      const val = props.value
      let valueEl
      if (props.badge && typeof val === 'boolean') {
        valueEl = h('span', {
          class: val
            ? 'px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400'
            : 'px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400',
        }, val ? 'YES' : 'NO')
      } else if (typeof val === 'boolean') {
        valueEl = h('span', { class: val ? 'text-green-400' : 'text-gray-600' }, val ? 'true' : 'false')
      } else if (val === null || val === undefined) {
        valueEl = h('span', { class: 'text-gray-700 italic' }, 'null')
      } else {
        valueEl = h('span', { class: props.warn ? 'text-amber-400' : 'text-gray-300' }, String(val))
      }
      return h('div', { class: 'flex items-center justify-between gap-4 min-w-0' }, [
        h('span', { class: 'flex-shrink-0 text-xs text-gray-600' }, props.label),
        h('div', { class: 'flex-1 text-right min-w-0 overflow-hidden' }, [valueEl]),
      ])
    }
  },
})
</script>
