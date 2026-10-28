import { expect, it, vi } from 'vitest'
import { ensureUpForgeCapture } from './obs-setup'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('./game-window-finder', () => ({ resolveObsCaptureWindow: async () => 'Valorant' }))

function server() {
  let input: { inputName: string; inputKind: unknown; inputSettings: unknown } | null = null
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'GetInputList') return { inputs: input ? [{ ...input }] : [] }
    if (method === 'GetInputSettings') return input
    if (method === 'CreateInput') {
      if (input) throw new Error('A source already exists by that input name.')
      input = { inputName: String(args!.inputName), inputKind: args!.inputKind, inputSettings: args!.inputSettings }
    }
    return {}
  })
  return { call }
}

it('serializes overlapping capture setup against the same OBS connection', async () => {
  const obs = server()
  await expect(Promise.all([
    ensureUpForgeCapture(obs as never, 'valorant'),
    ensureUpForgeCapture(obs as never, 'valorant'),
  ])).resolves.toHaveLength(2)
  expect(obs.call.mock.calls.filter(([method]) => method === 'CreateInput')).toHaveLength(1)
})

it('allows a new setup after the previous request failed', async () => {
  const obs = server()
  obs.call.mockRejectedValueOnce(new Error('Disconnected'))
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).rejects.toThrow('Disconnected')
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).resolves.toMatchObject({ inputCreated: true })
})
