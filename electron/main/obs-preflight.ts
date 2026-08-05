/**
 * OBS setup preflight — structured checks before match recording.
 * User-facing copy comes from classifyActivationError; raw OBS text stays in logs.
 */

import { existsSync, statSync } from 'fs'
import log from 'electron-log'
import type OBSWebSocket from 'obs-websocket-js'
import {
  classifyActivationError,
  type ActivationErrorCode,
} from './activation-error-codes'
import { isObsInstalled } from './obs-installer'
import { ensureObsConnected } from './obs-ensure'
import type { OBSRecorder } from './obs-recorder'
import {
  UPFORGE_SCENE_NAME,
  UPFORGE_INPUT_NAME,
  isUpForgeCaptureName,
  setupUpForgeScene,
} from './obs-setup'
import { resolveObsRecordVerifyMs, waitForObsRecordArmed } from './obs-start-verify'

export type ObsPreflightStepId =
  | 'obs_installed'
  | 'obs_running'
  | 'websocket_auth'
  | 'scene_exists'
  | 'source_exists'
  | 'source_active'
  | 'test_recording'

export interface ObsPreflightStepResult {
  step: ObsPreflightStepId
  ok: boolean
  code?: ActivationErrorCode
  technicalMessage?: string
  userMessage?: string
  optional?: boolean
}

export interface ObsPreflightResult {
  ok: boolean
  steps: ObsPreflightStepResult[]
  passedAt?: string
  errorCode?: ActivationErrorCode
  userMessage?: string
  technicalMessage?: string
}

export interface ObsRepairSetupResult {
  ok: boolean
  sceneCreated?: boolean
  inputCreated?: boolean
  errorCode?: ActivationErrorCode
  userMessage?: string
  technicalMessage?: string
}

export interface ObsTestRecordingResult {
  ok: boolean
  filePath?: string
  fileSizeBytes?: number
  errorCode?: ActivationErrorCode
  userMessage?: string
  technicalMessage?: string
}

const VALID_CAPTURE_KINDS = new Set(['window_capture', 'game_capture'])
const TEST_RECORD_DURATION_MS = 4_000
const TEST_FILE_POLL_MS = 500
const TEST_FILE_MAX_WAIT_MS = 30_000

function stepFailure(
  step: ObsPreflightStepId,
  technicalMessage: string,
  optional = false,
): ObsPreflightStepResult {
  const classified = classifyActivationError(technicalMessage)
  log.warn(`[OBS Preflight] ${step} failed:`, classified.technicalMessage)
  return {
    step,
    ok: false,
    optional,
    code: classified.code,
    technicalMessage: classified.technicalMessage,
    userMessage: classified.userMessage,
  }
}

function stepOk(step: ObsPreflightStepId, optional = false): ObsPreflightStepResult {
  return { step, ok: true, optional }
}

function firstBlockingFailure(steps: ObsPreflightStepResult[]): ObsPreflightStepResult | undefined {
  return steps.find((s) => !s.ok && !s.optional)
}

export function buildPreflightFailure(
  steps: ObsPreflightStepResult[],
): Pick<ObsPreflightResult, 'ok' | 'errorCode' | 'userMessage' | 'technicalMessage'> {
  const failed = firstBlockingFailure(steps)
  return {
    ok: false,
    errorCode: failed?.code,
    userMessage: failed?.userMessage,
    technicalMessage: failed?.technicalMessage,
  }
}

async function checkSceneExists(obs: OBSWebSocket): Promise<ObsPreflightStepResult> {
  try {
    const sceneList = await obs.call('GetSceneList') as unknown as { scenes?: { sceneName: string }[] }
    const hasScene = sceneList.scenes?.some((s) => s.sceneName === UPFORGE_SCENE_NAME) ?? false
    if (!hasScene) {
      return stepFailure('scene_exists', `Scene named ${UPFORGE_SCENE_NAME} was not found in OBS`)
    }
    return stepOk('scene_exists')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return stepFailure('scene_exists', msg)
  }
}

async function checkSourceExists(obs: OBSWebSocket): Promise<ObsPreflightStepResult> {
  try {
    const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
      sceneItems?: { sourceName: string; sceneItemId: number }[]
    }
    const captureItem = (items.sceneItems ?? []).find((i) => isUpForgeCaptureName(i.sourceName))
    if (!captureItem) {
      return stepFailure(
        'source_exists',
        `No source named \`${UPFORGE_INPUT_NAME}\` was found within the canvas \`Main\`.`,
      )
    }

    const settings = await obs.call('GetInputSettings', { inputName: captureItem.sourceName }) as {
      inputKind?: string
    }
    const kind = settings.inputKind ?? ''
    if (!VALID_CAPTURE_KINDS.has(kind)) {
      return stepFailure(
        'source_exists',
        `UpForge capture source has invalid type: ${kind || 'unknown'}`,
      )
    }
    return stepOk('source_exists')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/canvas|object not found|resource not found/i.test(msg)) {
      return stepFailure(
        'source_exists',
        `No source named \`${UPFORGE_INPUT_NAME}\` was found within the canvas \`Main\`.`,
      )
    }
    return stepFailure('source_exists', msg)
  }
}

async function checkSourceActive(obs: OBSWebSocket): Promise<ObsPreflightStepResult> {
  try {
    const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
      sceneItems?: { sourceName: string; sceneItemId: number }[]
    }
    const captureItem = (items.sceneItems ?? []).find((i) => isUpForgeCaptureName(i.sourceName))
    if (!captureItem) {
      return stepFailure('source_active', 'UpForge capture scene item not found', true)
    }
    const enabled = await obs.call('GetSceneItemEnabled', {
      sceneName: UPFORGE_SCENE_NAME,
      sceneItemId: captureItem.sceneItemId,
    }) as { sceneItemEnabled?: boolean }
    if (!enabled.sceneItemEnabled) {
      return stepFailure('source_active', 'UpForge capture source is hidden in OBS', true)
    }
    return stepOk('source_active', true)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return stepFailure('source_active', msg, true)
  }
}

async function waitForRecordingFile(filePath: string, sleep: (ms: number) => Promise<void>): Promise<number> {
  const deadline = Date.now() + TEST_FILE_MAX_WAIT_MS
  let lastSize = -1
  let stableChecks = 0

  while (Date.now() < deadline) {
    if (!existsSync(filePath)) {
      await sleep(TEST_FILE_POLL_MS)
      continue
    }
    let size = 0
    try {
      size = statSync(filePath).size
    } catch {
      await sleep(TEST_FILE_POLL_MS)
      continue
    }
    if (size > 0 && size === lastSize) {
      stableChecks++
      if (stableChecks >= 2) return size
    } else {
      stableChecks = 0
    }
    lastSize = size
    await sleep(TEST_FILE_POLL_MS)
  }

  if (existsSync(filePath)) {
    try {
      return statSync(filePath).size
    } catch { /* fall through */ }
  }
  return 0
}

export async function runObsTestRecording(opts: {
  obs: OBSWebSocket
  recordVerifyMs?: number
  recordDurationMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<ObsTestRecordingResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const recordDurationMs = opts.recordDurationMs ?? TEST_RECORD_DURATION_MS
  const verifyMs = opts.recordVerifyMs ?? resolveObsRecordVerifyMs()

  try {
    const status = await opts.obs.call('GetRecordStatus') as { outputActive?: boolean }
    if (status.outputActive) {
      return {
        ok: false,
        ...classifiedResult('OBS is already recording — stop the current recording before testing'),
      }
    }

    log.info('[OBS Preflight] Test recording — sending StartRecord')
    await opts.obs.call('StartRecord')

    const armed = await waitForObsRecordArmed({
      getOutputActive: async () => {
        const s = await opts.obs.call('GetRecordStatus') as { outputActive?: boolean }
        return !!s.outputActive
      },
      timeoutMs: verifyMs,
      sleep,
    })

    if (!armed.armed) {
      try {
        await opts.obs.call('StopRecord')
      } catch { /* ignore */ }
      const technical = `OBS StartRecord did not become active within ${Math.round(verifyMs / 1000)}s`
      return { ok: false, ...classifiedResult(technical) }
    }

    log.info('[OBS Preflight] Test recording armed — capturing for', recordDurationMs, 'ms')
    await sleep(recordDurationMs)

    const stopResponse = await opts.obs.call('StopRecord') as { outputPath?: string }
    const recordStatus = await opts.obs.call('GetRecordStatus') as { outputPath?: string }
    const filePath = stopResponse.outputPath ?? recordStatus.outputPath

    if (!filePath) {
      return {
        ok: false,
        ...classifiedResult('Recording file was not created after test recording'),
      }
    }

    const fileSizeBytes = await waitForRecordingFile(filePath, sleep)
    if (fileSizeBytes <= 0) {
      return {
        ok: false,
        filePath,
        fileSizeBytes: 0,
        ...classifiedResult('Recording file is incomplete or empty after test recording'),
      }
    }

    log.info('[OBS Preflight] Test recording passed:', filePath, `(${fileSizeBytes} bytes)`)
    return { ok: true, filePath, fileSizeBytes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, ...classifiedResult(msg) }
  }
}

function classifiedResult(technicalMessage: string): {
  errorCode: ActivationErrorCode
  userMessage: string
  technicalMessage: string
} {
  const classified = classifyActivationError(technicalMessage)
  return {
    errorCode: classified.code,
    userMessage: classified.userMessage,
    technicalMessage: classified.technicalMessage,
  }
}

export async function repairObsSetup(
  obsRecorder: OBSRecorder,
  game: string,
): Promise<ObsRepairSetupResult> {
  try {
    if (!obsRecorder.isConnected()) {
      const connected = await obsRecorder.connect()
      if (!connected.ok) {
        return { ok: false, ...classifiedResult(connected.error ?? 'OBS is not connected') }
      }
    }

    const result = await obsRecorder.setupScene(game, true)
    if (!result.ok) {
      return {
        ok: false,
        sceneCreated: result.sceneCreated,
        inputCreated: result.inputCreated,
        ...classifiedResult(result.error ?? 'OBS scene setup failed'),
      }
    }

    return {
      ok: true,
      sceneCreated: result.sceneCreated,
      inputCreated: result.inputCreated,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, ...classifiedResult(msg) }
  }
}

export interface RunObsPreflightOptions {
  obsRecorder: OBSRecorder
  game: string
  password: string
  port: number
  recordVerifyMs?: number
  includeTestRecording?: boolean
  onActivity?: (msg: string) => void
  sleep?: (ms: number) => Promise<void>
}

export async function runObsPreflight(opts: RunObsPreflightOptions): Promise<ObsPreflightResult> {
  const steps: ObsPreflightStepResult[] = []
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  if (!isObsInstalled()) {
    steps.push(stepFailure('obs_installed', 'OBS is not running — OBS Studio is not installed on this PC'))
    return { steps, ...buildPreflightFailure(steps) }
  }
  steps.push(stepOk('obs_installed'))

  const ensure = await ensureObsConnected(opts.obsRecorder, {
    password: opts.password,
    port: opts.port,
    allowProcessRestart: true,
    onActivity: opts.onActivity,
  })
  if (!ensure.ok) {
    steps.push(stepFailure('obs_running', ensure.error ?? 'OBS is not running'))
    return { steps, ...buildPreflightFailure(steps) }
  }
  steps.push(stepOk('obs_running'))

  if (!opts.obsRecorder.isConnected()) {
    const connect = await opts.obsRecorder.connect()
    if (!connect.ok) {
      steps.push(stepFailure('websocket_auth', connect.error ?? 'OBS WebSocket connection failed'))
      return { steps, ...buildPreflightFailure(steps) }
    }
  }
  steps.push(stepOk('websocket_auth'))

  const obs = opts.obsRecorder.getObsClient()

  const sceneStep = await checkSceneExists(obs)
  steps.push(sceneStep)
  if (!sceneStep.ok) return { steps, ...buildPreflightFailure(steps) }

  const sourceStep = await checkSourceExists(obs)
  steps.push(sourceStep)
  if (!sourceStep.ok) return { steps, ...buildPreflightFailure(steps) }

  steps.push(await checkSourceActive(obs))

  if (opts.includeTestRecording) {
    const testStep = await runObsTestRecording({
      obs,
      recordVerifyMs: opts.recordVerifyMs,
      sleep,
    })
    steps.push(
      testStep.ok
        ? stepOk('test_recording')
        : stepFailure('test_recording', testStep.technicalMessage ?? 'Test recording failed'),
    )
    if (!testStep.ok) return { steps, ...buildPreflightFailure(steps) }
  }

  const passedAt = new Date().toISOString()
  log.info('[OBS Preflight] All checks passed at', passedAt)
  return {
    ok: true,
    steps,
    passedAt,
  }
}

/** Direct scene repair without going through OBSRecorder.setupScene guards. */
export async function repairObsSetupDirect(
  obs: OBSWebSocket,
  game: string,
): Promise<ObsRepairSetupResult> {
  try {
    const result = await setupUpForgeScene(obs, game, { switchScene: true, forceRecreate: false })
    if (!result.ok) {
      return {
        ok: false,
        sceneCreated: result.sceneCreated,
        inputCreated: result.inputCreated,
        ...classifiedResult(result.error ?? 'OBS scene setup failed'),
      }
    }
    return {
      ok: true,
      sceneCreated: result.sceneCreated,
      inputCreated: result.inputCreated,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, ...classifiedResult(msg) }
  }
}
