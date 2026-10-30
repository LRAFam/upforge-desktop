<script setup lang="ts">
/**
 * Session coach (P6): after 2+ ranked losses in a row this session, one quiet line suggesting a
 * short break or a warm-up. Valorant only (ranked games logged from the Riot client). Hidden otherwise.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { sessionCoach, type RankedResult } from '../../../lib/ideas/session-coach'

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ warmup: [] }>()

const games = ref<RankedResult[]>([])
const now = ref(Date.now())
const coach = computed(() => sessionCoach(games.value, now.value))

async function load() {
  try {
    games.value = (await window.api.stats.valorantRankedGames?.()) ?? []
    now.value = Date.now()
  } catch { games.value = [] }
}

let off: (() => void) | null = null
onMounted(() => {
  void load()
  // A new rank arrives after each ranked match: reload the log then.
  off = window.api.stats.onValorantRank?.(() => { void load() }) ?? null
})
onUnmounted(() => { off?.() })
</script>

<template>
  <section v-if="coach" class="sc3" :class="{ 'sc3--compact': props.compact }" aria-label="Session coach">
    <p class="uf-t3 sc3-head">{{ coach.headline }}</p>
    <p class="uf-t4 sc3-detail">{{ coach.detail }}</p>
    <button v-if="!props.compact" type="button" class="uf-link" @click="emit('warmup')">Start a 5-minute warm-up →</button>
  </section>
</template>

<style scoped>
.sc3 { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.sc3--compact { padding: 8px 0; }
.sc3-head, .sc3-detail { margin: 0; }
.sc3-detail { max-width: 68ch; }
.sc3 .uf-link { align-self: flex-start; }
</style>
