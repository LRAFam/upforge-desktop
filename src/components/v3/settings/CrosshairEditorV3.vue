<script setup lang="ts">
/**
 * v3 trainer crosshair editor: live preview on the left (sticky), controls on the right, so every
 * slider change is visible without scrolling. Same data and ranges as the classic
 * CrosshairSettingsPanel (lib/crosshair.ts); switches use SettingsToggle (.uf-switch).
 */
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  CROSSHAIR_PALETTE_HEX,
  CROSSHAIR_PALETTE_NAMES,
  DEFAULT_CROSSHAIR,
  parseValorantCode,
  renderCrosshairPreview,
  type CrosshairSettings,
} from '../../../lib/crosshair'
import SettingsToggle from '../../settings/SettingsToggle.vue'
import { CROSSHAIR_GROUPS, sliderValueLabel, type CrosshairBoolKey, type CrosshairNumberKey } from './crosshair-editor'

const props = defineProps<{ modelValue: CrosshairSettings }>()
const emit = defineEmits<{ 'update:modelValue': [value: CrosshairSettings] }>()

const local = reactive<CrosshairSettings>({ ...DEFAULT_CROSSHAIR, ...props.modelValue })
const canvas = ref<HTMLCanvasElement | null>(null)
const importCode = ref('')
const importError = ref('')

watch(() => props.modelValue, v => Object.assign(local, v), { deep: true })
watch(local, () => nextTick(draw), { deep: true })
onMounted(draw)

function draw() {
  if (canvas.value) renderCrosshairPreview(canvas.value, local)
}
function commit() {
  emit('update:modelValue', { ...local })
}
function setNumber(key: CrosshairNumberKey, e: Event) {
  local[key] = Number((e.target as HTMLInputElement).value)
  commit()
}
function flip(key: CrosshairBoolKey | 'shadowShow') {
  local[key] = !local[key]
  commit()
}
function setColor(idx: number) {
  local.colorIndex = idx
  commit()
}
function onCustomColor(e: Event) {
  local.customColor = (e.target as HTMLInputElement).value.replace('#', '').toUpperCase()
  local.colorIndex = 6
  commit()
}
function applyImport() {
  importError.value = ''
  try {
    Object.assign(local, parseValorantCode(importCode.value))
    importCode.value = ''
    commit()
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Invalid code'
  }
}
</script>

<template>
  <div class="uf-xh">
    <div class="uf-xh-preview">
      <div class="uf-xh-canvas">
        <canvas ref="canvas" width="400" height="400" role="img" aria-label="Crosshair preview" />
      </div>
      <p class="uf-t4">Live preview. Changes save as you go.</p>
    </div>

    <div class="uf-xh-controls">
      <div class="uf-xh-group">
        <span class="uf-t3">Import a Valorant code</span>
        <div class="uf-xh-import">
          <input v-model="importCode" type="text" class="uf-input is-mono" placeholder="0;P;h;0;m;1;0t;2;0l;10;…" aria-label="Valorant crosshair code" @keydown.enter="applyImport">
          <button type="button" class="uf-btn-secondary uf-set-btn" :disabled="!importCode.trim()" @click="applyImport">Apply</button>
        </div>
        <p v-if="importError" class="uf-note is-bad" role="alert">{{ importError }}</p>
      </div>

      <div class="uf-xh-group">
        <div class="uf-set-row">
          <span class="uf-t3">Colour</span>
          <div class="uf-xh-swatches" role="group" aria-label="Crosshair colour">
            <button
              v-for="(hex, idx) in CROSSHAIR_PALETTE_HEX"
              :key="hex"
              type="button"
              class="uf-xh-swatch"
              :style="{ background: hex }"
              :aria-label="CROSSHAIR_PALETTE_NAMES[idx]"
              :aria-pressed="local.colorIndex === idx"
              @click="setColor(idx)"
            />
            <input type="color" class="uf-xh-swatch" :value="'#' + local.customColor" aria-label="Custom colour" :class="{ 'is-on': local.colorIndex === 6 }" @input="onCustomColor">
          </div>
        </div>
        <div class="uf-set-row">
          <span class="uf-t3">Outline</span>
          <SettingsToggle label="Outline" :on="local.shadowShow" @click="flip('shadowShow')" />
        </div>
      </div>

      <div v-for="group in CROSSHAIR_GROUPS" :key="group.title" class="uf-xh-group">
        <div class="uf-set-row">
          <span class="uf-t3">{{ group.title }}</span>
          <SettingsToggle :label="`Show ${group.title.toLowerCase()}`" :on="local[group.show]" @click="flip(group.show)" />
        </div>
        <template v-if="local[group.show]">
          <label v-for="s in group.sliders" :key="s.key" class="uf-xh-slider">
            <span class="uf-t4">{{ s.label }}</span>
            <input type="range" class="uf-range" :min="s.min" :max="s.max" :step="s.step" :value="local[s.key]" :aria-label="`${group.title} ${s.label.toLowerCase()}`" @input="setNumber(s.key, $event)">
            <span class="uf-t4 uf-num">{{ sliderValueLabel(local[s.key], s.percent) }}</span>
          </label>
        </template>
      </div>
    </div>
  </div>
</template>
