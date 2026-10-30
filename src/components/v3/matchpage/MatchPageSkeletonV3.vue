<script setup lang="ts">
/**
 * UI v3 match page while the timeline loads. Same geometry as the loaded page (header band,
 * section bar, coach line + rounds strip, round log | 16:9 player + transport | side panel),
 * so nothing moves when the real content fades in. The header shows real facts when we have
 * them (the clicked row or the last visit) and skeleton blocks when we don't.
 */
import { computed } from 'vue'
import type { MatchSummary } from '../../../composables/vod/match-summary'
import { formatGameMode, getAgentImage, getMapImage } from '../../../lib/valorant'
import { getMapImage as getLolMapImage } from '../../../lib/lol'
import UfHeroBand from '../UfHeroBand.vue'
import UfSkeleton from '../UfSkeleton.vue'

const props = defineProps<{ summary: MatchSummary | null; workspace: boolean; roundsWidth: number; detailsWidth: number; cloud?: boolean }>()

const s = computed(() => props.summary)
const art = computed(() => {
  if (!s.value) return undefined
  if (s.value.game === 'lol') return getLolMapImage() || undefined
  return s.value.game === 'valorant' ? getMapImage(s.value.map) || undefined : undefined
})
const agentImg = computed(() => (s.value?.game === 'valorant' ? getAgentImage(s.value.agent) || '' : ''))
const result = computed(() => (s.value?.won == null ? undefined : s.value.won ? 'VICTORY' : 'DEFEAT'))
const tone = computed<'win' | 'loss' | 'none'>(() => (s.value?.won == null ? 'none' : s.value.won ? 'win' : 'loss'))
const meta = computed(() => (s.value ? [s.value.map, s.value.mode ? formatGameMode(s.value.mode) : null, s.value.agent].filter(Boolean).join(' · ') : ''))
const hasScore = computed(() => s.value?.ally != null && s.value?.enemy != null)
const hasKda = computed(() => s.value?.kills != null && s.value?.deaths != null && s.value?.assists != null)
const roundBased = computed(() => !s.value || s.value.game === 'valorant' || s.value.game === 'cs2')
const roundCount = computed(() => (hasScore.value ? Math.min(30, (s.value!.ally ?? 0) + (s.value!.enemy ?? 0)) : 24))

const cols = computed(() => (props.workspace
  ? { left: `${props.roundsWidth}%`, right: `${props.detailsWidth}%` }
  : { left: '236px', right: '' }))
</script>

<template>
  <div class="mps" role="status" aria-label="Loading match">
    <UfHeroBand :art="art" :result="result" :tone="tone" :meta="meta" :height="150" art-position="center 45%">
      <div class="mps-score">
        <img v-if="agentImg" :src="agentImg" alt="" class="mps-agent">
        <UfSkeleton v-else :w="44" :h="44" />
        <span v-if="hasScore" class="uf-d2 uf-num">{{ s!.ally }}<span class="mps-dash">–</span>{{ s!.enemy }}</span>
        <UfSkeleton v-else :w="150" :h="40" />
      </div>
      <template #stats>
        <span v-if="hasKda" class="mps-stat"><span class="uf-d4 uf-num">{{ s!.kills }}/{{ s!.deaths }}/{{ s!.assists }}</span><span class="uf-t4">K/D/A</span></span>
        <UfSkeleton v-else :w="110" :h="26" />
        <UfSkeleton :w="90" :h="26" />
      </template>
    </UfHeroBand>

    <div class="mps-bar">
      <UfSkeleton :w="54" :h="15" />
      <UfSkeleton :w="64" :h="15" />
      <UfSkeleton :w="54" :h="15" />
      <UfSkeleton :w="40" :h="15" />
    </div>

    <div class="mps-story">
      <UfSkeleton :w="'min(720px, 70%)'" :h="18" />
      <div v-if="roundBased" class="mps-rounds">
        <UfSkeleton :w="70" :h="12" />
        <div class="mps-cells"><span v-for="i in roundCount" :key="i" class="mps-cell"><span class="uf-skel mps-cellbar" /></span></div>
      </div>
    </div>

    <!-- Cloud recordings get the coaching strip (CloudVodActions) above the body. -->
    <div v-if="cloud" class="mps-cloud"><UfSkeleton :w="120" :h="12" /><UfSkeleton :w="190" :h="14" /></div>

    <div class="mps-body">
      <div class="mps-col mps-left" :style="{ width: cols.left }">
        <UfSkeleton :w="80" :h="12" />
        <UfSkeleton :w="120" :h="36" />
        <div v-for="i in 6" :key="i" class="mps-log-row">
          <UfSkeleton :w="22" :h="22" />
          <UfSkeleton :lines="2" :w="'80%'" />
        </div>
      </div>
      <div class="mps-center">
        <div class="mps-player"><span class="uf-skel mps-video" /></div>
        <div class="mps-transport"><UfSkeleton :h="4" /><UfSkeleton :w="'60%'" :h="28" /></div>
      </div>
      <div class="mps-col mps-right" :class="{ 'mps-right--classic': !workspace }" :style="workspace ? { width: cols.right } : undefined">
        <UfSkeleton :w="140" :h="12" />
        <UfSkeleton :w="200" :h="30" />
        <UfSkeleton :lines="2" />
        <UfSkeleton :h="120" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mps { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.mps-score { display: flex; align-items: center; gap: 16px; }
.mps-agent { width: 44px; height: 44px; object-fit: contain; background: var(--uf-raised); }
.mps-dash { color: var(--uf-faint); padding: 0 10px; }
.mps-stat { display: inline-flex; align-items: baseline; gap: 8px; }
/* Bar + story match MatchPageHeaderV3 padding so the swap is still. */
.mps-bar { display: flex; align-items: center; gap: 22px; height: 52px; padding: 0 40px; border-top: 1px solid var(--uf-line); }
.mps-story { display: flex; flex-direction: column; gap: 12px; padding: 12px 40px 14px; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.mps-rounds { display: flex; flex-direction: column; gap: 8px; max-width: 760px; }
.mps-cells { display: flex; gap: 3px; }
/* UfRoundsLine cell = 22px bar + tick + round number (~48px tall). */
.mps-cell { flex: 1; height: 48px; display: flex; flex-direction: column; }
.mps-cellbar { height: 22px; }
.mps-cloud { flex: none; display: flex; align-items: center; gap: 14px; height: 52px; padding: 0 24px; border-bottom: 1px solid var(--uf-line); }
.mps-body { flex: 1; min-height: 0; display: flex; }
.mps-col { flex: none; display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; min-width: 0; overflow: hidden; }
.mps-left { border-right: 1px solid var(--uf-line); }
.mps-right { border-left: 1px solid var(--uf-line); }
.mps-right--classic { width: min(440px, 34vw); }
@media (min-width: 1280px) { .mps-right--classic { width: min(480px, 32vw); } }
.mps-log-row { display: flex; gap: 12px; align-items: flex-start; padding-top: 12px; border-top: 1px solid var(--uf-line); }
.mps-center { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #07090c; }
.mps-player { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 12px; }
.mps-video { width: 100%; max-height: 100%; aspect-ratio: 16 / 9; }
.mps-transport { flex: none; display: flex; flex-direction: column; gap: 12px; padding: 12px 24px 16px; background: var(--uf-chrome); border-top: 1px solid var(--uf-line); }
</style>
