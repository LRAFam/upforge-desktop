export type ObsSetupStage = 'checking' | 'installing' | 'connecting' | 'version' | 'capture' | 'testing' | 'complete'

export type GuidedObsSetupResult =
  | { ok: true; studioVersion: string }
  | { ok: false; error: string }

type Result = { ok: boolean; error?: string }

export interface GuidedObsSetupDependencies {
  isRecording(): boolean
  isConnected(): boolean
  isRunning(): Promise<boolean>
  isInstalled(): boolean
  install(): Promise<Result>
  configure(): Result
  connect(): Promise<Result>
  version(): Promise<{ obsVersion: string; obsWebSocketVersion: string }>
  outputs(): Promise<{ recording: boolean; streaming: boolean; replayBuffer: boolean }>
  setupCapture(): Promise<Result>
  testRecording(): Promise<Result>
  progress(stage: ObsSetupStage): void
}

// OBS 28 introduced the bundled WebSocket 5 protocol used by UpForge.
// A minimum protocol check is not a claim that every OBS release is certified.
export function isCompatibleObsVersion(studio: string, websocket: string): boolean {
  const release = /^(\d+)\.\d+\.\d+$/
  const obs = release.exec(studio)
  const ws = release.exec(websocket)
  return !!obs && !!ws && Number(obs[1]) >= 28 && Number(ws[1]) === 5
}

export async function runGuidedObsSetup(d: GuidedObsSetupDependencies): Promise<GuidedObsSetupResult> {
  const requireOk = (result: Result, message: string) => {
    if (!result.ok) throw new Error(result.error || message)
  }
  const requireIdle = async () => {
    const outputs = await d.outputs()
    if (d.isRecording() || outputs.recording || outputs.streaming || outputs.replayBuffer) {
      throw new Error('OBS has an active recording, stream, or replay buffer. Stop it in OBS, then retry setup.')
    }
  }
  try {
    d.progress('checking')
    if (d.isRecording()) throw new Error('Finish your current recording before setting up OBS.')
    if (!d.isConnected()) {
      // An unreachable running OBS may be streaming. Never kill it or overwrite
      // its configuration merely because UpForge cannot authenticate.
      if (await d.isRunning()) {
        throw new Error('OBS is open but UpForge cannot check whether it is busy. Close OBS when you have finished using it, then retry setup.')
      }
      if (!d.isInstalled()) {
        d.progress('installing')
        requireOk(await d.install(), 'OBS could not be installed. Use the official OBS download, then retry.')
      }
      requireOk(d.configure(), 'UpForge could not configure OBS. Retry setup.')
      d.progress('connecting')
      requireOk(await d.connect(), 'Could not connect to OBS. Use a stable OBS Studio 28 or newer, then retry.')
    }
    await requireIdle()
    d.progress('version')
    const version = await d.version()
    if (!isCompatibleObsVersion(version.obsVersion, version.obsWebSocketVersion)) {
      throw new Error(`OBS ${version.obsVersion || '(unknown version)'} could not pass the compatibility check. Install a stable OBS Studio 28 or newer with WebSocket 5, then retry setup.`)
    }
    d.progress('capture')
    await requireIdle()
    requireOk(await d.setupCapture(), 'UpForge could not set up game capture. Retry setup.')
    d.progress('testing')
    await requireIdle()
    requireOk(await d.testRecording(), 'The local test recording failed. Retry setup.')
    d.progress('complete')
    return { ok: true, studioVersion: version.obsVersion }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'OBS setup failed. Retry setup.' }
  }
}
