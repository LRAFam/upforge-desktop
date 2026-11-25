<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ scenario: string; metadata?: Record<string, unknown> }>()
const direction = computed(() => {
  if (!['head_height', 'angle_clearing'].includes(props.scenario)) return null
  const m = props.metadata
  if (!m || typeof m.placement_samples !== 'number' || !Number.isInteger(m.placement_samples) || m.placement_samples <= 0) return null
  const vertical = m.mean_signed_vertical_error_deg
  const horizontal = m.mean_signed_horizontal_error_deg
  const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180
  if (!measured(vertical) || !measured(horizontal)) return null
  return { vertical: offset(vertical, 'above', 'below'), horizontal: offset(horizontal, 'right', 'left') }
})

function offset(value: number, positive: string, negative: string): string {
  if (value === 0) return 'No average offset'
  const magnitude = Math.abs(value)
  return `${magnitude < 0.01 ? '<0.01' : magnitude.toFixed(2)}° ${value > 0 ? positive : negative}`
}
</script>

<template>
  <section v-if="direction" class="placement-direction" aria-label="Average crosshair offset">
    <h3>Average crosshair offset</h3>
    <p>When the head first became visible.</p>
    <dl>
      <div><dt>Vertical</dt><dd>{{ direction.vertical }}</dd></div>
      <div><dt>Horizontal</dt><dd>{{ direction.horizontal }}</dd></div>
    </dl>
    <p>Opposite offsets can cancel in the average.</p>
  </section>
</template>

<style scoped>
.placement-direction { display: grid; gap: 8px; }
h3, p, dl, dd { margin: 0; }
h3 { font-size: 13px; font-weight: 600; }
p, dt { font-size: 12px; opacity: .7; }
dl { display: flex; flex-wrap: wrap; gap: 12px 24px; }
dd { margin-top: 4px; font-size: 14px; font-variant-numeric: tabular-nums; }
</style>
