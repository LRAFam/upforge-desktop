<script setup lang="ts">
import { provideVodReview } from '../composables/useVodReview'
import VodReviewCommandBar from '../components/vod-review/VodReviewCommandBar.vue'
import VodReviewStates from '../components/vod-review/VodReviewStates.vue'
import VodReviewBody from '../components/vod-review/VodReviewBody.vue'
import VodReviewShortcuts from '../components/vod-review/VodReviewShortcuts.vue'

const { timelineLoading, timelineError } = provideVodReview()
</script>

<template>
  <div class="vod-review flex flex-col h-full text-white overflow-hidden">
    <VodReviewCommandBar />

    <VodReviewStates v-if="timelineLoading || timelineError" />

    <VodReviewBody v-else />

    <VodReviewShortcuts />
  </div>
</template>

<style scoped>
@import '../components/vod-review/vod-review.css';
</style>
