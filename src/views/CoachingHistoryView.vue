<script setup lang="ts">
import { provideCoachingHistory } from '../composables/useCoachingHistory'
import CoachingReviewsV3 from './v3/CoachingReviewsV3.vue'

defineProps<{ embedded?: boolean }>()
// Provides the coaching-history context for the v3 reviews screen.
provideCoachingHistory()
</script>

<template>
  <CoachingReviewsV3 :embedded="embedded" />
</template>
