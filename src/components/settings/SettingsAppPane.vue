<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettings } from '../../composables/useSettings'
import SettingsCoachingBriefs from './SettingsCoachingBriefs.vue'
import SettingsRow from './SettingsRow.vue'
import SettingsSection from './SettingsSection.vue'
import SettingsToggle from './SettingsToggle.vue'
import { setUiV3, uiV3 } from '../../lib/ui-v3'
import { gameBrand } from '../../lib/game-branding'

const {
  PRIMARY_GAMES,
  highlightSection,
  isMac,
  selectPrimaryGame,
  settings,
  toggleKey,
  toggleLaunchOnStartup,
  toggleTrainingConsent,
  toggles,
} = useSettings()

const currentGameLabel = computed(() => PRIMARY_GAMES.find(g => g.id === settings.primaryGame)?.label ?? 'Valorant')

const router = useRouter()

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
  else {
    toggleKey(key)
    if (key === 'discordRichPresence') void refreshDiscordStatus()
  }
}
</script>

<template>
  <div class="space-y-4">
    <SettingsCoachingBriefs />
    <!-- v3: the title bar's game switcher is the one place to change game (docs/design/ui-v3.md);
         Settings only says which game is on. -->
    <SettingsSection
      v-if="!uiV3"
      title="Your game"
      hint="Switches dashboard, settings, and web links, same as upforge.gg."
    >
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          v-for="game in PRIMARY_GAMES"
          :key="game.id"
          type="button"
          class="rounded-lg border px-3 py-2.5 text-left transition-colors"
          :class="settings.primaryGame === game.id
            ? 'border-white/[0.18] bg-white/[0.07]'
            : 'border-white/[0.08] bg-transparent hover:border-white/[0.12] hover:bg-white/[0.03]'"
          @click="selectPrimaryGame(game.id)"
        >
          <div class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full" :style="{ backgroundColor: game.accent }" />
            <span class="text-xs font-semibold text-gray-200">{{ game.label }}</span>
          </div>
        </button>
      </div>
    </SettingsSection>

    <SettingsSection
      id="discord"
      title="Preferences"
      hint="Startup, notifications, and automation"
      divided
      :highlight-id="highlightSection"
    >
      <SettingsRow
        v-if="uiV3"
        label="Your game"
        hint="Coaching, recording and web links follow this game. Switch it with the game logos in the title bar."
      >
        <span class="uf-set-ctl">
          <img :src="gameBrand(settings.primaryGame).logo" alt="" class="uf-link-logo">
          <span class="uf-t3">{{ currentGameLabel }}</span>
        </span>
      </SettingsRow>
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
          <div v-if="uiV3" class="uf-set-row-text">
            <p class="uf-note" :class="discordStatus.connected ? 'is-ok' : 'is-warn'">
              {{ discordStatus.connected ? 'Connected to Discord' : 'Waiting for Discord…' }}<span v-if="discordStatus.buttonsRegistered"> · Buttons registered</span>
            </p>
            <p v-if="discordStatus.details" class="uf-t4">Showing: {{ discordStatus.details }}</p>
            <p class="uf-t4">You cannot see buttons on your own profile. Test on Discord mobile, or ask a friend to open your full profile.</p>
          </div>
          <div v-else class="mt-2 text-xs text-gray-400">
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
              You cannot see buttons on your own profile. Test on Discord mobile, or ask a friend to open your full profile.
            </p>
          </div>
        </template>
        <SettingsToggle :label="toggle.label" :on="!!settings[toggle.key]" @click="onToggle(toggle.key)" />
      </SettingsRow>
      <SettingsRow
        v-if="uiV3 && !isMac"
        label="PC performance"
        hint="Raises game priority, switches the power plan and closes apps you choose while you play (Windows)."
      >
        <button type="button" class="uf-link" @click="router.push('/performance')">Open →</button>
      </SettingsRow>
      <!-- Shown in both designs so a player can always switch back. -->
      <SettingsRow
        label="Use the classic design"
        hint="Switch back to the previous look if something doesn't work for you. You can turn the new design on again here."
      >
        <SettingsToggle label="Use the classic design" :on="!uiV3" @click="setUiV3(!uiV3)" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      v-if="uiV3"
      title="Privacy &amp; data"
      divided
    >
      <SettingsRow
        label="Help improve UpForge AI"
        hint="Allow anonymised use of cloud-archived VODs for model training. Separate from saving to cloud. Off by default."
      >
        <SettingsToggle label="Help improve UpForge AI" :on="!!settings.trainingConsent" @click="toggleTrainingConsent" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
