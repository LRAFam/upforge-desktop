<script setup lang="ts">
/** Header for the Matches area: label, D2 title, text tabs (Matches · Coaching reviews · Clips), actions slot. */
import { useRouter } from 'vue-router'
import UfTabs from '../UfTabs.vue'

const props = defineProps<{ active: 'matches' | 'coaching' | 'clips'; title: string; count?: string }>()
const router = useRouter()
const tabs = [
  { id: 'matches', label: 'Matches', to: { path: '/recordings', query: { view: 'recordings' } } },
  { id: 'coaching', label: 'Coaching reviews', to: { path: '/recordings', query: { view: 'coaching' } } },
  { id: 'clips', label: 'Clips', to: { path: '/clips' } },
] as const
const items = tabs.map(t => ({ key: t.id, label: t.label }))
function go(id: string) {
  const tab = tabs.find(t => t.id === id)
  if (tab && id !== props.active) void router.push(tab.to)
}
</script>

<template>
  <header class="uf-mh">
    <div class="uf-mh-top">
      <div class="uf-mh-title">
        <span class="uf-label">Matches</span>
        <h1 class="uf-d2">{{ title }}</h1>
      </div>
      <div class="uf-mh-actions">
        <span v-if="count" class="uf-t4">{{ count }}</span>
        <slot />
      </div>
    </div>
    <UfTabs :items="items" :model-value="active" label="Matches views" @update:model-value="go" />
  </header>
</template>

<style scoped>
.uf-mh { flex: none; padding: 26px 40px 0; display: flex; flex-direction: column; gap: 18px; border-bottom: 1px solid var(--uf-line); }
.uf-mh-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.uf-mh-title { display: flex; flex-direction: column; gap: 10px; }
.uf-mh-title h1 { margin: 0; }
.uf-mh-actions { display: flex; align-items: center; gap: 16px; }
</style>
