import { inspect } from 'node:util'
import axios from 'axios'
import { describe, expect, it } from 'vitest'
import { redactAxiosError } from './redact-axios-error'

const SECRET = 'Bearer test-secret-token-123'

describe('redactAxiosError', () => {
  it('keeps message, code and status but never the Authorization header', async () => {
    const api = axios.create({ baseURL: 'http://127.0.0.1:9', timeout: 50, headers: { Authorization: SECRET } })
    api.interceptors.response.use(r => r, err => Promise.reject(redactAxiosError(err)))
    const err = await api.get('/api/thing').catch(e => e)
    const printed = inspect(err, { depth: 10, showHidden: true }) + JSON.stringify(err)
    expect(printed).not.toContain('Bearer')
    expect(printed).not.toContain('test-secret-token')
    expect(err.isAxiosError).toBe(true)
    expect(typeof err.message).toBe('string')
    expect(err.config.url).toBe('/api/thing')
  })

  it('keeps the response status and data callers branch on', () => {
    const raw = Object.assign(new Error('Request failed with status code 422'), {
      code: 'ERR_BAD_REQUEST',
      config: { url: '/api/x', method: 'post', headers: { Authorization: SECRET } },
      request: { _header: `POST /api/x\r\nAuthorization: ${SECRET}\r\n` },
      response: { status: 422, statusText: 'Unprocessable', data: { message: 'bad' }, headers: { 'content-type': 'json', 'set-cookie': 'x' }, config: { headers: { Authorization: SECRET } } },
    })
    const out = redactAxiosError(raw) as any
    expect(out.response.status).toBe(422)
    expect(out.response.data).toEqual({ message: 'bad' })
    expect(out.response.headers).toEqual({ 'content-type': 'json' })
    expect(out.code).toBe('ERR_BAD_REQUEST')
    expect(inspect(out, { depth: 10, showHidden: true })).not.toContain('Bearer')
  })

  it('leaves non-HTTP errors untouched', () => {
    const plain = new Error('boom')
    expect(redactAxiosError(plain)).toBe(plain)
  })
})
