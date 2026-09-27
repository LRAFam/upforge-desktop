<script setup lang="ts">
import { ref } from 'vue'
import { boundedPanelWidth, draggedPanelWidth } from '../../lib/review-workspace'
const props = defineProps<{ modelValue: number; min: number; max: number; label: string; reverse?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const dragging = ref(false)
let startX = 0
let startValue = 0
let containerWidth = 1
function update(value: number) {
  emit('update:modelValue', boundedPanelWidth(value, props.min, props.max))
}
function start(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  target.focus({ preventScroll: true })
  containerWidth = target.parentElement?.getBoundingClientRect().width || 1
  startX = event.clientX
  startValue = props.modelValue
  target.setPointerCapture(event.pointerId)
  dragging.value = true
}
function move(event: PointerEvent) {
  if (dragging.value) update(draggedPanelWidth(startValue, event.clientX - startX, containerWidth, props.reverse))
}
function key(event: KeyboardEvent) {
  const direction = props.reverse ? -1 : 1
  if (event.key === 'ArrowLeft') update(props.modelValue - direction)
  else if (event.key === 'ArrowRight') update(props.modelValue + direction)
  else if (event.key === 'Home') update(props.min)
  else if (event.key === 'End') update(props.max)
  else return
  event.preventDefault()
  event.stopPropagation()
}
</script>

<template>
  <div role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label"
    :aria-valuenow="Math.round(modelValue)" :aria-valuemin="min" :aria-valuemax="max"
    :aria-valuetext="`${Math.round(modelValue)} percent`"
    class="workspace-divider" :class="{ dragging }" title="Drag to resize. Use arrow keys when focused."
    @pointerdown.prevent="start" @pointermove="move" @pointerup="dragging = false"
    @pointercancel="dragging = false" @lostpointercapture="dragging = false" @keydown="key">
    <span aria-hidden="true">⋮</span>
  </div>
</template>

<style scoped>
.workspace-divider { width: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; cursor: col-resize; touch-action: none; color: #747e8c; background: #13161c; }
.workspace-divider:hover, .workspace-divider.dragging { background: #33202a; color: white; }
.workspace-divider:focus-visible { outline: 2px solid #d60838; outline-offset: -2px; }
</style>
