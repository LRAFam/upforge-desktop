import { describe, expect, it } from 'vitest'
import { buildElevatedObsScript } from './obs-launcher'

describe('buildElevatedObsScript', () => {
  it('stops OBS and starts it from its executable directory', () => {
    const script = buildElevatedObsScript(
      'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
      ['--minimize-to-tray', '--websocket_port=4455'],
    )

    expect(script).toContain("Get-Process -Name 'obs64'")
    expect(script).toContain("-FilePath 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'")
    expect(script).toContain("-WorkingDirectory 'C:\\Program Files\\obs-studio\\bin\\64bit'")
    expect(script).toContain("'--websocket_port=4455'")
  })

  it('keeps apostrophes inside PowerShell single-quoted arguments', () => {
    const script = buildElevatedObsScript(
      "C:\\User's Apps\\obs64.exe",
      ["--websocket_password=a'b"],
    )

    expect(script).toContain("'C:\\User''s Apps\\obs64.exe'")
    expect(script).toContain("'--websocket_password=a''b'")
  })
})
