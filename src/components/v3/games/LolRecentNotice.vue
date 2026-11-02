<script setup lang="ts">
/**
 * League recent games: Riot couldn't be reached (say so, never "no games"), or only some games loaded.
 * `hasMatches`: games from an earlier load are still on screen.
 */
import { computed } from 'vue'
import { LOL_RECENT_ERROR_TITLE, LOL_RECENT_PARTIAL_TEXT, lolRecentErrorText, type LolRecentResult } from '../../../lib/lol-recent'

const props = defineProps<{ state: Pick<LolRecentResult, 'error' | 'errorReason' | 'partial'> | null; hasMatches: boolean; busy?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const failed = computed(() => !!props.state?.error)
const title = computed(() => (props.state?.error === 'request_failed' ? 'Couldn’t load your League games' : LOL_RECENT_ERROR_TITLE))
</script>

<template>
  <div v-if="failed && !hasMatches" class="lrn" role="alert">
    <span class="uf-t3">{{ title }}</span>
    <p class="uf-t2">{{ lolRecentErrorText(state!) }}</p>
    <button type="button" class="uf-link" :disabled="busy" @click="emit('retry')">Try again →</button>
  </div>
  <p v-else-if="failed" class="uf-t4 lrn-line" role="status">
    {{ title }}. Showing your games from earlier. <button type="button" class="uf-link" :disabled="busy" @click="emit('retry')">Try again →</button>
  </p>
  <p v-else-if="state?.partial" class="uf-t4 lrn-line">{{ LOL_RECENT_PARTIAL_TEXT }}</p>
</template>

<style scoped>
.lrn { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.lrn p, .lrn-line { margin: 0; }
</style>
