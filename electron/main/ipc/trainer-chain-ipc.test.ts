import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Main-process wiring for a trainer that stays open between runs. The bridge's behaviour is in
// electron/main/trainer-bridge.test.ts and the launch message in electron/main/trainer-payload.test.ts.
const gaming = readFileSync(new URL('./gaming-ipc.ts', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../../preload/index.ts', import.meta.url), 'utf8')

describe('staying open between runs: main process', () => {
  it('Practice launches ask the trainer to stay open; the warm-up offer (a game is open) does not', () => {
    expect(gaming).toMatch(/async function launchDrill\(config: Record<string, unknown>, opts: TrainerLaunchOptions = \{\}\)/)
    expect(gaming).toMatch(/drillConfigFromRequest\(config \?\? \{\}, saved, TRAINER_VERSION, \{ keepOpen: opts\.keepOpen !== false \}\)/)
    expect(gaming).toMatch(/ipcMain\.handle\('trainer:launch', \(_e, config: Record<string, unknown>\) => launchDrill\(config\)\)/)
    expect(gaming).toMatch(/launchTrainerDrillRef\(config, \{ keepOpen: false \}\)/)
  })

  it('a run started again from the end card belongs to the account of the run it repeats', () => {
    expect(gaming).toMatch(/trainerBridge\?\.setRunStartedCallback\(\(launch\) => \{/)
    expect(gaming).toMatch(/setLaunchOwner\(launch\.launchId, repeated !== undefined && launchOwners\.has\(repeated\)\s*\? launchOwners\.get\(repeated\) \?\? null/)
    // The owner of a run whose trainer stays open is kept for that.
    expect(gaming).toMatch(/if \(launch && !launch\.keep_open\) launchOwners\.delete\(launch\.launchId\)/)
    // The owner map stays small.
    expect(gaming).toMatch(/if \(launchOwners\.size > 20\) launchOwners\.delete/)
  })

  it('each run is saved through the one result callback (no second save path for runs started in the trainer)', () => {
    expect(gaming.match(/trainerQueue\.submit\(/g)).toHaveLength(1)
  })

  it('the renderer may listen for runs started in the trainer and for its next-drill request', () => {
    expect(preload).toMatch(/'trainer:run-started',/)
    expect(preload).toMatch(/'trainer:next-drill',/)
  })
})
