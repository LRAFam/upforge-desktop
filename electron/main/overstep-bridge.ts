import { matchStats, profileStats, parseRecordingPolicy, type OverstepRecordingPolicy, type OverstepMode } from '../../src/lib/overstep-stats'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, unlinkSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseOverstepPacket, syncIssue, type OverstepSession, type OverstepStatus, type VideoAnchor } from '../../src/lib/overstep'

export interface OverstepRecorder {
  busy(): boolean
  start(): Promise<void>
  anchor(): Promise<VideoAnchor>
  stop(): Promise<string | null>
}
class CaptureBusyError extends Error {}
export class OverstepBridge {
  private policy: OverstepRecordingPolicy = { recordedModes: ['circuit', 'crosscurrent'] }
  private server: Server | null = null
  private token = ''
  private enabling: Promise<void> | null = null
  private sessions = new Map<string, OverstepSession>()
  private active: OverstepSession | null = null
  private operation: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setInterval> | null = null
  private sampling = false
  private lastPackets = new Map<string, number>()
  private error: string | null = null
  private ownsRecording = false
  private finishing = false
  private anchorOperation: Promise<void> = Promise.resolve()
  constructor(private root: string, private connectionFile: string, private recorder: OverstepRecorder) {
    mkdirSync(root, { recursive: true })
    if (existsSync(join(root, 'recording-policy.json'))) this.policy = parseRecordingPolicy(JSON.parse(readFileSync(join(root, 'recording-policy.json'), 'utf8')))
    for (const id of readdirSync(root)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue
      try {
        const dir = join(root, id)
        const s = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) as OverstepSession
        const lines = (file: string) => readFileSync(join(dir, file), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
        s.events = lines('events.jsonl'); s.anchors = lines('anchors.jsonl')
        for (let i = 0; i < s.events.length; i += 128) parseOverstepPacket({ manifest: s.manifest, events: s.events.slice(i, i + 128), sentAtMs: Date.now() })
        if (!Array.isArray(s.anchors) || s.anchors.some(a => !a || ![a.epochMs, a.videoMs, a.uncertaintyMs].every(Number.isFinite))) throw new Error('Invalid saved recording clock')
        if (s.events.some((e, i) => e.seq !== i || (i > 0 && e.elapsedMs < s.events[i - 1].elapsedMs))) throw new Error('Invalid saved event sequence')
        if (s.manifest.matchId !== id) throw new Error('Session identity mismatch')
        if (['starting', 'recording', 'finalizing'].includes(s.state)) { s.state = 'incomplete'; s.error = 'UpForge closed before the recording was finalized.' }
        // Upgrade old session metadata from the canonical event log, then mark unfinished data interrupted.
        const end = s.events.at(-1)
        s.dataState = end?.type === 'match_ended' ? (end.data.reason === 'completed' ? 'complete' : 'abandoned') : 'interrupted'
        s.dataError = s.dataState === 'interrupted' ? 'UpForge closed before the match result arrived.' : null
        this.sessions.set(id, s); this.save(s)
      } catch { this.error = 'A saved Overstep session could not be read. Its files have been preserved.' }
    }
  }
  recordingPolicy(): OverstepRecordingPolicy { return { recordedModes: [...this.policy.recordedModes] } }
  setRecordingPolicy(value: unknown): OverstepRecordingPolicy {
    const policy = parseRecordingPolicy(value)
    writeFileSync(join(this.root, 'recording-policy.tmp'), JSON.stringify(policy))
    renameSync(join(this.root, 'recording-policy.tmp'), join(this.root, 'recording-policy.json'))
    this.policy = policy; return this.recordingPolicy()
  }
  private videoAvailable(s: OverstepSession): boolean {
    if (!s.videoPath) return false
    try { return statSync(s.videoPath).isFile() } catch { return false }
  }
  matchSummaries() { return [...this.sessions.values()].sort((a, b) => b.manifest.startedAtMs - a.manifest.startedAtMs).map(s => matchStats(s, this.videoAvailable(s))) }
  playerStats(profileId: string, mode?: OverstepMode) { return profileStats([...this.sessions.values()], profileId, mode) }
  captureState(id: string): string {
    const s = this.sessions.get(id)
    if (!s) throw new Error('Unknown match')
    return s.state === 'starting' ? 'starting' : s.state === 'recording' ? 'recording' : s.state === 'skipped' ? 'skipped' : 'failed'
  }
  isBusy(): boolean { return this.active !== null }
  status(): OverstepStatus {
    return { enabled: this.server !== null, error: this.error, sessions: [...this.sessions.values()].reverse().map(s => ({
      ...s,
      videoUrl: s.videoPath && this.videoAvailable(s) ? pathToFileURL(s.videoPath).href : null,
    })) }
  }
  private save(s: OverstepSession): void {
    const dir = join(this.root, s.manifest.matchId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.tmp'), JSON.stringify({ ...s, events: [], anchors: [] }))
    renameSync(join(dir, 'session.tmp'), join(dir, 'session.json'))
  }
  enable(): Promise<void> {
    if (this.server) return Promise.resolve()
    if (!this.enabling) this.enabling = this.enableServer().finally(() => { this.enabling = null })
    return this.enabling
  }
  private async enableServer(): Promise<void> {
    this.token = randomBytes(32).toString('hex')
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (req.headers.origin || req.headers.authorization !== `Bearer ${this.token}`) { res.writeHead(403).end(); return }
      const url = new URL(req.url!, 'http://127.0.0.1')
      const json = (data: unknown, code = 200) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
      if (req.method === 'GET') {
        if (url.pathname === '/v1/capabilities') { json({ game: 'overstep', schemaVersion: 2, authority: 'local', modes: ['circuit', 'crosscurrent'], weapons: ['r04', 'knife'], headshotPercentage: '100 * landed firearm head hits / landed firearm hits', recordingPreparationTimeoutMs: 15000 }); return }
        if (url.pathname === '/v1/recording-policy') { json(this.recordingPolicy()); return }
        if (url.pathname === '/v1/matches') { json(this.matchSummaries()); return }
        const timeline = /^\/v1\/matches\/([a-f0-9-]{36})\/events$/.exec(url.pathname)
        if (timeline) {
          const session = this.sessions.get(timeline[1])
          if (!session) { json({ error: 'Match not found' }, 404); return }
          const after = url.searchParams.has('after') ? Number(url.searchParams.get('after')) : -1
          if (!Number.isInteger(after) || after < -1) { json({ error: 'after must be an event sequence number' }, 422); return }
          const events = session.events.filter(e => e.seq > after).slice(0, 128)
          json({ events, nextAfter: events.length ? events[events.length - 1].seq : after }); return
        }
        const match = /^\/v1\/matches\/([a-f0-9-]{36})$/.exec(url.pathname)
        if (match) { const summary = this.matchSummaries().find(m => m.matchId === match[1]); json(summary || { error: 'Match not found' }, summary ? 200 : 404); return }
        const profile = /^\/v1\/players\/([a-f0-9-]{36})\/stats$/.exec(url.pathname)
        if (profile) {
          const mode = url.searchParams.get('mode')
          if (mode !== null && mode !== 'circuit' && mode !== 'crosscurrent') { json({ error: 'Unsupported mode' }, 422); return }
          json(this.playerStats(profile[1], mode === null ? undefined : mode)); return
        }
        json({ error: 'Route not found' }, 404); return
      }
      if (!((req.method === 'POST' && url.pathname === '/events') || (req.method === 'PUT' && url.pathname === '/v1/recording-policy'))) { json({ error: 'Route not found' }, 404); return }
      let body = ''; let bytes = 0
      req.setTimeout(5000, () => req.destroy())
      try {
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 2_000_000) { res.writeHead(413).end(); req.destroy(); return }; body += chunk.toString() }
        if (req.method === 'PUT') { json(this.setRecordingPolicy(JSON.parse(body))); return }
        const packet = parseOverstepPacket(JSON.parse(body)); this.accept(packet)
        json({ accepted: true, captureState: this.captureState(packet.manifest.matchId) })
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Invalid telemetry'
        res.writeHead(err instanceof CaptureBusyError ? 503 : 422, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: this.error }))
      }
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') { server.close(); throw new Error('Local bridge failed to bind') }
    try {
      mkdirSync(join(this.connectionFile, '..'), { recursive: true })
      writeFileSync(this.connectionFile, JSON.stringify({ host: '127.0.0.1', port: address.port, token: this.token }), { mode: 0o600 })
      chmodSync(this.connectionFile, 0o600)
    } catch (err) { server.close(); throw err }
    this.server = server
    this.timer = setInterval(() => { void this.sample() }, 1000)
  }
  async disable(): Promise<void> {
    if (this.enabling) await this.enabling
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    // Remove only this instance's discovery file.
    try { if (JSON.parse(readFileSync(this.connectionFile, 'utf8')).token === this.token) unlinkSync(this.connectionFile) } catch { /* file may already be removed */ }
    const server = this.server; this.server = null
    if (server) { server.closeAllConnections(); server.close() }
    for (const s of this.sessions.values()) if (s.dataState === 'receiving') this.interruptData(s, 'Integration disabled before the match result arrived.')
    if (this.active) await this.finish('Recording disabled before the match ended.')
    await this.operation
  }
  accept(value: unknown): void {
    const packet = parseOverstepPacket(value), { manifest, events } = packet
    if (Math.abs(Date.now() - packet.sentAtMs) > 5000) throw new Error('Telemetry packet clock is not current')
    let session = this.sessions.get(manifest.matchId)
    if (session && JSON.stringify(session.manifest) !== JSON.stringify(manifest)) throw new Error('Match manifest changed')
    if (!session) {
      if (this.active) throw new CaptureBusyError('Another recording is already active')
      if (events[0].seq !== 0 || events[0].type !== 'match_preparing') throw new Error('Match start is missing')
      session = { manifest, events: [], anchors: [], state: this.policy.recordedModes.includes(manifest.mode) ? 'starting' : 'skipped', dataState: 'receiving', dataError: null, syncError: null, error: null, videoPath: null }
    }
    const added = [] as typeof events
    let previous = session.events.at(-1)
    for (const event of events) {
      if (event.seq < session.events.length) {
        if (JSON.stringify(session.events[event.seq]) !== JSON.stringify(event)) throw new Error('Conflicting duplicate event')
        continue
      }
      if (event.seq !== session.events.length + added.length || (previous && event.elapsedMs < previous.elapsedMs)) throw new Error('Event sequence has a gap or clock reversal')
      if (previous?.type === 'match_ended') throw new Error('Events follow match end')
      if (event.type === 'match_started' && [...session.events, ...added].some(e => e.type === 'match_started')) throw new Error('Duplicate match start')
      if (event.seq !== 0 && event.type === 'match_preparing') throw new Error('Duplicate match start')
      added.push(event); previous = event
    }
    if (session.events.length + added.length > 50000) throw new Error('Match event limit exceeded')
    if (!added.length) {
      this.lastPackets.set(manifest.matchId, Date.now())
      if (session.dataState === 'interrupted') { session.dataState = 'receiving'; session.dataError = null; this.save(session) }
      return
    }
    const fresh = !this.sessions.has(manifest.matchId)
    if (!fresh && session !== this.active && session.state !== 'failed' && session.state !== 'incomplete' && session.state !== 'skipped') throw new Error('Session has already been finalized')
    const dir = join(this.root, manifest.matchId)
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'events.jsonl'), added.map(e => JSON.stringify(e)).join('\n') + '\n')
    session.events.push(...added); this.lastPackets.set(manifest.matchId, Date.now())
    const end = session.events.at(-1)
    session.dataState = end?.type === 'match_ended' ? (end.data.reason === 'completed' ? 'complete' : 'abandoned') : 'receiving'
    session.dataError = null
    if (fresh) {
      writeFileSync(join(dir, 'anchors.jsonl'), '')
      this.sessions.set(manifest.matchId, session); this.save(session)
      if (session.state !== 'skipped') { this.active = session; this.operation = this.start(session) }
    }
    if (session === this.active && added.some(e => e.type === 'match_ended')) void this.finish()
    else if (session !== this.active) this.save(session)
  }
  private async start(s: OverstepSession): Promise<void> {
    try {
      if (Math.abs(Date.now() - s.manifest.startedAtMs) > 10000) throw new Error('Recording preparation arrived too late. Match statistics are still collected.')
      if (this.recorder.busy()) throw new Error('Another recording is already active')
      await this.recorder.start(); this.ownsRecording = true
      await this.measureAnchor(s)
      s.state = 'recording'; this.save(s)
    } catch (err) {
      s.state = 'failed'; s.error = err instanceof Error ? err.message : 'Recording could not start'
      if (this.ownsRecording) { try { s.videoPath = await this.recorder.stop() } catch { /* original startup failure remains */ } }
      this.ownsRecording = false; this.active = null; this.save(s)
    }
  }
  private measureAnchor(s: OverstepSession): Promise<void> {
    const request = this.anchorOperation.then(async () => { this.addAnchor(s, await this.recorder.anchor()) })
    this.anchorOperation = request.catch(() => {})
    return request
  }
  private addAnchor(s: OverstepSession, a: VideoAnchor): void {
    s.anchors.push(a)
    appendFileSync(join(this.root, s.manifest.matchId, 'anchors.jsonl'), JSON.stringify(a) + '\n')
  }
  private interruptData(s: OverstepSession, reason: string): void {
    s.dataState = 'interrupted'; s.dataError = reason; this.save(s)
  }
  private async sample(): Promise<void> {
    for (const [id, received] of this.lastPackets) {
      const session = this.sessions.get(id)!
      if (session.dataState === 'receiving' && Date.now() - received > 15000) this.interruptData(session, 'Game telemetry stopped before the match result arrived.')
    }
    const s = this.active
    if (!s || s.state !== 'recording' || this.sampling || this.finishing) return
    if (s.dataState === 'interrupted') { await this.finish('Game telemetry stopped before match completion.'); return }
    this.sampling = true
    try { await this.measureAnchor(s) }
    catch { s.syncError = 'Recording sync was interrupted.'; await this.finish('Recording sync was interrupted. Playback is retained without event seeking.') }
    finally { this.sampling = false }
  }
  private async finish(problem: string | null = null): Promise<void> {
    if (this.finishing) return this.operation
    this.finishing = true
    const pending = this.operation
    this.operation = (async () => {
      await pending
      const s = this.active
      if (!s) return
      s.state = 'finalizing'; this.save(s)
      try {
        await this.measureAnchor(s)
        s.videoPath = await this.recorder.stop(); this.ownsRecording = false
        const end = s.events.at(-1)
        s.error = problem || (s.events.find(e => e.type === 'match_started')?.data.captureState !== 'recording' ? 'Recording was not ready before the match started.' : null) || (end?.type !== 'match_ended' || end.data.reason !== 'completed' ? 'Match ended before completion.' : null) || syncIssue(s)
        if (!s.videoPath || !existsSync(s.videoPath)) s.error = 'Recording file is missing.'
        else if (!/\.(mp4|webm|m4v|mov)$/i.test(s.videoPath)) s.error = 'Recording format cannot play here. Configure OBS to record MP4.'
        s.state = s.error ? 'incomplete' : 'ready'
      } catch (err) {
        s.syncError = 'Recording continuity could not be verified.'
        s.state = 'failed'; s.error = err instanceof Error ? err.message : 'Recording could not finalize'
        if (this.ownsRecording) { try { s.videoPath = await this.recorder.stop() } catch { /* keep finalization error */ } }
        this.ownsRecording = false
      } finally { this.save(s); this.active = null }
    })().finally(() => { this.finishing = false })
    return this.operation
  }
}
