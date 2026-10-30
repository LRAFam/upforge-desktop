import { setupProductUsage } from './lib/setup-product-usage'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './assets/main.css'
import '@fontsource/big-shoulders-display/700'
import '@fontsource/big-shoulders-display/800'
import '@fontsource/ibm-plex-sans/400'
import '@fontsource/ibm-plex-sans/500'
import '@fontsource/ibm-plex-sans/600'
import '@fontsource/ibm-plex-sans/700'
import './design/v3.css'
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
import OverlayView from './views/OverlayView.vue'
import SquadView from './views/SquadView.vue'
import PerformanceView from './views/PerformanceView.vue'
import VODReviewView from './views/VODReviewView.vue'
import TrainingHubView from './views/TrainingHubView.vue'
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
    { path: '/cloud-storage', component: () => import('./views/CloudStorageView.vue') },
    { path: '/clips', component: ClipsView },
    { path: '/recordings', component: () => import('./views/MatchesView.vue') },
    { path: '/overstep', component: () => import('./views/OverstepView.vue') },
    { path: '/overlay', component: OverlayView },
    { path: '/squad', component: SquadView },
    { path: '/performance', component: PerformanceView },
    { path: '/vod-review', component: VODReviewView },
    { path: '/report/:matchId', component: () => import('./views/v3/MatchReportV3.vue') },
    { path: '/starting-report/:game', component: () => import('./views/v3/StartingReportV3.vue') },
    { path: '/training', component: TrainingHubView },
    { path: '/training/calibration', component: () => import('./views/ValorantCalibrationView.vue') },
    { path: '/trainer-results', component: TrainerResultsView },
    { path: '/stats', component: StatsView },
    { path: '/history', redirect: to => ({ path: '/recordings', query: { ...to.query, view: 'coaching' } }) },
    { path: '/matches', redirect: to => ({ path: '/recordings', query: to.query }) },
    { path: '/rosters', component: RostersView },
    { path: '/dev', component: DevView },
    // Dev builds only: v3 match page on the real Bind match data (no recording, no network).
    ...(import.meta.env.DEV ? [{ path: '/dev/match-fixture', component: () => import('./views/DevMatchFixtureView.vue') }] : []),
  ]
})

router.beforeEach(async (to) => {
  if (!hasDesktopApi()) {
    if (!PUBLIC_ROUTES.includes(to.path)) return '/login'
    return true
  }
  try {
    const [status, s] = await Promise.all([
      // One retry: a single failed status IPC is not a reason to show the sign-in screen.
      window.api.app.getStatus().catch(() => window.api.app.getStatus()),
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
      const redirect = await onboardingCampaignRedirect((status as { user?: { id?: number } }).user?.id ?? null)
      if (redirect) return redirect
    }
  } catch (err) {
    // The status check itself failed (IPC error, retried once), which says nothing about the session:
    // the token is untouched. Continue (cancelling would leave a blank window on the first navigation)
    // instead of sending a signed-in user to /login; a rejected token still signs out via auth:session-expired.
    console.warn('[Router] Status check failed; continuing without an auth redirect', err)
    return true
  }
  return true
})

/**
 * Onboarding campaign gate for Home. Once a user is cleared, later visits skip the server call
 * (it took up to 8.6 s on production and blocked Home from drawing). The first check per session
 * waits at most 1.5 s; if the answer comes later and says onboarding is needed, we redirect then.
 */
const CAMPAIGN_WAIT_MS = 1500
let campaignClearedFor: number | null = null
async function onboardingCampaignRedirect(userId: number | null): Promise<string | null> {
  if (userId != null && campaignClearedFor === userId) return null
  const check = window.api.auth.getOnboardingCampaign().then((campaign) => {
    if (!campaign.ok) {
      // The campaign is a rollout gate; an API outage must not lock users out of the paid app.
      console.warn('[Onboarding] Campaign gate unavailable:', campaign.error)
      return null
    }
    if (campaign.requires_onboarding) return '/onboarding'
    campaignClearedFor = userId
    return null
  }).catch(() => null)
  const timedOut = Symbol('timeout')
  const first = await Promise.race([check, new Promise<typeof timedOut>(r => setTimeout(() => r(timedOut), CAMPAIGN_WAIT_MS))])
  if (first !== timedOut) return first
  void check.then((late) => { if (late && router.currentRoute.value.path === '/dashboard') void router.replace(late) })
  return null
}

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
setupRendererErrorReporter(app)
app.mount('#app')
const stopProductUsage = setupProductUsage(router)
if (import.meta.hot) import.meta.hot.dispose(stopProductUsage)
