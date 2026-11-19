import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REMOVE_RUN_BODY, REMOVE_RUN_TITLE, recentRunRows } from './practice-recent-runs'

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const run = (id: number, completed_at: string, scenario = 'flick') => ({ id, scenario, score: 71.6, accuracy_pct: '64.4' as unknown as number, completed_at })

describe('recentRunRows', () => {
  it('lists newest first with rounded numbers and the drill label', () => {
    const rows = recentRunRows([run(1, '2026-11-10T10:00:00Z'), run(2, '2026-11-12T10:00:00Z', 'gridshot')], k => k.toUpperCase())
    expect(rows.map(r => r.id)).toEqual([2, 1])
    expect(rows[0]).toMatchObject({ label: 'GRIDSHOT', score: 72, accuracy: '64%', when: '12 Nov' })
  })

  it('leaves out runs removed this visit and rows without a real id, and caps the list', () => {
    const many = Array.from({ length: 14 }, (_, i) => run(i + 1, `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00Z`))
    const rows = recentRunRows([...many, run(0, '2026-11-30T10:00:00Z')], k => k, new Set([14]))
    expect(rows).toHaveLength(10)
    expect(rows[0].id).toBe(13)
    expect(rows.some(r => r.id === 0 || r.id === 14)).toBe(false)
  })

  it('is empty without history', () => {
    expect(recentRunRows(null, k => k)).toEqual([])
  })
})

describe('Remove run (Practice → Analytics)', () => {
  it('confirm copy says what goes and that it cannot be undone', () => {
    expect(REMOVE_RUN_TITLE).toBe('Remove this run?')
    expect(REMOVE_RUN_BODY).toBe('It’s deleted from your history, bests and leaderboards. This can’t be undone.')
  })

  it('only removes from the dialog confirm, shows the error on failure, and asks the parent to reload', () => {
    const vue = src('./PracticeRecentRunsV3.vue')
    expect(vue).toMatch(/@click="ask\(r\)"/)
    expect(vue).toMatch(/<UfDialog[^>]*:title="REMOVE_RUN_TITLE"/)
    expect(vue).toMatch(/@click="confirm"/)
    expect(vue).toMatch(/async function confirm\(\)[\s\S]*window\.api\.trainer\.removeRun\(row\.id\)[\s\S]*if \(!res\.ok\) \{\s*error\.value = res\.error[\s\S]*emit\('removed', row\.id\)/)
    expect(vue).not.toMatch(/\/api\/drills/)
    const analytics = src('./PracticeAnalyticsV3.vue')
    expect(analytics).toMatch(/<PracticeRecentRunsV3[^>]*@removed="\(id\) => emit\('run-removed', id\)"/)
    const hub = src('../../../views/TrainingHubView.vue')
    expect(hub).toMatch(/@run-removed="retryTrainerRefresh"/)
  })

  it('preload exposes trainer.removeRun on the trainer:remove-run channel', () => {
    expect(src('../../../../electron/preload/index.ts')).toMatch(/removeRun: \(id: number\) => ipcRenderer\.invoke\('trainer:remove-run', id\)/)
    expect(src('../../../../electron/main/ipc/gaming-ipc.ts')).toMatch(/ipcMain\.handle\('trainer:remove-run'[\s\S]{0,120}removeTrainingRun\(auth\.getApi\(\), auth\.getToken\(\), id\)/)
  })
})
