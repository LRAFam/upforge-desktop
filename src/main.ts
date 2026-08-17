import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './assets/main.css'
import { setupRendererErrorReporter } from './lib/errorReporter'
import { hasDesktopApi } from './lib/desktop-api'

// Views
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import PostGameView from './views/PostGameView.vue'
import SettingsView from './views/SettingsView.vue'
import OnboardingView from './views/OnboardingView.vue'
import SplashView from './views/SplashView.vue'
import { resolveUnauthenticatedRoute, needsDesktopOnboarding } from './lib/onboarding-gate'
import ClipsView from './views/ClipsView.vue'
import RecordingsView from './views/RecordingsView.vue'
import OverlayView from './views/OverlayView.vue'
import SquadView from './views/SquadView.vue'
import PerformanceView from './views/PerformanceView.vue'
import VODReviewView from './views/VODReviewView.vue'
import TrainingHubView from './views/TrainingHubView.vue'
import CoachingHistoryView from './views/CoachingHistoryView.vue'
import TrainerResultsView from './views/TrainerResultsView.vue'
import StatsView from './views/StatsView.vue'
import DevView from './views/DevView.vue'
import DashboardNeedsYouPreviewView from './views/DashboardNeedsYouPreviewView.vue'
import RostersView from './views/RostersView.vue'

const PUBLIC_ROUTES = ['/login', '/welcome', '/onboarding', '/splash', '/overlay']

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/splash', component: SplashView },
    { path: '/onboarding', component: OnboardingView },
    { path: '/welcome', redirect: (to) => ({ path: '/onboarding', query: to.query }) },
    { path: '/login', component: LoginView },
    { path: '/dashboard', component: DashboardView },
    { path: '/dashboard-needs-you-preview', component: DashboardNeedsYouPreviewView },
    { path: '/post-game', component: PostGameView },
    { path: '/post-game-preview', component: PostGameView },
    { path: '/settings', component: SettingsView },
    { path: '/clips', component: ClipsView },
    { path: '/recordings', component: RecordingsView },
    { path: '/overlay', component: OverlayView },
    { path: '/squad', component: SquadView },
    { path: '/performance', component: PerformanceView },
    { path: '/vod-review', component: VODReviewView },
    { path: '/training', component: TrainingHubView },
    { path: '/trainer-results', component: TrainerResultsView },
    { path: '/stats', component: StatsView },
    { path: '/history', component: CoachingHistoryView },
    { path: '/rosters', component: RostersView },
    { path: '/dev', component: DevView },
  ]
})

router.beforeEach(async (to) => {
  if (!hasDesktopApi()) {
    if (!PUBLIC_ROUTES.includes(to.path)) return '/login'
    return true
  }
  try {
    const [status, s] = await Promise.all([
      window.api.app.getStatus(),
      window.api.settings.get(),
    ])
    if (!status.authenticated) {
      if (!PUBLIC_ROUTES.includes(to.path)) {
        return resolveUnauthenticatedRoute(s)
      }
      return true
    }
    if (needsDesktopOnboarding(s) && to.path !== '/onboarding' && to.path !== '/splash' && to.path !== '/overlay') {
      return '/onboarding'
    }
    if (to.path === '/dashboard') {
      const campaign = await window.api.auth.getOnboardingCampaign()
      if (!campaign.ok) {
        // The campaign is a rollout gate; an API outage must not lock users out of the paid app.
        console.warn('[Onboarding] Campaign gate unavailable:', campaign.error)
      } else if (campaign.requires_onboarding) {
        return '/onboarding'
      }
    }
  } catch {
    if (!PUBLIC_ROUTES.includes(to.path)) return '/login'
    return true
  }
  return true
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
setupRendererErrorReporter(app)
app.mount('#app')
