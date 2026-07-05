<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { resolveColor, type CrosshairSettings } from '../../lib/crosshair'
import { TRAINING_ARTWORK } from '../../lib/training-icons'

const router = useRouter()
const crosshair = ref<CrosshairSettings | null>(null)
const mouseDpi = ref<number | null>(null)

onMounted(async () => {
  try {
    const s = await window.api.settings.get()
    crosshair.value = s.crosshairSettings as CrosshairSettings
    mouseDpi.value = s.trainerMouse?.dpi ?? null
  } catch { /* ignore */ }
})

function openSettings() {
  void router.push({ path: '/settings', query: { tab: 'trainer' } })
}
</script>

<template>
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
