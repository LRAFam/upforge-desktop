<script setup lang="ts">
import { provideVodReview } from '../composables/useVodReview'
import VodReviewCommandBar from '../components/vod-review/VodReviewCommandBar.vue'
import VodReviewStates from '../components/vod-review/VodReviewStates.vue'
import VodReviewBody from '../components/vod-review/VodReviewBody.vue'
import VodReviewShortcuts from '../components/vod-review/VodReviewShortcuts.vue'
import TrimRangeModal from '../components/shared/TrimRangeModal.vue'

const {
  timelineLoading,
  timelineError,
  trimModalOpen,
  trimStartSec,
  trimEndSec,
  trimLoading,
  trimError,
  trimHint,
  duration,
  confirmVodTrim,
} = provideVodReview()
</script>

<template>
  <div class="vod-review flex flex-col h-full text-white overflow-hidden">
    <VodReviewCommandBar />

    <VodReviewStates v-if="timelineLoading || timelineError" />

    <VodReviewBody v-else />

    <VodReviewShortcuts />

    <TrimRangeModal
      :show="trimModalOpen"
      title="Trim VOD"
      confirm-label="Trim VOD"
      :duration="duration"
      :start-sec="trimStartSec"
      :end-sec="trimEndSec"
      :loading="trimLoading"
      :error="trimError"
      :hint="trimHint"
      @close="trimModalOpen = false"
      @confirm="confirmVodTrim"
      @update:start-sec="trimStartSec = $event"
      @update:end-sec="trimEndSec = $event"
    />
  </div>
</template>

<style scoped>
@import '../components/vod-review/vod-review.css';
</style>
