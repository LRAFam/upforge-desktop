import { describe, expect, it } from 'vitest'
import { MatchTelemetrySession } from './match-telemetry'

describe('MatchTelemetrySession', () => {
  it('creates unique correlation ids', () => {
    const a = new MatchTelemetrySession('valorant', {
      bucket: 'mid',
      encoder: 'h264_nvenc',
      obsVersion: '30.0.0',
      appVersion: '2.10.37',
    })
    const b = new MatchTelemetrySession('valorant', {
      bucket: 'mid',
      encoder: 'h264_nvenc',
      obsVersion: '30.0.0',
      appVersion: '2.10.37',
    })
    expect(a.correlationId).not.toBe(b.correlationId)
    expect(a.correlationId.length).toBeGreaterThan(8)
  })

  it('records sector durations', () => {
    const session = new MatchTelemetrySession('cs2', {
      bucket: 'high',
      encoder: 'h264_nvenc',
      obsVersion: null,
      appVersion: '1.0.0',
    })
    session.startSector('upload', 1_000)
    session.endSector('upload', 1_250)
    const snap = session.snapshot()
    expect(snap.sectors_ms.upload).toBe(250)
  })

  it('stores DNF and end reason', () => {
    const session = new MatchTelemetrySession('valorant', {
      bucket: 'low',
      encoder: 'libx264',
      obsVersion: '29.0.0',
      appVersion: '2.0.0',
    })
    session.setDnf('advanced_output', 'still Advanced')
    session.setEndReason('start_failed')
    const snap = session.snapshot()
    expect(snap.dnf).toBe('advanced_output')
    expect(snap.dnf_detail).toBe('still Advanced')
    expect(snap.end_reason).toBe('start_failed')
  })

  it('snapshot has no absolute file path values', () => {
    const session = new MatchTelemetrySession('valorant', {
      bucket: 'mid',
      encoder: 'h264_nvenc',
      obsVersion: null,
      appVersion: '2.0.0',
    })
    session.setRecordingFacts({
      resolution: '1920x1080',
      bitrateKbps: 6000,
    })
    session.setPathFallback(true)
    const snap = session.snapshot()
    const json = JSON.stringify(snap)
    expect(json).not.toMatch(/\/Users\//)
    expect(json).not.toMatch(/[A-Za-z]:\\\\/)
    expect(snap.path_fallback).toBe(true)
    expect(snap.event).toBe('ops_recording_lap')
    expect(snap.machine_bucket).toBe('mid')
  })
})
