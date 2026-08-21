<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AnalysisItem, PendingRecording, ProductionArchiveSummary } from '../../env.d.ts'

const router = useRouter()
const archives = ref<ProductionArchiveSummary[]>([])
const analyses = ref<AnalysisItem[]>([])
const activeFixture = ref<PendingRecording | null>(null)
const loading = ref(false)
const busyArchiveId = ref<string | null>(null)
const error = ref<string | null>(null)

const analysedArchives = computed(() => archives.value.filter(item => item.analysis_state === 'analysed'))

onMounted(() => { void refresh() })

async function refresh() {
  loading.value = true
  error.value = null
  try {
    const [libraryResult, productionAnalyses, activeResult] = await Promise.all([
      window.api.dev.listProductionVods(),
      window.api.analyses.get(30),
      window.api.dev.getActiveProductionVod(),
    ])
    if (!libraryResult.ok) throw new Error(libraryResult.error)
    archives.value = libraryResult.archives
    analyses.value = productionAnalyses
    activeFixture.value = activeResult.fixture
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function mountArchive(archive: ProductionArchiveSummary) {
  busyArchiveId.value = archive.archive_id
  error.value = null
  try {
    const result = await window.api.dev.mountProductionVod(archive.archive_id)
    if (!result.ok) throw new Error(result.error)
    activeFixture.value = result.fixture
    await router.push({ path: '/history', query: { recording: result.fixture.id } })
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busyArchiveId.value = null
  }
}

async function unmount() {
  await window.api.dev.unmountProductionVod()
  activeFixture.value = null
}

function openAnalysis(analysisId: number) {
  void router.push({ path: '/history', query: { analysis: String(analysisId) } })
}

function formatDate(value: string | null): string {
  if (!value) return 'Timestamp missing'
  return new Date(value).toLocaleString()
}

function archiveLabel(archive: ProductionArchiveSummary): string {
  return [archive.agent, archive.map, archive.game].filter(Boolean).join(' | ')
}
</script>

<template>
  <section class="rounded-xl border border-amber-500/20 bg-[#111113]">
    <header class="flex items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
      <div>
        <h2 class="text-xs font-semibold text-white">Production VOD library</h2>
        <p class="mt-1 text-[11px] leading-relaxed text-gray-500">
          Read-only footage from the signed-in production account. Mounted footage lasts for this app session.
        </p>
      </div>
      <button
        type="button"
        class="rounded-lg border border-white/[0.10] px-2.5 py-1.5 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        :disabled="loading"
        @click="refresh"
      >{{ loading ? 'Loading...' : 'Refresh' }}</button>
    </header>

    <div v-if="activeFixture" class="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5">
      <div class="min-w-0">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">Production fixture active</p>
        <p class="mt-0.5 truncate text-xs text-gray-300">{{ activeFixture.agent || 'Unknown agent' }} | {{ activeFixture.map || 'Unknown map' }}</p>
      </div>
      <button type="button" class="text-[11px] font-semibold text-gray-400 hover:text-white" @click="unmount">Unmount</button>
    </div>

    <p v-if="error" class="border-b border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-xs text-red-300">{{ error }}</p>

    <div class="grid grid-cols-1 divide-y divide-white/[0.08] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
      <div class="min-w-0 p-3">
        <div class="mb-2 flex items-center justify-between px-1">
          <h3 class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Before coaching</h3>
          <span class="text-[10px] tabular-nums text-gray-600">{{ archives.length }}</span>
        </div>
        <p v-if="!loading && !archives.length" class="px-1 py-3 text-xs text-gray-600">No live archives found.</p>
        <div v-else class="max-h-56 space-y-1 overflow-y-auto pr-1">
          <div v-for="archive in archives" :key="archive.archive_id" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.035]">
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-gray-200">{{ archiveLabel(archive) }}</p>
              <p class="mt-0.5 truncate text-[10px] text-gray-600">{{ formatDate(archive.archived_at) }} | {{ archive.analysis_state.replace('_', ' ') }}</p>
            </div>
            <button
              type="button"
              class="flex-shrink-0 rounded-md border border-amber-500/25 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/[0.08] disabled:opacity-50"
              :disabled="busyArchiveId !== null"
              @click="mountArchive(archive)"
            >{{ busyArchiveId === archive.archive_id ? 'Mounting...' : 'Preview' }}</button>
          </div>
        </div>
      </div>

      <div class="min-w-0 p-3">
        <div class="mb-2 flex items-center justify-between px-1">
          <h3 class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Analysed</h3>
          <span class="text-[10px] tabular-nums text-gray-600">{{ analyses.length }}</span>
        </div>
        <p v-if="!loading && !analyses.length" class="px-1 py-3 text-xs text-gray-600">No analysed production VODs found.</p>
        <div v-else class="max-h-56 space-y-1 overflow-y-auto pr-1">
          <div v-for="analysis in analyses" :key="analysis.id" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.035]">
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-gray-200">{{ [analysis.agent, analysis.map].filter(Boolean).join(' | ') || `Analysis ${analysis.id}` }}</p>
              <p class="mt-0.5 truncate text-[10px] text-gray-600">{{ formatDate(analysis.created_at) }} | {{ analysis.status }}</p>
            </div>
            <button type="button" class="flex-shrink-0 rounded-md border border-white/[0.12] px-2 py-1 text-[10px] font-semibold text-gray-300 hover:bg-white/[0.05]" @click="openAnalysis(analysis.id)">Open</button>
          </div>
        </div>
        <p v-if="analysedArchives.length" class="mt-2 px-1 text-[10px] text-gray-700">{{ analysedArchives.length }} analysed archive{{ analysedArchives.length === 1 ? '' : 's' }} can also be mounted as a before-coaching fixture.</p>
      </div>
    </div>
  </section>
</template>
