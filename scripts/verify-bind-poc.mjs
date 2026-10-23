import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

// Offline integrity/consistency check of the previously source-audited example.
// No credentials, network access, Electron imports or new Riot verification.
const exampleDir = new URL('../docs/poc-recent-matches/', import.meta.url)
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const [payload, provenance] = await Promise.all([
  readJson(process.argv[2] ?? new URL('verified-bind.json', exampleDir)),
  readJson(new URL('bind-source-audit.json', exampleDir)),
])
const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
assert.equal(sha256, provenance.canonicalSha256, 'Export differs from the source-audited file')
const d = payload.match_data
const audited = provenance.liveSourceAudit.match
const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
assert.equal(payload.schemaVersion, 3)
assert.equal(payload.hasRecording, false)
assert.equal(d.recordingStartTime, null)
assert.equal(d.gameplayStartTime, null)
assert.equal(d.matchId, audited.matchId)
assert.equal(d.dataQuality.status, 'verified_fields_only')
assert.deepEqual(d.dataQuality.issues, [])
assert.equal(`${payload.riot_name}#${payload.riot_tag}`, provenance.identity)
assert.equal(d.finalStats.summonerName, provenance.identity)
assert.equal(d.matchStartTime, payload.game_start_time_ms)
assert.equal(d.matchStartTime, d.matchDetailsLite.matchInfo.gameStartMillis)
assert.equal(`${d.finalStats.kills}/${d.finalStats.deaths}/${d.finalStats.assists}`, audited.kda)
assert.equal(d.finalStats.score, audited.acs)
assert.equal(d.finalStats.adr, audited.adr)
assert.equal(d.finalStats.headshotPct, audited.hsPercent)
assert.deepEqual(d.finalScore, audited.finalScore)
assert.equal(d.killEvents.length, audited.lobbyEvents)
assert.equal(d.playerKills.length, d.finalStats.kills)
assert.equal(d.playerDeaths.length, d.finalStats.deaths)
assert.ok(d.playerKills.every(k => sameId(k.killerPuuid, d.puuid)))
assert.ok(d.playerDeaths.every(k => sameId(k.victimPuuid, d.puuid)))
assert.equal(d.spatialSummary, undefined)
assert.ok([...d.killEvents, ...d.playerKills, ...d.playerDeaths].every(k => k.spatial === undefined))

const rounds = d.roundSummaries
for (const stat of ['kills', 'deaths', 'assists']) {
  assert.equal(rounds.reduce((n, r) => n + r.playerStats[stat], 0), d.finalStats[stat])
}
assert.equal(rounds.reduce((n, r) => n + r.playerDamageDealt, 0), audited.rawDamage)
for (const r of rounds) {
  const first = d.killEvents.filter(k => k.round === r.roundNumber)
    .sort((a, b) => a.timeSinceGameStartMillis - b.timeSinceGameStartMillis)[0]
  assert.equal(r.playerGotFirstBlood, sameId(first?.killerPuuid, d.puuid))
  assert.equal(r.playerWasFirstBlood, sameId(first?.victimPuuid, d.puuid))
}
const firstDeathRounds = rounds.filter(r => r.playerWasFirstBlood).map(r => r.roundNumber + 1)
const zeroDamageRounds = rounds.filter(r => r.playerDamageDealt === 0).map(r => r.roundNumber + 1)
assert.equal(firstDeathRounds.length, audited.firstDeaths)
assert.equal(rounds.filter(r => r.playerGotFirstBlood).length, audited.firstKills)

const replay = d.roundReplay
assert.equal(replay.schemaVersion, 2)
assert.equal(replay.positionSource, 'riot_event_snapshots')
assert.ok(sameId(replay.players[replay.ownPlayerIndex].puuid, d.puuid))
const frames = replay.rounds.flatMap(r => r.frames.map(f => ({ ...f, round: r.r })))
assert.equal(frames.length, audited.replayFrames)
let positions = 0
for (const f of frames) {
  assert.equal(Object.hasOwn(f, 'v'), false, 'Data-only frames must not include video seek offsets')
  let actorKnownAlive = false
  if (f.k === 'kill') {
    const event = d.killEvents.find(k => k.round === f.round && k.timeSinceGameStartMillis === f.t
      && sameId(k.killerPuuid, replay.players[f.actorIndex]?.puuid)
      && sameId(k.victimPuuid, replay.players[f.victimIndex]?.puuid))
    assert.ok(event, 'Replay kill must match an exported event')
    actorKnownAlive = event.finishingDamage?.damageType === 'Weapon'
  } else {
    assert.ok(['plant', 'defuse'].includes(f.k))
    const event = (f.k === 'plant' ? d.spikePlants : d.spikeDefuses).find(e => e.round === f.round)
    assert.ok(event, 'Replay objective must match an exported event')
    assert.ok(sameId(event.planterPuuid ?? event.defuserPuuid, replay.players[f.actorIndex]?.puuid))
    assert.equal(event.gameTimeMs, f.t)
    actorKnownAlive = true
  }
  for (const p of f.p) {
    positions++
    const alive = f.k === 'kill' && p.i === f.victimIndex ? false
      : p.i === f.actorIndex && actorKnownAlive ? true : null
    assert.equal(p.alive, alive)
    assert.equal(p.aliveSource, alive === false ? 'event_victim' : alive === true ? 'event_actor' : 'unknown')
    assert.ok(Number.isFinite(p.world.x) && Number.isFinite(p.world.y))
  }
}
assert.equal(positions, audited.replayEvidence.positions)

const lost = rounds.filter(r => r.winningTeam !== d.finalStats.team)
console.log(JSON.stringify({
  ok: true,
  scope: 'Offline content hash and internal consistency; no fresh Riot source audit',
  sourceAuditedAt: provenance.liveSourceAudit.auditedAt,
  player: provenance.identity,
  startedUtc: new Date(d.matchStartTime).toISOString(),
  map: d.map, agent: d.agent, score: d.finalScore,
  kda: audited.kda, acs: d.finalStats.score, adr: d.finalStats.adr, headshotHitPercent: d.finalStats.headshotPct,
  firstDeathRounds, zeroDamageRounds,
  lostRounds: lost.length,
  killsInLostRounds: lost.reduce((n, r) => n + r.playerStats.kills, 0),
  damageInLostRounds: lost.reduce((n, r) => n + r.playerDamageDealt, 0),
  earlyDeathExamples: frames.filter(f => f.k === 'kill' && f.victimIndex === replay.ownPlayerIndex && [5, 7, 19].includes(f.round))
    .map(f => ({ round: f.round + 1, secondsIntoRound: Math.round(f.rt / 100) / 10 })),
  replayFrames: frames.length, replayPositions: positions,
}, null, 2))
