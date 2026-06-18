<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from 'vue'

export interface CarouselPanel {
  id: string
  label: string
  accent?: string
}

const props = withDefaults(defineProps<{
  panels: CarouselPanel[]
  interval?: number
}>(), {
  interval: 6000,
})

const index = defineModel<number>('index', { default: 0 })

const activePanel = computed(() => {
  if (!props.panels.length) return null
  const safe = ((index.value % props.panels.length) + props.panels.length) % props.panels.length
  return props.panels[safe] ?? null
})

let timer: ReturnType<typeof setInterval> | null = null

function goTo(i: number) {
  if (!props.panels.length) return
  index.value = ((i % props.panels.length) + props.panels.length) % props.panels.length
  restart()
}

function prev() {
  goTo(index.value - 1)
}

function next() {
  goTo(index.value + 1)
}

function start() {
  if (timer || props.panels.length <= 1) return
  timer = setInterval(next, props.interval)
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function restart() {
  stop()
  start()
}

watch(() => props.panels.length, (len) => {
  if (index.value >= len) index.value = 0
  restart()
})

onMounted(start)
onUnmounted(stop)

function onEnter() {
  stop()
}

function onLeave() {
  start()
}
</script>

<template>
  <div
    v-if="panels.length"
    class="panel-carousel w-full self-start"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <div class="panel-carousel__header">
      <span class="panel-carousel__label">{{ activePanel?.label }}</span>
      <div v-if="panels.length > 1" class="panel-carousel__nav">
        <button type="button" class="panel-carousel__arrow" aria-label="Previous panel" @click="prev">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div class="flex items-center gap-1 px-0.5">
          <button
            v-for="(panel, i) in panels"
            :key="panel.id"
            type="button"
            class="rounded-full transition-all duration-300"
            :class="i === index
              ? `w-3.5 h-1.5 ${panel.accent ?? 'bg-red-500'}`
              : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'"
            :title="panel.label"
            @click="goTo(i)"
          />
        </div>
        <button type="button" class="panel-carousel__arrow" aria-label="Next panel" @click="next">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <Transition name="panel-slide" mode="out-in">
      <div :key="activePanel?.id" class="panel-carousel__body">
        <slot :panel="activePanel" :index="index" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.panel-carousel {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
  height: fit-content;
  max-height: 100%;
}

.panel-carousel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-carousel__label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(107, 114, 128);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.panel-carousel__nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.panel-carousel__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgb(107, 114, 128);
  transition: color 0.15s, background 0.15s;
}
.panel-carousel__arrow:hover {
  color: white;
  background: rgba(255, 255, 255, 0.06);
}

.panel-carousel__body {
  padding: 8px 12px 10px;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.panel-slide-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.panel-slide-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}
</style>
