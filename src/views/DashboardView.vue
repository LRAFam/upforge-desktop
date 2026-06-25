<script setup lang="ts">
import { provideDashboard } from '../composables/useDashboard'
import DashboardBanners from '../components/dashboard/DashboardBanners.vue'
import DashboardStatusBar from '../components/dashboard/DashboardStatusBar.vue'
import DashboardPlayerCard from '../components/dashboard/DashboardPlayerCard.vue'
import DashboardLeftInsights from '../components/dashboard/DashboardLeftInsights.vue'
import DashboardSessionReview from '../components/dashboard/DashboardSessionReview.vue'
import DashboardWeeklyFocus from '../components/dashboard/DashboardWeeklyFocus.vue'
import DashboardDevTools from '../components/dashboard/DashboardDevTools.vue'
import DashboardGamePanels from '../components/dashboard/DashboardGamePanels.vue'
import DashboardRecentAnalyses from '../components/dashboard/DashboardRecentAnalyses.vue'
import DashboardCoachingSidebar from '../components/dashboard/DashboardCoachingSidebar.vue'

provideDashboard()
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <DashboardBanners />
    <DashboardStatusBar />

    <div class="flex-1 min-h-0 px-4 pb-4 pt-3 overflow-hidden">
      <div class="h-full grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px] gap-3 min-h-0 items-start">

        <div class="flex flex-col gap-3 min-w-0 w-full self-start max-h-full overflow-y-auto scroll-col">
          <DashboardPlayerCard />
          <DashboardSessionReview />
          <DashboardWeeklyFocus />
          <DashboardLeftInsights />
          <DashboardDevTools />
        </div>

        <div class="flex flex-col gap-2 min-h-0 h-full max-h-full self-stretch w-full min-w-0 overflow-hidden">
          <DashboardGamePanels />
          <DashboardRecentAnalyses />
        </div>

        <div class="flex flex-col gap-2 min-w-0 w-full self-start max-h-full overflow-y-auto scroll-col">
          <DashboardCoachingSidebar />
        </div>

      </div>
    </div>
  </div>
</template>
