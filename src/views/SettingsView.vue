<script setup lang="ts">
import { computed } from 'vue'
import { provideSettings } from '../composables/useSettings'
import { useGameTheme } from '../composables/useGameTheme'
import SettingsAccountPane from '../components/settings/SettingsAccountPane.vue'
import SettingsRecordingPane from '../components/settings/SettingsRecordingPane.vue'
import SettingsTrainerPane from '../components/settings/SettingsTrainerPane.vue'
import SettingsAppPane from '../components/settings/SettingsAppPane.vue'
import SettingsAdvancedPane from '../components/settings/SettingsAdvancedPane.vue'
import SettingsFooter from '../components/settings/SettingsFooter.vue'

const { cssVars } = useGameTheme()
const {
  SETTINGS_CATEGORIES,
  activeCategory,
  setActiveCategory,
  savedToast,
  toastMessage,
} = provideSettings()

const activeMeta = computed(
  () => SETTINGS_CATEGORIES.find((c) => c.id === activeCategory.value) ?? SETTINGS_CATEGORIES[0],
)
</script>

<template>
  <div class="settings-shell flex h-full flex-col overflow-hidden text-white" :style="cssVars">
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <nav class="flex w-[160px] flex-shrink-0 flex-col gap-0.5 border-r border-white/[0.08] bg-[#121212] px-2 py-3">
        <p class="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">Settings</p>
        <button
          v-for="cat in SETTINGS_CATEGORIES"
          :key="cat.id"
          type="button"
          class="relative flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors"
          :class="activeCategory === cat.id
            ? 'bg-white/[0.06] text-white'
            : 'text-gray-500 hover:bg-white/[0.03] hover:text-gray-300'"
          @click="setActiveCategory(cat.id)"
        >
          <span
            v-if="activeCategory === cat.id"
            class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
            :style="{ backgroundColor: 'var(--game-accent, #ef4444)' }"
          />
          <svg class="h-3.5 w-3.5 flex-shrink-0 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-html="cat.icon" />
          {{ cat.label }}
        </button>
      </nav>

      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div class="flex-shrink-0 border-b border-white/[0.07] px-5 py-3.5">
          <h1 class="text-base font-semibold tracking-tight text-white">{{ activeMeta.label }}</h1>
          <p class="mt-0.5 text-xs text-gray-500">{{ activeMeta.purpose }}</p>
        </div>

        <div class="flex-1 space-y-4 scroll-col px-5 py-4">
          <SettingsAccountPane v-if="activeCategory === 'account'" />
          <SettingsRecordingPane v-else-if="activeCategory === 'recording'" />
          <SettingsTrainerPane v-else-if="activeCategory === 'trainer'" />
          <SettingsAppPane v-else-if="activeCategory === 'app'" />
          <SettingsAdvancedPane v-else-if="activeCategory === 'advanced'" />
        </div>
      </div>
    </div>

    <SettingsFooter />

    <Transition name="toast-slide">
      <div
        v-if="savedToast"
        class="pointer-events-none fixed right-5 bottom-5 flex items-center gap-2 rounded-lg border border-green-500/20 bg-[#121212] px-4 py-2.5 text-sm text-white shadow-xl"
      >
        <svg class="h-4 w-4 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
        {{ toastMessage || 'Settings saved' }}
      </div>
    </Transition>
  </div>
</template>
