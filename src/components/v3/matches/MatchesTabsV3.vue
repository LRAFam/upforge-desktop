<script setup lang="ts">
/**
 * Header for the Matches area: one D2 title ("Matches"), the view tabs (All matches · Coaching reviews · Clips)
 * and an actions slot. The title never repeats the tab (audit 2 Nov: "MATCHES / ALL MATCHES").
 */
import { useRouter } from 'vue-router'
import UfTabs from '../UfTabs.vue'

const props = defineProps<{ active: 'matches' | 'coaching' | 'clips'; count?: string }>()
const router = useRouter()
const tabs = [
  { id: 'matches', label: 'All matches', to: { path: '/recordings', query: { view: 'recordings' } } },
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
      <h1 class="uf-d2 uf-mh-title">Matches</h1>
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
.uf-mh-title { margin: 0; }
.uf-mh-actions { display: flex; align-items: center; gap: 16px; padding-bottom: 6px; }
</style>
