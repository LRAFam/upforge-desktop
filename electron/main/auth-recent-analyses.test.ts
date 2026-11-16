import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { InternalAxiosRequestConfig } from 'axios'

const env = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => env.dir, getVersion: () => '9.9.9' },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { AuthManager } from './auth-manager'

beforeEach(() => { env.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-recent-')) })
afterEach(() => fs.rmSync(env.dir, { recursive: true, force: true }))

describe('fetchAnalyses (GET /api/analysis/recent)', () => {
  it('turns the 1/0 `won` of Riot-linked rows into true/false so Home and Progress count them', async () => {
    const auth = new AuthManager()
    const analyses = [
      { id: 1, won: 1, combat_score: 250, rounds_won: 13, rounds_lost: 9 },
      { id: 2, won: 0, combat_score: 5200, rounds_won: 9, rounds_lost: 13 },
      { id: 3, won: true, combat_score: null, rounds_won: null, rounds_lost: null },
      { id: 4, won: null, combat_score: null, rounds_won: null, rounds_lost: null },
    ]
    auth.getApi().defaults.adapter = async (config: InternalAxiosRequestConfig) =>
      ({ status: 200, statusText: '', data: { success: true, analyses }, headers: {}, config })
    const rows = await auth.fetchAnalyses(10)
    expect(rows.map(r => r.won)).toEqual([true, false, true, null])
    // A stored total combat score becomes ACS (5200 / 22 rounds).
    expect(rows.map(r => r.combat_score)).toEqual([250, 236, null, null])
  })
})
