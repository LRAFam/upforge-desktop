<script setup lang="ts">
/** Board 12 · Between games. Shown on Home only while agent select is open. Read-only brief, no AI spend. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { pregameView, type PregameBriefResponse, type PregameContext } from './pregame-brief'

const ctx = ref<PregameContext | null>(null)
const brief = ref<PregameBriefResponse | null>(null)
const fetchedFor = new Set<string>()
let off: (() => void) | null = null

const view = computed(() => pregameView(ctx.value, brief.value))

async function load(next: PregameContext | null): Promise<void> {
  ctx.value = next
  if (!next) { brief.value = null; return }
  // One read per lobby state (agent/map locks change the key), capped per match.
  const key = `${next.matchId}|${next.agent ?? ''}|${next.map ?? ''}`
  if (fetchedFor.has(key) || [...fetchedFor].filter(k => k.startsWith(`${next.matchId}|`)).length >= 4) return
  fetchedFor.add(key)
  const res = await window.api?.coaching?.pregameView?.(next).catch(() => null)
  if (ctx.value?.matchId === next.matchId) brief.value = res ?? null
}

onMounted(() => {
  off = window.api?.on?.('pregame:context', (payload: unknown) => { void load((payload as PregameContext | null) ?? null) }) ?? null
})
onBeforeUnmount(() => off?.())
</script>

<template>
  <section v-if="view" class="hp3 uf-rise" aria-label="Before this match">
    <span class="uf-label">{{ view.title }}</span>
    <p v-if="!view.lines.length" class="uf-t4" style="margin: 0">Lock in and play your plan. Notes appear here once you have analysed matches on this agent or map.</p>
    <dl v-else class="hp3-rows">
      <template v-for="l in view.lines" :key="l.label">
        <dt class="uf-t4">{{ l.label }}</dt><dd class="uf-t3">{{ l.text }}</dd>
      </template>
    </dl>
  </section>
</template>

<style scoped>
.hp3 { display: flex; flex-direction: column; gap: 10px; padding: 16px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.hp3-rows { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; margin: 0; }
.hp3-rows dt { color: var(--uf-faint); }
.hp3-rows dd { margin: 0; }
</style>
