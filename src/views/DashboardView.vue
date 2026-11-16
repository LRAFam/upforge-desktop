<script setup lang="ts">
import { provideDashboard } from '../composables/useDashboard'
import HomeV3 from './v3/HomeV3.vue'

provideDashboard({ cacheFirst: true })
</script>

<template>
  <HomeV3 />
</template>
