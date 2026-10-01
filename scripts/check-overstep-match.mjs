/** Read-only verification against the running native UpForge integration. Never changes recording policy. */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
const matchId = option('--match')
const output = option('--output')
if (!matchId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(matchId)) throw new Error('Use --match <match UUID> and optionally --output <report.json>')
const connection = JSON.parse(await readFile(option('--connection') || join(homedir(), '.upforge', 'overstep-bridge.json'), 'utf8'))
if (connection.host !== '127.0.0.1' || !Number.isInteger(connection.port) || connection.port < 1024 || connection.port > 65535 || !/^[a-f0-9]{64}$/.test(connection.token)) throw new Error('Invalid local integration discovery file')
async function get(path) {
  const response = await fetch(`http://127.0.0.1:${connection.port}${path}`, { headers: { Authorization: `Bearer ${connection.token}` }, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Native API returned ${response.status} for ${path}`)
  return response.json()
}
const capabilities = await get('/v1/capabilities')
const match = await get(`/v1/matches/${matchId}`)
const events = []; let after = -1
for (;;) {
  const page = await get(`/v1/matches/${matchId}/events?after=${after}`)
  if (!page.events.length) break
  if (page.nextAfter <= after) throw new Error('Timeline pagination did not advance')
  events.push(...page.events); after = page.nextAfter
}
const start = events.find(e => e.type === 'match_started')
const videoExists = match.recording.videoPath ? await stat(match.recording.videoPath).then(s => s.isFile()).catch(() => false) : false
const checks = {
  supportedSchema: capabilities.schemaVersion === 2,
  completedMatch: match.status === 'completed',
  contiguousEvents: events.length > 0 && events.every((e, i) => e.seq === i),
  terminalResult: events.at(-1)?.type === 'match_ended',
  killTotalsAgree: match.players.reduce((n, p) => n + p.kills, 0) === events.filter(e => e.type === 'kill').length,
  deathTotalsAgree: match.players.reduce((n, p) => n + p.deaths, 0) === events.filter(e => e.type === 'kill').length,
  recordingDecision: start?.data.captureState === 'skipped' ? match.recording.state === 'skipped' && !videoExists : start?.data.captureState === 'recording' && match.recording.state === 'ready' && match.recording.capturedFromStart && videoExists,
}
const report = { matchId, mode: match.mode, checks, passed: Object.values(checks).every(Boolean), manualChecksRemaining: ['Play the actual recording and check game-window content, audio and visible event alignment.'] }
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
