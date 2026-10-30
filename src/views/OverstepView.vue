<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { eventLabel, eventVideoMs, syncIssue, type OverstepStatus } from '../lib/overstep'
import type { OverstepRecordingPolicy, matchStats } from '../lib/overstep-stats'
import { uiV3 } from '../lib/ui-v3'
import UfButton from '../components/v3/UfButton.vue'
const policy = ref<OverstepRecordingPolicy>({ recordedModes: [] })
const summaries = ref<ReturnType<typeof matchStats>[]>([])
const stats = computed(() => summaries.value.find(s => s.matchId === selected.value)?.players[0])
async function savePolicy() { try { policy.value = await window.api.overstep.savePolicy(policy.value) } catch { error.value = 'Could not save recording modes.' } }
const status = ref<OverstepStatus>({ enabled: false, error: null, sessions: [] })
const selected = ref<string | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const busy = ref(false), error = ref<string | null>(null), currentTime = ref(0)
const session = computed(() => status.value.sessions.find(s => s.manifest.matchId === selected.value) ?? null)
const durationMs = computed(() => session.value?.anchors.at(-1)?.videoMs ?? 0)
const issue = computed(() => session.value ? (session.value.videoUrl ? syncIssue(session.value) : 'No playable recording is available.') : null)
const events = computed(() => session.value?.events.filter(e => !['positions', 'shot', 'damage', 'equipment', 'heartbeat'].includes(e.type)) ?? [])
const markers = computed(() => events.value.map(e => ({ event: e, ms: session.value ? eventVideoMs(session.value, e) : null })))
const activeEvent = computed(() => markers.value.filter(m => m.ms !== null && m.ms <= currentTime.value * 1000).at(-1)?.event.seq)
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
let timer: ReturnType<typeof setInterval> | null = null, loading = false
async function refresh() {
  if (loading) return
  loading = true
  try { status.value = await window.api.overstep.status(); summaries.value = await window.api.overstep.matches(); if (!selected.value && status.value.sessions.length) selected.value = status.value.sessions[0].manifest.matchId }
  catch { error.value = 'Could not read Overstep recordings.' }
  finally { loading = false }
}
async function toggle() {
  busy.value = true; error.value = null
  try { status.value = status.value.enabled ? await window.api.overstep.disable() : await window.api.overstep.enable() }
  catch (e) { error.value = e instanceof Error ? e.message : 'Could not change recording settings.' }
  finally { busy.value = false }
}
function seek(ms: number | null) { if (ms !== null && video.value) { video.value.currentTime = ms / 1000; void video.value.play().catch(() => { error.value = 'Press play to continue the recording.' }) } }
onMounted(() => { void window.api.overstep.policy().then(p => { policy.value = p }).catch(() => { error.value = 'Could not load recording modes.' }); void refresh(); timer = setInterval(() => { void refresh() }, 2000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>
<template>
  <main v-if="uiV3" class="uf-os">
    <header class="uf-os-head uf-rise">
      <div class="uf-os-col">
        <span class="uf-label">Local playtest · Overstep</span>
        <h1 class="uf-d2" style="margin: 0">Overstep integration</h1>
        <p class="uf-t2">Choose which modes to record. Match and weapon stats are collected for every connected match.</p>
      </div>
      <UfButton :variant="status.enabled ? 'secondary' : 'primary'" :disabled="busy" @click="toggle">{{ busy ? 'Updating…' : status.enabled ? 'Disable integration' : 'Enable integration' }}</UfButton>
    </header>
    <p class="uf-t4">Windows: set up OBS in UpForge, enable the integration, then start a new Overstep match. Your integration and mode settings are saved. Files stay on this computer.</p>
    <fieldset class="uf-os-modes">
      <legend class="uf-label">Record video for</legend>
      <label class="uf-t3"><input v-model="policy.recordedModes" type="checkbox" value="circuit" @change="savePolicy" /> Circuit</label>
      <label class="uf-t3"><input v-model="policy.recordedModes" type="checkbox" value="crosscurrent" @change="savePolicy" /> Crosscurrent</label>
      <span class="uf-t4">Changes apply to the next match. Unchecked modes still collect match stats.</span>
    </fieldset>
    <p v-if="status.enabled" role="status" class="uf-t4 uf-os-ok"><span class="uf-os-dot" :class="status.sessions.some(s => ['starting', 'recording', 'finalizing'].includes(s.state)) ? 'uf-live' : ''" />Ready for native Overstep match events. {{ status.sessions.some(s => ['starting', 'recording', 'finalizing'].includes(s.state)) ? 'A capture is in progress.' : 'Start a new match in the game.' }}</p>
    <p v-if="error || status.error" role="alert" class="uf-t4 uf-os-bad">{{ error || status.error }}</p>
    <div class="uf-os-layout">
      <aside class="uf-os-list" aria-label="Recorded matches">
        <span class="uf-label">Matches</span>
        <p v-if="!status.sessions.length" class="uf-t4">Your first match will appear here when Overstep connects.</p>
        <button v-for="s in status.sessions" :key="s.manifest.matchId" type="button" class="uf-os-match" :aria-pressed="selected === s.manifest.matchId" @click="selected = s.manifest.matchId; currentTime = 0">
          <span class="uf-t3">{{ s.manifest.map }} · {{ s.manifest.mode }}</span>
          <span class="uf-t4">{{ new Date(s.manifest.startedAtMs).toLocaleString() }}</span>
          <span class="uf-t4">{{ s.state }} · {{ s.dataState }}</span>
        </button>
      </aside>
      <section v-if="session" class="uf-os-col" aria-label="Match review">
        <span class="uf-label">Local match · 1 human, 5 bots · {{ session.manifest.build }}</span>
        <h2 class="uf-d4" style="margin: 0; text-transform: uppercase">{{ session.manifest.map }} / {{ session.manifest.mode }}</h2>
        <p v-if="stats" class="uf-t2 uf-num"><span class="uf-os-strong">{{ stats.kills }}</span> kills · <span class="uf-os-strong">{{ stats.deaths }}</span> deaths · {{ stats.headshotPercentage === null ? 'No firearm hits yet' : `${stats.headshotPercentage.toFixed(1)}% headshots` }} · {{ stats.outcome ?? 'In progress' }}</p>
        <video v-if="session.videoUrl" :key="session.manifest.matchId" ref="video" class="uf-os-video" :src="session.videoUrl" controls preload="metadata" @timeupdate="currentTime = video?.currentTime ?? 0" @error="error = 'This recording could not play. Check that the video still exists and OBS recorded a supported format.'" />
        <div v-else class="uf-os-video uf-os-novideo uf-t4">{{ ['starting', 'recording', 'finalizing'].includes(session.state) ? 'The recording will be available when this match ends.' : 'No playable recording is available for this match.' }}</div>
        <p v-if="session.dataError" class="uf-t4 uf-os-bad" role="status">{{ session.dataError }}</p>
        <p v-if="session.error" class="uf-t4 uf-os-bad" role="status">{{ session.error }}</p>
        <p v-if="issue" class="uf-t4">{{ issue }} Event seeking is unavailable.</p><p v-else class="uf-t4">Timeline aligned using measured OBS recording timestamps. Events outside the captured interval cannot be selected.</p>
        <span class="uf-label" style="margin-top: 10px">Match timeline</span>
        <div v-if="!issue && durationMs > 0" class="uf-os-track" aria-label="Recorded event positions">
          <button v-for="m in markers.filter(m => m.ms !== null)" :key="m.event.seq" type="button" :style="{ left: `${Math.min(99, m.ms! / durationMs * 100)}%` }" :title="eventLabel(m.event)" :aria-label="`Play ${eventLabel(m.event)}`" @click="seek(m.ms)" />
          <i :style="{ left: `${Math.min(100, currentTime * 1000 / durationMs * 100)}%` }" aria-hidden="true" />
        </div>
        <ol class="uf-os-timeline"><li v-for="m in markers" :key="m.event.seq"><button type="button" :disabled="m.ms === null || !session.videoUrl" :class="{ current: m.event.seq === activeEvent }" @click="seek(m.ms)"><time class="uf-t3 uf-num">{{ clock(m.event.elapsedMs) }}</time><span class="uf-t3">Round {{ m.event.round }} · {{ eventLabel(m.event) }}</span><small class="uf-t4">{{ m.ms === null ? 'Outside verified video' : 'Play moment' }}</small></button></li></ol>
        <p class="uf-t4 uf-os-scope">Native match facts only. Cloud upload and automated Overstep coaching are not enabled.</p>
      </section>
      <section v-else class="uf-os-col uf-os-empty"><p class="uf-t3">Review the moments that matter</p><p class="uf-t4">Keep UpForge open during your match. Completed recordings include a timeline you can click to review what happened.</p></section>
    </div>
  </main>
  <template v-else>
  <main class="overstep-review">
    <header><div><p class="eyebrow">LOCAL PLAYTEST</p><h1>Overstep integration</h1><p>Choose which modes to record. Match and weapon stats are collected for every connected match.</p></div><button :disabled="busy" @click="toggle">{{ busy ? 'Updating…' : status.enabled ? 'Disable integration' : 'Enable integration' }}</button></header>
    <p class="setup">Windows: set up OBS in UpForge, enable the integration, then start a new Overstep match. Your integration and mode settings are saved. Files stay on this computer.</p>
    <fieldset><legend>Record video for</legend><label><input v-model="policy.recordedModes" type="checkbox" value="circuit" @change="savePolicy" /> Circuit</label> <label><input v-model="policy.recordedModes" type="checkbox" value="crosscurrent" @change="savePolicy" /> Crosscurrent</label><p>Changes apply to the next match. Unchecked modes still collect match stats.</p></fieldset>
    <p v-if="status.enabled" role="status" class="enabled">Ready for native Overstep match events. {{ status.sessions.some(s => ['starting', 'recording', 'finalizing'].includes(s.state)) ? 'A capture is in progress.' : 'Start a new match in the game.' }}</p>
    <p v-if="error || status.error" role="alert" class="error">{{ error || status.error }}</p>
    <div class="review-layout">
      <aside aria-label="Recorded matches"><h2>Matches</h2><p v-if="!status.sessions.length">Your first match will appear here when Overstep connects.</p><button v-for="s in status.sessions" :key="s.manifest.matchId" :aria-pressed="selected === s.manifest.matchId" @click="selected = s.manifest.matchId; currentTime = 0"><strong>{{ s.manifest.map }} · {{ s.manifest.mode }}</strong><span>{{ new Date(s.manifest.startedAtMs).toLocaleString() }}</span><span>{{ s.state }} · {{ s.dataState }}</span></button></aside>
      <section v-if="session" class="playback" aria-label="Match review">
        <h2>{{ session.manifest.map }} / {{ session.manifest.mode }}</h2>
        <p class="authority">Local match · 1 human, 5 bots · {{ session.manifest.build }}</p>
        <p v-if="stats">{{ stats.kills }} kills · {{ stats.deaths }} deaths · {{ stats.headshotPercentage === null ? 'No firearm hits yet' : `${stats.headshotPercentage.toFixed(1)}% headshots` }} · {{ stats.outcome ?? 'In progress' }}</p>
        <video v-if="session.videoUrl" :key="session.manifest.matchId" ref="video" :src="session.videoUrl" controls preload="metadata" @timeupdate="currentTime = video?.currentTime ?? 0" @error="error = 'This recording could not play. Check that the video still exists and OBS recorded a supported format.'" />
        <div v-else class="no-video">{{ ['starting', 'recording', 'finalizing'].includes(session.state) ? 'The recording will be available when this match ends.' : 'No playable recording is available for this match.' }}</div>
        <p v-if="session.dataError" class="error" role="status">{{ session.dataError }}</p>
        <p v-if="session.error" class="error" role="status">{{ session.error }}</p>
        <p v-if="issue" class="sync-note">{{ issue }} Event seeking is unavailable.</p><p v-else class="sync-note">Timeline aligned using measured OBS recording timestamps. Events outside the captured interval cannot be selected.</p>
        <h3>Match timeline</h3>
        <div v-if="!issue && durationMs > 0" class="timeline-track" aria-label="Recorded event positions">
          <button v-for="m in markers.filter(m => m.ms !== null)" :key="m.event.seq" :style="{ left: `${Math.min(99, m.ms! / durationMs * 100)}%` }" :title="eventLabel(m.event)" :aria-label="`Play ${eventLabel(m.event)}`" @click="seek(m.ms)" />
          <i :style="{ left: `${Math.min(100, currentTime * 1000 / durationMs * 100)}%` }" aria-hidden="true" />
        </div>
        <ol class="timeline"><li v-for="m in markers" :key="m.event.seq"><button :disabled="m.ms === null || !session.videoUrl" :class="{ current: m.event.seq === activeEvent }" @click="seek(m.ms)"><time>{{ clock(m.event.elapsedMs) }}</time><span>Round {{ m.event.round }} · {{ eventLabel(m.event) }}</span><small>{{ m.ms === null ? 'Outside verified video' : 'Play moment' }}</small></button></li></ol>
        <p class="scope">Native match facts only. Cloud upload and automated Overstep coaching are not enabled.</p>
      </section>
      <section v-else class="empty"><h2>Review the moments that matter</h2><p>Keep UpForge open during your match. Completed recordings include a timeline you can click to review what happened.</p></section>
    </div>
  </main>
  </template>
</template>
<style scoped>
.overstep-review{padding:32px;max-width:1500px;margin:auto;color:#e7ebf0}header{display:flex;justify-content:space-between;align-items:center;gap:24px}h1{font-size:28px;font-weight:650;margin:4px 0 8px}h2{font-size:18px;font-weight:600;margin-bottom:12px}h3{font-size:16px;font-weight:600;margin:22px 0 12px}p{color:#aab5c4;line-height:1.6}.eyebrow{font-size:11px;letter-spacing:.14em;color:#7fabe0}button{border:1px solid #354354;background:#1b2939;color:inherit;padding:10px 16px;border-radius:5px;cursor:pointer}button:focus-visible{outline:2px solid #8dc4ff;outline-offset:3px}button:disabled{opacity:.55;cursor:default}.setup{margin:20px 0 12px;font-size:13px;max-width:1000px}.enabled{color:#a1d4b2}.error{color:#efb39f}.review-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:28px;margin-top:28px}aside{border-right:1px solid #303b48;padding-right:20px}aside button{display:flex;flex-direction:column;text-align:left;gap:5px;width:100%;margin-bottom:10px;background:transparent}aside button[aria-pressed=true]{border-color:#85baff;background:#172739}aside span{color:#aab5c4;font-size:12px}aside strong{font-size:13px;font-weight:500}.authority,.sync-note,.scope{font-size:12px;margin:10px 0}video,.no-video{width:100%;background:#090e15;aspect-ratio:16/9}.no-video{display:grid;place-items:center;padding:30px;text-align:center;color:#aab5c4}.timeline-track{position:relative;height:38px;background:#162331;margin:10px 0 20px}.timeline-track button{position:absolute;top:9px;height:20px;width:8px;padding:0;border:0;background:#8ab9e9;border-radius:1px}.timeline-track i{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none}.timeline{list-style:none;padding:0;max-height:420px;overflow:auto}.timeline button{display:flex;width:100%;gap:16px;align-items:center;text-align:left;background:transparent;border:0;border-bottom:1px solid #293440;border-radius:0}.timeline time{font-variant-numeric:tabular-nums;color:#9cb4d0;min-width:44px}.timeline small{margin-left:auto;color:#9ba8b9}.timeline .current{background:#213b56}.empty{padding:60px 30px}.scope{border-top:1px solid #303b48;padding-top:16px}@media(max-width:850px){.overstep-review{padding:20px}header{align-items:flex-start;flex-direction:column}.review-layout{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid #303b48;padding-bottom:16px}.timeline small{display:none}}
</style>

<style scoped>
.uf-os { height: 100%; overflow: auto; padding: 32px 40px 48px; background: var(--uf-bg); color: var(--uf-bone); display: flex; flex-direction: column; gap: 16px; }
.uf-os p { margin: 0; }
.uf-os-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.uf-os-head > button { flex: none; white-space: nowrap; }
.uf-os-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.uf-os-modes { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 24px; border: 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); padding: 14px 0; margin: 0; }
.uf-os-modes legend { float: left; margin-right: 8px; padding: 0; }
.uf-os-modes label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.uf-os-modes input { accent-color: var(--uf-red); width: 16px; height: 16px; }
.uf-os-ok { display: flex; align-items: center; gap: 8px; color: var(--uf-muted); }
.uf-os-dot { width: 6px; height: 6px; background: var(--uf-win); flex: none; }
.uf-os-bad { color: var(--uf-loss); }
.uf-os-strong { color: var(--uf-bone); font-weight: 600; }
.uf-os-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 32px; margin-top: 8px; }
.uf-os-list { display: flex; flex-direction: column; gap: 6px; padding-right: 24px; border-right: 1px solid var(--uf-line); }
.uf-os-match { display: flex; flex-direction: column; gap: 3px; text-align: left; background: none; border: 0; border-left: 2px solid transparent; padding: 10px 12px; color: inherit; cursor: pointer; }
.uf-os-match:hover { background: var(--uf-hover); }
.uf-os-match[aria-pressed=true] { border-left-color: var(--uf-red); background: var(--uf-raised); }
.uf-os-video { width: 100%; aspect-ratio: 16 / 9; background: #000; }
.uf-os-novideo { display: grid; place-items: center; padding: 30px; text-align: center; background: var(--uf-raised); }
.uf-os-track { position: relative; height: 32px; background: var(--uf-raised); }
.uf-os-track button { position: absolute; top: 8px; height: 16px; width: 4px; padding: 0; border: 0; background: var(--uf-muted); cursor: pointer; }
.uf-os-track button:hover { background: var(--uf-bone); }
.uf-os-track i { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--uf-red); pointer-events: none; }
.uf-os-timeline { list-style: none; padding: 0; margin: 0; max-height: 420px; overflow: auto; }
.uf-os-timeline button { display: flex; width: 100%; gap: 16px; align-items: center; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--uf-line); padding: 10px 8px; color: inherit; cursor: pointer; }
.uf-os-timeline button:hover:not(:disabled) { background: var(--uf-hover); }
.uf-os-timeline button:disabled { cursor: default; opacity: 0.6; }
.uf-os-timeline button.current { background: var(--uf-raised); box-shadow: inset 2px 0 0 var(--uf-red); }
.uf-os-timeline time { min-width: 48px; color: var(--uf-muted); }
.uf-os-timeline small { margin-left: auto; }
.uf-os-scope { padding-top: 14px; border-top: 1px solid var(--uf-line); }
.uf-os-empty { padding: 40px 0; }
@media (max-width: 850px) { .uf-os-layout { grid-template-columns: 1fr; } .uf-os-list { border-right: 0; padding-right: 0; border-bottom: 1px solid var(--uf-line); padding-bottom: 14px; } }
</style>
