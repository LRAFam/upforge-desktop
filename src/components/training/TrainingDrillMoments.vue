<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useLifetime } from '../../composables/useLifetime'
import { parseDrillMoments, type DrillMoments } from '../../lib/drill-moments'
import { openAnalysisInApp } from '../../lib/open-analysis-in-app'

const props = defineProps<{ drillId: number }>()
const router = useRouter()
const life = useLifetime()
const opened = ref(false)
const loading = ref(false)
const failed = ref(false)
const moments = ref<DrillMoments | null>(null)
const regionId = computed(() => `drill-moments-${props.drillId}`)
let revision = 0

function reset() {
  revision += 1
  opened.value = false
  loading.value = false
  failed.value = false
  moments.value = null
}

async function load() {
  const id = props.drillId
  const request = ++revision
  opened.value = true
  loading.value = true
  failed.value = false
  try {
    const raw = await window.api.trainer.getDrillMoments?.(id)
    if (life.ended || request !== revision || id !== props.drillId) return
    const parsed = parseDrillMoments(raw, id)
    if (!parsed) throw new Error('Drill source unavailable')
    moments.value = parsed
    if (parsed.reviewId && !parsed.sourceMoments.length) {
      await openAnalysisInApp(router, parsed.reviewId, {
        source: 'desktop_drill_moments',
        isCurrent: () => !life.ended && request === revision && id === props.drillId && opened.value,
      })
      if (!life.ended && request === revision) opened.value = false
    }
  } catch {
    if (!life.ended && request === revision) failed.value = true
  } finally {
    if (!life.ended && request === revision) loading.value = false
  }
}

async function openMoment(index: number) {
  const id = props.drillId
  const request = ++revision
  loading.value = true
  failed.value = false
  try {
    // Resolve the owned, current recording again; never turn a cached card timestamp into a URL.
    const parsed = parseDrillMoments(await window.api.trainer.getDrillMoments?.(id), id)
    if (life.ended || request !== revision || id !== props.drillId || !opened.value) return
    if (!parsed?.reviewId || !parsed.sourceMoments.some(m => m.index === index)) throw new Error('Moment unavailable')
    await openAnalysisInApp(router, parsed.reviewId, {
      source: 'desktop_drill_source_moment', drillMoment: { drillId: id, index },
      isCurrent: () => !life.ended && request === revision && id === props.drillId && opened.value,
    })
  } catch {
    if (!life.ended && request === revision) failed.value = true
  } finally {
    if (!life.ended && request === revision) loading.value = false
  }
}

function toggle() {
  if (opened.value) { revision += 1; opened.value = false; loading.value = false; return }
  if (moments.value && !moments.value.reviewId) { opened.value = true; return }
  void load()
}

watch(() => props.drillId, reset)
onMounted(() => {
  life.own(window.api.on('session:user-changed', reset))
  life.own(window.api.on('auth:session-expired', reset))
})
</script>

<template>
  <div class="drill-moments">
    <button type="button" class="uf-link" :aria-expanded="opened" :aria-controls="regionId" @click="toggle">
      {{ opened ? 'Hide matches' : 'See it in your matches' }}
    </button>
    <div v-if="opened" :id="regionId" class="drill-moments-body">
      <p v-if="loading" role="status">Loading your matches…</p>
      <p v-else-if="failed" role="alert">Couldn’t load your matches. <button type="button" class="uf-link" @click="load">Try again</button></p>
      <ul v-else-if="moments?.sourceMoments.length">
        <li v-for="moment in moments.sourceMoments" :key="moment.index">
          <button type="button" class="uf-link" @click="openMoment(moment.index)">{{ moment.label }}</button>
        </li>
      </ul>
      <p v-else-if="!moments?.matches.length">The review or matches behind this drill are no longer stored.</p>
      <template v-else>
        <p>The matches this number was measured over:</p>
        <ul>
          <li v-for="match in moments.matches" :key="match.to">
            <RouterLink :to="match.to" class="uf-link">{{ match.label }}</RouterLink>
            <span v-if="match.value">{{ match.value }}</span>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.drill-moments { margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--uf-bone, #eee); }
.uf-link { color: var(--uf-red, #f87171); background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-align: left; }
.uf-link:hover { text-decoration: underline; }
.drill-moments-body { margin-top: 8px; }
p { margin: 0 0 6px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
</style>
