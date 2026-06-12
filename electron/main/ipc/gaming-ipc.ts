/**
 * gaming-ipc.ts
 * IPC handlers for performance boost, aim trainer, Deadlock replays, CS2 detection,
 * and ForgeRank prestige. Also holds the crosshair→Godot conversion helper.
 */

import { IpcMain, app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { AuthManager } from '../auth-manager'
import { GameDetector } from '../game-detector'
import { SettingsManager } from '../settings-manager'
import { PerformanceManager } from '../performance-manager'
import { TrainerBridge, type DrillConfig } from '../trainer-bridge'
import { sendOverlayData } from '../overlay-window'
import type { AppSettings } from '../settings-manager'
import { apiPost } from './api-helpers'

// ── Crosshair helper ──────────────────────────────────────────────────────────

/** Valorant colour palette — indices match CrosshairConfig.gd VALORANT_COLORS */
const CROSSHAIR_PALETTE: [number, number, number][] = [
  [1.0,  1.0,  1.0 ], // 0 white
  [0.0,  1.0,  0.42], // 1 green
  [1.0,  0.85, 0.0 ], // 2 yellow
  [0.0,  0.87, 1.0 ], // 3 cyan
  [1.0,  0.47, 0.87], // 4 pink
  [1.0,  0.27, 0.33], // 5 red
]

/** Convert Electron CrosshairSettings into the Godot dict format. */
function crosshairSettingsToGodot(
  cs: AppSettings['crosshairSettings']
): DrillConfig['crosshair_settings'] {
  let color: [number, number, number]
  if (cs.colorIndex >= 0 && cs.colorIndex < CROSSHAIR_PALETTE.length) {
    color = CROSSHAIR_PALETTE[cs.colorIndex]
  } else {
    const hex = cs.customColor.replace('#', '').padEnd(6, '0')
    color = [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ]
  }
  return {
    color,
    shadow_show:      cs.shadowShow,
    dot_show:         cs.dotShow,
    dot_radius:       cs.dotRadius,
    dot_opacity:      cs.dotOpacity,
    inner_show:       cs.innerShow,
    inner_thickness:  cs.innerThickness,
    inner_length:     cs.innerLength,
    inner_offset:     cs.innerOffset,
    inner_opacity:    cs.innerOpacity,
    outer_show:       cs.outerShow,
    outer_thickness:  cs.outerThickness,
    outer_length:     cs.outerLength,
    outer_offset:     cs.outerOffset,
    outer_opacity:    cs.outerOpacity,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupGamingHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  settingsManager: SettingsManager,
  gameDetector: GameDetector,
  performanceManager?: PerformanceManager,
  trainerBridge?: TrainerBridge,
): void {
  const apiBase = process.env['VITE_API_URL'] || 'https://api.upforge.gg'

  // ── Performance ───────────────────────────────────────────────────────────

  ipcMain.handle('performance:get-status', async () => {
    if (!performanceManager) return { boosted: false, powerPlan: 'Unknown', platform: process.platform }
    return performanceManager.getStatus()
  })

  ipcMain.handle('performance:boost', async () => {
    if (!performanceManager) return []
    const currentGame = gameDetector.currentGame() ?? undefined
    return performanceManager.boost(currentGame)
  })

  ipcMain.handle('performance:restore', async () => {
    if (!performanceManager) return []
    return performanceManager.restore()
  })

  ipcMain.handle('performance:diagnostics', async () => {
    if (!performanceManager) return null
    return performanceManager.getDiagnostics()
  })

  ipcMain.handle('performance:kill-process', async (_e, name: string) => {
    if (!performanceManager) return { name: `Kill ${name}`, success: false, message: 'Not available' }
    return performanceManager.killProcess(name)
  })

  ipcMain.handle('performance:get-pregame-kill-list', async () => {
    return settingsManager.get().pregameKillList ?? []
  })

  ipcMain.handle('performance:set-pregame-kill-list', async (_e, list: string[]) => {
    settingsManager.save({ pregameKillList: list })
    return list
  })

  // ── Aim Trainer ───────────────────────────────────────────────────────────

  trainerBridge?.setResultCallback((result) => {
    sendOverlayData('overlay:trainer-result', result)
    const token = auth.getToken()
    if (token) {
      apiPost(apiBase, '/api/training/sessions', JSON.stringify(result), token)
        .then(() => log.info('[Trainer] Session synced to API'))
        .catch((err) => log.warn('[Trainer] Failed to sync session to API:', (err as Error)?.message))
    }
  })

  ipcMain.handle('trainer:launch', async (_e, config: DrillConfig) => {
    if (!trainerBridge) return { ok: false, error: 'Trainer not available' }
    try {
      const s = settingsManager.get()
      const ms = s.trainerMouse
      const cs = s.crosshairSettings
      const enrichedConfig: DrillConfig = {
        ...config,
        mouse_settings: {
          dpi: ms.dpi,
          game: ms.game,
          sensitivity: ms.sensitivity,
          fov: ms.fov,
          movement_speed: ms.movementSpeed ?? 6.75,
          trainer_volume: (ms.trainerVolume ?? 80) / 100,
        },
        crosshair_settings: crosshairSettingsToGodot(cs),
      }
      await trainerBridge.launch(enrichedConfig)
      sendOverlayData('overlay:trainer-started', {
        scenario: config.scenario,
        difficulty: config.difficulty,
        duration_seconds: config.duration_seconds,
      })
      return { ok: true }
    } catch (err: any) {
      log.error('[IPC] trainer:launch error:', err)
      return { ok: false, error: err?.message ?? 'Failed to launch trainer' }
    }
  })

  ipcMain.handle('trainer:kill', () => {
    trainerBridge?.kill()
    return { ok: true }
  })

  ipcMain.handle('trainer:get-history', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/sessions?limit=50')
      return res.data ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch training history:', err?.message)
      return null
    }
  })

  ipcMain.handle('trainer:get-coaching-drills', async () => {
    const token = auth.getToken()
    if (!token) return []
    try {
      const res = await auth.getApi().get('/api/drills')
      const data = res.data
      if (Array.isArray(data)) return data
      if (data && typeof data === 'object') return (data as Record<string, unknown>).active ?? []
      return []
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch coaching drills:', err?.message)
      return []
    }
  })

  ipcMain.handle('trainer:get-correlation', async () => {
    const token = auth.getToken()
    if (!token) return []
    try {
      const res = await auth.getApi().get('/api/training/correlation')
      return Array.isArray(res.data) ? res.data : []
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch correlation insights:', err?.message)
      return []
    }
  })

  ipcMain.handle('trainer:get-benchmark', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/benchmark')
      return res.data?.benchmark ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch benchmark:', err?.message)
      return null
    }
  })

  ipcMain.handle('trainer:get-ai-coaching', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/coaching')
      return res.data ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch AI coaching:', err?.message)
      return null
    }
  })

  // ── Deadlock replays ──────────────────────────────────────────────────────

  ipcMain.handle('deadlock:list-replays', async () => {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    const replayDir = path.join(localAppData, 'Deadlock', 'game', 'deadlock', 'replays')
    try {
      if (!fs.existsSync(replayDir)) return { files: [], dir: replayDir, exists: false }
      const entries = fs.readdirSync(replayDir)
      const files = entries
        .filter(f => f.endsWith('.dem'))
        .map(f => {
          const full = path.join(replayDir, f)
          const stat = fs.statSync(full)
          return { name: f, path: full, sizeBytes: stat.size, modifiedAt: stat.mtimeMs }
        })
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, 20)
      return { files, dir: replayDir, exists: true }
    } catch (err: any) {
      log.warn('[Deadlock] Failed to list replays:', err?.message)
      return { files: [], dir: replayDir, exists: false }
    }
  })

  ipcMain.handle('deadlock:open-replays-folder', async () => {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    const replayDir = path.join(localAppData, 'Deadlock', 'game', 'deadlock', 'replays')
    if (fs.existsSync(replayDir)) {
      await shell.openPath(replayDir)
    } else {
      await shell.openPath(path.join(localAppData, 'Deadlock'))
    }
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-analyze', () => {
    shell.openExternal('https://upforge.gg/deadlock/analyze')
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-dashboard', () => {
    shell.openExternal('https://upforge.gg/deadlock')
    return { ok: true }
  })

  ipcMain.handle('deadlock:get-stats', async () => {
    try {
      const api = auth.getApi()
      if (!api) return null
      const res = await api.get('/api/deadlock/profile')
      return res.data?.profile ?? null
    } catch {
      return null
    }
  })

  // ── CS2 ───────────────────────────────────────────────────────────────────

  ipcMain.handle('cs2:detect-demo-dir', async () => {
    const { detectCS2DemoDir } = await import('../cs2-demo-finder')
    const dir = await detectCS2DemoDir()
    return { dir }
  })

  ipcMain.handle('cs2:list-demos', async () => {
    const { listRecentCS2Demos } = await import('../cs2-demo-finder')
    const demoDir = settingsManager.get().cs2DemoDir
    return listRecentCS2Demos(demoDir)
  })

  ipcMain.handle('cs2:open-demos-folder', async () => {
    const { detectCS2DemoDir } = await import('../cs2-demo-finder')
    const custom = settingsManager.get().cs2DemoDir
    const dir = custom ?? (await detectCS2DemoDir())
    if (dir && fs.existsSync(dir)) {
      shell.openPath(dir)
      return { ok: true }
    }
    return { ok: false }
  })

  ipcMain.handle('cs2:open-analyze', () => {
    shell.openExternal('https://upforge.gg/cs2/analyze')
    return { ok: true }
  })

  ipcMain.handle('cs2:open-dashboard', () => {
    shell.openExternal('https://upforge.gg/cs2')
    return { ok: true }
  })

  // ── ForgeRank ─────────────────────────────────────────────────────────────

  ipcMain.handle('forge-rank:prestige', async () => {
    try {
      const api = auth.getApi()
      if (!api) return { success: false }
      const res = await api.post('/api/forge-rank/prestige')
      return res.data
    } catch {
      return { success: false }
    }
  })
}
