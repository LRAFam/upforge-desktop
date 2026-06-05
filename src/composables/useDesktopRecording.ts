import { onMounted, onUnmounted } from 'vue'

interface StartConfig {
  quality: '720p' | '1080p'
  bitrate: number
  fps: number
  audioEnabled: boolean
  game: string
  captureMonitor?: number
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

      // Select the correct screen source.
      // captureMonitor is a resolved 0-based index from the main process. Screen source IDs
      // follow the pattern "screen:<displayIndex>:<something>" on Windows and macOS.
      // If no match by ID pattern, fall back to positional index, then to "Screen 1" by name.
      let source: { id: string; name: string } | undefined
      if (typeof config.captureMonitor === 'number') {
        const idx = config.captureMonitor
        source =
          sources.find(s => {
            const m = s.id.match(/^screen:(\d+)/)
            return m ? parseInt(m[1]) === idx : false
          }) ??
          sources[idx] ??
          sources[0]
        console.info(`[DesktopRecording] Monitor ${idx} → source "${source?.name}" (${source?.id})`)
      } else {
        // Fallback: pick Screen 1 / primary by name
        source =
          sources.find(s => /^screen\s*1$/i.test(s.name)) ??
          sources.find(s => /^screen\s*\d*$/i.test(s.name)) ??
          sources.find(s => /entire screen|display|monitor|retina|built-in/i.test(s.name)) ??
          sources[0]
      }

      if (!source) throw new Error('No desktop sources found for capture')

      // Tell the main process which source we're about to capture.
      // setDisplayMediaRequestHandler intercepts getDisplayMedia() and returns
      // the pre-selected source without showing the OS picker.
      await window.api.desktopCapture.setSource(source.id, config.audioEnabled)

      const maxWidth = config.quality === '1080p' ? 1920 : 1280
      const maxHeight = config.quality === '1080p' ? 1080 : 720

      // Use getDisplayMedia (intercepted by setDisplayMediaRequestHandler in the main
      // process) so we can pass cursor:'never'. getUserMedia with chromeMediaSource:
      // 'desktop' always includes the cursor and doesn't support the cursor constraint.
      //
      // ideal + max only — Electron's setDisplayMediaRequestHandler rejects `min` constraints
      // ("min constraints are not supported") and never forwards them to the capture session.
      // cursor:'never' is a Screen Capture API extension not in standard TypeScript lib.
      const strictVideoConstraints = {
        width: { ideal: maxWidth, max: maxWidth },
        height: { ideal: maxHeight, max: maxHeight },
        frameRate: { ideal: config.fps, max: config.fps },
        cursor: 'never',
      } as MediaTrackConstraints

      const looseVideoConstraints = {
        width: { ideal: maxWidth },
        height: { ideal: maxHeight },
        frameRate: { ideal: config.fps },
        cursor: 'never',
      } as MediaTrackConstraints

      const audioConstraints: boolean | MediaTrackConstraints = config.audioEnabled
        ? ({
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
            // @ts-expect-error Chromium desktop-capture extension
            suppressLocalAudioPlayback: true,
          } as MediaTrackConstraints)
        : false

      async function acquireStream(audio: boolean | MediaTrackConstraints): Promise<MediaStream> {
        try {
          return await navigator.mediaDevices.getDisplayMedia({
            video: strictVideoConstraints,
            audio,
          })
        } catch (strictErr) {
          const msg = strictErr instanceof Error ? strictErr.message : String(strictErr)
          if (!/min constraints|constraint/i.test(msg)) throw strictErr
          console.warn('[DesktopRecording] Strict constraints rejected, retrying with ideal-only:', msg)
          return navigator.mediaDevices.getDisplayMedia({
            video: looseVideoConstraints,
            audio,
          })
        }
      }

      let noAudio = false

      // Try with system audio (loopback via handler) first, fall back to video-only.
      try {
        stream = await acquireStream(audioConstraints)
      } catch (audioErr) {
        console.warn('[DesktopRecording] Audio unavailable, recording video-only:', audioErr)
        noAudio = true
        stream = await acquireStream(false)
      }

      // Re-apply cursor:'never' after the stream is created. When setDisplayMediaRequestHandler
      // provides a custom source, Chromium/Electron may not forward the original constraint to
      // the underlying WGC/SCK capture session. applyConstraints() re-triggers the cursor flag.
      // We apply immediately AND after a short delay — some platforms (macOS SCK) apply the
      // constraint asynchronously after the capture session is fully initialised.
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        const applyCursorNever = async () => {
          try {
            await videoTrack.applyConstraints({
              cursor: 'never',
              // advanced array forces Chromium to re-evaluate cursor policy on the underlying session
              advanced: [{ cursor: 'never' } as MediaTrackConstraintSet],
            } as MediaTrackConstraints)
            console.info('[DesktopRecording] cursor:never applied to video track')
          } catch (err) {
            console.warn('[DesktopRecording] cursor:never applyConstraints failed:', err)
          }
        }
        await applyCursorNever()
        // Second pass after 250ms — macOS SCK initialises capture asynchronously and may
        // not honour the constraint until the session is fully active.
        setTimeout(applyCursorNever, 250)

        const settings = videoTrack.getSettings()
        console.info(
          `[DesktopRecording] Capture track: ${settings.width ?? '?'}x${settings.height ?? '?'} ` +
          `@ ${settings.frameRate ?? '?'}fps (requested ${maxWidth}x${maxHeight} @ ${config.fps}fps)`
        )
        if (settings.frameRate && settings.frameRate < config.fps - 1) {
          console.warn(
            `[DesktopRecording] OS capped frame rate at ${settings.frameRate}fps — ` +
            'on Windows, enable ffmpeg recording (default when bundled ffmpeg is present)'
          )
        }
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
        audioBitsPerSecond: 192_000,
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

      // 250ms chunks — fine-grained enough for smooth audio/video sync while keeping
      // IPC overhead low. 1s chunks cause noticeable audio choppiness on some systems.
      mediaRecorder.start(250)

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
