import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() } }))
vi.mock('./paths', () => ({
  spatialResourcePath: (...parts: string[]) => join(process.cwd(), 'resources', 'spatial', ...parts),
}))

import { clearPopulationApiCache, refreshPopulationFromApi } from './population-store'

function notFound(): Error & { response: { status: number } } {
  return Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } })
}

describe('refreshPopulationFromApi', () => {
  beforeEach(() => clearPopulationApiCache())

  it('stops calling the population endpoint after a 404 (the API has no such route)', async () => {
    const get = vi.fn().mockRejectedValue(notFound())
    const api = { get } as never

    await refreshPopulationFromApi('Ascent', api)
    await refreshPopulationFromApi('Ascent', api)
    await refreshPopulationFromApi('Bind', api)
    await refreshPopulationFromApi('Haven', api)

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('still falls back to bundled data after a 404', async () => {
    const api = { get: vi.fn().mockRejectedValue(notFound()) } as never
    const first = await refreshPopulationFromApi('Ascent', api)
    const second = await refreshPopulationFromApi('Ascent', api)
    expect(second).toEqual(first)
  })

  it('keeps trying after a network error (not a missing route)', async () => {
    const get = vi.fn().mockRejectedValue(new Error('socket hang up'))
    const api = { get } as never
    await refreshPopulationFromApi('Ascent', api)
    await refreshPopulationFromApi('Ascent', api)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
