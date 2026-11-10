import { expect, it, vi } from 'vitest'
import { capturedCs2PlayerSteamId, validCapturedCs2SteamId } from './cs2-upload-identity'
import { emptyMatchData } from './recording-sync'
import { prepareMatchDataForUpload } from './match-data-payload'

vi.mock('./spatial/map-transforms', () => ({ worldToNorm: () => ({ x: 0.5, y: 0.5 }) }))
vi.mock('./riot-local-api', () => ({ recomputeTimelineVideoOffsets() {}, effectiveVideoSyncOffsetMs: () => 0 }))
vi.mock('./match-plant-telemetry', () => ({ logPlantCoordStats() {} }))

it('accepts only exact in-range individual Steam64 strings', () => {
  for (const value of ['76561197960265729', '76561202255233023']) expect(validCapturedCs2SteamId(value)).toBe(true)
  for (const value of ['76561197960265728', '76561202255233024', ' 76561198000000042', 76561198000000042, null]) expect(validCapturedCs2SteamId(value)).toBe(false)
})

it('uploads only the captured owner matching the parsed CS2 target', () => {
  const timeline = emptyMatchData('cs2', 1000)
  timeline.playerSteamId = '76561198000000042'
  expect(capturedCs2PlayerSteamId(timeline)).toBeNull()
  expect(prepareMatchDataForUpload(timeline)).not.toHaveProperty('playerSteamId')
  timeline.cs2Live = { source: 'gsi', playerSteamId: timeline.playerSteamId, events: [], rounds: [], stats: null, allyScore: null, enemyScore: null }
  expect(prepareMatchDataForUpload(timeline)?.playerSteamId).toBe(timeline.playerSteamId)
  timeline.playerSteamId = '76561198000000999'
  expect(prepareMatchDataForUpload(timeline)).not.toHaveProperty('playerSteamId')
  timeline.game = 'deadlock'
  timeline.playerSteamId = timeline.cs2Live.playerSteamId
  expect(prepareMatchDataForUpload(timeline)).not.toHaveProperty('playerSteamId')
})
