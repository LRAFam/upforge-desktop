<script setup lang="ts">
/**
 * Settings (UI v3). SettingsView still provides the settings context. The panes render their own v3
 * markup (`v-if="uiV3"` branches in components/settings/**, styled by v3/settings/settings-v3.css);
 * every control, IPC call and section deep-link is unchanged (docs/design/ui-v3.md · board 25).
 */
import { computed } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { getTierBadgeLabel } from '../../lib/valorant'
import SettingsAccountPane from '../../components/settings/SettingsAccountPane.vue'
import SettingsRecordingPane from '../../components/settings/SettingsRecordingPane.vue'
import SettingsTrainerPane from '../../components/settings/SettingsTrainerPane.vue'
import SettingsAppPane from '../../components/settings/SettingsAppPane.vue'
import SettingsAdvancedPane from '../../components/settings/SettingsAdvancedPane.vue'
import SettingsFooter from '../../components/settings/SettingsFooter.vue'
import UfIcon from '../../components/v3/UfIcon.vue'
import UfTabs from '../../components/v3/UfTabs.vue'
import { settingsStatusLine } from '../../components/v3/settings/settings-v3-status'
import '../../components/v3/settings/settings-v3.css'

const {
  SETTINGS_CATEGORIES,
  activeCategory,
  setActiveCategory,
  savedToast,
  toastMessage,
  captureBackendOk,
  user,
} = useSettings()

const activeMeta = computed(
  () => SETTINGS_CATEGORIES.find(c => c.id === activeCategory.value) ?? SETTINGS_CATEGORIES[0],
)
const tabItems = computed(() => SETTINGS_CATEGORIES.map(c => ({ key: c.id, label: c.label })))
function onTab(id: string) {
  const cat = SETTINGS_CATEGORIES.find(c => c.id === id)
  if (cat) setActiveCategory(cat.id)
}
const status = computed(() => settingsStatusLine({
  recordingReady: captureBackendOk.value,
  planLabel: getTierBadgeLabel(user.value?.tier) || 'Free',
}))
</script>

<template>
  <div class="uf-settings">
    <div class="uf-settings-scroll">
      <div class="uf-settings-pad">
        <header class="uf-settings-head uf-rise">
          <div class="uf-settings-titles">
            <span class="uf-label">Settings</span>
            <h1 class="uf-d2">{{ activeMeta.label }}</h1>
            <p class="uf-t2">{{ activeMeta.purpose }}</p>
          </div>
          <dl class="uf-settings-status" aria-label="Status">
            <div v-for="s in status" :key="s.label">
              <dt class="uf-t4">{{ s.label }}</dt>
              <dd class="uf-t3"><span class="uf-dot" :style="{ background: s.tone === 'ok' ? 'var(--uf-win)' : s.tone === 'warn' ? 'var(--uf-gold)' : 'var(--uf-faint)' }" />{{ s.value }}</dd>
            </div>
          </dl>
        </header>

        <UfTabs :items="tabItems" :model-value="activeCategory" label="Settings sections" divider @update:model-value="onTab" />

        <div class="uf-settings-body">
          <SettingsAccountPane v-if="activeCategory === 'account'" />
          <SettingsRecordingPane v-else-if="activeCategory === 'recording'" />
          <SettingsTrainerPane v-else-if="activeCategory === 'trainer'" />
          <SettingsAppPane v-else-if="activeCategory === 'app'" />
          <SettingsAdvancedPane v-else-if="activeCategory === 'advanced'" />
        </div>
      </div>
    </div>

    <SettingsFooter />

    <Transition name="uf-toast">
      <div v-if="savedToast" class="uf-toast" role="status">
        <UfIcon name="check" :size="16" />{{ toastMessage || 'Settings saved' }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.uf-settings { --game-accent: var(--uf-red); position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--uf-bg); }
.uf-settings-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.uf-settings-pad { max-width: 1040px; padding: 22px 40px 40px; display: flex; flex-direction: column; gap: 22px; }
.uf-settings-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.uf-settings-titles { display: flex; flex-direction: column; gap: 10px; }
.uf-settings-titles h1, .uf-settings-titles p { margin: 0; }
.uf-settings-status { display: flex; gap: 28px; margin: 0; }
.uf-settings-status > div { display: flex; flex-direction: column; gap: 6px; }
.uf-settings-status dd { margin: 0; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; }
.uf-toast { position: fixed; right: 24px; bottom: 24px; z-index: 90; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--uf-raised); border-left: 2px solid var(--uf-win); color: var(--uf-bone); font: 600 15px/1 var(--uf-body); pointer-events: none; }
.uf-toast svg { color: var(--uf-win); }
.uf-toast-enter-active, .uf-toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.uf-toast-enter-from, .uf-toast-leave-to { opacity: 0; transform: translateY(8px); }

@media (prefers-reduced-motion: reduce) { .uf-toast-enter-active, .uf-toast-leave-active { transition: none; } }
</style>
