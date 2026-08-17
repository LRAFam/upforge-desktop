import { describe, expect, it, vi } from 'vitest'
import { RecordingPipelineSingleFlight } from './recording-pipeline-single-flight'

describe('RecordingPipelineSingleFlight', () => {
  it('shares one active pipeline for duplicate recording starts', async () => {
    const gate = new RecordingPipelineSingleFlight<string>()
    let release!: (value: string) => void
    const task = vi.fn(() => new Promise<string>((resolve) => { release = resolve }))

    const first = gate.run('recording-1', task)
    const duplicate = gate.run('recording-1', task)

    expect(task).toHaveBeenCalledTimes(1)
    release('job-1')
    await expect(first).resolves.toBe('job-1')
    await expect(duplicate).resolves.toBe('job-1')
  })

  it('allows a later retry after the active pipeline settles', async () => {
    const gate = new RecordingPipelineSingleFlight<string>()
    const task = vi.fn(async () => `job-${task.mock.calls.length}`)

    await expect(gate.run('recording-1', task)).resolves.toBe('job-1')
    await expect(gate.run('recording-1', task)).resolves.toBe('job-2')
    expect(task).toHaveBeenCalledTimes(2)
  })
})
