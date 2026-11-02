<script setup lang="ts">
/**
 * Sidebar "More on upforge.gg": one quiet menu of web-only features for the current game
 * (roadmap, goals, lineups, guides…). Opens each in the logged-in web shell (openWebFeature).
 * Hidden when the game has no web extras.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { usePrimaryGame } from '../../../composables/usePrimaryGame'
import { openWebFeature, webMoreLinks } from '../../../lib/web-explore-links'
import UfIcon from '../UfIcon.vue'

const { primaryGame } = usePrimaryGame()
const links = computed(() => webMoreLinks(primaryGame.value))
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') close() }
function onDown(e: MouseEvent): void { if (root.value && !root.value.contains(e.target as Node)) close() }
function close(): void {
  open.value = false
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousedown', onDown, true)
}
function toggle(): void {
  if (open.value) { close(); return }
  open.value = true
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousedown', onDown, true)
}
function go(path: string): void {
  close()
  void openWebFeature(path)
}
onBeforeUnmount(close)
</script>

<template>
  <div v-if="links.length" ref="root" class="uf-webmore">
    <button type="button" class="uf-side-item uf-webmore-btn" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <UfIcon name="share" :size="17" />More on upforge.gg
    </button>
    <div v-if="open" class="uf-webmore-menu" role="menu" aria-label="More on upforge.gg">
      <button v-for="l in links" :key="l.path" type="button" role="menuitem" class="uf-webmore-row" :title="l.hint" @click="go(l.path)">
        <span class="uf-t3">{{ l.label }}</span>
        <span class="uf-t4">{{ l.hint }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.uf-webmore { position: relative; }
/* Same row as the other sidebar items, but quieter: it leaves the app. */
.uf-side-item { display: flex; align-items: center; gap: 12px; width: 100%; height: 34px; padding: 0 16px; background: none; border: 0; color: var(--uf-faint); font: 500 13px/1 var(--uf-body); cursor: pointer; text-align: left; }
.uf-side-item:hover, .uf-side-item[aria-expanded='true'] { color: var(--uf-bone); background: var(--uf-hover); }
.uf-webmore-menu { position: absolute; left: calc(100% + 6px); bottom: 0; width: 260px; max-height: 70vh; overflow-y: auto; display: flex; flex-direction: column; padding: 6px 0; background: var(--uf-bg); border: 1px solid var(--uf-line-2); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5); z-index: 40; }
.uf-webmore-row { display: flex; flex-direction: column; gap: 2px; padding: 8px 14px; background: none; border: 0; text-align: left; cursor: pointer; }
.uf-webmore-row:hover, .uf-webmore-row:focus-visible { background: var(--uf-hover); }
.uf-webmore-row .uf-t4 { color: var(--uf-faint); }
</style>
