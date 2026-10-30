<script setup lang="ts">
import { ref } from 'vue'
import { uiV3 } from '../../lib/ui-v3'
import {
  confidenceTone,
  duelMomentKindBadgeClass,
  duelMomentKindLabel,
  duelMomentTimestampLabel,
  duelMomentWeightReasons,
  duelMomentWindowDurationLabel,
  formatKillStreakLabel,
  formatPeekSequence,
  isWinDuelMoment,
  isUntradedDuelMoment,
  normalizeStringList,
  type DuelMoment,
} from '../../lib/duel-moments'

defineProps<{
  moments: DuelMoment[]
  activeMomentId?: string | null
  compact?: boolean
}>()

const emit = defineEmits<{
  seek: [offsetMs: number, momentId: string]
}>()

const expandedWeights = ref<string | null>(null)

function confidenceClass(conf: string | undefined): string {
  const tone = confidenceTone(conf)
  if (tone === 'high') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
  if (tone === 'medium') return 'text-amber-200 bg-amber-500/15 border-amber-500/30'
  return 'text-gray-400 bg-white/[0.04] border-white/10'
}
</script>

<template>
<template v-if="uiV3">
  <section class="dm3" aria-label="Duel analysis">
    <div class="dm3-head">
      <span class="uf-label">Duel analysis · {{ moments.length }} moments</span>
      <p v-if="!compact" class="uf-t4">High-fps windows the coach studied — deaths, picks, and multi-kills</p>
    </div>
    <div class="dm3-list">
      <article v-for="moment in moments" :key="moment.moment_id" class="dm3-row" :class="{ 'dm3-row--on': activeMomentId === moment.moment_id, 'dm3-row--win': isWinDuelMoment(moment) }">
        <div class="dm3-top">
          <div class="dm3-what">
            <p class="dm3-line">
              <span class="uf-d4">R{{ moment.round }}</span>
              <span class="uf-label" :style="{ color: isWinDuelMoment(moment) ? 'var(--uf-win)' : 'var(--uf-loss)' }">{{ duelMomentKindLabel(moment) }}</span>
              <span v-if="isUntradedDuelMoment(moment) && !isWinDuelMoment(moment)" class="uf-label" style="color: var(--uf-loss)">· Untraded</span>
              <span v-if="moment.callout" class="uf-t4">{{ moment.callout }}</span>
            </p>
            <p class="uf-t4 uf-num">{{ duelMomentTimestampLabel(moment) }} · {{ duelMomentWindowDurationLabel(moment) }}<template v-if="moment.confidence"> · {{ moment.confidence }} confidence</template></p>
            <p v-if="formatKillStreakLabel(moment.kill_count ?? 0)" class="uf-t4" style="color: var(--uf-win)">Full spree captured in one clip</p>
          </div>
          <button type="button" class="dm3-watch" :aria-label="`Watch round ${moment.round} moment`" @click="emit('seek', moment.window_start_ms, moment.moment_id)">▷ Watch</button>
        </div>
        <p v-if="moment.key_observation" class="dm3-obs">{{ moment.key_observation }}</p>
        <p v-if="moment.player_action_visibility === 'obscured' || moment.movement_actor === 'enemy' || moment.movement_actor === 'uncertain'" class="uf-t4" style="color: var(--uf-gold)">Mechanics limited: the player action was not clearly visible.</p>
        <p v-if="formatPeekSequence(moment.peek_sequence) || moment.crosshair_on_commit" class="uf-t4">
          <template v-if="formatPeekSequence(moment.peek_sequence)">Peek: {{ formatPeekSequence(moment.peek_sequence) }}<template v-if="moment.mechanics_confidence?.peek"> ({{ moment.mechanics_confidence.peek }})</template></template>
          <template v-if="moment.crosshair_on_commit && moment.crosshair_on_commit !== 'unknown'"> · Crosshair: {{ moment.crosshair_on_commit.replace(/_/g, ' ') }}<template v-if="moment.mechanics_confidence?.crosshair"> ({{ moment.mechanics_confidence.crosshair }})</template></template>
          <template v-if="moment.movement_on_commit && moment.movement_on_commit !== 'unknown'"> · Move: {{ moment.movement_on_commit.replace(/_/g, ' ') }}<template v-if="moment.mechanics_confidence?.movement"> ({{ moment.mechanics_confidence.movement }})</template></template>
        </p>
        <p v-if="moment.player_fix" class="dm3-fix">Try: {{ moment.player_fix }}</p>
        <details v-if="normalizeStringList(moment.caveats).length" class="dm3-more">
          <summary class="uf-t4">Observation limits</summary>
          <p v-for="caveat in normalizeStringList(moment.caveats)" :key="caveat" class="uf-t4">{{ caveat }}</p>
        </details>
        <button v-if="duelMomentWeightReasons(moment).length" type="button" class="dm3-why" :aria-expanded="expandedWeights === moment.moment_id" @click="expandedWeights = expandedWeights === moment.moment_id ? null : moment.moment_id">{{ expandedWeights === moment.moment_id ? 'Hide' : 'Why this moment?' }}</button>
        <p v-if="expandedWeights === moment.moment_id" class="uf-t4">Selected because: {{ duelMomentWeightReasons(moment).join(' · ') }}</p>
      </article>
    </div>
  </section>
</template>
<template v-else>
  <div
    class="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
    :class="compact ? '' : 'shadow-[0_0_30px_rgba(249,115,22,0.06)]'"
  >
    <div class="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5" :class="compact ? 'py-2' : ''">
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400/90">Duel analysis</p>
        <p v-if="!compact" class="text-[11px] text-gray-500 mt-0.5">High-fps windows the coach studied — deaths, picks, and multi-kills</p>
      </div>
      <span class="text-[10px] font-bold tabular-nums text-gray-500">{{ moments.length }} moments</span>
    </div>

    <div class="divide-y divide-white/[0.05] max-h-[420px] overflow-y-auto">
      <div
        v-for="moment in moments"
        :key="moment.moment_id"
        class="px-3 py-3 transition-colors"
        :class="activeMomentId === moment.moment_id ? 'bg-orange-500/[0.07]' : 'hover:bg-white/[0.02]'"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-white">R{{ moment.round }}</span>
              <span
                class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border"
                :class="duelMomentKindBadgeClass(moment)"
              >
                {{ duelMomentKindLabel(moment) }}
              </span>
              <span v-if="moment.callout" class="text-[10px] text-gray-400">{{ moment.callout }}</span>
              <span
                v-if="isUntradedDuelMoment(moment) && !isWinDuelMoment(moment)"
                class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-300"
              >
                Untraded
              </span>
              <span
                v-if="moment.confidence"
                class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border"
                :class="confidenceClass(moment.confidence)"
              >
                {{ moment.confidence }}
              </span>
            </div>
            <p class="text-[10px] text-gray-600 mt-0.5 tabular-nums">
              {{ duelMomentTimestampLabel(moment) }}
              <span class="text-gray-700"> · {{ duelMomentWindowDurationLabel(moment) }}</span>
            </p>
            <p
              v-if="formatKillStreakLabel(moment.kill_count ?? 0)"
              class="text-[10px] text-emerald-400/90 mt-0.5"
            >
              Full spree captured in one clip
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors"
            :class="isWinDuelMoment(moment)
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
              : 'border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'"
            @click="emit('seek', moment.window_start_ms, moment.moment_id)"
          >
            Watch
          </button>
        </div>

        <div v-if="moment.key_observation" class="mt-2 text-xs text-gray-300 leading-relaxed">
          {{ moment.key_observation }}
        </div>

        <p
          v-if="moment.player_action_visibility === 'obscured' || moment.movement_actor === 'enemy' || moment.movement_actor === 'uncertain'"
          class="mt-2 text-[10px] leading-relaxed text-amber-300/80"
        >
          Mechanics limited: the player action was not clearly visible.
        </p>

        <div v-if="formatPeekSequence(moment.peek_sequence) || moment.crosshair_on_commit" class="mt-2 flex flex-wrap gap-1">
          <span
            v-if="formatPeekSequence(moment.peek_sequence)"
            class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-gray-300"
          >
            Peek: {{ formatPeekSequence(moment.peek_sequence) }}<template v-if="moment.mechanics_confidence?.peek"> · {{ moment.mechanics_confidence.peek }}</template>
          </span>
          <span
            v-if="moment.crosshair_on_commit && moment.crosshair_on_commit !== 'unknown'"
            class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-gray-300"
          >
            Crosshair: {{ moment.crosshair_on_commit.replace(/_/g, ' ') }}<template v-if="moment.mechanics_confidence?.crosshair"> · {{ moment.mechanics_confidence.crosshair }}</template>
          </span>
          <span
            v-if="moment.movement_on_commit && moment.movement_on_commit !== 'unknown'"
            class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-gray-300"
          >
            Move: {{ moment.movement_on_commit.replace(/_/g, ' ') }}<template v-if="moment.mechanics_confidence?.movement"> · {{ moment.mechanics_confidence.movement }}</template>
          </span>
        </div>

        <p v-if="moment.player_fix" class="mt-2 text-[11px] leading-relaxed text-emerald-200/85">
          Try: {{ moment.player_fix }}
        </p>

        <details v-if="normalizeStringList(moment.caveats).length" class="mt-2">
          <summary class="cursor-pointer text-[9px] text-gray-600 hover:text-gray-400">Observation limits</summary>
          <ul class="mt-1 space-y-1 border-l border-white/10 pl-2">
            <li v-for="caveat in normalizeStringList(moment.caveats)" :key="caveat" class="text-[9px] leading-relaxed text-gray-600">
              {{ caveat }}
            </li>
          </ul>
        </details>

        <button
          v-if="duelMomentWeightReasons(moment).length"
          type="button"
          class="mt-2 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          @click="expandedWeights = expandedWeights === moment.moment_id ? null : moment.moment_id"
        >
          {{ expandedWeights === moment.moment_id ? 'Hide' : 'Why this moment?' }}
        </button>
        <p v-if="expandedWeights === moment.moment_id" class="mt-1 text-[10px] text-gray-500">
          Selected because: {{ duelMomentWeightReasons(moment).join(' · ') }}
        </p>
      </div>
    </div>
  </div>
</template>
</template>

<style scoped>
.dm3 { display: flex; flex-direction: column; }
.dm3 p { margin: 0; }
.dm3-head { display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; }
.dm3-list { max-height: 520px; overflow-y: auto; }
.dm3-row { display: flex; flex-direction: column; gap: 8px; padding: 14px 0 14px 14px; border-top: 1px solid var(--uf-line); box-shadow: inset 2px 0 0 rgba(232, 80, 91, 0.45); }
.dm3-row--win { box-shadow: inset 2px 0 0 rgba(34, 169, 155, 0.45); }
.dm3-row--on { background: var(--uf-raised); }
.dm3-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.dm3-what { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dm3-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.dm3-watch { flex: none; height: 32px; padding: 0 12px; background: none; border: 1px solid var(--uf-line-2); color: var(--uf-bone); cursor: pointer; font: 600 13px/1 var(--uf-body); }
.dm3-watch:hover { background: var(--uf-hover); }
.dm3-obs { font: 400 15px/1.55 var(--uf-body); color: var(--uf-bone); }
.dm3-fix { font: 600 15px/1.5 var(--uf-body); color: var(--uf-bone); padding-left: 10px; border-left: 2px solid var(--uf-win); }
.dm3-more summary { cursor: pointer; }
.dm3-more p { padding: 4px 0 0 10px; border-left: 1px solid var(--uf-line); }
.dm3-why { align-self: flex-start; background: none; border: 0; padding: 0; cursor: pointer; font: 600 12px/1.6 var(--uf-body); color: var(--uf-faint); }
.dm3-why:hover { color: var(--uf-bone); }
</style>
