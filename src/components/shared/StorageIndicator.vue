<script setup lang="ts">
defineProps<{ cloud: boolean; local: boolean }>()
</script>
<template>
  <span class="inline-flex items-center gap-1 text-[10px] text-gray-400" :title="cloud ? (local ? 'Stored on this device and in the cloud' : 'Stored in the cloud') : 'Stored on this device'">
    <svg v-if="cloud" aria-hidden="true" class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.5a4.5 4.5 0 0 0-1.5-8.74A6.5 6.5 0 0 0 6 6.5a5 5 0 0 0 .5 10H20Z" /></svg>
    <span>{{ cloud ? (local ? 'Device + Cloud' : 'Cloud') : 'On device' }}</span>
  </span>
</template>
