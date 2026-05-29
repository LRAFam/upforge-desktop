import { onMounted, onUnmounted } from 'vue'

interface StartConfig {
  quality: '720p' | '1080p'
  bitrate: number
  fps: number
  audioEnabled: boolean
  game: string
}

/**
 * Handles MediaRecorder-based screen capture in the renderer process.
 * Called from App.vue so it's always active while the app is running.
 *
 * The main process sends 'desktop-recording:start' / 'desktop-recording:stop'
 * IPC events and this composable responds by managing a MediaRecorder session.
 * Chunks are sent back via IPC for incremental disk writing by the main process.
 */
export function useDesktopRecording() {
  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  const cleanups: Array<() => void> = []

  async function startRecording(config: StartConfig) {
    try {
      const sources = await window.api.desktopCapture.getSources()

      // All sources are screen (display) sources — prefer Screen 1 / primary display.
      // On Windows these are named "Screen 1", "Screen 2"; on macOS "Built-in Retina Display" etc.
      const source =
        sources.find(s => /^screen\s*1$/i.test(s.name)) ??
        sources.find(s => /^screen\s*\d*$/i.test(s.name)) ??
        sources.find(s => /entire screen|display|monitor|retina|built-in/i.test(s.name)) ??
        sources[0]

      if (!source) throw new Error('No desktop sources found for capture')

      // Tell the main process which source we're about to capture.
      // setDisplayMediaRequestHandler (required in Electron 20+) reads this
      // back when getUserMedia fires, so it can return the correct source.
      await window.api.desktopCapture.setSource(source.id)

      const maxWidth = config.quality === '1080p' ? 1920 : 1280
      const maxHeight = config.quality === '1080p' ? 1080 : 720

      // desktopCapturer requires chromeMediaSource / chromeMediaSourceId in
      // mandatory. All other constraints must also go in mandatory — Chromium
      // throws "Malformed constraint: Cannot use both optional/mandatory and
      // specific or advanced constraints" if you mix mandatory with top-level keys.
      const videoConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxWidth: maxWidth,
          maxHeight: maxHeight,
          maxFrameRate: config.fps,
        },
      } as unknown as MediaTrackConstraints

      let noAudio = false

      // Try with system audio first, fall back gracefully to video-only
      try {
        const audioConstraints = config.audioEnabled
          ? ({ mandatory: { chromeMediaSource: 'desktop' } } as MediaTrackConstraints)
          : (false as const)

        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints,
        })
      } catch (audioErr) {
        console.warn('[DesktopRecording] Audio unavailable, recording video-only:', audioErr)
        noAudio = true
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        })
      }

      // Codec priority: VP9 (native WebM codec, hardware-accelerated on modern GPUs) →
      // VP8 (universal WebM fallback) → H.264 in WebM (non-standard, avoid if possible).
      // H.264 in WebM is produced by some Chromium builds but is non-standard and can
      // confuse ffmpeg remux; VP9/VP8 remux to MP4 is more reliable.
      const mimeType =
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=h264')
              ? 'video/webm;codecs=h264'
              : 'video/webm'

      console.info('[DesktopRecording] Using codec:', mimeType)

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: config.bitrate * 1_000_000,
        audioBitsPerSecond: 128_000,
      })

      let emptyChunkCount = 0
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          emptyChunkCount = 0
          e.data.arrayBuffer().then((buffer) => {
            window.api.desktopCapture.sendChunk(buffer)
          })
        } else {
          emptyChunkCount++
          // 3+ consecutive empty chunks = capture is silently broken (common when
          // macOS Screen Recording permission is not granted for this app).
          if (emptyChunkCount >= 3) {
            const hint = navigator.platform.startsWith('Mac')
              ? 'Check Screen Recording permission: System Settings → Privacy & Security → Screen Recording'
              : 'Screen capture returned no data — check display capture permissions'
            window.api.desktopCapture.sendError(hint)
            cleanup()
          }
        }
      }

      mediaRecorder.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop())
        stream = null
        mediaRecorder = null
        window.api.desktopCapture.sendComplete()
      }

      mediaRecorder.onerror = (e) => {
        const msg = (e as Event & { error?: { message?: string } }).error?.message ?? 'MediaRecorder error'
        console.error('[DesktopRecording] MediaRecorder error:', msg)
        window.api.desktopCapture.sendError(msg)
        cleanup()
      }

      // 1-second chunks — small enough for smooth writes, large enough to avoid overhead
      mediaRecorder.start(1_000)

      window.api.desktopCapture.sendStarted(noAudio)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[DesktopRecording] Failed to start:', msg)
      window.api.desktopCapture.sendError(msg)
      cleanup()
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
  }

  function cleanup() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop() } catch { /* ignore */ }
    }
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    mediaRecorder = null
  }

  onMounted(() => {
    const startOff = window.api.on('desktop-recording:start', (...args) => {
      const config = args[0] as StartConfig
      startRecording(config)
    })
    const stopOff = window.api.on('desktop-recording:stop', () => {
      stopRecording()
    })
    cleanups.push(startOff, stopOff)
  })

  onUnmounted(() => {
    cleanup()
    cleanups.forEach((fn) => fn())
    cleanups.length = 0
  })
}
