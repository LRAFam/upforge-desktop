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

      // Prefer a named screen source — more reliable for fullscreen games than window capture
      const source =
        sources.find(s => /^screen\s*\d*$/i.test(s.name)) ??
        sources.find(s => /entire screen|display|monitor/i.test(s.name)) ??
        sources[0]

      if (!source) throw new Error('No desktop sources found for capture')

      const maxWidth = config.quality === '1080p' ? 1920 : 1280
      const maxHeight = config.quality === '1080p' ? 1080 : 720

      // desktopCapturer still requires chromeMediaSource/chromeMediaSourceId in
      // mandatory, but resolution and frame rate constraints are more reliably
      // enforced as top-level modern constraints alongside mandatory.
      const videoConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
        },
        // Top-level modern constraints — Chromium honours these over the
        // deprecated maxWidth/maxHeight/maxFrameRate in mandatory
        width:     { ideal: maxWidth,    max: maxWidth },
        height:    { ideal: maxHeight,   max: maxHeight },
        frameRate: { ideal: config.fps,  max: config.fps },
        cursor: 'never',
      } as MediaTrackConstraints

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

      // Codec priority: H.264 hardware (GPU, lowest CPU impact) → VP8 → VP9 (last
      // resort — software-only, crushes CPU and will cause game frame drops).
      // H.264 uses NVENC/AMF/QSV on Windows, VideoToolbox on macOS.
      const mimeType =
        MediaRecorder.isTypeSupported('video/webm;codecs=h264')
          ? 'video/webm;codecs=h264'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
              ? 'video/webm;codecs=vp9,opus'
              : 'video/webm'

      console.info('[DesktopRecording] Using codec:', mimeType)

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: config.bitrate * 1_000_000,
        audioBitsPerSecond: 128_000,
      })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          e.data.arrayBuffer().then((buffer) => {
            window.api.desktopCapture.sendChunk(buffer)
          })
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
