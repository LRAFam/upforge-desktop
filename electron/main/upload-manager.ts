import { createReadStream, statSync } from 'fs'
import FormData from 'form-data'
import { AuthManager } from './auth-manager'

interface UploadOptions {
  game: string
  videoPath: string
  timeline: Record<string, unknown> | null
  onProgress: (pct: number) => void
  onComplete: (jobId: string) => void
  onError: (err: string) => void
}

const POLL_INTERVAL_MS = 10000
const MAX_POLL_ATTEMPTS = 60 // 10 minutes

export class UploadManager {
  constructor(private auth: AuthManager) {}

  async upload(opts: UploadOptions): Promise<void> {
    const { game, videoPath, timeline, onProgress, onComplete, onError } = opts

    try {
      const api = this.auth.getApi()
      const user = this.auth.getUser()

      const form = new FormData()
      const fileSize = statSync(videoPath).size

      const stream = createReadStream(videoPath)
      let uploaded = 0

      stream.on('data', (chunk: Buffer | string) => {
        uploaded += typeof chunk === 'string' ? chunk.length : chunk.length
        onProgress(Math.round((uploaded / fileSize) * 100))
      })

      form.append('video', stream, {
        filename: `${game}_recording.mp4`,
        contentType: 'video/mp4',
        knownLength: fileSize
      })

      form.append('game', game)

      if (timeline) {
        form.append('match_timeline', JSON.stringify(timeline))
      }

      if (user?.riot_name) form.append('riot_name', user.riot_name)
      if (user?.riot_tag) form.append('riot_tag', user.riot_tag)

      const res = await api.post('/api/desktop-submissions', form, {
        headers: { ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      })

      const jobId = res.data?.job_id
      if (!jobId) throw new Error('No job_id returned from server')

      onProgress(100)
      onComplete(jobId)
    } catch (err: unknown) {
      const message = (err as Error).message || 'Upload failed'
      onError(message)
    }
  }

  pollJobStatus(
    jobId: string,
    onReady: (result: Record<string, unknown>) => void
  ): void {
    let attempts = 0
    const api = this.auth.getApi()

    const poll = async (): Promise<void> => {
      attempts++
      if (attempts > MAX_POLL_ATTEMPTS) {
        console.warn('[UploadManager] Poll timed out for job:', jobId)
        return
      }

      try {
        const res = await api.get(`/api/desktop-submissions/${jobId}/status`)
        const { status, result } = res.data

        if (status === 'completed' && result) {
          onReady(result)
          return
        }

        if (status === 'failed') {
          console.error('[UploadManager] Job failed:', jobId)
          return
        }
      } catch (err) {
        console.error('[UploadManager] Poll error:', err)
      }

      setTimeout(poll, POLL_INTERVAL_MS)
    }

    setTimeout(poll, POLL_INTERVAL_MS)
  }
}
