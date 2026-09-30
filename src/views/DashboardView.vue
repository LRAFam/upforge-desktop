<script setup lang="ts">
import { computed } from 'vue'
import { recordingNeedsUserAction } from '../lib/recording-library'
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

const needsAction = computed(() => dashboard.pendingRecordings.value.some(recordingNeedsUserAction))
const showCoachHero = computed(() => dashboard.isValorant.value && !!dashboard.weeklyFocus.value)
const showFirstReview = computed(() => dashboard.isValorant.value
  && !dashboard.analysesLoading.value
  && dashboard.dashboardAnalyses.value.length === 0
  && dashboard.pendingRecordings.value.length === 0
  && !dashboard.status.value.recording)
const showMatchCards = computed(() => dashboard.isValorant.value && dashboard.dashboardAnalyses.value.length > 0)
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden dashboard-shell">
    <DashboardBanners />

    <div class="flex-shrink-0 px-5 pt-4">
      <DashboardGameTabs />
    </div>

    <div class="home-content flex-1 min-h-0 px-5 pb-4 pt-4">
      <main class="home-main scroll-col" aria-label="Your next review">
        <section v-if="showFirstReview" class="first-review" aria-labelledby="first-review-title">
          <h2 id="first-review-title">Start your first review</h2>
          <p>{{ dashboard.status.value.obsConnected
            ? 'Record a match, then open it in Matches to review your gameplay.'
            : 'Set up recording before your next match, or open Matches to review footage you already have.' }}</p>
          <div class="first-review-actions">
            <button v-if="!dashboard.status.value.obsConnected" type="button" class="btn-primary"
              @click="dashboard.router.push('/settings?tab=recording')">Set up recording</button>
            <button type="button" :class="dashboard.status.value.obsConnected ? 'btn-primary' : 'btn-ghost'"
              @click="dashboard.router.push('/matches')">Open Matches</button>
          </div>
        </section>
        <DashboardGameCards class="flex-shrink-0" style="height: auto" />
        <DashboardActionQueue v-if="needsAction" class="flex-shrink-0" />
        <DashboardMatchCards v-if="showMatchCards" />
        <DashboardCoachHero v-if="showCoachHero" class="flex-shrink-0" style="height: auto" />
        <details class="home-activity">
          <summary>Recent activity <span>Uploads and coaching updates</span></summary>
          <DashboardActivityFeed class="h-[288px] min-h-0" />
        </details>
        <DashboardDevTools />
      </main>
      <aside class="home-rail scroll-col" aria-label="Recording and progress">
        <DashboardLiveOps class="flex-shrink-0" style="height: auto" />
        <DashboardRightRail />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dashboard-shell { background: #0a0a0a; container-type: inline-size; }
.first-review{flex-shrink:0;padding:20px;border:1px solid #ffffff18;border-radius:8px;background:#111317}
.first-review h2{font-size:18px;font-weight:700;color:#f3f4f6}
.first-review p{max-width:60ch;margin-top:8px;font-size:13px;line-height:1.6;color:#9ca3af}
.first-review-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.home-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(248px,280px);gap:16px}
.home-main,.home-rail{display:flex;flex-direction:column;gap:14px;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden}
.home-activity{flex-shrink:0;border:1px solid #ffffff18;border-radius:8px;background:#111317}
.home-activity summary{cursor:pointer;padding:12px 14px;font-size:13px;font-weight:600;color:#d1d5db;min-height:44px}
.home-activity summary span{margin-left:12px;color:#9ca3af;font-size:11px;font-weight:400}
.home-activity summary:focus-visible{outline:2px solid #f43f5e;outline-offset:-2px;border-radius:8px}
@container (max-width:900px){.home-content{display:flex;flex-direction:column;overflow-y:auto}.home-main,.home-rail{overflow:visible;flex-shrink:0}.home-rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));align-items:start}}
</style>
