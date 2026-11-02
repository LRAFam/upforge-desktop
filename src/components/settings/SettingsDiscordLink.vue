<script setup lang="ts">
/**
 * Settings › Account › Discord (v3): linked name, or "Link Discord" which opens Discord's authorise
 * page in the browser (state from the API; the web callback finishes the link). The row then
 * re-reads the profile when the app regains focus and every few seconds for up to 3 minutes.
 * Unlinking stays on the web profile (upforge.gg/profile).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { openWebFeature } from '../../lib/web-explore-links'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import { DISCORD_POLL_MS, linkedDiscordName, stillWaiting } from './discord-link'

const { user, highlightSection } = useSettings()
const name = computed(() => linkedDiscordName(user.value))
const busy = ref(false)
const error = ref('')
const waitingSince = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

function stopWaiting(): void {
  waitingSince.value = null
  if (timer) { clearInterval(timer); timer = null }
}

async function recheck(): Promise<void> {
  if (!stillWaiting(waitingSince.value, Date.now())) { stopWaiting(); return }
  try {
    // /api/profile carries discord_username (/api/user does not).
    const fresh = (await window.api.profile.get())?.user
    if (fresh && user.value) user.value = { ...user.value, discord_username: fresh.discord_username ?? null }
  } catch { /* try again on the next tick */ }
  if (name.value) stopWaiting()
}

async function link(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const res = await window.api.profile.linkDiscord()
    if (!res?.ok) { error.value = res?.error || 'Could not start Discord linking.'; return }
    waitingSince.value = Date.now()
    if (!timer) timer = setInterval(() => { void recheck() }, DISCORD_POLL_MS)
  } catch {
    error.value = 'Could not start Discord linking. Try again in a moment.'
  } finally {
    busy.value = false
  }
}

function onFocus(): void { if (waitingSince.value != null) void recheck() }
onMounted(() => window.addEventListener('focus', onFocus))
onBeforeUnmount(() => { window.removeEventListener('focus', onFocus); stopWaiting() })
</script>

<template>
  <SettingsSection id="discord-link" title="Discord" :highlight-id="highlightSection">
    <SettingsRow
      :label="name ? `Linked as ${name}` : 'Discord not linked'"
      :hint="name ? 'Pre-game briefs and post-game debriefs can reach you in Discord DMs.' : 'Link Discord to get pre-game briefs and post-game debriefs as DMs.'"
    >
      <button v-if="name" type="button" class="uf-link" @click="openWebFeature('/profile')">Change on upforge.gg →</button>
      <button v-else type="button" class="uf-btn-secondary uf-set-btn" :disabled="busy" @click="link">{{ busy ? 'Opening…' : 'Link Discord' }}</button>
    </SettingsRow>
    <p v-if="waitingSince && !name" class="uf-note" role="status">Finish in your browser. This updates when you come back.</p>
    <p v-if="error" class="uf-note is-bad" role="alert">{{ error }}</p>
  </SettingsSection>
</template>
