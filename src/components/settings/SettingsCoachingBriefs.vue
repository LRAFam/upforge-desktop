<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { CoachingPreferences } from '../../lib/coaching-preferences'
import { coachingSkipMessage } from '../../lib/coaching-preferences'
import SettingsSection from './SettingsSection.vue'

const preferences = ref<CoachingPreferences | null>(null)
const busy = ref(false)
const message = ref('')
onMounted(async () => {
  try { preferences.value = await window.api.coaching.preferences() }
  catch { message.value = 'Could not load coaching preferences. Reopen Settings to try again.' }
})
async function save() {
  if (!preferences.value) return
  busy.value = true
  try {
    preferences.value = await window.api.coaching.savePreferences({ ...preferences.value })
    message.value = 'Coaching preferences saved.'
  } catch { message.value = 'Could not save preferences. Your previous settings still apply.' }
  finally { busy.value = false }
}
async function pregame() {
  busy.value = true
  try {
    const result = await window.api.coaching.pregame()
    message.value = result.discord_sent ? 'Brief sent to Discord.' : coachingSkipMessage(result.reason)
  } catch { message.value = 'Could not request the brief. Try again later.' }
  finally { busy.value = false }
}
</script>

<template>
  <SettingsSection title="Coaching briefs" hint="Control Valorant pre-game DMs and post-game AI debriefs across your account.">
    <fieldset v-if="preferences" :disabled="busy" class="space-y-3 text-xs text-gray-300 disabled:opacity-60">
      <label class="flex items-center justify-between gap-4">
        Delivery
        <select v-model="preferences.mode" class="rounded border border-white/15 bg-[#181818] p-2">
          <option value="smart">Smart</option>
          <option value="manual">Manual only</option>
          <option value="off">Off</option>
        </select>
      </label>
      <p class="text-gray-500">Smart skips repeated advice and waits 90 minutes between briefs of each type. Automatic post-game coaching needs at least six captured rounds and three first kills or first deaths. Manual requests still use your plan allowance.</p>
      <label class="flex items-center gap-2"><input v-model="preferences.pregame_enabled" type="checkbox"> Pre-game briefs in Discord</label>
      <label class="flex items-center gap-2"><input v-model="preferences.postgame_enabled" type="checkbox"> Post-game AI debriefs in the app and Discord</label>
      <label class="flex items-center justify-between gap-4">
        Automatic briefs per day, per type (UTC)
        <input v-model.number="preferences.daily_limit" type="number" min="1" max="5" class="w-16 rounded border border-white/15 bg-[#181818] p-2">
      </label>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="rounded bg-white/10 px-3 py-2 hover:bg-white/15" @click="save">Save preferences</button>
        <button type="button" class="rounded border border-white/15 px-3 py-2" @click="pregame">Request current pre-game brief</button>
      </div>
      <p class="text-gray-500">Request a post-game debrief from the match screen. Pre-game briefs use saved advice and do not spend AI credits.</p>
    </fieldset>
    <p v-else-if="!message" class="text-xs text-gray-500">Loading preferences...</p>
    <p v-if="message" role="status" class="mt-2 text-xs text-gray-300">{{ message }}</p>
  </SettingsSection>
</template>
