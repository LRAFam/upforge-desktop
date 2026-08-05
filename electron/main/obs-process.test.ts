import { describe, expect, it } from 'vitest'
import { obsTerminateCommands } from './obs-process'

describe('obsTerminateCommands', () => {
  it('asks Windows to close OBS before forcing it', () => {
    const { graceful, force } = obsTerminateCommands('win32')
    expect(graceful).not.toContain('/F')
    expect(graceful).toContain('obs64.exe')
    expect(force).toContain('/F')
  })

  it('sends SIGTERM before SIGKILL on macOS', () => {
    const { graceful, force } = obsTerminateCommands('darwin')
    expect(graceful).not.toContain('-9')
    expect(force).toContain('-9')
  })

  it('sends SIGTERM before SIGKILL on Linux', () => {
    const { graceful, force } = obsTerminateCommands('linux')
    expect(graceful).not.toContain('-9')
    expect(force).toContain('-9')
  })
})
