import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveErrorReportingKey } from './error-reporting-key'

describe('resolveErrorReportingKey', () => {
  it('prefers the build-time inlined key over runtime env', () => {
    expect(resolveErrorReportingKey('built-key', { VITE_ERROR_REPORTING_KEY: 'dev-key' })).toBe('built-key')
  })

  it('falls back to runtime env when nothing was inlined (dev)', () => {
    expect(resolveErrorReportingKey('', { VITE_ERROR_REPORTING_KEY: 'dev-key' })).toBe('dev-key')
  })

  it('returns empty string when neither is set', () => {
    expect(resolveErrorReportingKey('', {})).toBe('')
  })
})

describe('electron.vite.config main define', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('inlines VITE_ERROR_REPORTING_KEY into the main bundle at build time', async () => {
    vi.stubEnv('VITE_ERROR_REPORTING_KEY', 'ci-secret-123')
    vi.resetModules()
    const mod = await import('../../electron.vite.config')
    const config = mod.default as { main?: { define?: Record<string, string> } }
    expect(config.main?.define?.['__UPFORGE_ERROR_REPORTING_KEY__']).toBe(JSON.stringify('ci-secret-123'))
  })
})
