<script setup lang="ts">
/**
 * "What keeps coming up": the coach's recurring habits from the knowledge bank (read-only).
 * Cache-first; whole-number counts; links to Practice. Honest empty / unavailable states.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStaleLoad } from '../../../lib/stale-cache'
import UfSkeleton from '../UfSkeleton.vue'
import { recurringHabitRows, withLocalStatuses, type RecurringInsightLike } from './recurring-habits'
import { openAnalysisInApp } from '../../../lib/open-analysis-in-app'

const router = useRouter()
const { data, loading, refreshing, error, reload } = useStaleLoad<RecurringInsightLike[] | null>(
  'progress:recurring',
  async () => {
    const rows = await window.api?.progress?.recurring?.(8)
    if (rows === null || rows === undefined) throw new Error('unavailable')
    return rows
  },
)
// Statuses set here before the next refresh; `undo` holds the last fixed habit so it can be put back.
const local = ref(new Map<number, string>())
const undo = ref<{ id: number; title: string; previous: string } | null>(null)
const busy = ref<number | null>(null)
const failed = ref<string | null>(null)
const rows = computed(() => recurringHabitRows(withLocalStatuses(data.value, local.value)))
/** Rows showing the coach's whole note. */
const expanded = ref(new Set<number>())
function toggle(id: number): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
const opening = ref<number | null>(null)
async function reviewExample(analysisId: number): Promise<void> {
  opening.value = analysisId
  try { await openAnalysisInApp(router, analysisId, { source: 'desktop_progress_habit' }) } finally { opening.value = null }
}

async function setStatus(id: number, status: 'active' | 'improving' | 'resolved'): Promise<boolean> {
  busy.value = id
  failed.value = null
  const res = await window.api?.progress?.setHabitStatus?.(id, status).catch(() => null)
  busy.value = null
  if (!res?.ok) { failed.value = res?.error ?? 'Could not update this habit.'; return false }
  local.value = new Map(local.value).set(id, status)
  return true
}

async function markFixed(id: number, title: string): Promise<void> {
  const previous = data.value?.find(r => r.id === id)?.status ?? 'active'
  if (await setStatus(id, 'resolved')) undo.value = { id, title, previous }
}

async function undoFixed(): Promise<void> {
  const u = undo.value
  if (!u) return
  if (await setStatus(u.id, u.previous === 'improving' ? 'improving' : 'active')) undo.value = null
}
</script>

<template>
  <section class="rh3" :class="{ 'uf-refreshing': refreshing }" aria-labelledby="rh3-h">
    <div class="rh3-head">
      <span id="rh3-h" class="uf-label">What keeps coming up · all analysed matches</span>
      <button v-if="rows.some(r => r.polarity === 'risk')" type="button" class="uf-link uf-t4" @click="router.push('/training')">Practise these →</button>
    </div>

    <div v-if="loading" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="rh3-row"><UfSkeleton :w="'60%'" :h="16" /><UfSkeleton :w="120" :h="14" /></div>
    </div>

    <template v-else-if="rows.length">
      <div v-for="r in rows" :key="r.id" class="rh3-row uf-reveal">
        <div class="rh3-main">
          <span class="uf-t3">{{ r.title }}</span>
          <span v-if="r.more && expanded.has(r.id)" :id="`rh3-more-${r.id}`" class="uf-t4">{{ r.more }}</span>
          <span v-else-if="r.detail" :id="`rh3-more-${r.id}`" class="uf-t4">{{ r.detail }}</span>
          <span v-if="r.maps.length && (expanded.has(r.id) || !r.more)" class="uf-t4 rh3-maps">Seen on {{ r.maps.join(', ') }}</span>
          <span v-if="r.more || r.exampleAnalysisId" class="rh3-acts">
            <button v-if="r.more" type="button" class="uf-link uf-t4" :aria-expanded="expanded.has(r.id)" :aria-controls="`rh3-more-${r.id}`" @click="toggle(r.id)">
              {{ expanded.has(r.id) ? 'Show less' : 'Show more' }}
            </button>
            <button v-if="r.exampleAnalysisId" type="button" class="uf-link uf-t4" :disabled="opening === r.exampleAnalysisId"
              :aria-label="`Review an example of ${r.title} in match review`" @click="reviewExample(r.exampleAnalysisId)">
              {{ opening === r.exampleAnalysisId ? 'Opening…' : 'Review an example →' }}
            </button>
          </span>
        </div>
        <div class="rh3-meta">
          <span class="uf-t4">{{ r.seen }}<template v-if="r.lastSeen"> · last {{ r.lastSeen }}</template></span>
          <span v-if="r.trend" class="rh3-trend uf-t4" :class="`is-${r.trend.tone}`">{{ r.trend.label }}</span>
          <button v-if="r.polarity === 'risk'" type="button" class="uf-link uf-t4" :disabled="busy === r.id" :aria-label="`Mark fixed: ${r.title}`" @click="markFixed(r.id, r.title)">
            {{ busy === r.id ? 'Saving…' : 'Mark fixed' }}
          </button>
          <span v-else-if="r.polarity === 'strength'" class="uf-t4 rh3-keep">Strength · keep doing this</span>
        </div>
      </div>
    </template>

    <p v-if="undo" class="uf-t4 rh3-note" role="status">
      Marked "{{ undo.title }}" as fixed.
      <button type="button" class="uf-link" :disabled="busy === undo.id" @click="undoFixed">Undo</button>
    </p>
    <p v-if="failed" class="uf-t4 rh3-note" role="alert">{{ failed }}</p>

    <p v-if="!loading && !rows.length && error && !data" class="uf-t2 rh3-empty">
      Couldn't load your recurring habits. <button type="button" class="uf-link" @click="reload">Retry</button>
    </p>
    <p v-else-if="!loading && !rows.length" class="uf-t2 rh3-empty">Nothing keeps coming up yet. Once your coach flags the same habit in two or more analysed matches, it shows here.</p>
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
.rh3-acts { display: flex; gap: 16px; flex-wrap: wrap; }
.rh3-maps { color: var(--uf-faint); }
.rh3-keep { color: var(--uf-win); }
.rh3-empty { margin: 0; }
.rh3-note { margin: 0; }
@container (max-width: 640px) { .rh3-row { grid-template-columns: minmax(0, 1fr); } .rh3-meta { align-items: flex-start; text-align: left; } }
</style>
