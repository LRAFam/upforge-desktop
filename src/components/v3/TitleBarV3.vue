<script setup lang="ts">
/**
 * UI v3 title bar: brand mark, game switcher (one accent at a time, always with the logo),
 * recording/OBS status and the account. Draggable; window controls on Windows only.
 */
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { useRoute } from 'vue-router'
import type { PrimaryGame } from '../../lib/games'
import UfIcon from './UfIcon.vue'
import upforgeIcon from '../../assets/upforge-icon.webp'
import valorantLogo from '../../assets/games/valorant-logo.svg'
import cs2Logo from '../../assets/games/cs2-icon.svg'
import deadlockLogo from '../../assets/games/deadlock-icon.png'
import lolLogo from '../../assets/games/lol-icon.webp'

defineProps<{
  isMac: boolean
  showWindowControls: boolean
  recording: boolean
  obsConnected: boolean | null
  obsTitle?: string
  identity?: string | null
}>()
defineEmits<{ minimize: []; close: []; account: [] }>()

const { primaryGame, setPrimaryGame } = usePrimaryGame()
// Onboarding picks the game itself (step 2), so the switcher hides there.
const route = useRoute()
const games: Array<{ id: PrimaryGame; name: string; logo: string }> = [
  { id: 'valorant', name: 'Valorant', logo: valorantLogo },
  { id: 'cs2', name: 'CS2', logo: cs2Logo },
  { id: 'deadlock', name: 'Deadlock', logo: deadlockLogo },
  { id: 'lol', name: 'League', logo: lolLogo },
]
</script>

<template>
  <header class="drag-region uf-titlebar" :style="isMac ? 'padding-left: 80px' : undefined">
    <img :src="upforgeIcon" alt="UpForge" class="uf-titlebar-mark">
    <nav v-if="!route.path.startsWith('/onboarding')" class="uf-games -webkit-no-drag" aria-label="Game">
      <button v-for="g in games" :key="g.id" type="button" class="uf-game" :class="{ 'is-on': primaryGame === g.id }"
        :title="g.name" :aria-pressed="primaryGame === g.id" @click="setPrimaryGame(g.id)">
        <img :src="g.logo" :alt="g.name">
      </button>
    </nav>
    <div style="flex: 1" />
    <span v-if="recording" class="uf-status"><span class="uf-dot uf-live" style="background: var(--uf-red)" />Recording</span>
    <span v-else-if="obsConnected != null" class="uf-status" :title="obsTitle">
      <span class="uf-dot" :style="{ background: obsConnected ? 'var(--uf-win)' : 'var(--uf-gold)' }" />{{ obsConnected ? 'Recording ready' : 'OBS not connected' }}
    </span>
    <div class="uf-sep" />
    <button type="button" class="uf-account -webkit-no-drag" @click="$emit('account')">
      <UfIcon name="user" :size="16" /><span>{{ identity || 'Account' }}</span>
    </button>
    <div v-if="!isMac && showWindowControls" class="uf-winctl -webkit-no-drag">
      <button type="button" aria-label="Minimise" @click="$emit('minimize')"><UfIcon name="minus" :size="14" /></button>
      <button type="button" aria-label="Close" class="is-close" @click="$emit('close')"><UfIcon name="close" :size="14" /></button>
    </div>
  </header>
</template>

<style scoped>
.uf-titlebar { position: relative; height: 44px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 0 0 16px; background: var(--uf-chrome); border-bottom: 1px solid var(--uf-line); z-index: 30; }
.uf-titlebar-mark { width: 22px; height: 22px; }
.uf-games { display: flex; gap: 2px; }
.uf-game { width: 34px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: 0; cursor: pointer; }
.uf-game img { height: 16px; width: auto; opacity: 0.4; }
.uf-game.is-on { background: rgba(255, 70, 85, 0.12); box-shadow: inset 0 -2px 0 var(--uf-red); }
.uf-game.is-on img, .uf-game:hover img { opacity: 1; }
.uf-status { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--uf-muted); }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; }
.uf-sep { width: 1px; height: 18px; background: var(--uf-line-2); }
.uf-account { display: inline-flex; align-items: center; gap: 8px; background: none; border: 0; color: var(--uf-bone); font: 600 13px/1 var(--uf-body); cursor: pointer; padding: 0 12px 0 0; }
.uf-winctl { display: flex; align-self: stretch; }
.uf-winctl button { width: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-muted); cursor: pointer; }
.uf-winctl button:hover { background: var(--uf-hover); color: var(--uf-bone); }
.uf-winctl button.is-close:hover { background: var(--uf-red-deep); color: #fff; }
</style>
