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

    <div class="flex-shrink-0 px-5 pt-4">
      <DashboardGameTabs />
    </div>

    <div class="flex-1 min-h-0 px-5 pb-4 pt-4 grid grid-cols-[minmax(0,1fr)_minmax(248px,280px)] gap-4">
      <div class="flex flex-col gap-3 min-h-0 overflow-y-auto overflow-x-hidden scroll-col">
        <div
          class="grid gap-2.5 flex-shrink-0 items-stretch"
          :class="showCoachHero ? 'grid-cols-1 xl:grid-cols-[minmax(210px,0.78fr)_minmax(0,1.22fr)]' : 'grid-cols-1'"
        >
          <DashboardGameCards class="min-h-0 h-full" />
          <DashboardCoachHero v-if="showCoachHero" class="min-h-0 h-full" />
        </div>

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
