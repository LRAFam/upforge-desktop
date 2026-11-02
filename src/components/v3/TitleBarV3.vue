<script setup lang="ts">
/**
 * UI v3 title bar: brand mark, game switcher (one accent at a time, always with the logo),
 * recording/OBS status and the account. Draggable; window controls on Windows only.
 */
import { ref } from 'vue'
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import AccountSwitcherV3 from './accounts/AccountSwitcherV3.vue'
import { useRoute } from 'vue-router'
import type { PrimaryGame } from '../../lib/games'
import UfIcon from './UfIcon.vue'
import NotificationBellV3 from './shell/NotificationBellV3.vue'
import upforgeIcon from '../../assets/upforge-icon.webp'
import { titleBarGames } from './games/display-names'
import PlayerAvatar from './identity/PlayerAvatar.vue'
import type { PlayerIdentity } from '../../lib/player-identity'

defineProps<{
  isMac: boolean
  showWindowControls: boolean
  recording: boolean
  obsConnected: boolean | null
  obsTitle?: string
  identity?: string | null
  /** Your avatar (player card → main agent → letter); the user icon when absent. */
  avatar?: PlayerIdentity | null
}>()
const emit = defineEmits<{ minimize: []; close: []; account: [] }>()
// Account menu: the current game's linked accounts; "Manage accounts" opens Settings › Account.
const accountOpen = ref(false)
function manageAccounts() { accountOpen.value = false; emit('account') }

const { primaryGame, setPrimaryGame } = usePrimaryGame()
// Onboarding picks the game itself (step 2), so the switcher hides there.
const route = useRoute()
// Same-size square marks (src/assets/games), one selected state: full colour + the game's accent underline.
const games = titleBarGames()
function pick(id: PrimaryGame): void { if (primaryGame.value !== id) void setPrimaryGame(id) }
</script>

<template>
  <header class="drag-region uf-titlebar" :style="isMac ? 'padding-left: 80px' : undefined">
    <img :src="upforgeIcon" alt="UpForge" class="uf-titlebar-mark">
    <nav v-if="!route.path.startsWith('/onboarding')" class="uf-games -webkit-no-drag" aria-label="Game">
      <button v-for="g in games" :key="g.id" type="button" class="uf-game" :class="{ 'is-on': primaryGame === g.id }"
        :style="{ '--uf-game-accent': g.accent }" :title="primaryGame === g.id ? `${g.name} (current game)` : `Switch to ${g.name}`"
        :aria-label="g.name" :aria-pressed="primaryGame === g.id" @click="pick(g.id)">
        <img :src="g.logo" alt="" width="20" height="20">
      </button>
    </nav>
    <div style="flex: 1" />
    <span v-if="recording" class="uf-status"><span class="uf-dot uf-live" style="background: var(--uf-red)" />Recording</span>
    <span v-else-if="obsConnected != null" class="uf-status" :title="obsTitle">
      <span class="uf-dot" :style="{ background: obsConnected ? 'var(--uf-win)' : 'var(--uf-gold)' }" />{{ obsConnected ? 'Recording ready' : 'OBS not connected' }}
    </span>
    <div class="uf-sep" />
    <NotificationBellV3 v-if="!route.path.startsWith('/onboarding')" />
    <button type="button" class="uf-account -webkit-no-drag" aria-haspopup="dialog" :aria-expanded="accountOpen" @click="accountOpen = !accountOpen">
      <PlayerAvatar v-if="avatar" :identity="avatar" :size="24" />
      <UfIcon v-else name="user" :size="16" /><span>{{ identity || 'Account' }}</span>
    </button>
    <AccountSwitcherV3 :open="accountOpen" @close="accountOpen = false" @manage="manageAccounts" />
    <div v-if="!isMac && showWindowControls" class="uf-winctl -webkit-no-drag">
      <button type="button" aria-label="Minimise" @click="$emit('minimize')"><UfIcon name="minus" :size="14" /></button>
      <button type="button" aria-label="Close" class="is-close" @click="$emit('close')"><UfIcon name="close" :size="14" /></button>
    </div>
  </header>
</template>

<style scoped>
.uf-titlebar { position: relative; height: 44px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 0 0 16px; background: var(--uf-chrome); border-bottom: 1px solid var(--uf-line); z-index: 30; }
.uf-titlebar-mark { width: 22px; height: 22px; }
.uf-games { display: flex; align-self: stretch; gap: 2px; }
.uf-game { width: 40px; display: flex; align-items: center; justify-content: center; background: none; border: 0; cursor: pointer; }
.uf-game img { width: 20px; height: 20px; object-fit: contain; opacity: 0.5; filter: grayscale(1); transition: opacity 0.15s, filter 0.15s; }
.uf-game:hover { background: var(--uf-hover); }
.uf-game:hover img { opacity: 0.85; }
.uf-game.is-on { box-shadow: inset 0 -2px 0 var(--uf-game-accent, var(--uf-red)); }
.uf-game.is-on img { opacity: 1; filter: none; }
.uf-status { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--uf-muted); }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; }
.uf-sep { width: 1px; height: 18px; background: var(--uf-line-2); }
.uf-account { display: inline-flex; align-items: center; gap: 8px; background: none; border: 0; color: var(--uf-bone); font: 600 13px/1 var(--uf-body); cursor: pointer; padding: 0 12px 0 0; }
.uf-winctl { display: flex; align-self: stretch; }
.uf-winctl button { width: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-muted); cursor: pointer; }
.uf-winctl button:hover { background: var(--uf-hover); color: var(--uf-bone); }
.uf-winctl button.is-close:hover { background: var(--uf-red-deep); color: #fff; }
</style>
