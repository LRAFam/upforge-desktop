import { parseDrillMoments } from './drill-moments'

interface Context {
  drillId: unknown
  momentIndex: unknown
  analysisId: number | null
  videoSource: string | null
  video: Pick<HTMLVideoElement, 'readyState' | 'duration' | 'currentSrc'> | null
}

/** Query strings identify saved evidence; only the API's matching recording supplies media/time. */
export function createDrillMomentSeek(options: {
  context: () => Context
  request: (drillId: number) => Promise<unknown>
  setSource: (url: string) => void
  seek: (seconds: number) => void
  unavailable?: () => void
}) {
  let generation = 0
  let pending: { key: string; seconds: number; url: string } | null = null
  let applied: { key: string; url: string } | null = null
  const selection = () => {
    const c = options.context()
    if (typeof c.drillId !== 'string' || !/^[1-9]\d*$/.test(c.drillId)
      || typeof c.momentIndex !== 'string' || !/^[0-2]$/.test(c.momentIndex)
      || !Number.isSafeInteger(Number(c.drillId)) || !Number.isSafeInteger(c.analysisId) || !c.analysisId || c.videoSource === null) return null
    return { ...c, id: Number(c.drillId), index: Number(c.momentIndex), key: `${c.drillId}:${c.momentIndex}:${c.analysisId}` }
  }
  function cancel() { generation++; pending = null; applied = null }
  function mediaReady() {
    const c = selection()
    if (!pending || !c || c.key !== pending.key || c.videoSource !== pending.url || !c.video || c.video.readyState < 1 || c.video.currentSrc !== pending.url) return
    const { seconds, key, url } = pending
    const duration = c.video.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    pending = null
    if (seconds >= duration) return
    applied = { key, url }
    options.seek(seconds)
  }
  async function load(force = false) {
    const c = selection()
    if (!c) { cancel(); return }
    // Setting the verified URL triggers the Vue source watcher. That is not another API request.
    if (!force && pending?.key === c.key && pending.url === c.videoSource) { mediaReady(); return }
    if (!force && applied?.key === c.key && applied.url === c.videoSource) return
    cancel()
    const request = generation
    try {
      const raw = await options.request(c.id)
      const now = selection()
      if (request !== generation || now?.key !== c.key || now.videoSource !== c.videoSource) return
      const parsed = parseDrillMoments(raw, c.id)
      if (parsed?.reviewId !== c.analysisId || !parsed.playback) { options.unavailable?.(); return }
      const moment = parsed.sourceMoments.find(m => m.index === c.index)
      if (!moment || moment.sourceIdentity !== parsed.playback.sourceIdentity) { options.unavailable?.(); return }
      pending = { key: c.key, seconds: moment.seconds, url: parsed.playback.url }
      if (force || c.videoSource !== parsed.playback.url) options.setSource(parsed.playback.url)
      mediaReady()
    } catch { if (request === generation && selection()?.key === c.key) options.unavailable?.() }
  }
  return { load, cancel, mediaReady }
}
