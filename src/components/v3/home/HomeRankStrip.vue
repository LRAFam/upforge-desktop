<script setup lang="ts">
/**
 * Valorant rank on Coach: rank icon + name, RR bar, last change, and how fresh it is.
 * Source order: live/saved rank from the Riot client (main process), else the newest synced snapshot.
 * Rank shields show only when the competitive-update history proves the count (see notes-rank.md).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getRankIconUrl } from '../../../lib/valorant'
import { useStaleLoad } from '../../../lib/stale-cache'
import UfSkeleton from '../UfSkeleton.vue'
import { rankStripView, type LiveRank, type SyncedRank } from './rank-strip'
import { CARD_H, CARD_W, drawRankCard } from './rank-card'

const api = window.api?.stats
const now = ref(Date.now())
const live = ref<LiveRank | null>(null)

const synced = useStaleLoad<SyncedRank | null>('home:valorant-rank-synced', async () => {
  const rows = (await api?.rrHistory?.('30d').catch(() => [])) ?? []
  const last = rows[rows.length - 1] // oldest-first list
  return last ? { date: last.date, rank: last.rank, rr: last.rr } : null
})

const view = computed(() => rankStripView(live.value, synced.data.value, now.value))
const icon = computed(() => (view.value && view.value.kind === 'ranked' ? getRankIconUrl(view.value.rankName) : null))
const loading = computed(() => !view.value && synced.loading.value)

let stopListen: (() => void) | null = null
let tick: ReturnType<typeof setInterval> | null = null
onMounted(async () => {
  stopListen = api?.onValorantRank?.((rank) => { live.value = rank }) ?? null
  tick = setInterval(() => { now.value = Date.now() }, 30_000)
  live.value = (await api?.valorantRank?.().catch(() => null)) ?? null
  const fresh = await api?.refreshValorantRank?.().catch(() => null)
  if (fresh) live.value = fresh
})
onBeforeUnmount(() => { stopListen?.(); if (tick) clearInterval(tick) })

// Shareable proof: draw the card locally from the real rank and save it as a PNG.
const cardState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
function loadIcon(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}
async function saveCard(): Promise<void> {
  const v = view.value
  if (!v || v.kind !== 'ranked' || cardState.value === 'saving') return
  cardState.value = 'saving'
  try {
    const canvas = document.createElement('canvas')
    canvas.width = CARD_W
    canvas.height = CARD_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    await document.fonts?.ready
    const data = { rankName: v.rankName, rr: v.rr ?? null, change: live.value?.lastChange ?? null, playerName: null, dateLabel: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }
    drawRankCard(ctx, data, await loadIcon(icon.value))
    let dataUrl: string
    try { dataUrl = canvas.toDataURL('image/png') } catch {
      // The rank icon came from another host without CORS: redraw without it rather than fail.
      drawRankCard(ctx, data, null)
      dataUrl = canvas.toDataURL('image/png')
    }
    const res = await window.api?.screenshots?.save?.(dataUrl)
    cardState.value = res?.ok ? 'saved' : 'failed'
  } catch {
    cardState.value = 'failed'
  }
}
</script>

<template>
  <section v-if="loading || view" class="rank3" aria-label="Your rank">
    <template v-if="loading">
      <UfSkeleton :w="28" :h="28" />
      <UfSkeleton :w="120" :h="16" />
      <UfSkeleton :w="160" :h="4" />
    </template>
    <template v-else-if="view">
      <img v-if="icon" :src="icon" alt="" class="rank3-icon" width="28" height="28">
      <span class="uf-t3 rank3-name">{{ view.rankName }}</span>
      <span v-if="view.rr != null" class="rank3-rr">
        <span class="uf-t4" style="color: var(--uf-bone)">{{ view.rr }} RR</span>
        <span class="rank3-bar" role="meter" aria-label="Ranked rating in this tier" :aria-valuenow="view.rrPct ?? 0" aria-valuemin="0" aria-valuemax="100">
          <i class="uf-fill" :style="{ width: `${view.rrPct ?? 0}%` }" />
        </span>
      </span>
      <span v-if="view.change" class="uf-t4 rank3-change" :class="view.changeTone === 'win' ? 'is-win' : 'is-loss'">{{ view.change }}</span>
      <span v-if="view.shields" class="uf-t4 rank3-shields" title="Each loss at 0 RR uses a shield instead of dropping your rank.">
        <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden="true"><path d="M6 .5 11 2.5v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6v-4L6 .5Z" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        {{ view.shields }}
      </span>
      <span class="uf-t4 rank3-fresh" :class="{ 'is-stale': view.stale }">{{ view.freshness }}</span>
      <button v-if="view.kind === 'ranked'" type="button" class="uf-link rank3-card" :disabled="cardState === 'saving'" @click="saveCard">
        {{ cardState === 'saving' ? 'Saving card…' : cardState === 'saved' ? 'Card saved to Screenshots' : cardState === 'failed' ? 'Couldn\'t save · Retry' : 'Save rank card' }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.rank3 { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 0; border-bottom: 1px solid var(--uf-line); }
.rank3-icon { width: 28px; height: 28px; object-fit: contain; flex: none; }
.rank3-name { white-space: nowrap; }
.rank3-rr { display: inline-flex; align-items: center; gap: 10px; }
.rank3-bar { position: relative; display: inline-block; width: 140px; height: 4px; background: var(--uf-line-2); }
.rank3-bar i { position: absolute; inset: 0 auto 0 0; background: var(--uf-bone); }
.rank3-change.is-win { color: var(--uf-win); font-weight: 600; }
.rank3-change.is-loss { color: var(--uf-loss); font-weight: 600; }
.rank3-shields { display: inline-flex; align-items: center; gap: 6px; color: var(--uf-muted); white-space: nowrap; }
.rank3-fresh { margin-left: auto; color: var(--uf-faint); }
.rank3-fresh.is-stale { color: var(--uf-muted); }
.rank3-card { margin-left: auto; }
</style>
