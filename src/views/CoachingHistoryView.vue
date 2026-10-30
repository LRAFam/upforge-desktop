<script setup lang="ts">
import { provideCoachingHistory } from '../composables/useCoachingHistory'
import CoachingHistoryToolbar from '../components/coaching-history/CoachingHistoryToolbar.vue'
import CoachingHistoryList from '../components/coaching-history/CoachingHistoryList.vue'
import CoachingHistoryDetail from '../components/coaching-history/CoachingHistoryDetail.vue'
import CoachingReviewsV3 from './v3/CoachingReviewsV3.vue'
import { uiV3 } from '../lib/ui-v3'

defineProps<{ embedded?: boolean }>()
// One coaching-history context for both the old markup and the v3 screen.
provideCoachingHistory()
</script>

<template>
  <CoachingReviewsV3 v-if="uiV3" :embedded="embedded" />
  <div v-else class="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#111111] text-white">
    <CoachingHistoryToolbar :embedded="embedded" />
    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <CoachingHistoryList />
      <CoachingHistoryDetail />
    </div>
  </div>
</template>
