<script setup lang="ts">
/**
 * 2D round viewer from the match replay: every player's position, where they look, abilities in flight and on
 * the map, flashes and reveals, the spike. Follows the recording by default (lined up through shared kills),
 * or plays a round on its own. Renders nothing when the match has no parsed replay.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVodReview } from '../../../composables/useVodReview'
import { getMapMinimap } from '../../../lib/valorant'
import {
  ABILITY_ICON, AGENT_ICON, SPIKE_ICON, deathTime, playerAt, recordingToReplayOffset, roundAt, roundClock, roundWindow,
  spikeAt, toUv, utilityAt, utilityVisible, yawToUv, type CompactReplay, type ReplayRound,
} from '../../../lib/replay-viewer'

const { timeline, activeRoundNumber, currentTime } = useVodReview()
const replay = ref<CompactReplay | null>(null)
const status = ref<string>('none')
const canvas = ref<HTMLCanvasElement | null>(null)
const follow = ref(true)
const playing = ref(false)
const speed = ref(1)
const ownT = ref(0)
const pickedRound = ref<number | null>(null)

const md = computed(() => (timeline.value ?? null) as unknown as {
  game?: string; matchId?: string | null; puuid?: string; map?: string | null
  killEvents?: { killerPuuid?: string; victimPuuid?: string; videoOffsetMs?: number | null }[]
} | null)
const me = computed(() => md.value?.puuid ?? '')
const offset = computed(() => (replay.value ? recordingToReplayOffset(md.value?.killEvents ?? [], replay.value) : null))
const canFollow = computed(() => offset.value != null)

async function load() {
  replay.value = null
  status.value = 'none'
  const id = md.value?.game === 'valorant' ? md.value?.matchId : null
  if (!id || !window.api?.valorantReplay) return
  const res = await window.api.valorantReplay.get(id).catch(() => null)
  if (!res || id !== md.value?.matchId) return
  status.value = res.status
  if (res.ok) replay.value = res.compact
}
watch(() => md.value?.matchId, load, { immediate: true })

const t = computed(() => (follow.value && canFollow.value ? currentTime.value * 1000 + (offset.value as number) : ownT.value))
const round = computed<ReplayRound | null>(() => {
  const c = replay.value
  if (!c) return null
  if (follow.value && canFollow.value) return roundAt(c, t.value) ?? c.rounds.find((r) => r.n === activeRoundNumber.value) ?? null
  return c.rounds.find((r) => r.n === (pickedRound.value ?? activeRoundNumber.value ?? 1)) ?? c.rounds[0] ?? null
})
const window_ = computed(() => (round.value ? roundWindow(round.value) : { from: 0, to: 1 }))
const clock = computed(() => (round.value ? roundClock(round.value, t.value) : null))
const myTeam = computed(() => replay.value?.players.find((p) => p.puuid === me.value)?.team ?? 'Red')
const isAlly = (team: string | null) => team === myTeam.value
const ALLY = '#4fd1c5'
const ENEMY = '#ff5a5f'
const colour = (team: string | null) => (isAlly(team) ? ALLY : ENEMY)
const agentOf = (name: string) => replay.value?.players.find((p) => p.agent === name)

function pickRound(n: number) {
  follow.value = false
  pickedRound.value = n
  const r = replay.value?.rounds.find((x) => x.n === n)
  if (r) ownT.value = roundWindow(r).from
}
function togglePlay() {
  if (follow.value) { follow.value = false; ownT.value = t.value; pickedRound.value = round.value?.n ?? null }
  playing.value = !playing.value
}
function scrub(e: Event) {
  follow.value = false
  pickedRound.value = round.value?.n ?? null
  ownT.value = Number((e.target as HTMLInputElement).value)
}

// What happened recently, newest last.
const feed = computed(() => {
  const c = replay.value
  const r = round.value
  if (!c || !r) return []
  const now = t.value
  const go = r.buy_end_ms ?? r.start_ms ?? 0
  const when = (ms: number) => { const s = Math.max(0, Math.floor((ms - go) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  const name = (p: string | null) => (p === me.value ? 'You' : c.players.find((x) => x.puuid === p)?.agent ?? 'World')
  const team = (p: string | null) => c.players.find((x) => x.puuid === p)?.team ?? null
  const items: { t: number; text: string; colour: string }[] = []
  for (const k of c.kills) if (k.t >= window_.value.from && k.t <= now) {
    items.push({ t: k.t, colour: colour(team(k.killer)), text: `${when(k.t)}  ${name(k.killer)} killed ${name(k.victim)}${k.weapon ? ` · ${k.weapon}` : ''}${k.headshot ? ' · headshot' : ''}` })
  }
  const seen = new Map<string, number>()
  for (const u of c.utility) if (u.t0 >= window_.value.from && u.t0 <= now && u.ability && u.kind !== 'wall') {
    const key = `${u.agent}|${u.ability}`
    if ((seen.get(key) ?? -1e9) > u.t0 - 1500) continue
    seen.set(key, u.t0)
    const owner = agentOf(u.agent)
    items.push({ t: u.t0, colour: colour(owner?.team ?? null), text: `${when(u.t0)}  ${owner?.puuid === me.value ? 'You' : u.agent} · ${u.ability}` })
  }
  for (const e of c.effects) if (e.t0 >= window_.value.from && e.t0 <= now) {
    items.push({ t: e.t0, colour: '#f5f5f5', text: `${when(e.t0)}  ${name(e.target)} ${e.label}${e.source_agent ? ` by ${e.source_agent}${e.ability ? `'s ${e.ability}` : ''}` : ''}` })
  }
  if (r.plant_ms != null && r.plant_ms <= now) items.push({ t: r.plant_ms, colour: '#ffd23f', text: `${when(r.plant_ms)}  Spike planted` })
  if (r.defuse_ms != null && r.defuse_ms <= now) items.push({ t: r.defuse_ms, colour: '#ffd23f', text: `${when(r.defuse_ms)}  Spike defused` })
  return items.sort((a, b) => a.t - b.t).filter((i) => now - i.t < 10_000).slice(-7)
})

// ── drawing ────────────────────────────────────────────────────────────────────────────────────
const images = new Map<string, HTMLImageElement>()
function img(url: string): HTMLImageElement | null {
  let im = images.get(url)
  if (!im) {
    im = new Image()
    im.crossOrigin = 'anonymous'
    im.src = url
    im.onload = () => draw()
    images.set(url, im)
  }
  return im.complete && im.naturalWidth ? im : null
}
const tinted = new Map<string, HTMLCanvasElement>()
function tintedIcon(url: string, colourHex: string, size: number): HTMLCanvasElement | null {
  const key = `${url}|${colourHex}|${size}`
  const hit = tinted.get(key)
  if (hit) return hit
  const im = img(url)
  if (!im) return null
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')!
  x.drawImage(im, 0, 0, size, size)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = colourHex
  x.fillRect(0, 0, size, size)
  tinted.set(key, c)
  return c
}

function draw() {
  const cv = canvas.value
  const c = replay.value
  const r = round.value
  if (!cv || !c || !r) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const S = cv.width
  const now = t.value
  const P = (x: number, y: number) => { const p = toUv(c, x, y); return [p.u * S, p.v * S] as const }
  const cmPx = Math.abs(c.minimap.xMultiplier) * S
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#0e0e12'
  ctx.fillRect(0, 0, S, S)
  const map = img(getMapMinimap(md.value?.map ?? c.map))
  if (map) { ctx.globalAlpha = 0.6; ctx.drawImage(map, 0, 0, S, S); ctx.globalAlpha = 1 }

  const live = c.utility.filter((u) => utilityVisible(u, now) && u.t0 >= window_.value.from - 3000)
  for (const u of live) {
    const at = utilityAt(u, now)
    if (!at) continue
    const [x, y] = P(at.x, at.y)
    const col = colour(agentOf(u.agent)?.team ?? null)
    if (u.kind === 'smoke') {
      const rr = 410 * cmPx
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(205,205,215,0.55)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke()
    } else if (u.kind === 'slow') {
      const rr = 450 * cmPx
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(90,220,255,0.18)'; ctx.fill()
    } else if (u.kind === 'wall') {
      ctx.fillStyle = col; ctx.fillRect(x - 3, y - 3, 6, 6)
    }
  }
  for (const u of live) {
    if (u.kind === 'wall' || u.kind === 'slow' || !u.slot) continue
    const at = utilityAt(u, now)
    const owner = agentOf(u.agent)
    if (!at || !owner?.agent_id) continue
    const [x, y] = P(at.x, at.y)
    const col = colour(owner.team)
    if (u.track?.length) {
      ctx.beginPath()
      u.track.filter((p) => p[0] <= now && p[0] > now - 1500).forEach((p, i) => { const [a, b] = P(p[1], p[2]); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b) })
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,20,26,0.9)'; ctx.fill()
    const ic = tintedIcon(ABILITY_ICON(owner.agent_id, u.slot), col, 18)
    if (ic) ctx.drawImage(ic, x - 9, y - 9)
  }

  const spike = spikeAt(c, r, now)
  for (const p of c.players) {
    const died = deathTime(c, p.puuid, r)
    const dead = died != null && now >= died
    const s = playerAt(c, p.puuid, dead ? (died as number) : now)
    if (!s) continue
    const [x, y] = P(s.x, s.y)
    const col = colour(p.team)
    if (dead) {
      ctx.strokeStyle = '#e64545'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke()
      continue
    }
    const d = yawToUv(c, s.yaw)
    ctx.beginPath()
    ctx.moveTo(x + d.du * 30, y + d.dv * 30)
    ctx.lineTo(x + d.du * 16 - d.dv * 7, y + d.dv * 16 + d.du * 7)
    ctx.lineTo(x + d.du * 16 + d.dv * 7, y + d.dv * 16 - d.du * 7)
    ctx.closePath(); ctx.fillStyle = col; ctx.fill()
    const fx = c.effects.find((e) => e.target === p.puuid && e.t0 <= now && e.t1 >= now)
    if (fx) {
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#f5f5f5'; ctx.stroke()
      ctx.fillStyle = '#f5f5f5'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(fx.label.toUpperCase(), x, y + 34)
    }
    ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2)
    ctx.fillStyle = p.puuid === me.value ? '#ffd23f' : col; ctx.fill()
    const portrait = p.agent_id ? img(AGENT_ICON(p.agent_id)) : null
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.clip()
    ctx.fillStyle = '#19191e'; ctx.fillRect(x - 14, y - 14, 28, 28)
    if (portrait) ctx.drawImage(portrait, x - 14, y - 14, 28, 28)
    ctx.restore()
    if (p.puuid === me.value) { ctx.fillStyle = '#ffd23f'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('YOU', x, y - 22) }
    if (spike?.state === 'carried' && spike.carrier === p.puuid) {
      const ic = tintedIcon(SPIKE_ICON, '#ff5a5f', 14)
      ctx.beginPath(); ctx.arc(x + 15, y + 13, 9, 0, Math.PI * 2); ctx.fillStyle = '#14141a'; ctx.fill()
      if (ic) ctx.drawImage(ic, x + 8, y + 6)
    }
  }
  if (spike && spike.state !== 'carried') {
    const [x, y] = P(spike.x, spike.y)
    const col = spike.state === 'defused' ? '#999999' : '#ff5a5f'
    if (spike.state === 'planted' && Math.floor(now / 500) % 2 === 0) {
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fillStyle = '#14141a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke()
    const ic = tintedIcon(SPIKE_ICON, col, 22)
    if (ic) ctx.drawImage(ic, x - 11, y - 11)
  }
}

let raf = 0
let last = 0
function tick(ts: number) {
  if (playing.value && !follow.value && round.value) {
    const dt = last ? ts - last : 0
    ownT.value = Math.min(window_.value.to, ownT.value + dt * speed.value)
    if (ownT.value >= window_.value.to) playing.value = false
  }
  last = ts
  draw()
  raf = requestAnimationFrame(tick)
}
onMounted(() => { raf = requestAnimationFrame(tick) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
watch(replay, () => { if (replay.value && !canFollow.value) follow.value = false })
</script>

<template>
  <section v-if="replay" class="rv3" aria-label="2D replay of the round">
    <div class="rv3-head">
      <span class="uf-t3">2D replay · round {{ round?.n ?? '–' }}</span>
      <span v-if="clock" class="uf-t3 uf-num" :class="{ 'rv3-spike': clock.spike }">{{ clock.text }}{{ clock.defused ? ' · defused' : clock.spike ? ' · spike' : '' }}</span>
    </div>
    <div class="rv3-body">
      <canvas ref="canvas" width="640" height="640" class="rv3-map" />
      <ol class="rv3-feed">
        <li v-for="(i, k) in feed" :key="k" class="uf-t4" :style="{ color: i.colour }">{{ i.text }}</li>
        <li v-if="!feed.length" class="uf-t4 rv3-muted">Kills, abilities and flashes show here as they happen.</li>
      </ol>
    </div>
    <div class="rv3-controls">
      <button type="button" class="uf-btn-secondary" @click="togglePlay">{{ playing ? 'Pause' : 'Play' }}</button>
      <select v-model.number="speed" class="uf-select is-inline" aria-label="Speed"><option :value="1">1×</option><option :value="2">2×</option><option :value="4">4×</option></select>
      <input type="range" class="uf-range rv3-scrub" :min="window_.from" :max="window_.to" :value="t" aria-label="Round time" @input="scrub">
      <select :value="round?.n" class="uf-select is-inline" aria-label="Round" @change="pickRound(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="r in replay.rounds" :key="r.n" :value="r.n">Round {{ r.n }}</option>
      </select>
      <label v-if="canFollow" class="uf-checkrow"><input v-model="follow" type="checkbox" class="uf-check"><span class="uf-t4">Follow video</span></label>
    </div>
  </section>
  <p v-else-if="status === 'uploaded'" class="uf-t4 rv3-muted">The 2D replay of this match is being prepared.</p>
</template>

<style scoped>
.rv3 { display: flex; flex-direction: column; gap: 10px; padding: 16px 0; border-top: 1px solid var(--uf-line); }
.rv3-head { display: flex; justify-content: space-between; align-items: baseline; }
.rv3-spike { color: #ffd23f; }
.rv3-body { display: grid; grid-template-columns: minmax(0, 560px) minmax(0, 1fr); gap: 16px; align-items: start; }
.rv3-map { width: 100%; aspect-ratio: 1; border-radius: 6px; background: #0e0e12; }
.rv3-feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rv3-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.rv3-scrub { flex: 1 1 200px; }
.rv3-muted { color: var(--uf-muted); }
@media (max-width: 900px) { .rv3-body { grid-template-columns: 1fr; } }
</style>
