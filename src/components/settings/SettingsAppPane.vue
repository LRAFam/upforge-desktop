<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useSettings } from '../../composables/useSettings'
import SettingsRow from './SettingsRow.vue'
import SettingsSection from './SettingsSection.vue'

const {
  PRIMARY_GAMES,
  highlightSection,
  selectPrimaryGame,
  settings,
  toggleKey,
  toggleLaunchOnStartup,
  toggles,
} = useSettings()

const discordStatus = ref<Awaited<ReturnType<typeof window.api.discord.getStatus>> | null>(null)
let discordStatusTimer: ReturnType<typeof setInterval> | null = null

async function refreshDiscordStatus(): Promise<void> {
  if (!settings.discordRichPresence) {
    discordStatus.value = null
    return
  }
  try {
    discordStatus.value = await window.api.discord.getStatus()
  } catch {
    discordStatus.value = null
  }
}

onMounted(() => {
  void refreshDiscordStatus()
  discordStatusTimer = setInterval(() => { void refreshDiscordStatus() }, 10_000)
})

onUnmounted(() => {
  if (discordStatusTimer) clearInterval(discordStatusTimer)
})

function onToggle(key: (typeof toggles)[number]['key']): void {
  if (key === 'launchOnStartup') toggleLaunchOnStartup()
  else toggleKey(key)
}
</script>

<template>
  <div class="space-y-4">
    <SettingsSection
      title="Your game"
      hint="Switches dashboard, settings, and web links, same as upforge.gg."
    >
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          v-for="game in PRIMARY_GAMES"
          :key="game.id"
          type="button"
          class="rounded-xl border px-3 py-2.5 text-left transition-all"
          :class="settings.primaryGame === game.id
            ? 'border-white/[0.20] bg-white/[0.08]'
            : 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'"
          @click="selectPrimaryGame(game.id)"
        >
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 flex-shrink-0 rounded-full" :style="{ backgroundColor: game.accent }" />
            <span class="text-xs font-semibold text-gray-200">{{ game.label }}</span>
          </div>
        </button>
      </div>
    </SettingsSection>

    <SettingsSection
      id="discord"
      title="General preferences"
      hint="Startup, notifications, and automation"
      :highlight-id="highlightSection"
    >
      <SettingsRow
        v-for="toggle in toggles"
        :key="toggle.key"
        :label="toggle.label"
        :hint="toggle.hint ?? undefined"
      >
        <template
          v-if="toggle.key === 'discordRichPresence' && settings.discordRichPresence && discordStatus"
          #below
        >
          <div class="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-gray-400">
            <p>
              <span :class="discordStatus.connected ? 'text-emerald-400' : 'text-amber-400'">
                {{ discordStatus.connected ? 'Connected to Discord' : 'Waiting for Discord…' }}
              </span>
              <span v-if="discordStatus.buttonsRegistered"> · Buttons registered</span>
            </p>
            <p v-if="discordStatus.details" class="mt-1 text-gray-500">
              Showing: {{ discordStatus.details }}
            </p>
            <p class="mt-1 text-gray-500">
              You cannot see buttons on your own profile. Test on Discord mobile, or ask a friend to click your avatar and open the full profile popup.
            </p>
          </div>
        </template>
        <button
          type="button"
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
          :class="settings[toggle.key] ? 'bg-red-500' : 'bg-white/20'"
          @click="onToggle(toggle.key)"
        >
          <span
            class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
            :class="settings[toggle.key] ? 'translate-x-4' : 'translate-x-0.5'"
          />
        </button>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
