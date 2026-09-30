<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getMapListViewImage, getAgentImage } from '../lib/valorant'
import upforgeLogo from '../assets/upforge-logo.webp'
import StorageAddonPicker from '../components/shared/StorageAddonPicker.vue'
import type { StorageAddonSnapshot } from '../lib/storage-addon'
import { useAccountUsage } from '../composables/useAccountUsage'
import { cloudGames, type CloudGame, cloudBytes, cloudRetention, cloudFileTitle, validCloudPage, type CloudFile, type CloudKind, type CloudSort, type CloudPage } from '../lib/cloud-storage'
import type { PendingRecording, ClipRecord } from '../env.d.ts'
const router = useRouter()
const pendingRemoval = ref<CloudFile | null>(null)
const addon = ref<StorageAddonSnapshot | null>(null), addonVersion = ref(0), keepError = ref(''), keeping = ref('')
async function keep(file: CloudFile, action: 'keep' | 'remove' = 'keep') {
  keeping.value = `${file.kind}:${file.id}`; keepError.value = ''
  try {
    const result = await window.api.storageAddon.request({ action, kind: file.kind, id: file.id })
    if (!result.ok) keepError.value = result.error
    else { pendingRemoval.value = null; addonVersion.value++; refresh() }
  } catch { keepError.value = 'Could not update this cloud file. Please retry.' }
  finally { keeping.value = '' }
}
const { usage, error: usageError, load: loadUsage } = useAccountUsage()
const game = ref<CloudGame>('all')
const gameLabel = computed(() => cloudGames.find(item => item.value === game.value)!.label)
const kind = ref<CloudKind>(useRoute().query.kind === 'recording' ? 'recording' : 'all'), sort = ref<CloudSort>('newest'), page = ref(1)
const library = ref<CloudPage | null>(null), error = ref(''), loading = ref(false)
const recordings = ref<PendingRecording[]>([]), clips = ref<ClipRecord[]>([]), queueError = ref('')
let generation = 0, queueGeneration = 0
let updateTimer: ReturnType<typeof setTimeout> | undefined
const filters: { value: CloudKind; label: string }[] = [{ value: 'all', label: 'All files' }, { value: 'recording', label: 'Recordings' }, { value: 'clip', label: 'Clips' }]
const failedAgents = ref<Set<string>>(new Set())
const retentionNow = ref(Date.now())
const attentionCount = computed(() => library.value?.items.filter(file => ['expired', 'soon'].includes(cloudRetention(file.expires_at, retentionNow.value).state)).length ?? 0)
const failedMapImages = ref<Set<string>>(new Set())
function hideMapImage(map: string) { failedMapImages.value = new Set([...failedMapImages.value, map]) }
const full = computed(() => usage.value?.cloud_storage?.remaining_bytes === 0)
const queue = computed(() => [
  ...recordings.value.filter(r => r.pipelineStatus === 'uploading' || !!r.lastAnalysisError).map(r => ({ id: `r:${r.id}`, title: `${r.map || 'Recording'}`, status: r.pipelineStatus === 'uploading' ? 'Uploading' : 'Needs attention', progress: r.pipelineStatus === 'uploading' && typeof r.uploadProgress === 'number' && Number.isFinite(r.uploadProgress) ? r.uploadProgress : null, path: '/recordings' })),
  ...clips.value.filter(c => c.uploadStatus === 'uploading' || c.uploadStatus === 'failed').map(c => ({ id: `c:${c.id}`, title: c.title || 'Clip', status: c.uploadStatus === 'uploading' ? 'Uploading' : 'Upload failed', progress: null, path: '/clips' })),
])
let lastLoaded = 0
async function load() {
  const request = ++generation
  retentionNow.value = Date.now()
  loading.value = true; error.value = ''
  try {
    const result = await window.api.cloudStorage.list({ game: game.value, kind: kind.value, sort: sort.value, page: page.value })
    if (request !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!validCloudPage(result.data)) { error.value = 'Cloud library could not be verified. Please retry.'; return }
    if (game.value !== 'all' && result.data.game_filter !== game.value) { error.value = 'Game filtering is not available on the server yet.'; return }
    library.value = result.data
    lastLoaded = Date.now()
  } catch { if (request === generation) error.value = 'Cloud library is unavailable. Please retry.' }
  finally { if (request === generation) loading.value = false }
}
async function loadQueue() {
  const request = ++queueGeneration
  try {
    const [r, c] = await Promise.all([window.api.recordings.listAll(), window.api.clips.get({ allGames: true })])
    if (request !== queueGeneration) return
    recordings.value = r; clips.value = c; queueError.value = ''
  } catch { if (request === queueGeneration) { recordings.value = []; clips.value = []; queueError.value = 'Upload activity could not be loaded.' } }
}
function focusRefresh() { if (!loading.value && Date.now() - lastLoaded > 30000) { void load(); void loadQueue() } }
function refresh() { void load(); void loadUsage(); void loadQueue() }
function resetAccount() { pendingRemoval.value = null; addon.value = null; keepError.value = ''; closePlayback(); clearTimeout(updateTimer); generation++; queueGeneration++; library.value = null; recordings.value = []; clips.value = []; loading.value = false; error.value = 'Sign in again to view cloud storage.' }
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const retention = (value: string | null) => cloudRetention(value, retentionNow.value)
const planError = ref('')
async function plans() {
  planError.value = ''
  try { if (!(await window.api.app.openUrl('https://upforge.gg/pricing')).ok) planError.value = 'Could not open pricing. Please try again.' }
  catch { planError.value = 'Could not open pricing. Please try again.' }
}
const playerDialog = ref<HTMLDialogElement | null>(null)
const downloadMessage = ref('')
const selectedFile = ref<CloudFile | null>(null), playbackUrl = ref(''), playbackError = ref(''), playbackLoading = ref(false)
const localRecording = computed(() => selectedFile.value?.kind === 'recording'
  ? recordings.value.find(recording => recording.archiveId === selectedFile.value?.id && recording.hasLocalFile === true)
  : undefined)
function openLocalCopy() {
  const recording = localRecording.value
  if (!recording) return
  closePlayback()
  void router.push({ path: '/vod-review', query: { id: recording.id } })
}
let playbackRequest = 0
function closePlayback() { playerDialog.value?.close(); downloadMessage.value = ''; playbackRequest++; selectedFile.value = null; playbackUrl.value = ''; playbackError.value = ''; playbackLoading.value = false }
async function openFile(file: CloudFile) {
  if (file.kind === 'recording' && ['archived'].includes(file.status) && retention(file.expires_at).state !== 'expired') {
    await router.push({ path: '/vod-review', query: { archiveId: file.id } }); return
  }
  if (file.kind === 'clip' && retention(file.expires_at).state !== 'expired') {
    await router.push({ path: '/clips', query: { cloudClip: file.id } })
    return
  }
  const request = ++playbackRequest
  selectedFile.value = file; playbackUrl.value = ''; playbackError.value = ''; playbackLoading.value = true
  await nextTick()
  if (request !== playbackRequest) return
  if (!playerDialog.value?.open) playerDialog.value?.showModal()
  if (retention(file.expires_at).state === 'expired') {
    playbackLoading.value = false
    playbackError.value = 'Cloud retention has ended. Use your local copy if available. Buying more storage cannot restore expired footage.'
    return
  }
  try {
    const result = await window.api.cloudStorage.playback({ kind: file.kind, id: file.id })
    if (request !== playbackRequest) return
    if (result.ok) playbackUrl.value = result.url
    else playbackError.value = result.error
  } catch { if (request === playbackRequest) playbackError.value = 'Could not open this file. Please retry.' }
  finally { if (request === playbackRequest) playbackLoading.value = false }
}
async function downloadFile() {
  const file = selectedFile.value
  if (!file) return
  const request = playbackRequest
  downloadMessage.value = 'Preparing download…'
  try {
    const result = await window.api.cloudStorage.download({ kind: file.kind, id: file.id })
    if (request === playbackRequest) downloadMessage.value = result.ok ? 'Download requested. Choose where to save it in the save window.' : result.error
  } catch { if (request === playbackRequest) downloadMessage.value = 'Could not start the download. Please retry.' }
}
watch([kind, sort, game], () => { if (page.value !== 1) page.value = 1; else void load() })
watch(page, () => { void load() })
const cleanups = ['session:user-changed', 'auth:session-expired'].map(event => window.api.on(event, resetAccount))
cleanups.push(...['recordings:updated', 'clips:updated', 'clips:new'].map(event => window.api.on(event, () => {
  void loadQueue()
  clearTimeout(updateTimer)
  updateTimer = setTimeout(() => { void load() }, 750)
})))
onMounted(() => { void load(); void loadQueue(); window.addEventListener('focus', focusRefresh) })
onBeforeUnmount(() => { closePlayback(); clearTimeout(updateTimer); generation++; queueGeneration++; cleanups.forEach(fn => fn()); window.removeEventListener('focus', focusRefresh) })
</script>

<template>
  <main class="cloud-page">
    <header class="page-heading">
      <div class="hero-copy"><p class="eyebrow">UPFORGE / ALL GAMES</p><h1>Cloud storage</h1><p>Your clips and recordings from every game, in one library.</p><div class="hero-meta"><span>Account-wide storage</span><span>One shared allowance across games</span></div></div>
      <img class="cloud-brand" :src="upforgeLogo" alt="" />
      <button class="refresh-button" :disabled="loading" @click="refresh"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
    </header>
    <div class="cloud-layout">
      <div class="main-column">
        <section class="capacity-panel" aria-label="Cloud capacity">
          <div class="section-heading"><h2>Your cloud space</h2><span>Account-wide allowance</span></div>
          <p v-if="usageError" role="status">{{ usageError }} <button @click="loadUsage">Retry</button></p>
          <p v-else-if="!usage">Loading your allowance…</p>
          <div v-else-if="usage.cloud_storage" class="capacity-grid">
            <div class="capacity" :class="{ full: usage.cloud_storage.remaining_bytes === 0 }">
              <div><span>Clips &amp; recordings</span><strong>{{ cloudBytes(usage.cloud_storage.used_bytes) }}<small v-if="usage.cloud_storage.capacity_bytes !== null"> / {{ cloudBytes(usage.cloud_storage.capacity_bytes) }}</small></strong></div>
              <progress v-if="usage.cloud_storage.capacity_bytes !== null" :value="Math.min(usage.cloud_storage.used_bytes + usage.cloud_storage.reserved_bytes, usage.cloud_storage.capacity_bytes)" :max="Math.max(usage.cloud_storage.capacity_bytes, 1)" aria-label="Cloud storage used and reserved" />
              <p>{{ usage.cloud_storage.remaining_bytes === null ? 'No storage cap' : `${cloudBytes(usage.cloud_storage.remaining_bytes)} available` }}</p>
              <p v-if="usage.cloud_storage.unknown_size_files">Checking sizes for {{ usage.cloud_storage.unknown_size_files }} existing files. Uploads pause until this is complete.</p>
              <p v-if="usage.cloud_storage.remaining_bytes === 0">Storage is full. Add capacity below or remove cloud copies to upload more.</p>
            </div>
          </div>
          <p v-else role="status">Your storage allowance is being updated. Refresh to check again.</p>
          <div v-if="usage?.cloud_storage" class="storage-facts"><span>{{ cloudBytes(usage.cloud_storage.included_bytes) }} included</span><span>{{ cloudBytes(usage.cloud_storage.addon_bytes) }} extra storage</span><span>{{ cloudBytes(usage.cloud_storage.reserved_bytes) }} reserved for uploads</span></div>
          <p class="fine-print">One shared GB allowance for cloud clips and recordings across all games. Local files do not count. Recording retention is shown on each file.</p>
        </section>
        <section v-if="queue.length || queueError" class="queue-panel" aria-label="Uploads on this device"><div class="section-heading"><h2>On this device</h2><span>Upload activity</span></div><p v-if="queueError">{{ queueError }}</p><div v-for="item in queue" :key="item.id" class="queue-item"><div><strong>{{ item.title }}</strong><p>{{ item.status }}<span v-if="item.progress !== null"> · {{ Math.round(item.progress) }}%</span></p></div><button @click="router.push(item.path)">View {{ item.path === '/clips' ? 'clip' : 'footage' }}</button></div></section>
        <section v-if="pendingRemoval" class="retention-notice" role="alert"><div><strong>Remove {{ cloudFileTitle(pendingRemoval) }} from the cloud?</strong><p>This permanently removes the cloud video. Your local files and notebook notes stay saved.</p></div><button :disabled="!!keeping" @click="keep(pendingRemoval, 'remove')">Remove cloud copy</button><button :disabled="!!keeping" @click="pendingRemoval=null">Cancel</button></section><p v-if="keepError" role="alert">{{ keepError }}</p><section class="files-panel" aria-label="Cloud files" :aria-busy="loading">
          <div v-if="attentionCount" class="retention-notice"><div><strong>{{ attentionCount }} {{ attentionCount === 1 ? 'file needs' : 'files need' }} a retention check</strong><p>On this page: expiring within 7 days or past the retention date. Open a file to check playback. Files past their retention date may be removed; your notes stay saved.</p></div><button v-if="sort !== 'expiry'" @click="sort = 'expiry'">Sort by expiry</button></div>
          <div class="library-heading"><h2>Saved to cloud · {{ gameLabel }}</h2><span v-if="library">{{ library.total }} files</span><span v-else>Clips &amp; recordings</span></div>
          <div class="file-toolbar"><label class="sort">Game <select v-model="game"><option v-for="option in cloudGames" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><div class="filters" aria-label="File type"><button v-for="filter in filters" :key="filter.value" :aria-pressed="kind === filter.value" :class="{ selected: kind === filter.value }" @click="kind = filter.value">{{ filter.label }}</button></div><label class="sort">Sort <select v-model="sort"><option value="newest">Newest first</option><option value="largest">Largest first</option><option value="expiry">Expiring first</option></select></label></div>
          <p v-if="loading && !library" class="empty" role="status">Loading cloud files…</p><div v-else-if="error" class="empty" role="alert"><p>{{ error }}</p><button @click="load">Retry</button></div>
          <template v-else-if="library"><div v-if="!library.items.length" class="empty"><h3>No {{ kind === 'all' ? 'cloud files' : kind === 'clip' ? 'cloud clips' : 'cloud recordings' }}{{ game === 'all' ? '' : ` for ${gameLabel}` }} yet</h3><p>Upload from Clips or Footage to keep your gameplay available on other devices.</p><button @click="router.push(kind === 'clip' ? '/clips' : '/recordings')">Open {{ kind === 'clip' ? 'Clips' : 'Footage' }}</button></div>
            <div v-for="file in library.items" :key="`${file.kind}:${file.id}`" class="file-row" :class="{ 'retention-ended': retention(file.expires_at).state === 'expired' }"><div class="file-icon" :style="{ backgroundImage: getMapListViewImage(file.map) ? `url(${getMapListViewImage(file.map)})` : undefined }" :class="[file.kind, { 'map-thumbnail': getMapListViewImage(file.map) && !failedMapImages.has(file.map!) }]" aria-hidden="true"><img v-if="getAgentImage(file.agent) && !failedAgents.has(file.agent!)" class="file-agent" :src="getAgentImage(file.agent)" alt="" loading="lazy" @error="failedAgents.add(file.agent!)" /><img v-else-if="getMapListViewImage(file.map) && !failedMapImages.has(file.map!)" :src="getMapListViewImage(file.map)" alt="" loading="lazy" @error="hideMapImage(file.map!)" /><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/></svg></div><div class="file-description"><h3><button class="file-open" :disabled="file.status === 'uploading'" @click="openFile(file)">{{ cloudFileTitle(file) }}</button></h3><p>{{ cloudGames.find(item => item.value === file.game)?.label || 'Game not recorded' }} · {{ file.kind === 'clip' ? 'Clip' : 'Recording' }}<span v-if="file.agent"> · {{ file.agent }}</span> · {{ date(file.created_at) }}<span v-if="file.status === 'uploading'"> · Uploading</span><span v-if="file.status === 'failed'"> · Upload failed</span></p></div><div class="file-storage"><strong :title="file.bytes === null ? 'This older file has no verified size yet. Its size has not been counted as zero.' : undefined">{{ cloudBytes(file.bytes) }}</strong><p class="retention-label" :class="retention(file.expires_at).state" :title="file.expires_at ? `Retention date: ${date(file.expires_at)}` : undefined">{{ file.paid_storage && addon?.usage.active ? 'Kept in paid storage' : retention(file.expires_at).label }}</p><button @click="openFile(file)" :disabled="file.status === 'uploading'">{{ file.status === 'uploading' ? 'Uploading…' : retention(file.expires_at).state === 'expired' ? 'Recovery options' : 'Open file' }}</button><button v-if="addon?.usage.active && !file.paid_storage && ['stored','archived'].includes(file.status) && retention(file.expires_at).state !== 'expired'" :disabled="!!keeping" @click="keep(file)">{{ keeping === `${file.kind}:${file.id}` ? 'Moving…' : 'Keep in paid storage' }}</button><button v-if="file.paid_storage || usage?.cloud_storage" :disabled="!!keeping" @click="pendingRemoval=file">Remove cloud copy</button></div></div>
            <footer v-if="library.total" class="pagination"><span>{{ library.total }} files · Page {{ library.page }} of {{ library.last_page }}</span><div><button :disabled="page <= 1" @click="page--">Previous</button><button :disabled="page >= library.last_page" @click="page++">Next</button></div></footer>
          </template>
        </section>
      </div>
      <aside class="side-column"><StorageAddonPicker :key="addonVersion" @changed="refresh" @loaded="addon=$event" /><section class="plan-panel"><p class="eyebrow">ROOM FOR YOUR NEXT MATCH</p><h2>{{ full ? 'Your cloud space is full' : 'Keep more of your gameplay' }}</h2><p>{{ full ? 'Your upload allowance is full. Existing files keep their current retention dates. Compare plans for more upload capacity.' : 'Review your plan for more cloud capacity and recording retention.' }}</p><button class="primary" @click="plans">Compare plans</button><p v-if="planError" role="alert">{{ planError }}</p><p class="fine-print">See the allowances available to your account before making a change.</p></section><section class="library-links"><h2>Manage your footage</h2><button @click="router.push('/recordings')">Open Footage <span aria-hidden="true">→</span></button><button @click="router.push('/clips')">Open Clips <span aria-hidden="true">→</span></button><p>Open files here to watch or download. Use Clips for editing and Footage for match review.</p></section><section class="storage-help"><h2>How storage works</h2><p>Cloud storage is used until files are removed. They do not reset each month.</p><p>Files past their retention date may be removed during cleanup. Your saved notes and comparisons stay in your notebook even when footage is unavailable.</p></section></aside>
    </div>
    <dialog v-if="selectedFile" ref="playerDialog" class="cloud-player" aria-labelledby="cloud-player-title" @cancel.prevent="closePlayback">
      <div class="cloud-player-body"><header><h2 id="cloud-player-title">{{ cloudFileTitle(selectedFile) }}</h2><button autofocus @click="closePlayback">Close player</button></header>
      <p v-if="playbackLoading" role="status">Opening cloud file…</p>
      <div v-else-if="playbackError" role="alert"><p>{{ playbackError }}</p><button @click="openFile(selectedFile)">Check availability again</button><button v-if="localRecording" @click="openLocalCopy">Open local copy</button></div>
      <video v-else-if="playbackUrl" :key="playbackUrl" :src="playbackUrl" controls preload="metadata" @error="playbackError = 'Playback failed. Retry to request a fresh video link.'" />
      <button v-if="playbackUrl && !playbackError" @click="downloadFile">Download a copy</button><p v-if="downloadMessage" role="status">{{ downloadMessage }}</p><p>Cloud playback uses your internet connection. Keep a local copy before the retention date if you need this footage later.</p></div>
    </dialog>
  </main>
</template>
<style scoped>
.cloud-page{height:100%;overflow:auto;padding:28px;color:#e7ebf0;background:#0c1015;font-size:13px}.page-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:24px}.page-heading h1{font-size:28px;font-weight:750;letter-spacing:-.7px;margin:3px 0 6px}.page-heading p,.fine-print{color:#929dab}.eyebrow{font-size:10px;letter-spacing:1.5px;font-weight:700;color:#adb6c4}.cloud-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:20px}.main-column,.side-column{display:flex;flex-direction:column;gap:20px;min-width:0}.capacity-panel,.queue-panel,.files-panel,.plan-panel,.library-links{border:1px solid #ffffff15;background:#121820;border-radius:10px;overflow:hidden}.capacity-panel,.queue-panel,.plan-panel,.library-links,.storage-help{padding:20px}.section-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:20px}.section-heading span{font-size:11px;color:#94a0af}h2{font-weight:650;font-size:15px}.capacity-grid{display:grid;grid-template-columns:1fr 1fr;gap:25px}.capacity>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.capacity strong{font-size:23px;font-variant-numeric:tabular-nums}.capacity small{font-size:14px;font-weight:400;color:#94a0af}.capacity p{font-size:11px;color:#94a0af;margin-top:5px}.capacity.full p{color:#f3ba62}progress{display:block;width:100%;height:6px;margin-top:13px;appearance:none;border:0;border-radius:4px;overflow:hidden;background:#ffffff12}progress::-webkit-progress-bar{background:#ffffff12}progress::-webkit-progress-value{background:#ed164a}progress::-moz-progress-bar{background:#ed164a}.storage-facts{display:flex;flex-wrap:wrap;gap:8px 22px;padding-top:18px;margin-top:18px;border-top:1px solid #ffffff10;color:#95a2b3;font-size:11px}.storage-facts strong{color:#dee4eb}.fine-print{font-size:11px;line-height:1.6;margin-top:13px}.file-toolbar{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px;border-bottom:1px solid #ffffff12}.filters{display:flex;gap:4px}.filters button{border-color:transparent;padding:7px 10px}.filters button.selected{background:#ed164a1a;border-color:#ed164a66;color:#fff}.sort{display:flex;align-items:center;gap:8px;color:#94a0af;font-size:11px}select{background:#181f29;color:#dee4eb;padding:8px;border:1px solid #ffffff22;border-radius:5px}.file-row{display:flex;gap:12px;align-items:center;padding:17px 18px;border-bottom:1px solid #ffffff09}.file-icon{width:40px;height:40px;background:#1d2834;display:grid;place-items:center;border-radius:6px;flex-shrink:0;color:#90a7bf}.file-icon svg{width:23px;height:23px}.file-description{flex:1;min-width:0}.file-description h3{font-weight:600;overflow-wrap:anywhere}.file-row p{font-size:11px;color:#8e9baa;margin-top:4px}.file-storage{text-align:right;font-size:12px;flex-shrink:0}.file-row .expiring{color:#e8b86a}.empty{text-align:center;padding:44px 22px;color:#9aa6b4;line-height:1.8}.empty h3{color:#e7ebf0}.empty button{margin-top:15px}.pagination{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 16px;color:#94a0af;font-size:11px}.pagination div{display:flex;gap:6px}button{border:1px solid #ffffff24;border-radius:5px;padding:8px 12px;min-height:34px;color:#dce3ec;background:#ffffff03}button:hover:not(:disabled){background:#ffffff0b;border-color:#ffffff44}button:disabled{opacity:.4}button:focus-visible,select:focus-visible{outline:2px solid #ff3561;outline-offset:2px}.plan-panel{border-top:2px solid #ed164a}.plan-panel h2{font-size:21px;line-height:1.25;margin:12px 0}.plan-panel>p:not(.eyebrow){line-height:1.6;color:#99a7b7}.plan-panel .primary{width:100%;background:#ed164a;border-color:#ed164a;color:white;font-weight:650;margin-top:20px;min-height:40px}.library-links h2{margin-bottom:12px}.library-links button{display:flex;width:100%;justify-content:space-between;margin-top:8px}.library-links p,.storage-help p{font-size:12px;color:#94a0af;line-height:1.65;margin-top:12px}.storage-help{padding-top:0}.queue-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #ffffff10}.queue-item p{font-size:11px;color:#a1adbc;margin-top:4px}@media(max-width:1000px){.cloud-layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:1fr 1fr}.storage-help{grid-column:1/-1}}@media(max-width:600px){.cloud-page{padding:16px}.capacity-grid,.side-column{grid-template-columns:1fr}.page-heading{align-items:flex-start}.file-row{flex-wrap:wrap}.file-storage{width:100%;text-align:left;padding-left:52px}.capacity-grid{gap:20px}.page-heading h1{font-size:24px}}

/* Keep artwork above the working library, so file rows stay quiet and readable. */
.cloud-page{padding:24px;background:#0b0f14}.page-heading{position:relative;isolation:isolate;overflow:hidden;min-height:180px;padding:28px 30px;border:1px solid #ffffff18;border-radius:8px;background:#131b23;align-items:flex-start;margin-bottom:20px}.hero-copy{position:relative;max-width:70%}.page-heading .eyebrow{color:#c6a8ae;font-size:10px;letter-spacing:2px;margin:0 0 14px}.page-heading h1{font-size:32px;line-height:1.15;letter-spacing:-1px;margin:0 0 10px}.page-heading p{line-height:1.5;color:#b1bdca}.hero-meta{display:flex;gap:16px;margin-top:21px;font-size:10px;color:#cbd4df}.hero-meta span+span{border-left:1px solid #ffffff30;padding-left:16px;color:#9aa8b8}.refresh-button{display:flex;align-items:center;gap:7px;background:#0b1017bb;z-index:1}.refresh-button svg{width:15px;height:15px}.cloud-layout{grid-template-columns:minmax(0,1fr) 310px;gap:18px}.main-column,.side-column{gap:18px}.capacity-panel,.queue-panel,.files-panel,.plan-panel,.library-links{background:#11171e;border-radius:8px}.capacity-grid{gap:12px}.capacity{padding:17px;background:#171f28;border:1px solid #ffffff0b;border-radius:5px}.capacity>div{align-items:flex-start;flex-direction:column;gap:13px}.capacity strong{font-size:30px;line-height:1}.capacity small{font-size:17px}.capacity.full{border-color:#e8b86a50}.capacity.full progress::-webkit-progress-value{background:#e8b86a}.capacity.full progress::-moz-progress-bar{background:#e8b86a}.capacity-panel .section-heading{margin-bottom:14px}.library-heading{display:flex;justify-content:space-between;align-items:center;padding:18px 20px 4px}.library-heading span{font-size:11px;color:#8f9dab}.file-toolbar{padding:12px 14px}.file-row{padding:15px 20px}.file-icon{background:#202a35;color:#b7c8d9}.file-icon.clip{background:#30212a;color:#f28ea5}.file-description h3{font-size:13px}.file-storage strong{font-variant-numeric:tabular-nums}.storage-help{padding:0 8px}.storage-help h2{font-size:12px;color:#c3cedb}.storage-help p{font-size:11px}.library-links{padding:18px}.library-links button{background:#19212b}.fine-print{color:#9ca8b6}
@media(min-width:1500px){.cloud-page{padding:28px 36px}.cloud-layout{grid-template-columns:minmax(0,1fr) 340px}.page-heading{min-height:195px}}
@media(max-width:1100px){.cloud-layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:1fr 1fr;align-items:start}.storage-help{grid-column:1/-1}.hero-copy{max-width:75%}}
@media(max-width:650px){.cloud-page{padding:14px}.page-heading{padding:22px;min-height:210px}.page-heading h1{font-size:26px}.hero-copy{max-width:100%;padding-right:0}.refresh-button{position:absolute;right:14px;bottom:15px}.hero-meta{flex-direction:column;gap:6px}.hero-meta span+span{border:0;padding:0}.capacity-grid,.side-column{grid-template-columns:1fr}.file-storage{padding-left:52px}.section-heading{flex-wrap:wrap}}.file-icon.map-thumbnail{width:92px;height:48px;position:relative;overflow:hidden;border:1px solid #ffffff18}.map-thumbnail>img{width:100%;height:100%;object-fit:cover}.map-thumbnail>svg{display:none}

@media(max-width:650px){.file-icon.map-thumbnail{width:68px;height:42px}}.file-icon{position:relative;overflow:hidden;background-size:cover;background-position:center}.file-icon>img.file-agent{position:absolute;inset:0;height:100%;width:100%;object-fit:contain;background:transparent}.file-icon:has(.file-agent)>svg{display:none}.hero-meta{margin-top:14px}.capacity{padding:14px}.capacity>div{flex-direction:row;align-items:center;gap:12px}.capacity strong{font-size:27px}.storage-facts{margin-top:14px;padding-top:14px}.file-row{min-height:82px}.file-icon.map-thumbnail{width:100px;height:56px}.file-icon>img.file-agent{object-position:center bottom}.file-row.retention-ended{border-left:2px solid #be955947;padding-left:18px}.file-row .retention-label.soon{color:#f1c47f}.file-row .retention-label.expired{color:#c5a47a}.retention-notice{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 20px;background:#b7842310;border-bottom:1px solid #b7842326}.retention-notice strong{font-size:12px;color:#e7c697}.retention-notice p{font-size:11px;line-height:1.5;color:#aeb6c2;margin-top:4px}.retention-notice button{white-space:nowrap;font-size:11px;border-color:#b7842345;color:#e7c697}.file-row:hover{background:#ffffff03}
@media(max-width:650px){.retention-notice{align-items:flex-start;flex-direction:column}.file-icon.map-thumbnail{width:78px;height:48px}.file-storage{padding-left:90px}.pagination{flex-wrap:wrap}}
.file-icon:has(.file-agent):before{content:"";position:absolute;inset:0;background:rgba(10,17,24,.35);pointer-events:none}
.file-icon>img.file-agent{z-index:1;background:transparent}
.file-icon.map-thumbnail{border-color:#303943;background-clip:padding-box}
.file-open{border:0;padding:0;text-align:left;font-weight:600;background:none}.file-open:hover{text-decoration:underline}.cloud-player{margin:auto;width:min(95vw,1100px);max-width:none;border:0;padding:0;background:transparent;color:#e7ebf0}.cloud-player::backdrop{background:#000d}.cloud-player-body{width:min(100%,1100px);max-height:95vh;overflow:auto;background:#121820;border:1px solid #394452;border-radius:10px;padding:20px}.cloud-player header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:16px}.cloud-player video{width:100%;max-height:70vh}.cloud-player p{margin:14px 0;color:#a9b4c2}
.cloud-brand{position:absolute;right:175px;top:50%;transform:translateY(-50%);width:150px;height:auto;opacity:.7;pointer-events:none}.page-heading{min-height:160px;border-top:2px solid #ed164a}.hero-copy{max-width:65%}
@media(max-width:900px){.cloud-brand{display:none}.hero-copy{max-width:80%}}
@media(max-width:650px){.hero-copy{max-width:100%}.page-heading{min-height:210px}}
</style>
