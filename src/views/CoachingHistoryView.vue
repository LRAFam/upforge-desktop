<script setup lang="ts">
import { provideCoachingHistory } from '../composables/useCoachingHistory'
import CoachingHistoryToolbar from '../components/coaching-history/CoachingHistoryToolbar.vue'
import CoachingHistoryList from '../components/coaching-history/CoachingHistoryList.vue'
import CoachingHistoryDetail from '../components/coaching-history/CoachingHistoryDetail.vue'

provideCoachingHistory()
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#111111] text-white">
    <CoachingHistoryToolbar />
    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <CoachingHistoryList />
      <CoachingHistoryDetail />
    </div>
  </div>
</template>
