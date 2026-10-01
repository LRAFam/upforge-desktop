import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { isTrustedRendererUrl } from './renderer-trust'
import { app, ipcMain } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { syncIssue } from '../../src/lib/overstep'
import { OverstepBridge } from './overstep-bridge'
import type { OBSRecorder } from './obs-recorder'
import type { RecorderConfig } from './recorder'

export function setupOverstepIntegration(recorder: OBSRecorder, config: () => RecorderConfig, otherCaptureBusy: () => boolean, performance: (active: boolean) => void): OverstepBridge {
  let performanceHeld = false
  const bridge = new OverstepBridge(join(app.getPath('userData'), 'overstep-sessions'), join(homedir(), '.upforge', 'overstep-bridge.json'), {
    busy: () => otherCaptureBusy() || recorder.isRecording(),
    start: async () => {
      if (process.platform !== 'win32') throw new Error('Automatic Overstep capture currently requires the Windows desktop app.')
      if (otherCaptureBusy() || recorder.isRecording() || await recorder.isObsOutputActive()) throw new Error('Another recording is active. Stop it before starting an Overstep match.')
      performanceHeld = true; performance(true)
      try {
        await recorder.start('overstep', { ...config(), savePath: join(app.getPath('userData'), 'overstep-recordings'), clipsOnly: false })
        if (!recorder.isActivelyRecording()) { await recorder.stop(); throw new Error('OBS did not confirm an active recording.') }
      } catch (err) { performanceHeld = false; performance(false); throw err }
    },
    anchor: () => recorder.measureVideoAnchor(),
    stop: async () => { try { return await recorder.stop() } finally { if (performanceHeld) { performanceHeld = false; performance(false) } } },
  })
  // Keep high-frequency poses and shot traces on disk, outside the renderer polling loop.
  const reviewStatus = () => {
    const status = bridge.status()
    return { ...status, sessions: status.sessions.map(s => ({ ...s, syncError: syncIssue(s), events: s.events.filter(e => !['positions', 'shot', 'damage', 'equipment', 'heartbeat'].includes(e.type)) })) }
  }
  const trusted = (e: Electron.IpcMainInvokeEvent) => { if (!e.senderFrame || !isTrustedRendererUrl(e.senderFrame.url)) throw new Error('Untrusted recording request') }
  const enabledFile = join(app.getPath('userData'), 'overstep-integration-enabled')
  if (existsSync(enabledFile)) void bridge.enable().catch(err => console.error('Overstep API startup failed', err))
  ipcMain.handle('overstep:policy', e => { trusted(e); return bridge.recordingPolicy() })
  ipcMain.handle('overstep:save-policy', (e, value: unknown) => { trusted(e); return bridge.setRecordingPolicy(value) })
  ipcMain.handle('overstep:matches', e => { trusted(e); return bridge.matchSummaries() })
  ipcMain.handle('overstep:status', e => { trusted(e); return reviewStatus() })
  ipcMain.handle('overstep:enable', async e => { trusted(e); await bridge.enable(); writeFileSync(enabledFile, 'enabled'); return reviewStatus() })
  ipcMain.handle('overstep:disable', async e => { trusted(e); await bridge.disable(); if (existsSync(enabledFile)) unlinkSync(enabledFile); return reviewStatus() })
  return bridge
}
