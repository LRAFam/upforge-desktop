import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// card-demo-poll-window raised the demo job poll to 40 min. The Scan again
// IPC must not wait for that poll, or the button sits on "Scanning…" for the
// whole window. Progress reaches the window via post-game:demo-status events.
describe('post-game:retry-demo-scan', () => {
  const index = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n') // Windows checkouts are CRLF
  const start = index.indexOf("ipcMain.handle('post-game:retry-demo-scan'")
  const handler = index.slice(start, index.indexOf('\n  })\n', start))

  it('starts the replay upload/poll in the background', () => {
    expect(start).toBeGreaterThan(-1)
    expect(handler.length).toBeLessThan(5000)
    expect(handler).toContain('tryAutoUploadSourceReplay(')
    expect(handler).not.toMatch(/await tryAutoUploadSourceReplay\(/)
  })

})
