<script setup lang="ts">
import { computed } from 'vue'
import { provideSettings } from '../composables/useSettings'
import { useGameTheme } from '../composables/useGameTheme'
import { getTierBadgeClass, getTierBadgeLabel } from '../lib/valorant'
import { getSubscriptionIconUrl } from '../lib/rank-assets'
import SettingsGeneralTab from '../components/settings/SettingsGeneralTab.vue'
import SettingsRecordingTab from '../components/settings/SettingsRecordingTab.vue'
import SettingsTrainerTab from '../components/settings/SettingsTrainerTab.vue'
import SettingsSystemTab from '../components/settings/SettingsSystemTab.vue'
import SettingsFooter from '../components/settings/SettingsFooter.vue'

const { theme, cssVars } = useGameTheme()
const settingsTabActiveClass = computed(
  () => `${theme.value.accentBg} ${theme.value.accentText} ring-1 ${theme.value.accentBorder}`,
)
const {
  user,
  SETTINGS_TABS,
  activeTab,
  savedToast,
  toastMessage,
} = provideSettings()
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden text-white" :style="cssVars">
    <div class="flex-shrink-0 px-4 pt-4 pb-2 border-b border-white/[0.08]">
      <div class="panel-elevated relative overflow-hidden px-4 py-3.5">
        <div class="absolute -right-8 top-0 h-24 w-24 rounded-full blur-3xl pointer-events-none" :class="theme.accentBg" />
        <div class="relative flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.28em]" :class="theme.accentMuted">Desktop App</p>
            <h1 class="text-lg font-black tracking-tight text-white">Settings</h1>
            <p class="text-[11px] text-gray-500 mt-0.5">Account, recording, hotkeys, and preferences</p>
          </div>
          <div v-if="user" class="hidden sm:block rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
            <p class="text-[10px] font-semibold text-gray-300 truncate max-w-[140px]">{{ user.name }}</p>
            <span class="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" :class="getTierBadgeClass(user.tier)">
              <img v-if="getSubscriptionIconUrl(user.tier)" :src="getSubscriptionIconUrl(user.tier)!" :alt="getTierBadgeLabel(user.tier)" class="w-3.5 h-3.5 object-contain" />
              {{ getTierBadgeLabel(user.tier) }}
            </span>
          </div>
        </div>
      </div>
    </div>
    <nav class="flex flex-shrink-0 gap-1 overflow-x-auto scrollbar-hide border-b border-white/[0.09] bg-[#161616]/80 px-4 py-2.5">
      <button
        v-for="tab in SETTINGS_TABS"
        :key="tab.id"
        :class="[
          'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
          activeTab === tab.id
            ? settingsTabActiveClass
            : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
        ]"
        @click="activeTab = tab.id"
      >
        <svg class="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-html="tab.icon" />
        {{ tab.label }}
      </button>
    </nav>

    <div class="flex-1 space-y-4 scroll-col px-4 py-4">
      <SettingsGeneralTab v-show="activeTab === 'general'" />
      <SettingsRecordingTab v-show="activeTab === 'recording'" />
      <SettingsTrainerTab v-show="activeTab === 'trainer'" />
      <SettingsSystemTab v-show="activeTab === 'system'" />
    </div>

    <SettingsFooter />

    <Transition name="toast-slide">
      <div v-if="savedToast" class="fixed right-5 bottom-5 flex items-center gap-2 rounded-xl border border-green-500/20 bg-[#121212] px-4 py-2.5 text-sm text-white shadow-xl pointer-events-none">
          <svg class="h-4 w-4 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          {{ toastMessage || 'Settings saved' }}
        </div>
    </Transition>
  </div>
</template>
