<script setup lang="ts">
import { computed } from 'vue'
import { provideDashboard } from '../composables/useDashboard'
import DashboardBanners from '../components/dashboard/DashboardBanners.vue'
import DashboardGameTabs from '../components/dashboard/DashboardGameTabs.vue'
import DashboardGameCards from '../components/dashboard/DashboardGameCards.vue'
import DashboardCoachHero from '../components/dashboard/DashboardCoachHero.vue'
import DashboardActivityFeed from '../components/dashboard/DashboardActivityFeed.vue'
import DashboardRightRail from '../components/dashboard/DashboardRightRail.vue'
import DashboardLiveOps from '../components/dashboard/DashboardLiveOps.vue'
import DashboardMatchCards from '../components/dashboard/DashboardMatchCards.vue'
import DashboardActionQueue from '../components/dashboard/DashboardActionQueue.vue'
import DashboardDevTools from '../components/dashboard/DashboardDevTools.vue'

const dashboard = provideDashboard()

const showCoachHero = computed(() => dashboard.isValorant.value && !!dashboard.weeklyFocus.value)
const showMatchCards = computed(() => dashboard.isValorant.value && dashboard.dashboardAnalyses.value.length > 0)
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden dashboard-shell">
    <DashboardBanners />

    <div class="flex-shrink-0 px-5 pt-4 space-y-4">
      <DashboardGameTabs />
      <DashboardGameCards />
    </div>

    <div class="flex-1 min-h-0 px-5 pb-4 pt-4 grid grid-cols-[minmax(0,1fr)_minmax(248px,280px)] gap-4">
      <div class="flex flex-col gap-3 min-h-0 overflow-y-auto overflow-x-hidden scroll-col">
        <DashboardCoachHero v-if="showCoachHero" />

        <div class="grid grid-cols-[minmax(0,1.15fr)_minmax(260px,1fr)] gap-3 h-[288px] items-stretch flex-shrink-0">
          <DashboardActivityFeed class="h-full min-h-0" />
          <DashboardLiveOps class="h-full min-h-0" />
        </div>

        <DashboardMatchCards v-if="showMatchCards" />
        <DashboardActionQueue class="flex-shrink-0" />
        <DashboardDevTools />
      </div>

      <aside class="min-h-0 overflow-y-auto overflow-x-hidden scroll-col">
        <DashboardRightRail />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dashboard-shell {
  background: #0a0a0a;
}
</style>
