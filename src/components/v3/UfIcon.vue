<script setup lang="ts">
import { computed } from 'vue'
import { UF_ICONS, type UfIconName } from './uf-icons'

const props = withDefaults(defineProps<{ name: UfIconName; size?: number }>(), { size: 18 })
const paths = computed(() => UF_ICONS[props.name])
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- static, trusted icon paths from uf-icons.ts -->
  <svg aria-hidden="true" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex: none" v-html="paths" />
</template>
