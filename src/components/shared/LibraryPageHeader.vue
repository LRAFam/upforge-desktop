<script setup lang="ts">
defineProps<{ title: string; description: string }>()
</script>
<template>
  <header class="library-header">
    <div class="library-heading"><h1>{{ title }}</h1><p>{{ description }}</p></div>
    <div v-if="$slots.default" class="library-header-actions"><slot /></div>
  </header>
</template>
<style scoped>
.library-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px;border-bottom:1px solid #ffffff12;background:#111317}.library-heading{min-width:180px;flex:1}h1{font-size:20px;line-height:1.25;font-weight:750;letter-spacing:-.025em;color:#f4f5f7}p{margin-top:5px;font-size:12px;line-height:1.5;color:#9ca3af}.library-header-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;max-width:100%;font-size:12px;color:#9ca3af}.library-header-actions :deep(button:focus-visible){outline:2px solid #f43f5e;outline-offset:3px}.library-header-actions :deep(button){min-height:36px}
</style>
