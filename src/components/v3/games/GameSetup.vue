<script setup lang="ts">
/** v3 setup section for CS2 / Deadlock / League: what's missing, numbered steps, one primary action. */
import UfButton from '../UfButton.vue'
import GameMark from './GameMark.vue'
import { GAME_NAME, type DemoGame, type SetupAction, type SetupState } from './game-data'

defineProps<{ game: DemoGame; setup: SetupState; busy?: boolean; error?: string }>()
defineEmits<{ run: [SetupAction] }>()
</script>

<template>
  <section class="gset uf-rise uf-d3s" :aria-label="`Set up ${GAME_NAME[game]}`">
    <GameMark :game="game" label="Set up" />
    <p class="uf-t2 gset-missing">{{ setup.missing }}</p>
    <ol class="gset-steps">
      <li v-for="(s, i) in setup.steps" :key="s.title" class="gset-step" :class="{ 'is-done': s.done }">
        <span class="uf-d3 gset-n" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="uf-t3">{{ s.title }}<span v-if="s.done" class="gset-done"> · done</span></span>
        <span class="uf-t4">{{ s.text }}</span>
      </li>
    </ol>
    <div class="gset-act">
      <UfButton v-if="setup.action" variant="primary" :disabled="busy" @click="$emit('run', setup.action)">
        {{ busy ? 'Working…' : setup.actionLabel }}
      </UfButton>
      <span v-if="error" class="uf-t4" style="color: var(--uf-loss)" role="alert">{{ error }}</span>
    </div>
    <p v-if="setup.note" class="uf-t4">{{ setup.note }}</p>
  </section>
</template>

<style scoped>
.gset { display: flex; flex-direction: column; gap: 16px; }
.gset p { margin: 0; }
.gset-missing { max-width: 760px; }
.gset-steps { display: flex; margin: 0 -24px; padding: 0; list-style: none; }
.gset-step { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 0 24px; border-left: 1px solid var(--uf-line); }
.gset-step:first-child { border-left: 0; }
.gset-n { color: var(--uf-faint); }
.gset-step.is-done .gset-n { color: var(--uf-win); }
.gset-done { color: var(--uf-win); font-weight: 600; }
.gset-act { display: flex; gap: 16px; align-items: center; }
</style>
