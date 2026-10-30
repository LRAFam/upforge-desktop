/** Read-only: enemy habits for one Valorant recording, computed from its stored Riot match data. */
import type { IpcMain } from 'electron'
import { buildMatchRoundReplay } from '../round-replay'
import { computeEnemyHabits, type EnemyHabits } from '../enemy-habits'
import type { MatchData } from '../riot-types'

export function registerEnemyHabitsIpc(ipcMain: IpcMain, getTimeline: (recordingId: string) => MatchData | null | undefined): void {
  ipcMain.handle('valorant:enemy-habits', (_event, recordingId: unknown): EnemyHabits | null => {
    if (typeof recordingId !== 'string' || recordingId.length === 0 || recordingId.length > 128) return null
    const timeline = getTimeline(recordingId)
    if (!timeline || timeline.game !== 'valorant') return null
    try { return computeEnemyHabits(buildMatchRoundReplay(timeline)) } catch { return null }
  })
}
