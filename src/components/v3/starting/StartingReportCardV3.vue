<script setup lang="ts">
/**
 * Starting report card: Home (first week, until dismissed) and the end of onboarding.
 * Generates the report once if it doesn't exist yet; shows a loading line while the
 * last matches are read.
 */
import { computed, onMounted, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import UfButton from '../UfButton.vue'
import UfSkeleton from '../UfSkeleton.vue'
import { loadingLine, showStartingCard, startingReportView, type StartingGame } from '../../../lib/starting-report'
import { useStartingReport } from './useStartingReport'

const props = defineProps<{ game: StartingGame; mode: 'home' | 'onboarding' }>()
const router = useRouter()
const { data, loading, generating, load, dismiss } = useStartingReport(toRef(props, 'game'))
const view = computed(() => startingReportView(data.value))
const visible = computed(() => {
  if (props.mode === 'onboarding') return true
  if (generating.value) return true
  return showStartingCard(data.value)
})

onMounted(() => { void load({ generate: true }) })
watch(() => props.game, () => { void load({ generate: true }) })

function open() { void router.push(`/starting-report/${props.game}`) }
</script>

<template>
  <section v-if="visible" class="sr3-card uf-rise" aria-label="Your starting report">
    <span class="uf-label">Your starting report</span>
    <template v-if="loading || generating">
      <p class="uf-t3">{{ loadingLine(game) }}</p>
      <UfSkeleton :lines="2" :w="'min(520px, 100%)'" />
    </template>
    <template v-else-if="view.kind === 'ready'">
      <p class="uf-t3">{{ view.summary[0] }}</p>
      <p v-for="(h, i) in view.habits" :key="i" class="uf-t4">{{ h }}</p>
      <div class="sr3-actions">
        <UfButton variant="secondary" @click="open">Open your starting report</UfButton>
        <button v-if="mode === 'home'" type="button" class="uf-link" @click="dismiss">Hide</button>
      </div>
    </template>
    <template v-else-if="view.kind === 'insufficient'">
      <p class="uf-t3">Play {{ view.needed - view.available === 1 ? '1 more match' : `${view.needed - view.available} more matches` }} and your starting report appears here.</p>
      <p class="uf-t4">It reads your last matches and shows how you play right now, what's costing you games and your first focus.</p>
    </template>
    <template v-else>
      <p class="uf-t4">Your starting report appears here once your recent matches are synced.</p>
    </template>
  </section>
</template>

<style scoped>
.sr3-card { display: flex; flex-direction: column; gap: 8px; padding: 18px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.sr3-actions { display: flex; align-items: center; gap: 16px; margin-top: 6px; }
</style>
