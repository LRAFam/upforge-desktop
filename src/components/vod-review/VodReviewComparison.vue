<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue'
import { useVodReview, type RecordingTimeline } from '../../composables/useVodReview'
import { reviewEventStart, reviewVideoUrl, parseReviewTime } from '../../lib/review-media'
import { ReviewComparison, validComparisonLoop, comparisonPlayerLabel, type ComparisonSide } from '../../lib/review-comparison'

import { resolveNotebookFootage } from '../../lib/review-recovery'
import VodWorkspaceDivider from './VodWorkspaceDivider.vue'
import { comparisonPanelWidths, nearbyReviewEvent } from '../../lib/review-workspace'
import { reviewNoteMarkers, groupReviewNoteMarkers, type ReviewNoteMarker, type ReviewNoteMarkerGroup } from '../../lib/review-note-markers'
import VodReviewNotebook from './VodReviewNotebook.vue'
import VodWorkspaceCoach from './VodWorkspaceCoach.vue'
import type { CoachMoment } from '../../lib/workspace-coach'
import { validNotebookContext, relinkNotebookContext, sameNotebookSource, type NotebookRelink, type SavedComparison, type NotebookContext, type NotebookMoment, type NotebookSource } from '../../lib/review-notebook'
import VodComparisonSourcePicker from './VodComparisonSourcePicker.vue'
import { buildReviewEvents } from '../../lib/review-timeline'
import { killSourceLabel } from '../../lib/match-kill-display'

const props = defineProps<{ initialComparisonId?: string; trial?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { comparisonEventShift, currentTime, ownPuuid, eventVideoSeconds, formatSeconds, timeline } = useVodReview()
const notebookOpen = ref(true)
const sidePanel = ref<'notebook' | 'coach'>('notebook')
const coachMoments = computed<CoachMoment[] | null>(() => {
  const ids = sources.value.map(source => source.analysisId)
  if (ids.some(id => !Number.isInteger(id) || !id || id < 1)) return null
  return ([0, 1] as const).map(side => ({ analysis_id: ids[side]!, position: times.value[side], round: momentsBySide.value[side].find(m => String(m.id) === selectedIds.value[side])?.round ?? null }))
})
const notebookItems = ref<SavedComparison[]>([])
const selectedNoteGroup = ref<{ side: ComparisonSide; key: number } | null>(null)
const layoutKey = 'upforge-comparison-layout-v1'
let savedWidths = comparisonPanelWidths(null)
try { savedWidths = comparisonPanelWidths(JSON.parse(localStorage.getItem(layoutKey) || 'null')) } catch { /* Use default panel sizes when preferences are unavailable. */ }
const videoSplit = ref(savedWidths.videos)
const notebookWidth = ref(savedWidths.notebook)
watch([videoSplit, notebookWidth], () => {
  try { localStorage.setItem(layoutKey, JSON.stringify({ version: 1, videos: videoSplit.value, notebook: notebookWidth.value })) } catch { /* Resizing still works for this session. */ }
})
function resetComparisonLayout() { videoSplit.value = 50; notebookWidth.value = 24; notebookOpen.value = true; expanded.value = null; swapped.value = false }
const restoredPositions = ref<[number | null, number | null]>([null, null])
const notebook = ref<InstanceType<typeof VodReviewNotebook> | null>(null)
const coach = ref<InstanceType<typeof VodWorkspaceCoach> | null>(null)
const coachOpened = ref(false)
function openCoach() { coachOpened.value = true; sidePanel.value = 'coach'; notebookOpen.value = true }
const restoring = ref(false)
const recovery = ref<{ context: NotebookContext; original: NotebookContext; attachment: 'a' | 'b' | 'both'; item: SavedComparison; failed: ComparisonSide[]; changes: NotebookRelink[]; ready: boolean } | null>(null)
const replacementSide = ref<ComparisonSide | null>(null)
const savingReplacement = ref(false)
let restoreGeneration = 0
const pendingMoments: [NotebookMoment | null, NotebookMoment | null] = [null, null]
let pendingContext: NotebookContext | null = null
const initialTime = currentTime.value
const sources = ref<[RecordingTimeline, RecordingTimeline]>([timeline.value!, timeline.value!])
const sourceKeys = ref<[string, string]>(['current', 'current'])
const pickerSide = ref<ComparisonSide | null>(null)
const sourceCorrections = ref<Record<string, number>>({})
const sourceRevision = ref<[number, number]>([0, 0])
function shiftFor(side: ComparisonSide) { return sourceKeys.value[side] === 'current' ? comparisonEventShift.value : (sourceCorrections.value[sourceKeys.value[side]] ?? 0) }
function playerLabel(side: ComparisonSide, name: string | null | undefined, puuid?: string): string {
  return comparisonPlayerLabel(name, puuid, ownPuuid.value, sources.value[side].teamSnapshot)
}

const markerWidths = ref<[number, number]>([0, 0])
const markerResize = new ResizeObserver(entries => {
  for (const entry of entries) {
    const side = players.indexOf(entry.target as HTMLVideoElement)
    if (side === 0 || side === 1) markerWidths.value[side] = Math.max(0, entry.contentRect.width - 24)
  }
})
const players: [HTMLVideoElement | null, HTMLVideoElement | null] = [null, null]
const times = ref<[number, number]>([initialTime, initialTime])
const durations = ref<[number, number]>([0, 0])
const playing = ref<[boolean, boolean]>([false, false])
const errors = ref<[boolean, boolean]>([false, false])
const audio = ref<ComparisonSide | null>(0)
const linked = ref(false)
const speed = ref(1)
const starts = ref<[number, number]>([initialTime, initialTime])
const loopEnabled = ref(false)
const loopIn = ref(0)
const loopOut = ref(8)
let restartingLoop = false
const volume = ref(1)
const loopValid = computed(() => validComparisonLoop(starts.value, durations.value, loopIn.value, loopOut.value))
const controlsReady = computed(() => !restoring.value && durations.value.every(d => d > 0) && !errors.value.some(Boolean))
const swapped = ref(false)
const expanded = ref<ComparisonSide | null>(null)
const message = ref('')
const timeDrafts = ref<[string, string]>(['', ''])
const timeErrors = ref<[string, string]>(['', ''])
const selectedIds = ref<[string, string]>(['', ''])
const roundFilters = ref<[string, string]>(['', ''])
const typeFilters = ref<[string, string]>(['', ''])
const filteredMoments = computed(() => momentsBySide.value.map((moments, side) => moments.filter(moment =>
  (!roundFilters.value[side] || String(moment.round) === roundFilters.value[side]) &&
  (!typeFilters.value[side] || moment.type === typeFilters.value[side]))))
const roundOptions = computed(() => momentsBySide.value.map(moments => [...new Set(moments.flatMap(m => m.round == null ? [] : [m.round]))].sort((a, b) => a - b)))
const typeOptions = computed(() => momentsBySide.value.map(moments => [...new Set(moments.map(m => m.type))]))
for (const side of [0, 1] as const) watch(() => sourceRevision.value[side], () => { roundFilters.value[side] = ''; typeFilters.value[side] = ''; timeDrafts.value[side] = ''; timeErrors.value[side] = '' })
const engine = new ReviewComparison(side => players[side])
const sides = computed<ComparisonSide[]>(() => swapped.value ? [1, 0] : [0, 1])
const momentsBySide = computed(() => ([0, 1] as const).map(side => buildReviewEvents(sources.value[side], ownPuuid.value).flatMap((event, index) => {
  const recordedSeconds = eventVideoSeconds(event)
  const seconds = recordedSeconds == null ? null : recordedSeconds + shiftFor(side)
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return []
  const seekSeconds = reviewEventStart(seconds, event.type)
  if (seekSeconds == null) return []
  const round = event.round == null ? '' : `R${event.round + 1} · `
  let description: string
  const details: string[] = []
  if (event.type === 'kill' || event.type === 'death' || event.type === 'neutral') {
    const killer = playerLabel(side, event.killerName, event.killerPuuid)
    const victim = playerLabel(side, event.victimName, event.victimPuuid)
    if (event.type === 'kill') description = victim ? `You killed ${victim}` : 'Your kill (opponent unavailable)'
    else if (event.type === 'death') description = killer ? `Killed by ${killer}` : 'Your death (opponent unavailable)'
    else description = `${killer || 'Unknown player'} killed ${victim || 'unknown player'}`
    const source = killSourceLabel({ ...event, killerAgent: sources.value[side].teamSnapshot.find(p => p.puuid === event.killerPuuid)?.agent })
    if (source) details.push(source)
  } else if (event.type === 'plant' || event.type === 'defuse' || event.type === 'detonation') {
    description = { plant: 'Spike planted', defuse: 'Spike defused', detonation: 'Spike detonated' }[event.type]
    if (event.site) details.push(`Site ${event.site}`)
    const actor = event.type === 'plant' ? event.planter : event.type === 'defuse' ? event.defuser : null
    if (actor) details.push(`by ${playerLabel(side, actor)}`)
  } else {
    description = event.type.charAt(0).toUpperCase() + event.type.slice(1)
    if (event.detail) details.push(event.detail)
    if (event.team) details.push(event.team)
    if (event.stolen) details.push('Stolen')
  }
  return [{ id: index, round: event.round, seconds, seekSeconds, type: event.type, label: `${round}${formatSeconds(seconds)} · ${[description, ...details].join(' · ')}` }]
})))
watch([comparisonEventShift, sourceCorrections], () => {
  if (restoring.value) return
  loopEnabled.value = false
  restartingLoop = false
  engine.unlink()
  linked.value = false
  message.value = 'Event timing adjusted for this comparison session. Select a moment to seek again.'
})
function setTiming(side: ComparisonSide, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || Math.abs(value) > 120) return
  if (sourceKeys.value[side] === 'current') comparisonEventShift.value = value
  else sourceCorrections.value = { ...sourceCorrections.value, [sourceKeys.value[side]]: value }
}
function setPlayer(side: ComparisonSide, el: Element | ComponentPublicInstance | null) {
  if (players[side]) markerResize.unobserve(players[side]!)
  players[side] = el instanceof HTMLVideoElement ? el : null
  if (players[side]) markerResize.observe(players[side]!)
}
function loaded(side: ComparisonSide) {
  const player = players[side]
  if (!player || !Number.isFinite(player.duration) || player.duration <= 0) return
  durations.value[side] = player.duration
  const pending = pendingMoments[side]
  if (pending) restoredPositions.value[side] = pending.position
  if (pending && (pending.position > player.duration || pending.start > player.duration)) {
    errors.value[side] = true
    if (recovery.value) { recovery.value.ready = false; recovery.value.failed = [...new Set([...recovery.value.failed, side])] }
    pendingMoments[side] = null
    pendingContext = null
    message.value = 'Saved position is outside this recording. Your notes are unchanged.'
    return
  }
  player.currentTime = pending ? pending.position : Math.min(sourceKeys.value[side] === 'current' ? initialTime : 0, player.duration)
  player.playbackRate = speed.value
  times.value[side] = player.currentTime
  starts.value[side] = pending ? pending.start : player.currentTime
  pendingMoments[side] = null
  if (recovery.value && pendingMoments.every(m => m === null) && !errors.value.some(Boolean)) recovery.value.ready = true
  if (pendingContext && pendingMoments.every(m => m === null) && !errors.value.some(Boolean)) {
    const context = pendingContext
    pendingContext = null
    linked.value = context.linked && engine.align(starts.value)
    loopEnabled.value = linked.value && context.loop.enabled && loopValid.value
    message.value = 'Saved moments restored. Playback is paused.'
  }
}
function seek(side: ComparisonSide, seconds: number) {
  restartingLoop = false
  engine.seek(side, seconds)
  for (const i of [0, 1] as const) if (players[i]) times.value[i] = players[i]!.currentTime
  message.value = ''
}
function selectMoment(side: ComparisonSide, id: string) {
  const moment = momentsBySide.value[side].find(m => String(m.id) === id)
  if (!moment) return
  loopEnabled.value = false
  const wasLinked = linked.value
  // A new event replaces this side's alignment, so the old shared bounds must not clamp it.
  if (wasLinked) { engine.unlink(); linked.value = false }
  seek(side, moment.seekSeconds)
  starts.value[side] = players[side]!.currentTime
  restoredPositions.value[side] = null
  selectedIds.value[side] = String(moment.id)
  if (wasLinked) message.value = 'Playback unlinked for the new moment. Link again when both positions are ready.'
}
function sourceDescription(side: ComparisonSide) {
  const source = sources.value[side]
  const date = source.recordedAt > 0 && Number.isFinite(source.recordedAt)
    ? new Date(source.recordedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
  return [source.map, source.agent, date].filter(Boolean).join(' · ')
}
function momentContext(side: ComparisonSide) {
  const selected = selectedLabel(side)
  if (selected) return `Selected: ${selected}`
  const restored = restoredPositions.value[side]
  const nearby = nearbyReviewEvent(momentsBySide.value[side], restored ?? times.value[side], restored === null ? 4 : 10)
  if (restored !== null) return `Saved: ${preciseTime(restored)}${nearby ? ` · Nearby: ${nearby.label}` : ''}`
  return nearby ? `Nearby: ${nearby.label}` : 'Choose an event or seek to a moment'
}
function selectedLabel(side: ComparisonSide) {
  return momentsBySide.value[side].find(m => String(m.id) === selectedIds.value[side])?.label
}

async function toggle(side: ComparisonSide) {
  if (linked.value && loopEnabled.value) { await toggleBoth(); return }
  restartingLoop = false
  if (players[side] && !players[side]!.paused) { engine.pause(linked.value ? undefined : side); return }
  message.value = ''
  if (!await engine.play(side)) message.value = 'Playback paused. Wait for both videos to load, or choose an earlier moment, then press Play.'
}
function align() {
  if (linked.value) { engine.unlink(); linked.value = false; loopEnabled.value = false; restartingLoop = false; return }
  linked.value = engine.align(starts.value)
  if (linked.value) backToStarts()
  message.value = linked.value ? 'Playback linked to the A/B start points.' : 'Wait for both videos to load before linking.'
}
function ended(side: ComparisonSide) {
  if (linked.value && loopEnabled.value && loopValid.value) {
    if (!restartingLoop) restartLoop()
  } else interrupt(side)
}
function interrupt(side: ComparisonSide, failed = false) {
  if (restartingLoop && !failed) return
  restartingLoop = false
  if (failed) { errors.value[side] = true; engine.pause(); if (recovery.value) { recovery.value.ready = false; recovery.value.failed = [...new Set([...recovery.value.failed, side])] } }
  else engine.interrupt()
  if (linked.value) message.value = failed ? 'A recording could not be played. Use Change footage to retry or select another recording.' : 'Linked playback paused because a video is buffering or has ended. Press Play when ready.'
}
function openPicker(side: ComparisonSide) {
  recovery.value = null; replacementSide.value = null
  restoreGeneration++; pendingContext = null; pendingMoments.fill(null); restoring.value = false
  restartingLoop = false
  engine.pause()
  pickerSide.value = side
}
function changeSource(key: string, source: RecordingTimeline) {
  if (replacementSide.value !== null && recovery.value) {
    const state = recovery.value
    const side = replacementSide.value
    const from = state.original.moments[side].source
    const kind = key.startsWith('recording:') ? 'recording' : key.startsWith('analysis:') ? 'analysis' : source.analysisId != null ? 'analysis' : 'recording'
    const id = key === 'current' ? (kind === 'analysis' ? String(source.analysisId) : source.id) : key.slice(key.indexOf(':') + 1)
    const to: NotebookSource = { kind, id, game: source.game, label: [source.map, source.agent].filter(Boolean).join(' · ') }
    state.changes = [...state.changes.filter(change => !sameNotebookSource(change.from, from)), { from, to }]
    state.context = relinkNotebookContext(state.original, state.changes)
    pickerSide.value = null; replacementSide.value = null
    void restoreContext(state.context, state.attachment, state.item, true)
    return
  }
  const side = pickerSide.value
  if (side === null) return
  engine.unlink()
  linked.value = false
  loopEnabled.value = false
  restartingLoop = false
  sources.value[side] = source
  sourceKeys.value[side] = key
  sourceRevision.value[side]++
  durations.value[side] = 0
  times.value[side] = key === 'current' ? initialTime : 0
  starts.value[side] = times.value[side]
  playing.value[side] = false
  errors.value[side] = false
  selectedIds.value[side] = ''
  restoredPositions.value[side] = null
  pickerSide.value = null
  message.value = 'Footage changed. Choose a moment and set its start before linking again.'
}
function close() { if (coach.value && !coach.value.canClose()) return; if (notebook.value && !notebook.value.canClose()) return; restartingLoop = false; engine.pause(); emit('close') }
onBeforeUnmount(() => { markerResize.disconnect(); restoreGeneration++; cleanupAccount.forEach(fn => fn()); restartingLoop = false; engine.pause() })
function setStart(side: ComparisonSide) {
  engine.unlink()
  linked.value = false
  loopEnabled.value = false
  restartingLoop = false
  starts.value[side] = times.value[side]
  message.value = 'Start point set. Link playback again to use the new alignment.'
}
function backToStarts() {
  restartingLoop = false
  engine.pause()
  if (linked.value) seek(0, starts.value[0])
  else { seek(0, starts.value[0]); seek(1, starts.value[1]) }
}
async function toggleBoth() {
  restartingLoop = false
  if (playing.value.some(Boolean)) { engine.pause(); return }
  if (loopEnabled.value && loopValid.value) {
    const offset = times.value[0] - starts.value[0]
    if (offset < loopIn.value || offset >= loopOut.value) {
      restartLoop()
      return
    }
  }
  if (!await engine.playBoth()) message.value = 'Both videos need to be ready to play. Wait for loading to finish and try again.'
}
function restartLoop() {
  engine.pause()
  engine.seek(0, starts.value[0] + loopIn.value)
  restartingLoop = true
  void resumeLoop()
}
async function resumeLoop() {
  if (!restartingLoop || !players.every(p => p && !p.seeking && p.readyState >= 3)) return
  restartingLoop = false
  if (!await engine.playBoth()) message.value = 'Loop paused while footage loads. Press Play both to resume.'
}
function updateTime(side: ComparisonSide) {
  if (!players[side]) return
  times.value[side] = players[side]!.currentTime
  if (linked.value && loopEnabled.value && loopValid.value && !restartingLoop && playing.value.some(Boolean)
    && times.value[side] - starts.value[side] >= loopOut.value) restartLoop()
}
watch([loopIn, loopOut], () => { restartingLoop = false; engine.pause(); if (!loopValid.value) loopEnabled.value = false })
function toggleLoop() {
  restartingLoop = false
  engine.pause()
  loopEnabled.value = !loopEnabled.value
}
async function fullscreen(side: ComparisonSide) {
  try {
    const frame = players[side]?.closest('article')
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (frame) await frame.requestFullscreen()
  } catch { message.value = 'Fullscreen is unavailable in this window.' }
}
function goToTime(side: ComparisonSide) {
  const target = parseReviewTime(timeDrafts.value[side])
  if (target === null || target > durations.value[side]) {
    timeErrors.value[side] = `Enter a time from 0:00 to ${formatSeconds(durations.value[side])}, such as 6:11.250.`
    return
  }
  // A direct timestamp is independent navigation, not a request to clamp linked footage.
  engine.unlink(); linked.value = false; loopEnabled.value = false
  selectedIds.value[side] = ''; restoredPositions.value[side] = null
  seek(side, target); timeErrors.value[side] = ''
}
function preciseTime(seconds: number) { return `${formatSeconds(seconds)}.${Math.floor((seconds % 1) * 10)}` }

function canonicalSource(side: ComparisonSide): NotebookSource | null {
  const source = sources.value[side]
  const key = sourceKeys.value[side]
  const kind = key.startsWith('recording:') ? 'recording' : key.startsWith('analysis:') ? 'analysis' : source.analysisId != null ? 'analysis' : 'recording'
  const id = key === 'current' ? (kind === 'analysis' ? String(source.analysisId) : source.id) : key.slice(key.indexOf(':') + 1)
  if (!id) return null
  return { kind, id, game: source.game, label: [source.map, source.agent].filter(Boolean).join(' · ') }
}
const noteGroups = computed(() => ([0, 1] as const).map(side => groupReviewNoteMarkers(reviewNoteMarkers(notebookItems.value, canonicalSource(side), durations.value[side]), durations.value[side], markerWidths.value[side])))
watch([sourceKeys, notebookItems, markerWidths], () => { selectedNoteGroup.value = null }, { deep: true })
function openNoteMarker(marker: ReviewNoteMarker) {
  if (notebook.value?.openSavedNote(marker.item, marker.note)) { notebookOpen.value = true; sidePanel.value = 'notebook'; selectedNoteGroup.value = null }
}
function selectNoteGroup(side: ComparisonSide, group: ReviewNoteMarkerGroup) {
  if (group.markers.length === 1) openNoteMarker(group.markers[0])
  else selectedNoteGroup.value = selectedNoteGroup.value?.side === side && selectedNoteGroup.value.key === group.key ? null : { side, key: group.key }
}
function noteGroupLabel(group: ReviewNoteMarkerGroup) {
  return group.markers.length === 1 ? `Saved note at ${preciseTime(group.markers[0].seconds)}: ${group.markers[0].note.text}` : `${group.markers.length} saved note positions near ${preciseTime(group.markers[0].seconds)}`
}
function captureContext(): NotebookContext | null {
  if (!controlsReady.value || restoring.value) return null
  const a = canonicalSource(0), b = canonicalSource(1)
  if (!a || !b) return null
  const moment = (side: ComparisonSide, source: NotebookSource): NotebookMoment => ({ source, position: times.value[side], start: starts.value[side], eventShift: shiftFor(side) })
  return { version: 1, moments: [moment(0, a), moment(1, b)], linked: linked.value, speed: speed.value, loop: { enabled: loopEnabled.value, from: loopIn.value, to: loopOut.value } }
}
async function restoreContext(context: NotebookContext, attachment: 'a' | 'b' | 'both', item: SavedComparison, retry = false) {
  if (!validNotebookContext(context)) { message.value = 'This saved comparison has invalid coordinates.'; return }
  if (context.moments[0].source.game !== timeline.value?.game) { message.value = 'Open a review for that game to restore these moments.'; return }
  if (!retry) recovery.value = { context, original: context, attachment, item, failed: [], changes: [], ready: false }
  if (recovery.value) { recovery.value.ready = false; recovery.value.failed = [] }
  const generation = ++restoreGeneration
  restoring.value = true; restartingLoop = false; engine.pause(); message.value = 'Opening saved footage…'
  try {
    const { failed, loaded: loadedSources } = await resolveNotebookFootage(context, attachment, async ref =>
      (ref.kind === 'analysis' ? await window.api.analyses.getTimeline(Number(ref.id)) : await window.api.recordings.getTimeline(ref.id)) as RecordingTimeline | null)
    if (generation !== restoreGeneration) return
    if (failed.length) {
      if (recovery.value) recovery.value.failed = failed
      message.value = 'Some saved footage is unavailable. Your current footage and notes are unchanged.'
      return
    }
    engine.unlink(); linked.value = false; loopEnabled.value = false
    pendingMoments.fill(null)
    pendingContext = attachment === 'both' ? context : null
    speed.value = context.speed
    engine.setSpeed(context.speed)
    loopIn.value = context.loop.from; loopOut.value = context.loop.to
    for (const { side, source, key } of loadedSources) {
      pendingMoments[side] = context.moments[side]
      sources.value[side] = source; sourceKeys.value[side] = key
      sourceCorrections.value = { ...sourceCorrections.value, [key]: context.moments[side].eventShift }
      times.value[side] = context.moments[side].position; starts.value[side] = context.moments[side].start
      durations.value[side] = 0; errors.value[side] = false; selectedIds.value[side] = ''; sourceRevision.value[side]++
    }
    await nextTick()
    message.value = 'Loading saved positions. Playback will stay paused.'
  } catch {
    if (generation === restoreGeneration) message.value = 'Saved footage is unavailable. Your notes and current footage have been kept. Try again after reconnecting or restoring the recording.'
  } finally { if (generation === restoreGeneration) restoring.value = false }
}
function chooseReplacement(side: ComparisonSide) {
  engine.pause(); restartingLoop = false; replacementSide.value = side; pickerSide.value = side
}
function cancelRecovery() { restoreGeneration++; recovery.value = null; pendingContext = null; pendingMoments.fill(null); restoring.value = false; replacementSide.value = null; pickerSide.value = null }
async function saveReplacement() {
  const state = recovery.value
  if (!state?.ready || !state.changes.length || savingReplacement.value) return
  savingReplacement.value = true
  const saved = await notebook.value?.saveRelink(state.item, state.changes)
  savingReplacement.value = false
  if (saved && recovery.value === state) recovery.value = null
}

const cleanupAccount = [window.api.on('session:user-changed', () => { restoreGeneration++; engine.pause(); emit('close') }), window.api.on('auth:session-expired', () => { restoreGeneration++; engine.pause(); emit('close') })]

</script>

<template>
  <section class="comparison" aria-label="Compare moments" @keydown.stop>
    <header class="comparison-header">
      <div class="comparison-title">
        <button type="button" class="back" @click="close">Back</button>
        <h1>Compare moments</h1>
        <span class="match-context">{{ timeline?.map }}</span>
      </div>
      <div class="comparison-actions">
        <button type="button" :aria-pressed="notebookOpen" @click="notebookOpen = !notebookOpen">Review tools</button>
        <button type="button" :aria-pressed="linked" :disabled="restoring || durations.some(d => !d) || errors.some(Boolean)" @click="align">{{ linked ? 'Unlink playback' : 'Link playback' }}</button>
        <label>Speed <select v-model="speed" :disabled="restoring" @change="engine.setSpeed(speed)"><option v-for="rate in [0.25, 0.5, 1, 1.5, 2]" :key="rate" :value="rate">{{ rate }}×</option></select></label>
        <details class="comparison-settings" :inert="restoring"><summary>Options</summary>
          <div class="options-panel">
            <button type="button" @click="swapped = !swapped">Swap left and right</button>
            <button type="button" @click="resetComparisonLayout">Reset layout</button>
            <label v-for="side in ([0, 1] as const)" :key="side" class="timing-adjustment">{{ side === 0 ? 'A' : 'B' }} event timing (seconds)
              <input type="number" min="-120" max="120" step="0.1" :value="shiftFor(side)" @change="setTiming(side, $event)" />
            </label>
            <p>Negative moves events earlier for this review session.</p>
            <p>Set each start, then link playback. Loop offsets are measured from those starts.</p>
            <p>Start points and loops last for this comparison. Fine seeking uses 0.1-second steps.</p>
          </div>
        </details>
      </div>
    </header>
    <div class="comparison-toolstrip" :inert="restoring">
    <div class="transport" aria-label="Comparison playback controls">
      <button type="button" class="primary" :disabled="!controlsReady" @click="toggleBoth">{{ playing.some(Boolean) ? 'Pause both' : 'Play both' }}</button>
      <button type="button" :disabled="!controlsReady" @click="backToStarts">Back to starts</button>
      <label>Volume <input v-model.number="volume" type="range" min="0" max="1" step="0.05" /></label>
    </div>
    <div class="transport" aria-label="Loop selection">
      <button type="button" :aria-pressed="loopEnabled" :disabled="!linked || !loopValid" :title="linked ? 'Repeat the chosen range from both starts' : 'Link playback to enable looping'" @click="toggleLoop">{{ loopEnabled ? 'Loop on' : 'Loop off' }}</button>
      <label>In + <input v-model.number="loopIn" type="number" min="0" step="0.1" /> s</label>
      <label>Out + <input v-model.number="loopOut" type="number" min="0" step="0.1" /> s</label>
      <span v-if="linked && !loopValid" role="status">Range must fit both videos.</span>
    </div>
    </div>
    <p v-if="message" class="comparison-message" role="status">{{ message }}</p>
    <div v-if="recovery && (recovery.failed.length || recovery.changes.length)" class="recovery-panel" role="region" aria-label="Recover saved footage">
      <p>Use the same full recording. Trimmed or different footage will not match saved timestamps.</p>
      <div v-for="side in recovery.failed" :key="side">
        <span>Moment {{ side === 0 ? 'A' : 'B' }} · {{ recovery.context.moments[side].source.label }} is unavailable.</span>
        <button type="button" :disabled="restoring || savingReplacement" @click="chooseReplacement(side)">Choose replacement for {{ side === 0 ? 'A' : 'B' }}</button>
      </div>
      <button type="button" :disabled="restoring || savingReplacement" @click="restoreContext(recovery.context, recovery.attachment, recovery.item, true)">Retry saved footage</button>
      <button v-if="recovery.changes.length" type="button" :disabled="!recovery.ready || restoring || savingReplacement" @click="saveReplacement">{{ savingReplacement ? 'Saving…' : 'Save replacement links' }}</button>
      <button type="button" :disabled="savingReplacement" @click="cancelRecovery">Dismiss</button>
      <p v-if="recovery.changes.length">Replacement is a preview until you save its links. Notes and timestamps will be retained.</p>
    </div>
    <div class="comparison-workspace" :style="{ '--workspace-columns': `minmax(0, ${100 - notebookWidth}fr) 10px minmax(260px, ${notebookWidth}fr)` }" :class="{ 'with-notebook': notebookOpen }">
    <div class="comparison-players" :style="{ '--player-columns': `${videoSplit}fr 10px ${100 - videoSplit}fr` }" :inert="restoring" :class="{ expanded: expanded !== null }">
      <template v-for="(side, index) in sides" :key="side">
      <article v-show="expanded === null || expanded === side" class="comparison-player" :aria-label="`Moment ${side === 0 ? 'A' : 'B'}`">
        <div class="player-heading">
          <h2>Moment {{ side === 0 ? 'A' : 'B' }}</h2>
          <button type="button" @click="openPicker(side)">Change footage</button>
          <button type="button" @click="expanded = expanded === side ? null : side">{{ expanded === side ? 'Show both' : 'Expand' }}</button>
        </div>
        <p class="source-caption" :title="sourceDescription(side)">{{ sourceDescription(side) }}</p>
        <div class="moment-filters">
          <select v-model="roundFilters[side]" :aria-label="`Round filter for moment ${side === 0 ? 'A' : 'B'}`"><option value="">All rounds</option><option v-for="round in roundOptions[side]" :key="round" :value="String(round)">Round {{ round + 1 }}</option></select>
          <select v-model="typeFilters[side]" :aria-label="`Event filter for moment ${side === 0 ? 'A' : 'B'}`"><option value="">All events</option><option v-for="type in typeOptions[side]" :key="type" :value="type">{{ type.charAt(0).toUpperCase() + type.slice(1) }}</option></select>
          <span aria-live="polite">{{ filteredMoments[side].length }} moments</span>
        </div>
        <label class="moment-picker">Jump to event
          <select :value="selectedIds[side]" :disabled="!durations[side] || errors[side]" @change="selectMoment(side, ($event.target as HTMLSelectElement).value)">
            <option value="">{{ restoredPositions[side] !== null ? `Saved position · ${preciseTime(restoredPositions[side]!)}` : filteredMoments[side].length ? 'Choose a moment' : 'No matching moments' }}</option>
            <option v-if="selectedIds[side] && !filteredMoments[side].some(m => String(m.id) === selectedIds[side])" :value="selectedIds[side]" disabled>{{ selectedLabel(side) }} (outside filters)</option>
            <option v-for="moment in filteredMoments[side]" :key="moment.id" :value="moment.id">{{ moment.label }}</option>
          </select>
        </label>
        <p class="moment-context" :title="momentContext(side)" aria-live="polite">{{ momentContext(side) }}</p>
        <video :key="`${side}:${sourceRevision[side]}`" :ref="el => setPlayer(side, el)" :src="reviewVideoUrl(sources[side].videoPath)" :muted="audio !== side" :volume="volume" preload="metadata" playsinline
          @loadedmetadata="loaded(side)" @timeupdate="updateTime(side)" @seeked="resumeLoop" @canplay="resumeLoop"
          @play="playing[side] = true" @pause="playing[side] = false" @waiting="interrupt(side)" @ended="ended(side)" @error="interrupt(side, true)" />
        <p v-if="errors[side]" class="comparison-message" role="alert">Footage unavailable. Use Change footage to retry or select another recording.</p>
        <div class="player-controls">
          <button type="button" class="play-control" :aria-label="`${playing[side] ? 'Pause' : 'Play'} moment ${side === 0 ? 'A' : 'B'}`" :disabled="!durations[side] || errors[side]" @click="toggle(side)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path v-if="playing[side]" d="M5 3h4v14H5zM12 3h4v14h-4z"/><path v-else d="M5 2l13 8-13 8z"/></svg>
          </button>
          <div class="seek-controls" role="group" aria-label="Seek one second">
            <button type="button" :disabled="!durations[side] || errors[side]" title="Back one second" @click="seek(side, times[side] - 1)">−1s</button>
            <button type="button" :disabled="!durations[side] || errors[side]" title="Forward one second" @click="seek(side, times[side] + 1)">+1s</button>
          </div>
          <span class="playback-time">{{ preciseTime(times[side]) }} <span class="total-time">/ {{ formatSeconds(durations[side]) }}</span></span>
          <button type="button" class="icon-control" :aria-label="audio === side ? 'Mute this video' : 'Listen to this video'" :title="audio === side ? 'Mute' : 'Listen here'" :aria-pressed="audio === side" @click="audio = audio === side ? null : side">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9h4l5-4v14l-5-4H4z"/><path v-if="audio === side" d="M17 8c3 2 3 6 0 8M20 5c5 4 5 10 0 14"/><path v-else d="m17 9 5 6m0-6-5 6"/></svg>
          </button>
          <button type="button" class="icon-control" aria-label="Toggle player fullscreen" title="Fullscreen" @click="fullscreen(side)"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg></button>
        </div>
        <div v-if="durations[side] > 0" class="event-timeline" :aria-label="`Events for moment ${side === 0 ? 'A' : 'B'}`" role="group">
          <button v-for="moment in momentsBySide[side].filter(m => m.seconds <= durations[side])" :key="moment.id" type="button"
            class="event-marker" :class="[`event-${moment.type}`, { selected: selectedIds[side] === String(moment.id) }]"
            :style="{ left: `${moment.seconds / durations[side] * 100}%` }"
            :title="moment.label" :aria-label="moment.label" :aria-pressed="selectedIds[side] === String(moment.id)"
            :disabled="errors[side]" @click="selectMoment(side, String(moment.id))" />
          <span class="event-playhead" :style="{ left: `${times[side] / durations[side] * 100}%` }" aria-hidden="true" />
        </div>
        <div v-if="noteGroups[side].length" class="note-timeline" role="group" :aria-label="`Saved notes on footage ${side === 0 ? 'A' : 'B'}`">
          <button v-for="group in noteGroups[side]" :key="group.key" type="button" class="note-marker" :style="{ left: `${group.percent}%` }"
            :title="noteGroupLabel(group)" :aria-label="noteGroupLabel(group)" :disabled="restoring || savingReplacement" @click="selectNoteGroup(side, group)">{{ group.markers.length > 1 ? group.markers.length : 'N' }}</button>
        </div>
        <div v-if="selectedNoteGroup?.side === side" class="note-marker-list" aria-label="Choose a saved note">
          <button type="button" @click="selectedNoteGroup = null">Close notes</button>
          <button v-for="marker in noteGroups[side].find(group => group.key === selectedNoteGroup?.key)?.markers ?? []" :key="marker.key" type="button" :disabled="restoring || savingReplacement" @click="openNoteMarker(marker)">
            <strong>{{ preciseTime(marker.seconds) }} · Saved {{ marker.side === 0 ? 'A' : 'B' }} · {{ marker.item.title }}</strong><span>{{ marker.note.text }}</span>
          </button>
        </div>
        <input type="range" :aria-label="`Seek moment ${side === 0 ? 'A' : 'B'}`" min="0" :max="durations[side]" step="0.1" :value="times[side]" :disabled="!durations[side] || errors[side]" @input="seek(side, Number(($event.target as HTMLInputElement).value))" />
        <details class="precision-controls"><summary>Precision controls</summary>
          <div class="seek-controls" role="group" aria-label="Fine seek one tenth of a second">
            <button type="button" :disabled="!durations[side] || errors[side]" title="Back one tenth of a second" @click="seek(side, times[side] - 0.1)">−0.1s</button>
            <button type="button" :disabled="!durations[side] || errors[side]" title="Forward one tenth of a second" @click="seek(side, times[side] + 0.1)">+0.1s</button>
          </div>
        <form class="time-jump" @submit.prevent="goToTime(side)">
          <label :for="`jump-time-${side}`">Go to time</label><input :id="`jump-time-${side}`" v-model="timeDrafts[side]" type="text" inputmode="decimal" placeholder="m:ss.mmm" :aria-invalid="!!timeErrors[side]" :aria-describedby="timeErrors[side] ? `time-error-${side}` : undefined" :disabled="!durations[side] || errors[side]" />
          <button type="submit" :disabled="!durations[side] || errors[side] || !timeDrafts[side].trim()">Go</button>
        </form>
        <p v-if="timeErrors[side]" :id="`time-error-${side}`" role="alert" class="time-error">{{ timeErrors[side] }}</p>
        <div class="start-controls"><span>Start: {{ preciseTime(starts[side]) }}</span><button type="button" :disabled="!durations[side] || errors[side]" @click="setStart(side)">Set start here</button></div>
        </details>
        <p class="event-legend">Events: <span class="legend-kill">Kill</span> · <span class="legend-death">Death</span> · <span class="legend-objective">Objective</span> · Other</p>
      </article>
      <VodWorkspaceDivider v-if="index === 0 && expanded === null" v-model="videoSplit" :min="35" :max="65" label="Resize comparison videos" class="video-divider" />
      </template>
    </div>
    <VodWorkspaceDivider v-if="notebookOpen" v-model="notebookWidth" :min="20" :max="36" reverse label="Resize review notebook" class="notebook-divider" />
    <div v-show="notebookOpen" class="review-side-panel"><nav aria-label="Review tools"><button type="button" :aria-pressed="sidePanel === 'notebook'" @click="sidePanel = 'notebook'">Notebook</button><button type="button" :aria-pressed="sidePanel === 'coach'" @click="openCoach">Ask AI coach</button></nav>
    <VodWorkspaceCoach v-if="coachOpened" v-show="sidePanel === 'coach'" ref="coach" :moments="coachMoments" />
    <VodReviewNotebook :trial="props.trial" :initial-comparison-id="props.initialComparisonId" v-show="sidePanel === 'notebook'" ref="notebook" :capture="captureContext" :restoring="restoring" @items-changed="notebookItems = $event" @restore="restoreContext" @close="notebookOpen = false" />
    </div>
    </div>
    <VodComparisonSourcePicker v-if="pickerSide !== null && timeline" :game="timeline.game" :current="timeline" @close="pickerSide = null; replacementSide = null" @select="changeSource" />
  </section>
</template>

<style scoped>
.review-side-panel { min-width:0; }.review-side-panel nav { display:flex; gap:6px; margin-bottom:8px; }.review-side-panel nav button { flex:1; }
.moment-filters { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:6px; font-size:11px; color:#9da8b7; }.moment-filters select { min-width:0; padding:4px 6px; }
.comparison { flex: 1; min-height: 0; overflow: auto; padding: 12px; background: #101217; color: #e6e8ed; }
.comparison-header, .comparison-actions, .player-heading, .player-controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
h1 { margin: 0; font-size: 17px; font-weight: 700; } h2 { font-size: 14px; font-weight: 700; }
p, label { font-size: 12px; color: #aab2bf; } .comparison-help { margin: 16px 0; }
button, select, summary { border: 1px solid #ffffff24; border-radius: 4px; background: #1a1d24; padding: 7px 10px; font-size: 12px; color: #e6e8ed; }
button, summary { cursor: pointer; } button:hover { border-color: #e11d48; } button:disabled, select:disabled { opacity: .45; cursor: default; }
button[aria-pressed="true"] { border-color: #e11d48; background: #e11d4818; }
:is(button, select, input, summary):focus-visible { outline: 2px solid #e11d48; outline-offset: 2px; }
.comparison-players { display: grid; grid-template-columns: var(--player-columns); gap: 0; }
.comparison-players.expanded { grid-template-columns: minmax(0, 1fr); }
.precision-controls { margin-top: 10px; }.precision-controls summary { cursor: pointer; margin-bottom: 8px; width: fit-content; }
.comparison-player { min-width: 0; padding: 12px; border: 1px solid #ffffff18; border-radius: 6px; background: #15181e; }
.moment-picker { display: flex; align-items: center; gap: 8px; margin: 8px 0; } .moment-picker select { min-width: 0; flex: 1; }
video { display: block; width: 100%; aspect-ratio: 16 / 9; background: black; object-fit: contain; }
.player-heading { justify-content: flex-end; gap: 6px; }.player-heading h2 { margin-right: auto; }.time-jump { flex-wrap: wrap; }
.player-controls { justify-content: flex-start; margin: 12px 0; } .player-controls span { margin-left: auto; font-size: 12px; font-variant-numeric: tabular-nums; }
input[type="range"] { width: 100%; accent-color: #e11d48; }
.comparison-message { padding: 10px; margin-bottom: 12px; background: #ffffff08; color: #d3d8e0; }
details { position: relative; } details > button { position: absolute; right: 0; top: 100%; z-index: 2; width: 170px; }
@container review-workspace (max-width: 760px) { .comparison-players { grid-template-columns: minmax(0, 1fr); gap: 12px; } .video-divider { display: none; } }
.selected-moment { min-height: 34px; color: #d3d8e0; margin: 0 0 10px; font-size: 12px; }
.event-timeline { position: relative; height: 32px; margin: 0 7px; border-bottom: 1px solid #ffffff25; }
.event-marker { position: absolute; top: 7px; width: 9px; height: 18px; padding: 0; transform: translateX(-50%); border: 1px solid #c4ccd6; border-radius: 2px; background: #758092; }
.event-kill { background: #34b78a; border-color: #73dfb8; }
.event-death { background: #dc4762; border-color: #fb91a2; }
.event-plant, .event-defuse, .event-detonation { background: #d7983b; border-color: #f5ca81; }
.event-marker.selected, .event-marker:hover, .event-marker:focus-visible { z-index: 2; outline: 2px solid white; outline-offset: 2px; }
.event-playhead { position: absolute; height: 28px; width: 2px; background: white; pointer-events: none; }
.event-legend { margin-top: 8px; font-size: 11px; }.legend-kill { color: #73dfb8; }.legend-death { color: #fb91a2; }.legend-objective { color: #f5ca81; }
.timing-adjustment { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }.timing-adjustment input { width: 80px; padding: 7px; border: 1px solid #ffffff30; border-radius: 4px; background: #1a1d24; color: white; }
.transport, .start-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 0; font-size: 12px; color: #cbd1da; }
.transport { border-top: 1px solid #ffffff20; margin-top: 12px; }.transport label { display: flex; align-items: center; gap: 6px; }.transport input[type="number"] { width: 70px; background: #1a1d24; border: 1px solid #ffffff30; padding: 6px; border-radius: 4px; color: white; }.transport input[type="range"] { width: 110px; }.primary { background: #d60838; border-color: #d60838; color: white; }
.comparison-player:fullscreen { overflow: auto; padding: 20px; }.comparison-player:fullscreen video { max-height: 65vh; }
.comparison-title { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }.match-context { font-size: 12px; color: #9aa3b1; }
.comparison-header { margin-bottom: 8px; }
.comparison-toolstrip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; position: sticky; top: -12px; z-index: 5; padding: 8px 0; margin-bottom: 8px; background: #101217; border-bottom: 1px solid #ffffff20; }
.comparison-toolstrip .transport { padding: 0; margin: 0; border: 0; gap: 8px; }
.options-panel { position: absolute; right: 0; top: 100%; z-index: 10; width: min(300px, 70vw); padding: 14px; background: #1a1d24; border: 1px solid #ffffff25; border-radius: 5px; box-shadow: 0 8px 24px #0008; }
.options-panel p { margin-top: 10px; line-height: 1.5; }.options-panel .timing-adjustment { margin: 14px 0 0; }
.comparison-settings[open] { z-index: 10; }.start-controls { padding: 6px 0; }.player-controls { gap: 6px; margin: 8px 0; }.comparison-message { padding: 6px 10px; margin-bottom: 8px; }
.comparison-player:fullscreen video { max-height: 65vh; }
.source-caption { font-size: 11px; font-weight: 400; color: #aab2bf; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.comparison-workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; align-items: stretch; }
.comparison-workspace.with-notebook { grid-template-columns: var(--workspace-columns); }
@container review-workspace (max-width: 1100px) { .comparison-workspace.with-notebook { grid-template-columns: minmax(0, 1fr); gap: 12px; } .notebook-divider { display: none; } .review-side-panel :deep(.notebook) { max-height: none; overflow: visible; } }
.recovery-panel { margin: 8px 0; padding: 10px; border: 1px solid #b0803955; background: #b0803910; font-size: 12px; }.recovery-panel button { margin: 6px 6px 0 0; }.recovery-panel p { margin-block: 4px; }
.moment-context { margin: 0 0 8px; font-size: 11px; color: #c7d2df; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.comparison-players { min-width: 0; }.notebook-divider, .video-divider { min-height: 100%; }
.note-timeline { position: relative; height: 30px; margin: 0 12px; border-bottom: 1px solid #92b2d633; }.note-marker { position: absolute; top: 2px; width: 22px; height: 24px; padding: 0; transform: translateX(-50%); color: #cce3ff; border-color: #7da4cf; font-size: 10px; }.note-marker:focus-visible,.note-marker:hover { z-index: 2; }.note-marker-list { display: grid; gap: 6px; padding: 8px; max-height: 180px; overflow: auto; background: #101217; }.note-marker-list button { text-align: left; }.note-marker-list span { display: block; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 4px; }.note-marker-list strong { color: #b8cfe8; font-weight: 500; }
.play-control,.icon-control { display: inline-flex; justify-content: center; align-items: center; width: 32px; height: 32px; padding: 6px; flex-shrink: 0; }.play-control { color: white; background: #d60838; border-color: #d60838; }.play-control svg { width: 16px; height: 16px; fill: currentColor; }.icon-control svg { width: 18px; height: 18px; }.seek-controls { display: inline-flex; gap: 0; border: 1px solid #ffffff25; border-radius: 4px; overflow: hidden; }.seek-controls button { border: 0; border-radius: 0; padding: 7px; }.seek-controls button + button { border-left: 1px solid #ffffff20; }.seek-controls:focus-within { overflow: visible; }.player-controls .playback-time { white-space: nowrap; margin-left: auto; }.player-controls .total-time { color: #8490a1; font-size: 11px; margin: 0; }.time-jump { display: flex; align-items: center; gap: 6px; margin-top: 8px; }.time-jump input { width: 100px; min-width: 0; background: #101217; border: 1px solid #ffffff25; border-radius: 4px; padding: 6px 8px; font-size: 12px; color: white; font-variant-numeric: tabular-nums; }.time-jump label { font-size: 11px; }.time-jump button { padding: 5px 9px; }.time-error { color: #ffa3b5; margin-top: 6px; }
</style>
