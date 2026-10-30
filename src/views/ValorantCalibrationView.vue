<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { measureCalibration, type CalibrationInput } from '../lib/valorant-calibration'
import { useRouter } from 'vue-router'
import { uiV3 } from '../lib/ui-v3'
import UfButton from '../components/v3/UfButton.vue'

const router = useRouter()

const video = ref<HTMLVideoElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const url = ref('')
const filename = ref('')
const ready = ref(false)
const error = ref('')
const captured = ref(false)
const framePng = ref('')
const timestamp = ref(0)
const patch = ref('')
const setup = ref('')
const pose = ref('standing')
const confirmed = ref(false)
const nextMark = ref(0)
const labels = ['Head top (exclude hair / hats)', 'Chin', 'Feet at floor contact']
const marks = ref<Array<number | '' | null>>([null, null, null])
const width = ref(0)
const height = ref(0)
const fov = ref<number | ''>('')
const depth = ref<number | ''>('')
const depthError = ref<number | ''>('')
const pixelError = ref<number | ''>(2)
const samples = ref<Array<Record<string, unknown>>>([])

function clearFrame() {
  captured.value = false
  framePng.value = ''
  marks.value = [null, null, null]
  nextMark.value = 0
}
function loadRecording(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (url.value) URL.revokeObjectURL(url.value)
  clearFrame()
  ready.value = false
  confirmed.value = false
  error.value = ''
  filename.value = file.name
  url.value = URL.createObjectURL(file)
}
function capture() {
  const v = video.value
  const c = canvas.value
  if (!v || !c || v.readyState < 2 || v.seeking) return
  v.pause()
  clearFrame()
  width.value = c.width = v.videoWidth
  height.value = c.height = v.videoHeight
  const ctx = c.getContext('2d')
  if (!ctx) { error.value = 'Frame capture is unavailable.'; return }
  ctx.drawImage(v, 0, 0)
  framePng.value = c.toDataURL('image/png')
  timestamp.value = v.currentTime
  captured.value = true
}
function mark(event: MouseEvent) {
  if (!captured.value || !canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  marks.value[nextMark.value] = Math.min(height.value - 1, Math.max(0, (event.clientY - rect.top) * height.value / rect.height))
  nextMark.value = Math.min(2, nextMark.value + 1)
}
const calculation = computed(() => {
  if (!captured.value || marks.value.some(m => m === null || m === '') || [fov.value, depth.value, depthError.value, pixelError.value].some(v => v === '')) {
    return { error: 'Capture a frame, mark all three points and complete the camera measurements.' }
  }
  const input: CalibrationInput = {
    width: width.value, height: height.value, horizontalFovDeg: Number(fov.value),
    depthM: Number(depth.value), depthErrorM: Number(depthError.value), pixelError: Number(pixelError.value),
    headTopY: Number(marks.value[0]), headBottomY: Number(marks.value[1]), feetY: Number(marks.value[2]),
  }
  try { return { input, result: measureCalibration(input), error: '' } }
  catch (e) { return { error: e instanceof Error ? e.message : 'Invalid measurement.' } }
})
const canSave = computed(() => !!calculation.value.result && confirmed.value && !!patch.value.trim() && !!setup.value.trim())
function saveSample() {
  if (!canSave.value) return
  samples.value.push({
    source: { filename: filename.value, timestampSeconds: timestamp.value, framePng: framePng.value },
    patch: patch.value.trim(), setup: setup.value.trim(), pose: pose.value,
    input: calculation.value.input, measurements: calculation.value.result,
    setupConfirmed: true, annotation: 'manual',
  })
  clearFrame()
}
function exportSamples() {
  const data = {
    schemaVersion: 1, game: 'valorant', status: 'unvalidated_visual_measurements',
    createdAt: new Date().toISOString(),
    method: 'Level-camera pinhole projection, square pixels, uncropped frame, target on a known camera-depth plane.',
    limitations: ['Visual landmarks are not server hitboxes.', 'Bounds cover entered pixel and distance errors only, not FOV, pitch, pose or depth-plane error.', 'Requires validation across distances and independent recordings before trainer use.'],
    samples: samples.value,
  }
  const blob = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = blob
  a.download = 'upforge-valorant-calibration.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(blob), 1000)
}
onUnmounted(() => { if (url.value) URL.revokeObjectURL(url.value) })
</script>

<template>
  <main v-if="uiV3" class="cal3">
    <header class="cal3-head">
      <button type="button" class="uf-link uf-t4" @click="router.push('/training')">← Practice</button>
      <span class="uf-label">Prototype · manual landmarks · visual estimates only</span>
      <h1 class="uf-d2">Valorant calibration</h1>
      <p class="uf-t2">Measure a local recording to help calibrate the aim trainer. Nothing here changes your trainer settings.</p>
    </header>

    <section class="cal3-step">
      <span class="cal3-n uf-d3">01</span>
      <div class="cal3-body">
        <h2 class="uf-t3">Choose a controlled recording</h2>
        <p class="uf-t4">Uncropped, unstretched first-person frame, level camera, no ADS, a stationary target near screen centre on the same flat floor. Record several distances separately.</p>
        <label class="cal3-field"><span class="uf-t4">Recording</span><input type="file" accept="video/*" @change="loadRecording"></label>
        <p class="uf-t4 cal3-faint">The recording stays on this device. Saved samples stay on this page until exported; leaving clears them.</p>
        <video v-if="url" ref="video" class="cal3-media" :src="url" controls preload="metadata" @loadeddata="ready = true" @error="ready = false; error = 'Cannot decode this recording. Try an MP4 with H.264 video.'" />
        <div><UfButton variant="secondary" :disabled="!ready" @click="capture">Capture paused frame</UfButton></div>
        <p v-if="error" role="alert" class="uf-t4" style="color: var(--uf-loss)">{{ error }}</p>
      </div>
    </section>

    <section class="cal3-step">
      <span class="cal3-n uf-d3">02</span>
      <div class="cal3-body">
        <h2 class="uf-t3">Mark the captured frame</h2>
        <p class="uf-t4">Pick a landmark, then click its height on the frame. Adjust the pixel value for precision.</p>
        <div class="cal3-grid">
          <div v-for="(label, index) in labels" :key="label" class="cal3-field">
            <button type="button" class="cal3-mark" :class="{ 'is-on': nextMark === index }" :aria-pressed="nextMark === index" @click="nextMark = index">{{ index + 1 }} · {{ label }}</button>
            <input v-model.number="marks[index]" type="number" min="0" :max="height - 1" :disabled="!captured" :aria-label="`${label} Y pixel`">
          </div>
        </div>
        <p v-if="captured" class="uf-t4">Frame {{ timestamp.toFixed(3) }}s · {{ width }} × {{ height }} · Next: {{ labels[nextMark] }}</p>
        <div v-show="captured" class="frame cal3-media">
          <canvas ref="canvas" aria-label="Captured frame. Click to mark selected landmark, or enter Y pixels above." @click="mark" />
          <template v-for="(y, index) in marks" :key="index">
            <div v-if="y !== null && y !== ''" class="cal3-guide" :style="{ top: `${Number(y) / height * 100}%` }"><span>{{ index + 1 }}</span></div>
          </template>
        </div>
      </div>
    </section>

    <section class="cal3-step">
      <span class="cal3-n uf-d3">03</span>
      <div class="cal3-body">
        <h2 class="uf-t3">Enter the capture measurements</h2>
        <div class="cal3-grid">
          <label class="cal3-field"><span class="uf-t4">Horizontal FOV (degrees)</span><input v-model.number="fov" type="number" min="1" max="179" placeholder="Verify capture settings"></label>
          <label class="cal3-field"><span class="uf-t4">Camera-depth distance (metres)</span><input v-model.number="depth" type="number" min="0" step="0.1"></label>
          <label class="cal3-field"><span class="uf-t4">Distance uncertainty ± metres</span><input v-model.number="depthError" type="number" min="0" step="0.1"></label>
          <label class="cal3-field"><span class="uf-t4">Landmark uncertainty ± pixels</span><input v-model.number="pixelError" type="number" min="0" step="0.5"></label>
          <label class="cal3-field"><span class="uf-t4">Game patch</span><input v-model="patch" placeholder="Patch used for recording"></label>
          <label class="cal3-field"><span class="uf-t4">Target pose</span><select v-model="pose"><option>standing</option><option>crouching</option></select></label>
        </div>
        <label class="cal3-field"><span class="uf-t4">Capture setup and distance source</span><input v-model="setup" placeholder="Map, agent, weapon, position and how distance was measured"></label>
        <p class="uf-t4 cal3-faint">Distance means depth along the camera's forward axis, not a rounded ping or diagonal distance. All landmarks are assumed to lie on that plane.</p>
        <label class="cal3-check"><input v-model="confirmed" type="checkbox"> <span class="uf-t4">I checked the level camera, same floor, full frame, FOV and distance setup.</span></label>
        <p v-if="calculation.error" role="status" class="uf-t4">{{ calculation.error }}</p>
        <div v-if="calculation.result" class="cal3-results">
          <div v-for="(key, label) in { visualHeadHeight: 'Visible head height', headCentreAboveGround: 'Head centre above floor', cameraAboveGround: 'Camera above floor' }" :key="label" class="cal3-result">
            <span class="uf-d3">{{ calculation.result[label].value.toFixed(3) }} m</span>
            <span class="uf-t4">{{ key }} · {{ calculation.result[label].min.toFixed(3) }}–{{ calculation.result[label].max.toFixed(3) }} m</span>
          </div>
        </div>
        <p class="uf-t4 cal3-faint">Ranges cover only the entered pixel and distance uncertainty. Camera tilt, FOV errors and target depth can add systematic error. These are not official dimensions or hitbox measurements.</p>
        <div><UfButton variant="primary" :disabled="!canSave" @click="saveSample">Save sample</UfButton></div>
      </div>
    </section>

    <section class="cal3-step">
      <span class="cal3-n uf-d3">04</span>
      <div class="cal3-body">
        <h2 class="uf-t3">Export for validation</h2>
        <p class="uf-t4">{{ samples.length }} {{ samples.length === 1 ? 'sample' : 'samples' }} saved. The export includes the captured frames, annotations, settings and measurement bounds.</p>
        <div class="cal3-actions">
          <UfButton variant="secondary" :disabled="samples.length === 0" @click="exportSamples">Export calibration evidence</UfButton>
          <button type="button" class="uf-link uf-t4" :disabled="samples.length === 0" @click="samples.pop()">Remove last sample</button>
        </div>
      </div>
    </section>
  </main>
  <main v-else class="calibration">
    <RouterLink to="/training">← Training Hub</RouterLink>
    <h1>Valorant calibration</h1>
    <p>Measure a local recording to help calibrate the aim trainer. Prototype: manual landmarks, visual estimates only.</p>
    <section>
      <h2>1. Choose a controlled recording</h2>
      <p>Use an uncropped, unstretched first-person frame with a level camera, no ADS, and a stationary target near screen centre. Keep the target's feet on the same flat floor as the player. Record several distances separately.</p>
      <label>Recording <input type="file" accept="video/*" @change="loadRecording"></label>
      <p class="muted">The recording stays on this device. Saved samples stay in this page until exported; leaving clears them.</p>
      <video v-if="url" ref="video" :src="url" controls preload="metadata" @loadeddata="ready = true" @error="ready = false; error = 'Cannot decode this recording. Try an MP4 with H.264 video.'" />
      <button :disabled="!ready" @click="capture">Capture paused frame</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </section>
    <section>
      <h2>2. Mark the captured frame</h2>
      <p>Select a landmark, then click its height on the frame. Adjust the pixel value for precision.</p>
      <div class="fields">
        <div v-for="(label, index) in labels" :key="label" class="landmark">
          <button :aria-pressed="nextMark === index" @click="nextMark = index">{{ label }}</button>
          <input v-model.number="marks[index]" type="number" min="0" :max="height - 1" :disabled="!captured" :aria-label="`${label} Y pixel`">
        </div>
      </div>
      <p v-if="captured">Frame {{ timestamp.toFixed(3) }}s · {{ width }} × {{ height }} · Next: {{ labels[nextMark] }}</p>
      <div v-show="captured" class="frame">
        <canvas ref="canvas" aria-label="Captured frame. Click to mark selected landmark, or enter Y pixels above." @click="mark" />
        <template v-for="(y, index) in marks" :key="index">
          <div v-if="y !== null && y !== ''" class="guide" :style="{ top: `${Number(y) / height * 100}%` }"><span>{{ index + 1 }}</span></div>
        </template>
      </div>
    </section>
    <section>
      <h2>3. Enter the capture measurements</h2>
      <div class="fields">
        <label>Horizontal FOV (degrees)<input v-model.number="fov" type="number" min="1" max="179" placeholder="Verify capture settings"></label>
        <label>Camera-depth distance (metres)<input v-model.number="depth" type="number" min="0" step="0.1"></label>
        <label>Distance uncertainty ± metres<input v-model.number="depthError" type="number" min="0" step="0.1"></label>
        <label>Landmark uncertainty ± pixels<input v-model.number="pixelError" type="number" min="0" step="0.5"></label>
        <label>Game patch<input v-model="patch" placeholder="Patch used for recording"></label>
        <label>Target pose<select v-model="pose"><option>standing</option><option>crouching</option></select></label>
      </div>
      <label>Capture setup and distance source<input v-model="setup" placeholder="Map, agent, weapon, position and how distance was measured"></label>
      <p class="muted">Distance means depth along the camera's forward axis, not an unchecked rounded ping or diagonal distance. These calculations assume all landmarks lie on that plane.</p>
      <label class="confirm"><input v-model="confirmed" type="checkbox"> I checked the level camera, same floor, full frame, FOV and distance setup.</label>
      <p v-if="calculation.error" role="status">{{ calculation.error }}</p>
      <dl v-if="calculation.result">
        <template v-for="(key, label) in { visualHeadHeight: 'Visible head height', headCentreAboveGround: 'Head centre above floor', cameraAboveGround: 'Camera above floor' }" :key="label">
          <dt>{{ key }}</dt>
          <dd>{{ calculation.result[label].value.toFixed(3) }} m <span class="muted">({{ calculation.result[label].min.toFixed(3) }}–{{ calculation.result[label].max.toFixed(3) }} m)</span></dd>
        </template>
      </dl>
      <p class="muted">Ranges cover only the entered pixel and distance uncertainty. Camera tilt, FOV errors and target depth can add systematic error. These are not official dimensions or hitbox measurements.</p>
      <button :disabled="!canSave" @click="saveSample">Save sample</button>
    </section>
    <section>
      <h2>4. Export for validation</h2>
      <p>{{ samples.length }} samples saved. Export includes the captured frames, annotations, settings and measurement bounds. Trainer settings are not changed.</p>
      <button :disabled="samples.length === 0" @click="exportSamples">Export calibration evidence</button>
      <button :disabled="samples.length === 0" @click="samples.pop()">Remove last sample</button>
    </section>
  </main>
</template>

<style scoped>
.calibration { box-sizing: border-box; font-family: system-ui, sans-serif; color: #e5e7eb; max-width: 1100px; width: 100%; margin: 0 auto; padding: 24px; overflow-y: auto; }
h1 { font-size: 24px; font-weight: 700; margin: 16px 0 8px; }
h2 { font-size: 17px; font-weight: 650; margin-bottom: 10px; }
p { font-size: 13px; line-height: 1.6; margin: 10px 0; }
section { border-top: 1px solid #374151; padding: 22px 0; margin-top: 18px; }
a { color: #fca5a5; }
label { display: flex; flex-direction: column; gap: 7px; font-size: 13px; margin-bottom: 12px; }
input, select { background: #111827; border: 1px solid #4b5563; border-radius: 5px; padding: 9px; color: #f3f4f6; min-width: 0; }
button { background: #292e38; color: #fff; border: 1px solid #596171; border-radius: 5px; padding: 9px 12px; margin: 4px 8px 4px 0; font-size: 13px; cursor: pointer; }
button[aria-pressed='true'] { border-color: #f87171; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid #fca5a5; outline-offset: 2px; }
.landmark { display: flex; flex-direction: column; gap: 7px; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
video { display: block; width: 100%; max-height: 480px; background: #000; margin: 12px 0; }
.frame { position: relative; }
canvas { display: block; width: 100%; cursor: crosshair; }
.guide { position: absolute; left: 0; right: 0; height: 1px; background: #ff5757; pointer-events: none; }
.guide span { background: #111827; color: #fff; font-size: 10px; }
.muted { color: #9ca3af; }
.confirm { flex-direction: row; align-items: center; }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px; margin: 16px 0; }
</style>

<style scoped>
/* UI v3: own markup (cal3); the legacy branch keeps the styles above. */
.cal3 { box-sizing: border-box; height: 100%; overflow-y: auto; padding: 28px 40px 48px; display: flex; flex-direction: column; gap: 8px; color: var(--uf-bone); }
.cal3 p { margin: 0; max-width: 760px; }
.cal3-head { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; padding-bottom: 18px; }
.cal3-head h1 { margin: 0; }
.cal3-step { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 16px; padding: 22px 0; border-top: 1px solid var(--uf-line); }
.cal3-n { color: var(--uf-faint); }
.cal3-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.cal3-body h2 { margin: 0; }
.cal3-faint { color: var(--uf-faint); }
.cal3-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px 16px; }
.cal3-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cal3-field input, .cal3-field select { background: var(--uf-raised); border: 1px solid var(--uf-line-2); border-radius: 0; color: var(--uf-bone); font: 400 15px/1.2 var(--uf-body); padding: 10px; min-width: 0; }
.cal3-field input:focus-visible, .cal3-field select:focus-visible { outline: 2px solid var(--uf-red); outline-offset: 2px; }
.cal3-mark { text-align: left; background: none; border: 0; border-left: 2px solid var(--uf-line-2); padding: 6px 10px; color: var(--uf-muted); font: 600 15px/1.3 var(--uf-body); cursor: pointer; }
.cal3-mark.is-on { border-left-color: var(--uf-red); color: var(--uf-bone); }
.cal3-media { display: block; width: 100%; max-height: 480px; background: #000; border: 1px solid var(--uf-line); }
.cal3 .frame { position: relative; max-height: none; }
.cal3 canvas { display: block; width: 100%; cursor: crosshair; }
.cal3-guide { position: absolute; left: 0; right: 0; height: 1px; background: var(--uf-red); pointer-events: none; }
.cal3-guide span { background: var(--uf-chrome); color: var(--uf-bone); font: 600 12px/1 var(--uf-body); padding: 2px 4px; }
.cal3-check { display: flex; gap: 10px; align-items: center; }
.cal3-check input { width: 16px; height: 16px; accent-color: var(--uf-red); }
.cal3-results { display: flex; flex-wrap: wrap; gap: 28px; padding: 14px 0; border-top: 1px solid var(--uf-line); }
.cal3-result { display: flex; flex-direction: column; gap: 6px; }
.cal3-actions { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
</style>
