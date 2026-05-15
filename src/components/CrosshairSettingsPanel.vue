<template>
  <div class="crosshair-panel">
    <!-- Preview + import code -->
    <div class="crosshair-top">
      <div class="crosshair-preview-wrap">
        <canvas ref="previewCanvas" width="120" height="120" class="crosshair-preview" />
      </div>

      <div class="crosshair-import">
        <label class="setting-label">Import Valorant Code</label>
        <div class="import-row">
          <input
            v-model="importCode"
            class="setting-input import-input"
            placeholder="0;P;h;0;m;1;0t;2;0l;10;..."
            @keydown.enter="applyImportCode"
          />
          <button class="btn-import" :class="{ 'btn-error': importError }" @click="applyImportCode">
            {{ importError ? 'Invalid' : 'Apply' }}
          </button>
        </div>
        <p v-if="importError" class="import-error-msg">{{ importError }}</p>
      </div>
    </div>

    <!-- Color palette -->
    <div class="setting-row">
      <label class="setting-label">Color</label>
      <div class="color-swatches">
        <button
          v-for="(hex, idx) in PALETTE_HEX"
          :key="idx"
          class="color-swatch"
          :class="{ active: localSettings.colorIndex === idx }"
          :style="{ background: hex }"
          :title="PALETTE_NAMES[idx]"
          @click="setColorIndex(idx)"
        />
        <!-- Custom -->
        <button
          class="color-swatch custom-swatch"
          :class="{ active: localSettings.colorIndex === 6 }"
          :style="{ background: '#' + localSettings.customColor }"
          title="Custom"
          @click="setColorIndex(6)"
        >
          <span v-if="localSettings.colorIndex !== 6" class="custom-icon">+</span>
        </button>
        <input
          v-if="localSettings.colorIndex === 6"
          type="color"
          class="color-picker"
          :value="'#' + localSettings.customColor"
          @input="onCustomColor"
        />
      </div>
    </div>

    <!-- Shadow -->
    <div class="setting-row">
      <label class="setting-label">Shadow / Outline</label>
      <toggle-switch :value="localSettings.shadowShow" @change="set('shadowShow', $event)" />
    </div>

    <!-- Centre dot -->
    <div class="setting-section-header">Centre Dot</div>

    <div class="setting-row">
      <label class="setting-label">Show</label>
      <toggle-switch :value="localSettings.dotShow" @change="set('dotShow', $event)" />
    </div>
    <template v-if="localSettings.dotShow">
      <div class="setting-row">
        <label class="setting-label">Size</label>
        <slider-control :value="localSettings.dotRadius" :min="0.5" :max="6" :step="0.5" @change="set('dotRadius', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Opacity</label>
        <slider-control :value="localSettings.dotOpacity" :min="0" :max="1" :step="0.05" :format="pct" @change="set('dotOpacity', $event)" />
      </div>
    </template>

    <!-- Inner lines -->
    <div class="setting-section-header">Inner Lines</div>

    <div class="setting-row">
      <label class="setting-label">Show</label>
      <toggle-switch :value="localSettings.innerShow" @change="set('innerShow', $event)" />
    </div>
    <template v-if="localSettings.innerShow">
      <div class="setting-row">
        <label class="setting-label">Thickness</label>
        <slider-control :value="localSettings.innerThickness" :min="0.5" :max="8" :step="0.5" @change="set('innerThickness', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Length</label>
        <slider-control :value="localSettings.innerLength" :min="0" :max="30" :step="1" @change="set('innerLength', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Gap</label>
        <slider-control :value="localSettings.innerOffset" :min="0" :max="20" :step="0.5" @change="set('innerOffset', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Opacity</label>
        <slider-control :value="localSettings.innerOpacity" :min="0" :max="1" :step="0.05" :format="pct" @change="set('innerOpacity', $event)" />
      </div>
    </template>

    <!-- Outer lines -->
    <div class="setting-section-header">Outer Lines</div>

    <div class="setting-row">
      <label class="setting-label">Show</label>
      <toggle-switch :value="localSettings.outerShow" @change="set('outerShow', $event)" />
    </div>
    <template v-if="localSettings.outerShow">
      <div class="setting-row">
        <label class="setting-label">Thickness</label>
        <slider-control :value="localSettings.outerThickness" :min="0.5" :max="8" :step="0.5" @change="set('outerThickness', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Length</label>
        <slider-control :value="localSettings.outerLength" :min="0" :max="30" :step="1" @change="set('outerLength', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Offset</label>
        <slider-control :value="localSettings.outerOffset" :min="0" :max="20" :step="0.5" @change="set('outerOffset', $event)" />
      </div>
      <div class="setting-row">
        <label class="setting-label">Opacity</label>
        <slider-control :value="localSettings.outerOpacity" :min="0" :max="1" :step="0.05" :format="pct" @change="set('outerOpacity', $event)" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, onMounted } from 'vue'
import {
  type CrosshairSettings,
  DEFAULT_CROSSHAIR,
  CROSSHAIR_PALETTE_HEX,
  CROSSHAIR_PALETTE_NAMES,
  parseValorantCode,
  renderCrosshairPreview,
} from '../lib/crosshair'

// ── Props & emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  modelValue: CrosshairSettings
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: CrosshairSettings): void
}>()

// ── Local state ───────────────────────────────────────────────────────────────

const localSettings = reactive<CrosshairSettings>({ ...DEFAULT_CROSSHAIR, ...props.modelValue })
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const importCode = ref('')
const importError = ref('')

const PALETTE_HEX   = CROSSHAIR_PALETTE_HEX
const PALETTE_NAMES = CROSSHAIR_PALETTE_NAMES

// ── Watchers ──────────────────────────────────────────────────────────────────

// Sync incoming prop changes → local state
watch(
  () => props.modelValue,
  (v) => Object.assign(localSettings, v),
  { deep: true }
)

// Re-draw preview whenever anything changes
watch(
  localSettings,
  () => nextTick(drawPreview),
  { deep: true, immediate: true }
)

onMounted(drawPreview)

// ── Methods ───────────────────────────────────────────────────────────────────

function set<K extends keyof CrosshairSettings>(key: K, value: CrosshairSettings[K]) {
  ;(localSettings as CrosshairSettings)[key] = value
  emit('update:modelValue', { ...localSettings })
}

function setColorIndex(idx: number) {
  localSettings.colorIndex = idx
  emit('update:modelValue', { ...localSettings })
}

function onCustomColor(e: Event) {
  const hex = (e.target as HTMLInputElement).value.replace('#', '').toUpperCase()
  localSettings.customColor = hex
  localSettings.colorIndex = 6
  emit('update:modelValue', { ...localSettings })
}

function applyImportCode() {
  importError.value = ''
  try {
    const parsed = parseValorantCode(importCode.value)
    Object.assign(localSettings, parsed)
    emit('update:modelValue', { ...localSettings })
    importCode.value = ''
  } catch (err: any) {
    importError.value = err?.message ?? 'Invalid code'
    setTimeout(() => { importError.value = '' }, 2500)
  }
}

function drawPreview() {
  if (previewCanvas.value) {
    renderCrosshairPreview(previewCanvas.value, localSettings)
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
</script>

<!-- Inline sub-components to keep the panel self-contained ─────────────────── -->
<script lang="ts">
import { defineComponent, h } from 'vue'

export const ToggleSwitch = defineComponent({
  name: 'ToggleSwitch',
  props: { value: Boolean },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h(
      'button',
      {
        class: ['toggle', props.value ? 'toggle-on' : 'toggle-off'],
        onClick: () => emit('change', !props.value),
      },
      props.value ? 'ON' : 'OFF'
    )
  }
})

export const SliderControl = defineComponent({
  name: 'SliderControl',
  props: {
    value: Number,
    min: Number,
    max: Number,
    step: Number,
    format: Function,
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'slider-wrap' }, [
      h('input', {
        type: 'range',
        class: 'slider',
        min: props.min,
        max: props.max,
        step: props.step,
        value: props.value,
        onInput: (e: Event) => emit('change', parseFloat((e.target as HTMLInputElement).value)),
      }),
      h('span', { class: 'slider-value' },
        props.format
          ? (props.format as Function)(props.value)
          : String(props.value)
      ),
    ])
  }
})
</script>

<style scoped>
.crosshair-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.crosshair-top {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 6px;
}

.crosshair-preview-wrap {
  flex-shrink: 0;
  width: 120px;
  height: 120px;
  background: #0f1015;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.crosshair-preview {
  display: block;
}

.crosshair-import {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.import-row {
  display: flex;
  gap: 8px;
}

.import-input {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
}

.btn-import {
  padding: 6px 14px;
  background: rgba(0, 255, 107, 0.15);
  border: 1px solid rgba(0, 255, 107, 0.3);
  border-radius: 6px;
  color: #00ff6b;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.btn-import:hover { background: rgba(0, 255, 107, 0.25); }
.btn-import.btn-error {
  background: rgba(255, 60, 60, 0.15);
  border-color: rgba(255, 60, 60, 0.4);
  color: #ff6b6b;
}

.import-error-msg {
  font-size: 11px;
  color: #ff6b6b;
  margin: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.setting-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  min-width: 100px;
}

.setting-section-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
  padding: 8px 0 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 4px;
}

/* Color swatches */
.color-swatches {
  display: flex;
  gap: 6px;
  align-items: center;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.15s;
  padding: 0;
  position: relative;
}
.color-swatch:hover { transform: scale(1.15); }
.color-swatch.active { border-color: white; transform: scale(1.1); }
.custom-swatch { background: #333; }
.custom-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: rgba(255,255,255,0.6);
}
.color-picker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

/* Toggle */
:deep(.toggle) {
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  min-width: 42px;
  transition: background 0.15s, border-color 0.15s;
}
:deep(.toggle-on) {
  background: rgba(0, 255, 107, 0.18);
  border-color: rgba(0, 255, 107, 0.4);
  color: #00ff6b;
}
:deep(.toggle-off) {
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.35);
}

/* Slider */
:deep(.slider-wrap) {
  display: flex;
  align-items: center;
  gap: 8px;
}
:deep(.slider) {
  width: 140px;
  accent-color: #00ff6b;
  cursor: pointer;
}
:deep(.slider-value) {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  min-width: 36px;
  text-align: right;
}
</style>
