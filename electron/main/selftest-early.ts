/**
 * First import of index.ts (side effect only): in self-test mode, point userData and logs at a
 * temp folder before any other module loads, so a self-test never touches a real profile — even
 * if a later import throws. See selftest.ts.
 */
import { app } from 'electron'
import fs from 'fs'
import { join } from 'path'
import { parseSelftestRequest } from './selftest-request'

export const selftestRequest = parseSelftestRequest(process.argv, process.env)

if (selftestRequest) {
  const dir = fs.mkdtempSync(join(app.getPath('temp'), 'upforge-selftest-data-'))
  app.setPath('userData', dir)
  app.setPath('sessionData', dir)
  app.setPath('logs', join(dir, 'logs'))
  // Surface import-time crashes as a result line + exit code instead of a modal error dialog.
  process.on('uncaughtException', (err) => {
    const line = JSON.stringify({ selftest: selftestRequest, ok: false, status: 'error', error: `uncaught: ${err?.stack ?? err}` }) + '\n'
    try { process.stdout.write(line) } catch { /* closed */ }
    try { if (process.env.UPFORGE_SELFTEST_OUT) fs.writeFileSync(process.env.UPFORGE_SELFTEST_OUT, line) } catch { /* ignore */ }
    app.exit(1)
  })
}
