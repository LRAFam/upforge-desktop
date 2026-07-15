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
import WelcomeView from './views/WelcomeView.vue'
import SplashView from './views/SplashView.vue'
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

const PUBLIC_ROUTES = ['/login', '/welcome', '/splash', '/overlay']

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/splash', component: SplashView },
    { path: '/welcome', component: WelcomeView },
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
    { path: '/dev', component: DevView },
  ]
})

router.beforeEach(async (to) => {
  if (PUBLIC_ROUTES.includes(to.path)) return true
  if (!hasDesktopApi()) return '/login'
  try {
    const s = await window.api.app.getStatus()
    if (!s.authenticated) {
      return s.firstRun ? '/welcome' : '/login'
    }
  } catch {
    return '/login'
  }
  return true
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
setupRendererErrorReporter(app)
app.mount('#app')
