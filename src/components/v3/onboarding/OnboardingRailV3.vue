<script setup lang="ts">
/**
 * UI v3 onboarding rail: full-bleed art, the one big title, and the steps as numbered text
 * with hairlines. The wizard itself (all step logic) stays in OnboardingView.
 */
import { computed } from 'vue'
import heroArt from '../../../assets/hero-agents.webp'
import UfIcon from '../UfIcon.vue'
import { railSteps, stepNumber } from './onboarding-steps'
import './onboarding-v3.css'

const props = defineProps<{ step: number; labels: readonly string[]; initializing: boolean }>()
const steps = computed(() => railSteps(props.labels, props.step, props.initializing))
const current = computed(() => steps.value.find(s => s.state === 'current') ?? null)
</script>

<template>
  <aside class="ob-rail" aria-label="Setup steps">
    <img :src="heroArt" alt="" class="ob-rail-art">
    <div class="ob-rail-scrim" />
    <!-- Compact windows (the onboarding window is 720×600): one band with the step count and progress -->
    <div class="ob-rail-compact">
      <span class="uf-label" style="color: var(--uf-red)">UpForge · setup</span>
      <span class="uf-d4">{{ current ? `${stepNumber(current.n)} / ${stepNumber(steps.length)}` : 'Getting ready' }}</span>
      <div class="ob-rail-segs" aria-hidden="true">
        <span v-for="s in steps" :key="s.n" :class="`is-${s.state}`" />
      </div>
    </div>
    <div class="ob-rail-body">
      <div class="uf-rise" style="display: flex; flex-direction: column; gap: 12px; max-width: 460px">
        <span class="uf-label" style="color: var(--uf-red)">UpForge · setup</span>
        <h1 class="uf-d2">Set up your coach</h1>
        <p class="uf-t2">Sign in, pick your game, link your account, then a quick recording check. Your first match is next.</p>
      </div>
      <ol class="ob-steps uf-rise uf-d2s">
        <li v-for="s in steps" :key="s.n" class="ob-step" :class="`is-${s.state}`" :aria-current="s.state === 'current' ? 'step' : undefined">
          <span class="uf-d4 ob-step-n">
            <UfIcon v-if="s.state === 'done'" name="check" :size="20" />
            <template v-else>{{ stepNumber(s.n) }}</template>
          </span>
          <span class="uf-t3 ob-step-label">{{ s.label }}</span>
          <span v-if="s.state === 'done'" class="uf-t4">Done</span>
        </li>
      </ol>
      <p class="uf-t4">Recording can be finished later in Settings → Recording.</p>
    </div>
  </aside>
</template>

<style scoped>
.ob-rail { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; }
.ob-rail-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; filter: saturate(0.6) brightness(0.85); pointer-events: none; }
.ob-rail-scrim { position: absolute; inset: 0; pointer-events: none; background:
  linear-gradient(90deg, var(--uf-bg) 0%, rgba(14, 17, 22, 0.9) 45%, rgba(14, 17, 22, 0.55) 100%),
  linear-gradient(180deg, rgba(14, 17, 22, 0.3) 0%, var(--uf-bg) 92%); }
.ob-rail-body { position: relative; flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; justify-content: flex-end; gap: 28px; padding: 40px; }
.ob-steps { list-style: none; margin: 0; padding: 0; max-width: 420px; display: flex; flex-direction: column; }
.ob-step { display: flex; align-items: center; gap: 16px; padding: 11px 0; border-top: 1px solid var(--uf-line); }
.ob-step:last-child { border-bottom: 1px solid var(--uf-line); }
.ob-step-n { width: 36px; display: inline-flex; color: var(--uf-faint); }
.ob-step-label { flex: 1; color: var(--uf-muted); }
.ob-step.is-current .ob-step-n { color: var(--uf-red); }
.ob-step.is-current .ob-step-label { color: var(--uf-bone); }
.ob-step.is-done .ob-step-n { color: var(--uf-win); }
.ob-rail-compact { display: none; position: relative; align-items: center; gap: 16px; padding: 0 24px; height: 64px; }
.ob-rail-segs { flex: 1; display: flex; gap: 4px; max-width: 260px; margin-left: auto; }
.ob-rail-segs span { flex: 1; height: 4px; background: rgba(236, 232, 225, 0.12); }
.ob-rail-segs span.is-done { background: var(--uf-win); }
.ob-rail-segs span.is-current { background: var(--uf-red); }
@media (max-width: 960px) {
  .ob-rail { flex: 0 0 auto; border-bottom: 1px solid var(--uf-line); }
  .ob-rail-body { display: none; }
  .ob-rail-compact { display: flex; flex: 1 1 auto; }
  .ob-rail-art { object-position: center 25%; }
}
</style>
