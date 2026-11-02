<script setup lang="ts">
/**
 * One League match's loadout inline: summoner spells · items in slot order · trinket last.
 * Square icons (rulebook rule 3); an icon that fails to load (e.g. an item newer than the bundled
 * Data Dragon version) is hidden rather than shown broken.
 */
import { computed, ref } from 'vue'
import { lolLoadout, type LolLoadoutIcon } from '../../../lib/lol-recent'

const props = withDefaults(defineProps<{ match: { items?: unknown; summoner_spells?: unknown } | null | undefined; size?: number }>(), { size: 18 })
const loadout = computed(() => lolLoadout(props.match))
const broken = ref(new Set<string>())
const shown = (list: LolLoadoutIcon[]) => list.filter(i => !broken.value.has(i.key))
function hide(key: string) { broken.value = new Set(broken.value).add(key) }
const label = computed(() => {
  const l = loadout.value
  if (!l) return ''
  return [l.spells.map(s => s.label).join(' + '), `${l.items.length} ${l.items.length === 1 ? 'item' : 'items'}`].filter(Boolean).join(' · ')
})
</script>

<template>
  <span v-if="loadout" class="lls" role="img" :aria-label="`Loadout: ${label}`">
    <img v-for="s in shown(loadout.spells)" :key="s.key" :src="s.src" :title="s.label" alt="" :width="size" :height="size" @error="hide(s.key)">
    <span v-if="loadout.spells.length && (loadout.items.length || loadout.trinket)" class="lls-gap" />
    <img v-for="i in shown(loadout.items)" :key="i.key" :src="i.src" alt="" :width="size" :height="size" @error="hide(i.key)">
    <img v-if="loadout.trinket && !broken.has(loadout.trinket.key)" :src="loadout.trinket.src" title="Trinket" alt="" :width="size" :height="size"
      class="lls-trinket" @error="hide(loadout.trinket.key)">
  </span>
</template>

<style scoped>
.lls { display: inline-flex; align-items: center; gap: 2px; }
.lls img { object-fit: cover; border-radius: 0; background: var(--uf-raised); }
.lls-gap { width: 6px; }
.lls-trinket { margin-left: 4px; }
</style>
