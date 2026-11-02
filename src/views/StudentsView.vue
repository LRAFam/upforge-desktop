<script setup lang="ts">
/**
 * /students — coaching others (UI v3 only). The classic UI keeps coach tools inside /rosters
 * (Coach/Student switch), so a classic visit goes there.
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import StudentsV3 from './v3/StudentsV3.vue'
import { uiV3 } from '../lib/ui-v3'

const router = useRouter()
onMounted(() => { if (!uiV3.value) router.replace('/rosters').catch(() => {}) })
</script>

<template>
  <StudentsV3 v-if="uiV3" />
</template>
