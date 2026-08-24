import { describe, expect, it } from 'vitest'
import { obsTerminateCommands } from './obs-process'

describe('obsTerminateCommands', () => {
  it('targets Windows OBS processes by executable name and OBS Studio metadata', () => {
    const { graceful, force } = obsTerminateCommands('win32')
    expect(graceful).not.toContain('/F')
    expect(graceful).toContain("'obs64','obs32'")
    expect(graceful).toContain("ProductName -eq 'OBS Studio'")
    expect(graceful).toContain("FileDescription -eq 'OBS Studio'")
    expect(graceful).toContain('taskkill.exe /PID $_.Id /T')
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
