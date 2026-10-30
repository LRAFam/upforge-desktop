<script setup lang="ts">
/**
 * UI v3 dialog: one pattern for every modal. Square panel on a dim backdrop, hairline sections,
 * title (uf-d4 caps), body slot, actions slot (one primary at most). Esc / backdrop close unless `persistent`.
 * Teleports to <body>, so it carries `.ui-v3` itself to keep the tokens.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UfIcon from './UfIcon.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  kicker?: string
  width?: number
  persistent?: boolean
}>(), { width: 520, persistent: false })
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
let restoreFocus: HTMLElement | null = null

function close() { if (!props.persistent) emit('close') }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); close() } }

watch(() => props.open, async (on) => {
  if (on) {
    restoreFocus = document.activeElement as HTMLElement | null
    window.addEventListener('keydown', onKey, true)
    await nextTick()
    const first = panel.value?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ;(first ?? panel.value)?.focus()
  } else {
    window.removeEventListener('keydown', onKey, true)
    restoreFocus?.focus?.()
  }
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ui-v3 uf-dialog-backdrop" @mousedown.self="close">
      <div ref="panel" class="uf-dialog uf-rise" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" :style="{ width: `min(${width}px, calc(100vw - 48px))` }">
        <header v-if="title || kicker" class="uf-dialog-head">
          <div style="display: flex; flex-direction: column; gap: 8px; min-width: 0">
            <span v-if="kicker" class="uf-label">{{ kicker }}</span>
            <h2 v-if="title" class="uf-d4" style="margin: 0; text-transform: uppercase">{{ title }}</h2>
          </div>
          <button v-if="!persistent" type="button" class="uf-dialog-x" aria-label="Close" @click="close"><UfIcon name="close" :size="16" /></button>
        </header>
        <div class="uf-dialog-body"><slot /></div>
        <footer v-if="$slots.actions" class="uf-dialog-actions"><slot name="actions" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.uf-dialog-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(5, 7, 10, 0.72); display: flex; align-items: center; justify-content: center; font-family: var(--uf-body); color: var(--uf-bone); background-color: rgba(5, 7, 10, 0.72) !important; }
.uf-dialog { max-height: calc(100vh - 48px); overflow: auto; background: var(--uf-bg); border: 1px solid var(--uf-line-2); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6); outline: none; }
.uf-dialog-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 22px 24px 16px; border-bottom: 1px solid var(--uf-line); }
.uf-dialog-x { background: none; border: 0; color: var(--uf-muted); cursor: pointer; padding: 4px; }
.uf-dialog-x:hover { color: var(--uf-bone); }
.uf-dialog-body { padding: 18px 24px; display: flex; flex-direction: column; gap: 14px; }
.uf-dialog-actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 16px 24px 20px; border-top: 1px solid var(--uf-line); }
</style>
