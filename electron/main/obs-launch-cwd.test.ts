import { describe, expect, it } from 'vitest'
import { buildObsCmdStartArgs, obsExecutableWorkingDirectory } from './obs-launch-cwd'

describe('obsExecutableWorkingDirectory', () => {
  it('uses the folder that contains obs64.exe', () => {
    expect(obsExecutableWorkingDirectory('C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'))
      .toBe('C:\\Program Files\\obs-studio\\bin\\64bit')
  })
})

describe('buildObsCmdStartArgs', () => {
  it('passes start /d so OBS starts in its bin directory', () => {
    const exe = 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'
    expect(buildObsCmdStartArgs(exe, ['--minimize-to-tray', '--websocket_port=4455'])).toEqual([
      '/c',
      'start',
      '""',
      '/min',
      '/d',
      'C:\\Program Files\\obs-studio\\bin\\64bit',
      exe,
      '--minimize-to-tray',
      '--websocket_port=4455',
    ])
  })
})
