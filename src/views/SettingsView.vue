<script setup lang="ts">
import { provideSettings } from '../composables/useSettings'
import SettingsV3 from './v3/SettingsV3.vue'

provideSettings()
</script>

<template>
  <SettingsV3 />
</template>
