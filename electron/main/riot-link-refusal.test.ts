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

import { AuthManager, apiRefusal } from './auth-manager'

// Body the API sends (HTTP 200) while Riot account verification is switched off.
const UNAVAILABLE = {
  success: false, status: 'unavailable', error: 'riot_api_unavailable', error_reason: 'pending_approval',
  message: 'VALORANT account verification is not available yet.',
}

let routes: Record<string, unknown>
function install(auth: AuthManager) {
  auth.getApi().defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const key = `${config.method?.toUpperCase()} ${(config.url ?? '').split('?')[0]}`
    return { status: 200, statusText: '', data: routes[key] ?? {}, headers: {}, config }
  }
}

beforeEach(() => {
  env.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-riot-link-'))
  routes = {}
})
afterEach(() => fs.rmSync(env.dir, { recursive: true, force: true }))

describe('apiRefusal', () => {
  it('reads an HTTP 200 success:false body as a failure with its code and message', () => {
    expect(apiRefusal(UNAVAILABLE, 'fallback')).toEqual({ error: UNAVAILABLE.message, code: 'riot_api_unavailable' })
    expect(apiRefusal({ success: false }, 'fallback')).toEqual({ error: 'fallback' })
  })
  it('passes successful and older bodies through', () => {
    expect(apiRefusal({ success: true, account: {} }, 'x')).toBeNull()
    expect(apiRefusal({ account: {} }, 'x')).toBeNull()
    expect(apiRefusal(null, 'x')).toBeNull()
  })
})

describe('Riot linking while verification is unavailable', () => {
  it('does not report "linked" when the API saved nothing', async () => {
    const auth = new AuthManager(); install(auth)
    routes['POST /api/riot-accounts'] = UNAVAILABLE
    await expect(auth.linkRiotAccount({ riot_name: 'New', riot_tag: 'EUW' }))
      .resolves.toEqual({ ok: false, error: UNAVAILABLE.message, code: 'riot_api_unavailable' })
  })

  it('reports rename, legacy profile link and League link refusals too', async () => {
    const auth = new AuthManager(); install(auth)
    routes['PATCH /api/riot-accounts/3'] = UNAVAILABLE
    routes['POST /api/profile/update-riot-account'] = { ...UNAVAILABLE, message: undefined }
    routes['POST /api/lol-accounts'] = { success: false, error: 'riot_api_unavailable', message: 'League verification is not available yet.' }
    expect((await auth.renameRiotAccount(3, { riot_name: 'New', riot_tag: 'EUW' })).ok).toBe(false)
    expect(await auth.updateRiotAccount({ riot_name: 'New', riot_tag: 'EUW' })).toEqual({ ok: false, error: 'Failed to link Riot account' })
    expect(await auth.addLolAccount({ riot_name: 'New', riot_tag: 'EUW', platform: 'EUW1' }))
      .toEqual({ ok: false, limit: false, error: 'League verification is not available yet.' })
  })

  it('still reports a real link as linked', async () => {
    const auth = new AuthManager(); install(auth)
    routes['POST /api/riot-accounts'] = { success: true, account: { id: 5, riot_name: 'New', riot_tag: 'EUW', is_active: false } }
    routes['GET /api/riot-accounts'] = { success: true, accounts: [], max_valorant_accounts: 1 }
    expect(await auth.linkRiotAccount({ riot_name: 'New', riot_tag: 'EUW' })).toEqual({ ok: true })
  })
})
