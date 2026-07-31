<script setup lang="ts">
import { computed } from 'vue'
import { scoreGrade, scoreGradeBadgeClass } from '../../lib/analysis-scoring'
import {
  rosterFormatDate,
  rosterMapLabel,
  rosterMatchGame,
  rosterScoreTone,
  type RosterMatchVisual,
} from '../../lib/roster-match-display'
import {
  rosterAgentAccent,
  rosterAgentImage,
  rosterBrand,
  rosterForgeScore,
  rosterKdaLine,
  rosterMapUnderlay,
  rosterRoleMeta,
} from '../../lib/roster-match-display'

const props = withDefaults(defineProps<{
  match: RosterMatchVisual
  subtitle?: string
  tone?: 'default' | 'pending'
  actionLabel?: string
  actionBusy?: boolean
  actionDisabled?: boolean
  actionTitle?: string
  showAction?: boolean
}>(), {
  tone: 'default',
  showAction: false,
  actionBusy: false,
  actionDisabled: false,
})

const emit = defineEmits<{
  action: []
  open: []
}>()

const role = computed(() => rosterRoleMeta(props.match))
const brand = computed(() => rosterBrand(props.match))
const agentImg = computed(() => rosterAgentImage(props.match))
const mapUnderlay = computed(() => rosterMapUnderlay(props.match))
const accent = computed(() => rosterAgentAccent(props.match))
const kda = computed(() => rosterKdaLine(props.match))
const forge = computed(() => rosterForgeScore(props.match.overall_score))
</script>

<template>
  <div
    class="roster-match-row relative px-3 py-2 rounded-xl border transition-colors"
    :class="[
      tone === 'pending'
        ? 'border-amber-500/25 bg-amber-500/[0.05]'
        : 'border-white/[0.09] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]',
      showAction ? '' : 'roster-match-row--no-action cursor-pointer',
    ]"
    @click="!showAction && emit('open')"
  >
    <button
      v-if="showAction"
      type="button"
      class="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center relative flex-shrink-0 border border-white/10 text-left"
      :style="agentImg ? { backgroundColor: accent + '22' } : {}"
      title="Open match"
      @click.stop="emit('open')"
    >
      <img
        v-if="mapUnderlay"
        :src="mapUnderlay"
        class="absolute inset-0 w-full h-full object-cover opacity-25"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <img
        v-if="agentImg"
        :src="agentImg"
        class="relative w-8 h-8 object-contain drop-shadow-md"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <img
        v-else
        :src="brand.logo"
        class="relative w-5 h-5 object-contain opacity-80"
        alt=""
      />
    </button>
    <div
      v-else
      class="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center relative flex-shrink-0 border border-white/10"
      :style="agentImg ? { backgroundColor: accent + '22' } : {}"
    >
      <img
        v-if="mapUnderlay"
        :src="mapUnderlay"
        class="absolute inset-0 w-full h-full object-cover opacity-25"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <img
        v-if="agentImg"
        :src="agentImg"
        class="relative w-8 h-8 object-contain drop-shadow-md"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <img
        v-else
        :src="brand.logo"
        class="relative w-5 h-5 object-contain opacity-80"
        alt=""
      />
    </div>

    <div class="min-w-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="text-xs font-semibold text-white truncate">
          {{ match.agent || rosterMapLabel(match) }}
        </span>
        <span
          v-if="role"
          class="flex-shrink-0 text-[8px] font-bold px-1 py-px rounded"
          :style="{ color: role.color, backgroundColor: role.color + '20' }"
        >{{ role.label }}</span>
        <span
          class="flex-shrink-0 rounded border px-1.5 py-px text-[8px] font-semibold"
          :style="{
            color: brand.accent,
            borderColor: brand.accent + '44',
            background: brand.accent + '12',
          }"
        >{{ brand.wordmark }}</span>
        <slot name="badges" />
      </div>
      <p class="text-[10px] text-gray-500 mt-0.5 truncate">
        <template v-if="subtitle">{{ subtitle }}</template>
        <template v-else>
          {{ rosterMapLabel(match) }}
          <template v-if="match.rounds_won != null && match.rounds_lost != null">
            · {{ match.rounds_won }}–{{ match.rounds_lost }}
          </template>
          <template v-if="rosterFormatDate(match.created_at)">
            · {{ rosterFormatDate(match.created_at) }}
          </template>
        </template>
      </p>
    </div>

    <div class="roster-match-stats flex-shrink-0">
      <span
        v-if="match.won != null"
        class="roster-stat-wl"
        :class="match.won ? 'roster-stat-wl--w' : 'roster-stat-wl--l'"
      >{{ match.won ? 'W' : 'L' }}</span>
      <span v-else class="roster-stat-empty">-</span>
      <span v-if="kda" class="roster-stat-kda">{{ kda }}</span>
      <span v-else class="roster-stat-empty">-</span>
      <span
        v-if="match.hs_pct != null"
        class="roster-stat-hs"
        :class="match.hs_pct >= 25 ? 'text-orange-400' : 'text-gray-400'"
      >{{ match.hs_pct }}%</span>
      <span v-else class="roster-stat-empty">-</span>
      <span
        v-if="match.combat_score != null && rosterMatchGame(match) === 'valorant'"
        class="roster-stat-acs"
        title="Average combat score"
      >{{ match.combat_score }}</span>
      <span v-else class="roster-stat-empty">-</span>
      <div
        v-if="match.overall_score != null && forge != null"
        class="roster-stat-score"
        :title="`Forge score ${forge}/1000`"
      >
        <span :class="rosterScoreTone(match.overall_score)">{{ forge }}</span>
        <span :class="scoreGradeBadgeClass(match.overall_score)">{{ scoreGrade(match.overall_score) }}</span>
      </div>
      <span v-else class="roster-stat-empty">-</span>
    </div>

    <button
      v-if="showAction"
      type="button"
      class="roster-row-action"
      :class="tone === 'pending' ? 'roster-row-action--quiet' : ''"
      :disabled="actionBusy || actionDisabled"
      :title="actionTitle"
      @click.stop="emit('action')"
    >
      {{ actionBusy ? 'Sending…' : actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.roster-match-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1.4fr) minmax(240px, auto) 108px;
  align-items: center;
  column-gap: 12px;
}

.roster-match-row--no-action {
  grid-template-columns: 36px minmax(0, 1.4fr) minmax(240px, auto);
}

.roster-match-stats {
  display: grid;
  grid-template-columns: 28px 58px 34px 36px 52px;
  align-items: center;
  justify-items: end;
  column-gap: 8px;
}

.roster-stat-empty {
  font-size: 10px;
  color: rgb(55 65 81);
}

.roster-stat-wl {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  text-align: center;
  min-width: 22px;
}

.roster-stat-wl--w {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74 222 128);
}

.roster-stat-wl--l {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248 113 113);
}

.roster-stat-kda {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgb(209 213 219);
}

.roster-stat-hs,
.roster-stat-acs {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(156 163 175);
}

.roster-stat-score {
  display: flex;
  align-items: center;
  gap: 4px;
}

.roster-stat-score > span:first-child {
  font-size: 13px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.roster-stat-score > span:last-child {
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
}

.roster-row-action {
  justify-self: end;
  width: 108px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: rgb(209 213 219);
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.roster-row-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
  color: white;
  border-color: rgba(255, 255, 255, 0.16);
}

.roster-row-action:disabled {
  opacity: 0.5;
}

.roster-row-action--quiet {
  width: auto;
  min-width: 64px;
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.08);
  color: rgb(253 230 138);
}

.roster-row-action--quiet:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.14);
  color: white;
  border-color: rgba(245, 158, 11, 0.4);
}

@media (max-width: 980px) {
  .roster-match-row {
    grid-template-columns: 36px minmax(0, 1fr) auto;
  }

  .roster-match-stats {
    display: none;
  }
}
</style>
