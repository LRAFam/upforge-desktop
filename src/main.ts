import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './assets/main.css'

// Views
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import PostGameView from './views/PostGameView.vue'
import SettingsView from './views/SettingsView.vue'
import WelcomeView from './views/WelcomeView.vue'
import SplashView from './views/SplashView.vue'
import ClipsView from './views/ClipsView.vue'
import OverlayView from './views/OverlayView.vue'
import SquadView from './views/SquadView.vue'
import PerformanceView from './views/PerformanceView.vue'
import VODReviewView from './views/VODReviewView.vue'

const PUBLIC_ROUTES = ['/login', '/welcome', '/splash', '/overlay']

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/splash', component: SplashView },
    { path: '/welcome', component: WelcomeView },
    { path: '/login', component: LoginView },
    { path: '/dashboard', component: DashboardView },
    { path: '/post-game', component: PostGameView },
    { path: '/post-game-preview', component: PostGameView },
    { path: '/settings', component: SettingsView },
    { path: '/clips', component: ClipsView },
    { path: '/overlay', component: OverlayView },
    { path: '/squad', component: SquadView },
    { path: '/performance', component: PerformanceView },
    { path: '/vod-review', component: VODReviewView }
  ]
})

router.beforeEach(async (to) => {
  if (PUBLIC_ROUTES.includes(to.path)) return true
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
app.mount('#app')
