<script setup lang="ts">
/**
 * Matches row for a match that has a free report but no recording. Same columns as MatchRowV3 so
 * the list stays aligned; the footage columns say "Not recorded" and the one action opens the report.
 */
import { computed } from 'vue'
import { scoreToneColor } from '../../../lib/upforge-score'
import { gameLogo } from './game-logo'
import { matchRowArt } from './match-meta'
import { reportRowView, type MatchReportRow } from './report-rows'

const props = defineProps<{ report: MatchReportRow }>()
const emit = defineEmits<{ open: [] }>()

const view = computed(() => reportRowView(props.report))
const art = computed(() => matchRowArt({ game: 'valorant', map: props.report.map, agent: props.report.agent, timeline: null }))
const logo = gameLogo('valorant')
</script>

<template>
  <div class="uf-row uf-band" :class="`is-${view.tone}`">
    <img v-if="art.backdrop" :src="art.backdrop" alt="" aria-hidden="true" class="uf-band-bg" loading="lazy">
    <div class="uf-art" aria-hidden="true">
      <img v-if="art.figure" :src="art.figure" alt="" class="uf-figure" loading="lazy">
      <img v-else-if="art.icon" :src="art.icon" alt="" class="uf-figure-icon" loading="lazy">
    </div>
    <div class="uf-result">
      <span v-if="view.resultWord" class="uf-label uf-res-word">{{ view.resultWord }}</span>
      <span v-if="view.score" class="uf-d3 uf-num uf-res-score">{{ view.score }}</span>
    </div>
    <!-- No K / D / A in the list data, so the text takes that column too and has room for the coach's headline. -->
    <div class="uf-who-text">
      <span class="uf-t3 uf-trunc uf-map"><img v-if="logo" :src="logo" alt="Valorant" class="uf-logo">{{ view.mapLabel }}</span>
      <span class="uf-t4 uf-trunc">{{ view.meta }}</span>
      <span class="uf-t4 uf-trunc" :title="view.line">{{ view.line }}</span>
    </div>
    <div class="uf-score" :title="view.score1000 ? `UpForge score ${view.score1000.text} of 1000 · ${view.score1000.label}` : undefined">
      <template v-if="view.score1000">
        <span class="uf-t3 uf-num" :style="{ color: view.score1000.tone ? scoreToneColor(view.score1000.tone) : 'var(--uf-bone)' }">{{ view.score1000.text }}</span>
        <span class="uf-t4">UpForge</span>
      </template>
    </div>
    <div class="uf-status">
      <span class="uf-t4 uf-trunc" style="color: var(--uf-faint)">Not recorded</span>
    </div>
    <div class="uf-actions">
      <button type="button" class="uf-btn-secondary uf-open" :aria-label="`Open the match report: ${view.mapLabel}${view.score ? `, ${view.score}` : ''}`" @click="emit('open')">Open report</button>
    </div>
  </div>
</template>

<style scoped>
/* Same columns as MatchRowV3 (shared with the skeleton in MatchesV3). */
.uf-row { display: grid; grid-template-columns: 150px 104px minmax(150px, 1fr) 104px 96px 140px 320px; gap: 18px; align-items: center; padding: 0 16px 0 0; min-height: 88px; border-top: 1px solid var(--uf-line); }
@container uf-matches (max-width: 1040px) {
  .uf-row { grid-template-columns: 110px 92px minmax(120px, 1fr) 88px 84px 112px 270px; gap: 14px; min-height: 80px; }
}
.uf-band { --tone: 122, 130, 142; position: relative; overflow: hidden; isolation: isolate; box-shadow: inset 3px 0 0 rgb(var(--tone)); }
.uf-band.is-win { --tone: 34, 169, 155; }
.uf-band.is-loss { --tone: 232, 80, 91; }
.uf-band::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background:
    linear-gradient(90deg, rgba(var(--tone), 0.42) 0%, rgba(var(--tone), 0.12) 26%, rgba(var(--tone), 0) 55%),
    linear-gradient(90deg, rgba(14, 17, 22, 0.2) 0%, rgba(14, 17, 22, 0.8) 26%, rgba(14, 17, 22, 0.95) 58%);
  transition: opacity 0.15s ease; }
.uf-band:hover::before { opacity: 0.88; }
.uf-band-bg { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; filter: saturate(0.85); }
.uf-art { position: relative; align-self: stretch; overflow: hidden; }
.uf-figure { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); height: 250%; width: auto; max-width: none; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55)); transition: transform 0.2s ease; }
.uf-band:hover .uf-figure { transform: translate(-50%, -3px); }
.uf-figure-icon { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 52px; height: 52px; object-fit: cover; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); }
.uf-res-word { color: rgb(var(--tone)); font-weight: 700; filter: brightness(1.15); }
.uf-res-score { color: var(--uf-bone); white-space: nowrap; }
.uf-map { display: inline-flex; align-items: center; gap: 8px; }
.uf-band .uf-t4 { color: #c9c5be; }
.uf-band .uf-result, .uf-band .uf-who-text, .uf-band .uf-score, .uf-band .uf-status { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
@media (prefers-reduced-motion: reduce) { .uf-band::before, .uf-figure { transition: none; } .uf-band:hover .uf-figure { transform: translateX(-50%); } }
.uf-logo { width: 18px; height: 14px; object-fit: contain; flex: none; }
.uf-who-text, .uf-status, .uf-result, .uf-score { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.uf-who-text { grid-column: span 2; }
.uf-num { font-variant-numeric: tabular-nums; }
.uf-trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-score .uf-t4 { white-space: nowrap; }
.uf-actions { display: flex; align-items: center; justify-content: flex-end; min-width: 0; padding-right: 50px; }
.uf-open { height: 36px; }
</style>
