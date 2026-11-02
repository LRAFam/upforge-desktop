<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { DEFAULT_CROSSHAIR, resolveColor, type CrosshairSettings } from '../../lib/crosshair'
import { TRAINING_ARTWORK } from '../../lib/training-icons'
import { uiV3 } from '../../lib/ui-v3'
import UfButton from '../v3/UfButton.vue'
import CrosshairPreview from '../v3/practice/CrosshairPreview.vue'
import { getMapImage } from '../../lib/valorant'

// Real map art behind the crosshair so colour and outline contrast read like in game.
const previewBackdrop = getMapImage('Ascent')

const router = useRouter()
const crosshair = ref<CrosshairSettings | null>(null)
const mouseDpi = ref<number | null>(null)

onMounted(async () => {
  try {
    const s = await window.api.settings.get()
    // Older saved settings can miss newer fields; fill them from the trainer defaults.
    crosshair.value = s.crosshairSettings ? { ...DEFAULT_CROSSHAIR, ...(s.crosshairSettings as Partial<CrosshairSettings>) } : null
    mouseDpi.value = s.trainerMouse?.dpi ?? null
  } catch { /* ignore */ }
})

function openSettings() {
  void router.push({ path: '/settings', query: { tab: 'trainer' } })
}
</script>

<template>
  <!-- UI v3 (legacy markup below, unchanged). The old "Competitive preset" name was hard-coded, so v3 leaves it out. -->
  <section v-if="uiV3" class="uf-lo uf-rise">
    <span class="uf-label">Drill loadout</span>
    <p class="uf-t2" style="margin: 0">The crosshair and sensitivity the trainer uses when you launch a drill.</p>
    <div class="uf-lo-row">
      <CrosshairPreview v-if="crosshair" :settings="crosshair" :scale="2" :size="200" :background="previewBackdrop" />
      <dl class="uf-lo-facts">
        <div v-if="mouseDpi"><dt class="uf-t4">Mouse DPI</dt><dd class="uf-d4">{{ mouseDpi }}</dd></div>
        <div><dt class="uf-t4">Crosshair</dt><dd class="uf-t3">Synced to trainer · shown at 2×</dd></div>
      </dl>
    </div>
    <UfButton variant="secondary" icon="settings" @click="openSettings">Edit in Settings</UfButton>
    <div class="uf-hair" style="align-self: stretch" />
    <p class="uf-t4" style="margin: 0">Saving more than one loadout isn’t available yet.</p>
  </section>

  <template v-else>
  <div class="p-5 space-y-4 max-w-lg">
    <div class="dash-panel relative overflow-hidden p-4">
      <img
        :src="TRAINING_ARTWORK.loadoutArt"
        alt=""
        aria-hidden="true"
        class="absolute -right-6 -top-6 h-32 w-32 object-contain opacity-[0.18] pointer-events-none"
      />
      <div class="relative z-10">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Active loadout</p>
      <p class="text-sm font-bold text-white mt-1">Competitive preset</p>
      <p class="text-[11px] text-gray-500 mt-1">Crosshair + sensitivity applied when launching drills.</p>

      <div class="mt-4 flex items-center gap-4">
        <div
          v-if="crosshair"
          class="relative h-16 w-16 rounded-xl border border-white/[0.10] bg-[#1a1a1a] flex items-center justify-center overflow-hidden"
        >
          <span
            class="absolute rounded-full"
            :style="{
              width: `${Math.max(4, crosshair.dotRadius * 2)}px`,
              height: `${Math.max(4, crosshair.dotRadius * 2)}px`,
              backgroundColor: resolveColor(crosshair),
              opacity: crosshair.dotOpacity,
            }"
          />
        </div>
        <div class="text-[11px] text-gray-500 space-y-1">
          <p v-if="mouseDpi">DPI: <span class="text-gray-300 font-semibold tabular-nums">{{ mouseDpi }}</span></p>
          <p>Crosshair synced to trainer</p>
        </div>
      </div>

      <button
        type="button"
        class="mt-4 w-full py-2.5 rounded-lg border border-white/[0.10] text-[12px] font-semibold text-gray-300 hover:bg-white/[0.04] transition-colors"
        @click="openSettings"
      >Edit in Settings</button>
      </div>
    </div>

    <p class="text-[11px] text-gray-600">Named loadout presets — save multiple crosshair + sens combos — coming in Phase 4.</p>
  </div>
  </template>
</template>

<style scoped>
.uf-lo { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 14px 12px 32px; max-width: 560px; }
.uf-lo-row { display: flex; align-items: center; gap: 28px; }
.uf-lo-facts { display: flex; flex-direction: column; gap: 18px; margin: 0; }
.uf-lo-facts > div { display: flex; flex-direction: column-reverse; gap: 4px; }
.uf-lo-facts dd { margin: 0; }
</style>
