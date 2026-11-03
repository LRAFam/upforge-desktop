<script setup lang="ts">
/**
 * Settings › Advanced — hidden diagnostics: save the raw CS2 GSI / Deadlock data of ONE match
 * to local files so we can confirm what each game really sends. Off by default; turns itself off.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { GameDataCaptureStatus } from '../../env'
import SettingsRow from './SettingsRow.vue'
import SettingsSection from './SettingsSection.vue'
import SettingsToggle from './SettingsToggle.vue'

const status = ref<GameDataCaptureStatus | null>(null)
const busy = ref(false)
const cs2NeedsRestart = ref(false)
const openError = ref<string | null>(null)
let poll: ReturnType<typeof setInterval> | null = null

async function refresh(): Promise<void> {
  try {
    status.value = await window.api.app.gameDataCapture.status()
  } catch {
    status.value = null
  }
}

async function toggle(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const next = await window.api.app.gameDataCapture.set(!status.value?.armed)
    if (next) status.value = next
    cs2NeedsRestart.value = Boolean(next?.armed && next.cs2NeedsRestart)
  } finally {
    busy.value = false
  }
}

async function openFolder(): Promise<void> {
  const res = await window.api.app.gameDataCapture.openFolder()
  openError.value = res.ok ? null : res.error ?? 'Could not open the folder'
}

const gameLabel = (g: 'cs2' | 'deadlock'): string => (g === 'cs2' ? 'CS2' : 'Deadlock')

const stateLine = computed(() => {
  const s = status.value
  if (!s) return null
  if (s.active) return `Saving ${gameLabel(s.active.game)} data · ${s.active.updates} updates · ${(s.active.bytesWritten / 1048576).toFixed(1)} MB`
  if (s.armed) return 'Waiting for your next CS2 or Deadlock match'
  if (s.last) {
    const when = new Date(s.last.endedAt ?? s.last.matchStartedAt).toLocaleString()
    const why = s.last.stopReason === 'size-limit' ? ' (stopped at 200 MB)' : ''
    return `Last capture: ${gameLabel(s.last.game)}, ${when}, ${s.last.updates} updates${why}`
  }
  return null
})

onMounted(() => {
  void refresh()
  poll = setInterval(() => { void refresh() }, 5000)
})
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
</script>

<template>
  <SettingsSection id="game-data-capture" title="Game data diagnostics" hint="Saves the raw data CS2 or Deadlock sends UpForge during one match">
    <SettingsRow
      label="Save raw game data for the next match (diagnostics)"
      hint="Turns itself off after one CS2 or Deadlock match, or at 200 MB. Files contain your Steam ID and stay on this PC. UpForge never uploads them."
    >
      <SettingsToggle label="Save raw game data for the next match (diagnostics)" :on="!!status?.armed" :disabled="busy || !status" @click="toggle" />
    </SettingsRow>
    <p v-if="stateLine" class="uf-note" :class="status?.active ? 'is-ok' : undefined" role="status">{{ stateLine }}</p>
    <p v-if="status?.armed" class="uf-t4">
      CS2: {{ cs2NeedsRestart ? 'restart CS2 now' : 'if CS2 is open, restart it' }} so it sends every data field. Deadlock: for console lines, add <strong>-condebug</strong> to Deadlock's launch options in Steam first.
    </p>
    <p v-if="status?.last?.deadlock?.consoleLogHint" class="uf-note is-warn">{{ status.last.deadlock.consoleLogHint }}</p>
    <SettingsRow label="Diagnostics folder" :hint="status?.dir ?? '%APPDATA%\\upforge-desktop\\diagnostics'">
      <button type="button" class="uf-btn-secondary uf-set-btn" @click="openFolder">Open diagnostics folder</button>
    </SettingsRow>
    <p v-if="openError" class="uf-t4" role="status">{{ openError }}</p>
  </SettingsSection>
</template>
