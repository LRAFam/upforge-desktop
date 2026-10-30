<script setup lang="ts">
/** Enemy habits — this match only: where the enemy team got their kills, by callout. Counted facts, whole numbers. */
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ recordingId: string | null }>()
type Habits = Awaited<ReturnType<NonNullable<NonNullable<typeof window.api>['stats']['enemyHabits']>>>
const habits = ref<Habits>(null)
const loaded = ref(false)

async function load() {
  loaded.value = false
  habits.value = null
  if (!props.recordingId) { loaded.value = true; return }
  try { habits.value = (await window.api?.stats?.enemyHabits?.(props.recordingId)) ?? null } catch { habits.value = null }
  loaded.value = true
}
onMounted(load)
watch(() => props.recordingId, load)

const kills = (n: number) => `${n} ${n === 1 ? 'kill' : 'kills'}`
</script>

<template>
  <section v-if="loaded && habits && habits.rows.length" class="eh3 uf-reveal" aria-label="Enemy habits this match">
    <div class="eh3-head">
      <span class="uf-label">Enemy habits · this match</span>
      <span class="uf-t4">{{ kills(habits.enemyKills) }} placed on the map</span>
    </div>
    <ul class="eh3-rows">
      <li v-for="r in habits.rows" :key="r.callout" class="eh3-row">
        <span class="uf-t3">{{ r.callout }}</span>
        <span class="eh3-bar" aria-hidden="true"><i :style="{ width: `${Math.round((r.kills / habits.rows[0].kills) * 100)}%` }" /></span>
        <span class="uf-t4 uf-num">{{ kills(r.kills) }}<template v-if="r.openingKills"> · {{ r.openingKills }} opening</template></span>
      </li>
    </ul>
    <p class="uf-t4">Where the enemy stood when they got the kill. Only callouts with 3 or more kills are shown.</p>
  </section>
</template>

<style scoped>
.eh3 { display: flex; flex-direction: column; gap: 10px; padding: 16px 0; border-top: 1px solid var(--uf-line); }
.eh3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.eh3-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.eh3-row { display: grid; grid-template-columns: minmax(0, 160px) minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--uf-line); }
.eh3-bar { height: 4px; background: var(--uf-line); position: relative; }
.eh3-bar i { position: absolute; inset: 0 auto 0 0; background: var(--uf-muted); }
</style>
