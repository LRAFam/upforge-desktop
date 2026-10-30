<script setup lang="ts">
/**
 * Dev builds only: open the v3 match page on the real (anonymised) Bind match so the page can be
 * checked with real match data. No network calls, no recording. Production redirects to Home.
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { pendingTimeline } from '../stores/pendingTimeline'
import { bindFixtureTimeline, DEV_BIND_FIXTURE_ID } from '../dev/bind-fixture-timeline'

const router = useRouter()
const error = ref<string | null>(null)

onMounted(async () => {
  if (!import.meta.env.DEV) { void router.replace('/dashboard'); return }
  try {
    const raw = (await import('../dev/fixtures/valorant-bind-match.json')).default as { match_data: Parameters<typeof bindFixtureTimeline>[0] }
    pendingTimeline.value = bindFixtureTimeline(raw.match_data)
    void router.replace({ path: '/vod-review', query: { timelineId: DEV_BIND_FIXTURE_ID } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <p style="padding: 24px; color: var(--uf-muted, #9aa2ad)">{{ error ? `Fixture failed to load: ${error}` : 'Opening the Bind fixture…' }}</p>
</template>
