<script setup lang="ts">
/**
 * Deadlock free match report: the item build as a compact timeline. Item icons in buy order with
 * the buy time under each; a sold item is dimmed and says when it went. The thin bar under an icon
 * is its shop slot (weapon / vitality / spirit). Honest states: `null` = the match metadata had
 * no item list; `[]` = nothing bought.
 */
import { computed, ref } from 'vue'
import { deadlockBuildSummary, deadlockStepLabel, type DeadlockBuildStep } from '../../../lib/deadlock-item-build'

const props = defineProps<{ steps: DeadlockBuildStep[] | null | undefined }>()
const broken = ref(new Set<string>())
const summary = computed(() => (props.steps?.length ? deadlockBuildSummary(props.steps) : ''))
const short = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
</script>

<template>
  <section class="dib" aria-label="Item build">
    <span class="uf-label">Item build</span>
    <p v-if="steps == null" class="uf-t4">Valve didn’t publish the item list for this match.</p>
    <p v-else-if="!steps.length" class="uf-t4">No items bought this match.</p>
    <template v-else>
      <ol class="dib-list">
        <li v-for="s in steps" :key="s.key" class="dib-step" :class="{ 'is-sold': s.soldAt }" :aria-label="deadlockStepLabel(s)" :title="deadlockStepLabel(s)">
          <span class="dib-icon" :class="s.slot ? `dib-slot--${s.slot}` : ''">
            <img v-if="s.icon && !broken.has(s.key)" :src="s.icon" alt="" width="36" height="36" @error="broken = new Set(broken).add(s.key)">
            <span v-else class="dib-letter uf-t4" aria-hidden="true">{{ short(s.name) }}</span>
          </span>
          <span class="uf-t4 uf-num">{{ s.at }}</span>
          <span v-if="s.soldAt" class="uf-t4 uf-num dib-sold">sold {{ s.soldAt }}</span>
        </li>
      </ol>
      <p class="uf-t4">{{ summary }} · buy order, left to right</p>
    </template>
  </section>
</template>

<style scoped>
.dib { display: flex; flex-direction: column; gap: 12px; padding-top: 18px; border-top: 1px solid var(--uf-line); }
.dib p { margin: 0; }
.dib-list { display: flex; flex-wrap: wrap; gap: 14px 10px; margin: 0; padding: 0; list-style: none; }
.dib-step { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 44px; }
.dib-icon { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--uf-raised); border-bottom: 2px solid var(--uf-line-2); }
.dib-icon img { width: 36px; height: 36px; object-fit: contain; }
.dib-letter { color: var(--uf-muted); }
/* Shop slot colours as Deadlock uses them (weapon orange, vitality green, spirit purple). */
.dib-slot--weapon { border-bottom-color: #d08a3c; }
.dib-slot--vitality { border-bottom-color: #6aa84f; }
.dib-slot--spirit { border-bottom-color: #9a6fd1; }
.dib-step.is-sold .dib-icon { opacity: 0.45; }
.dib-sold { color: var(--uf-loss); white-space: nowrap; }
</style>
