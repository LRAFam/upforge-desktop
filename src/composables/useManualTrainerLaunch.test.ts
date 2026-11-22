import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualTrainerLaunch } from './useManualTrainerLaunch'
import { readManualTrainerOptions, writeManualTrainerOptions } from '../lib/manual-trainer-options'

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
let storage: ReturnType<typeof memoryStorage>
beforeEach(() => { storage = memoryStorage(); vi.stubGlobal('localStorage', storage) })
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const context = { game: 'valorant', accountId: 7 as number | null, busy: false }
  const launch = vi.fn(async () => {})
  const accountId = vi.fn(async () => context.accountId)
  const create = () => useManualTrainerLaunch({
    game: () => context.game, busy: () => context.busy, accountId,
    // A former best/assigned object must not carry an assigned attempt into manual practice.
    defaults: () => ({ difficulty: 'medium', duration_seconds: 60, user_drill_id: 99 }), launch,
  })
  return { context, launch, accountId, create, flow: create() }
}

describe('manual drill preferences and ownership', () => {
  it('remembers a confirmed choice across screen recreation, separately for each account/game/drill', async () => {
    const { flow, create, context, launch } = setup()
    await flow.open('gridshot')
    await flow.start({ difficulty: 'hard', duration_seconds: 30, user_drill_id: 99 })
    expect(launch).toHaveBeenCalledWith({ scenario: 'gridshot', difficulty: 'hard', duration_seconds: 30 })
    const reopened = create()
    await reopened.open('gridshot')
    expect(reopened.request.value?.options).toEqual({ difficulty: 'hard', duration_seconds: 30 })
    for (const change of [() => { context.game = 'cs2' }, () => { context.game = 'valorant'; context.accountId = 8 }]) {
      change()
      await reopened.open('gridshot')
      expect(reopened.request.value?.options).toEqual({ difficulty: 'medium', duration_seconds: 60 })
    }
    context.accountId = 7
    await reopened.open('sixshot')
    expect(reopened.request.value?.options).toEqual({ difficulty: 'medium', duration_seconds: 60 })
    await reopened.open('gridshot')
    expect(reopened.request.value?.options).toEqual({ difficulty: 'hard', duration_seconds: 30 })
  })

  it('cancel and malformed settings do not overwrite the last choice or launch', async () => {
    const { flow, launch } = setup()
    await flow.open('gridshot')
    for (const value of [{ difficulty: 'hard', duration_seconds: 45 }, { difficulty: 'nightmare', duration_seconds: 60 }, { difficulty: 'hard', duration_seconds: '30' }]) {
      await flow.start(value)
    }
    flow.cancel()
    expect(launch).not.toHaveBeenCalled()
    expect(storage.values.size).toBe(0)
  })

  it('does not open unavailable drills or interfere with an active guided/challenge run', async () => {
    const { flow, context, launch } = setup()
    context.game = 'cs2'
    await flow.open('operator_hold')
    await flow.open('unknown')
    expect(flow.request.value).toBeNull()
    context.busy = true
    await flow.open('gridshot')
    expect(flow.request.value).toBeNull()
    context.busy = false
    await flow.open('gridshot')
    context.busy = true
    await flow.start({ difficulty: 'hard', duration_seconds: 30 })
    expect(launch).not.toHaveBeenCalled()
  })

  it('drops stale open replies and cancels a start after the account or game changes', async () => {
    const { flow, context, accountId, launch } = setup()
    let reply!: (id: number | null) => void
    accountId.mockImplementationOnce(() => new Promise(resolve => { reply = resolve }))
    const opening = flow.open('gridshot')
    flow.cancel()
    reply(7)
    await opening
    expect(flow.request.value).toBeNull()
    await flow.open('gridshot')
    context.accountId = 8
    await flow.start({ difficulty: 'hard', duration_seconds: 30 })
    expect(flow.request.value).toBeNull()
    await flow.open('gridshot')
    context.game = 'cs2'
    await flow.start({ difficulty: 'hard', duration_seconds: 30 })
    expect(launch).not.toHaveBeenCalled()
    expect(storage.values.size).toBe(0)
  })

  it('does not let a late start launch after dismissal or submit twice', async () => {
    const { flow, accountId, launch } = setup()
    await flow.open('gridshot')
    let reply!: (id: number | null) => void
    accountId.mockImplementationOnce(() => new Promise(resolve => { reply = resolve }))
    const starting = flow.start({ difficulty: 'hard', duration_seconds: 30 })
    await flow.start({ difficulty: 'hard', duration_seconds: 30 })
    flow.cancel()
    reply(7)
    await starting
    expect(launch).not.toHaveBeenCalled()
    expect(storage.values.size).toBe(0)
  })

  it('tolerates corrupt/unavailable storage and never saves anonymous preferences', () => {
    const scope = { accountId: 7, game: 'valorant', scenario: 'gridshot' }
    writeManualTrainerOptions(scope, { difficulty: 'hard', duration_seconds: 30 })
    for (const value of ['not json', '{"difficulty":"hard","duration_seconds":45}', 'null']) {
      storage.values.set([...storage.values.keys()][0], value)
      expect(readManualTrainerOptions(scope, null)).toEqual({ difficulty: 'medium', duration_seconds: 60 })
    }
    const broken = { getItem() { throw Error('denied') }, setItem() { throw Error('full') } }
    expect(readManualTrainerOptions(scope, { difficulty: 'easy', duration_seconds: 90 }, broken)).toEqual({ difficulty: 'easy', duration_seconds: 90 })
    expect(() => writeManualTrainerOptions(scope, { difficulty: 'hard', duration_seconds: 30 }, broken)).not.toThrow()
    storage.values.clear()
    writeManualTrainerOptions({ ...scope, accountId: null }, { difficulty: 'hard', duration_seconds: 30 })
    expect(storage.values.size).toBe(0)
  })
})
