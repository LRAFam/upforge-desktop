<script setup lang="ts">
/**
 * "What keeps coming up": the coach's recurring habits from the knowledge bank (read-only).
 * Cache-first; whole-number counts; links to Practice. Honest empty / unavailable states.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStaleLoad } from '../../../lib/stale-cache'
import UfSkeleton from '../UfSkeleton.vue'
import { recurringHabitRows, type RecurringInsightLike } from './recurring-habits'

const router = useRouter()
const { data, loading, refreshing, error, reload } = useStaleLoad<RecurringInsightLike[] | null>(
  'progress:recurring',
  async () => {
    const rows = await window.api?.progress?.recurring?.(8)
    if (rows === null || rows === undefined) throw new Error('unavailable')
    return rows
  },
)
const rows = computed(() => recurringHabitRows(data.value))
</script>

<template>
  <section class="rh3" :class="{ 'uf-refreshing': refreshing }" aria-labelledby="rh3-h">
    <div class="rh3-head">
      <span id="rh3-h" class="uf-label">What keeps coming up</span>
      <button v-if="rows.length" type="button" class="uf-link uf-t4" @click="router.push('/training')">Practise these →</button>
    </div>

    <div v-if="loading" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="rh3-row"><UfSkeleton :w="'60%'" :h="16" /><UfSkeleton :w="120" :h="14" /></div>
    </div>

    <template v-else-if="rows.length">
      <div v-for="r in rows" :key="r.id" class="rh3-row uf-reveal">
        <div class="rh3-main">
          <span class="uf-t3">{{ r.title }}</span>
          <span v-if="r.detail" class="uf-t4">{{ r.detail }}</span>
        </div>
        <div class="rh3-meta">
          <span class="uf-t4">{{ r.seen }}<template v-if="r.lastSeen"> · last {{ r.lastSeen }}</template></span>
          <span v-if="r.trend" class="rh3-trend uf-t4" :class="`is-${r.trend.tone}`">{{ r.trend.label }}</span>
        </div>
      </div>
    </template>

    <p v-else-if="error && !data" class="uf-t2 rh3-empty">
      Couldn't load your recurring habits. <button type="button" class="uf-link" @click="reload">Retry</button>
    </p>
    <p v-else class="uf-t2 rh3-empty">Nothing keeps coming up yet. Once your coach flags the same habit in two or more analysed matches, it shows here.</p>
  </section>
</template>

<style scoped>
.rh3 { display: flex; flex-direction: column; gap: 10px; }
.rh3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.rh3-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: center; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.rh3-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rh3-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
.rh3-trend { font-weight: 600; color: var(--uf-muted); }
.rh3-trend.is-better { color: var(--uf-win); }
.rh3-trend.is-worse { color: var(--uf-loss); }
.rh3-empty { margin: 0; }
@container (max-width: 640px) { .rh3-row { grid-template-columns: minmax(0, 1fr); } .rh3-meta { align-items: flex-start; text-align: left; } }
</style>
