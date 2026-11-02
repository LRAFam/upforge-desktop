<script setup lang="ts">
/**
 * "Your playstyle": tracked-match tendencies (GET /api/progress/playstyle-profile) beside the
 * coach's category scores (GET /api/skill-profile, Plus). Real numbers only; bars inside rows.
 */
import { computed } from 'vue'
import { useStaleLoad } from '../../../lib/stale-cache'
import { openWebFeature } from '../../../lib/web-explore-links'
import UfSkeleton from '../UfSkeleton.vue'
import { agentPoolLine, categoryLabel, playstyleRows, roleSentence, type PlaystyleProfileLike } from './playstyle'
import type { SkillProfileSummary } from '../../../../electron/main/ipc/progress-plan-ipc'

const style = useStaleLoad<PlaystyleProfileLike | null>('progress:playstyle', async () => {
  const fn = window.api?.progress?.playstyleProfile
  return fn ? (await fn()) ?? null : null
})
/** Older preloads lack the channel → no column (not an error). */
const skills = useStaleLoad<{ locked: boolean; profile: SkillProfileSummary | null } | null>('progress:skill-profile', async () => {
  const fn = window.api?.progress?.skillProfile
  if (!fn) return null
  const res = await fn()
  if (!res.ok) throw new Error(res.error)
  return { locked: res.locked, profile: res.profile }
})

const profile = computed(() => style.data.value)
const rows = computed(() => playstyleRows(profile.value))
const role = computed(() => roleSentence(profile.value))
const agents = computed(() => agentPoolLine(profile.value))
const matches = computed(() => profile.value?.matches_tracked ?? 0)
const skillProfile = computed(() => skills.data.value?.profile ?? null)
/** Show the category column only when the plan includes it (locked → hidden, no upsell). */
const showSkills = computed(() => skills.loading.value || !!skillProfile.value || (!!skills.data.value && !skills.data.value.locked) || (!!skills.error.value && !skills.data.value))
const refreshing = computed(() => style.refreshing.value || skills.refreshing.value)
</script>

<template>
  <section class="ps3" :class="{ 'uf-refreshing': refreshing, 'is-single': !showSkills }" aria-label="Your playstyle">
    <div class="ps3-col">
      <div class="ps3-head">
        <span class="uf-label">Your playstyle<template v-if="matches"> · {{ matches }} tracked matches</template></span>
        <button v-if="rows.length" type="button" class="uf-link uf-t4" @click="openWebFeature('/valorant/playstyle')">More on upforge.gg →</button>
      </div>
      <div v-if="style.loading.value" aria-hidden="true">
        <div v-for="i in 4" :key="i" class="ps3-row"><UfSkeleton :w="'60%'" :h="16" /><UfSkeleton :h="18" /></div>
      </div>
      <template v-else-if="rows.length">
        <span v-if="role || agents" class="uf-t4 uf-reveal">{{ [role, agents].filter(Boolean).join(' · ') }}</span>
        <div v-for="r in rows" :key="r.key" class="ps3-row uf-reveal" :title="r.of ? `${r.value} ${r.of}` : undefined">
          <span class="uf-t3">{{ r.label }}</span>
          <span class="ps3-bar"><span v-if="r.pct != null" class="uf-fill" :style="{ width: `${r.pct}%` }" /><b class="uf-d4">{{ r.value }}</b></span>
          <span class="uf-t4 ps3-of">{{ r.of }}</span>
        </div>
        <span v-if="matches < 5" class="uf-t4">Fewer than 5 tracked matches is an early read.</span>
      </template>
      <p v-else-if="style.error.value && !profile" class="uf-t2 ps3-empty">Couldn't load your playstyle. <button type="button" class="uf-link" @click="style.reload">Retry</button></p>
      <p v-else class="uf-t2 ps3-empty">No playstyle yet. It builds from the Valorant matches UpForge tracks; play a few and it shows here.</p>
    </div>

    <div v-if="showSkills" class="ps3-col ps3-col--side">
      <span class="uf-label">Coach scores<template v-if="skillProfile"> · last {{ skillProfile.matches }} analysed {{ skillProfile.matches === 1 ? 'match' : 'matches' }}</template></span>
      <div v-if="skills.loading.value" aria-hidden="true">
        <div v-for="i in 4" :key="i" class="ps3-row"><UfSkeleton :w="'50%'" :h="16" /><UfSkeleton :h="18" /></div>
      </div>
      <template v-else-if="skillProfile && skillProfile.categories.length">
        <div v-for="c in skillProfile.categories" :key="c.key" class="ps3-row ps3-row--score uf-reveal">
          <span class="uf-t3">{{ categoryLabel(c.key) }}</span>
          <span class="ps3-bar"><span class="uf-fill" :style="{ width: `${c.average * 10}%` }" /><b class="uf-d4">{{ c.average }}</b></span>
          <span class="uf-t4 ps3-of">/10 avg<template v-if="c.latest != null"> · latest {{ c.latest }}</template></span>
        </div>
        <span v-if="skillProfile.matches < 3" class="uf-t4">Fewer than 3 analysed matches is an early read.</span>
      </template>
      <p v-else-if="skills.error.value && !skills.data.value" class="uf-t2 ps3-empty">Couldn't load your coach scores. <button type="button" class="uf-link" @click="skills.reload">Retry</button></p>
      <p v-else class="uf-t2 ps3-empty">No coach scores yet. They appear after your first AI-analysed match.</p>
    </div>
  </section>
</template>

<style scoped>
.ps3 { display: grid; grid-template-columns: 1.5fr 1fr; gap: 40px; }
.ps3.is-single { grid-template-columns: minmax(0, 1fr); max-width: 900px; }
.ps3-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ps3-col--side { border-left: 1px solid var(--uf-line); padding-left: 32px; }
.ps3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.ps3-row { display: grid; grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1.2fr) minmax(0, 0.9fr); gap: 16px; align-items: center; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.ps3-row--score { grid-template-columns: minmax(100px, 0.9fr) minmax(0, 1.2fr) auto; }
.ps3-bar { position: relative; height: 24px; display: flex; align-items: center; gap: 8px; min-width: 0; }
.ps3-bar > .uf-fill { position: absolute; left: 0; top: 3px; bottom: 3px; background: var(--uf-bone); opacity: 0.16; }
.ps3-bar > b { position: relative; padding-left: 8px; }
.ps3-of { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ps3-empty { margin: 0; }
@container (max-width: 760px) {
  .ps3 { grid-template-columns: minmax(0, 1fr); }
  .ps3-col--side { border-left: 0; padding-left: 0; }
}
</style>
