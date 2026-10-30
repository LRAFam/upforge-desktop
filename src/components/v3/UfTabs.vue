<script setup lang="ts">
/**
 * Text tabs for UI v3. `page` = view switch under a D2 title (15/600, 22px gap).
 * `filter` = list filters (13/600). The active tab is bone with a 2px red underline.
 */
withDefaults(defineProps<{
  items: ReadonlyArray<{ key: string; label: string; count?: number | string | null }>
  modelValue: string
  size?: 'page' | 'filter'
  label?: string
  divider?: boolean
}>(), { size: 'page', label: undefined, divider: false })
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

function onKey(e: KeyboardEvent, items: ReadonlyArray<{ key: string }>, index: number) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  e.preventDefault()
  const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
  emit('update:modelValue', items[next].key)
  const row = (e.currentTarget as HTMLElement | null)?.parentElement
  ;(row?.children[next] as HTMLElement | undefined)?.focus()
}
</script>

<template>
  <div class="uf-tabs" :class="[`uf-tabs--${size}`, { 'uf-tabs--divider': divider }]" role="tablist" :aria-label="label">
    <button v-for="(t, i) in items" :key="t.key" type="button" role="tab" class="uf-tab"
      :class="{ 'is-on': t.key === modelValue }" :aria-selected="t.key === modelValue"
      :tabindex="t.key === modelValue ? 0 : -1"
      @click="emit('update:modelValue', t.key)" @keydown="onKey($event, items, i)">
      {{ t.label }}<span v-if="t.count != null && t.count !== ''" class="uf-tab-count">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.uf-tabs { display: flex; flex-wrap: wrap; }
.uf-tabs--page { gap: 22px; }
.uf-tabs--filter { gap: 18px; }
.uf-tabs--divider { border-bottom: 1px solid var(--uf-line); }
.uf-tab { display: inline-flex; align-items: baseline; gap: 6px; background: none; border: 0; cursor: pointer; color: var(--uf-faint); }
.uf-tabs--page .uf-tab { font: 600 15px/1 var(--uf-body); padding: 0 0 12px; }
.uf-tabs--filter .uf-tab { font: 600 13px/1 var(--uf-body); padding: 0 0 8px; }
.uf-tab:hover { color: var(--uf-bone); }
.uf-tab.is-on { color: var(--uf-bone); box-shadow: inset 0 -2px 0 var(--uf-red); }
.uf-tab-count { font: 400 13px/1 var(--uf-body); color: var(--uf-faint); font-variant-numeric: tabular-nums; }
</style>
