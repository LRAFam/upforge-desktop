export interface ObsWatchdogSnapshot {
  processRunning: boolean
  matchOwned: boolean
  activelyRecording: boolean
  disconnectedDuringRecording: boolean
  outputActive: boolean
  matchPerformanceModeActive?: boolean
}

function encodeSensitive(s: ObsWatchdogSnapshot): boolean {
  return (
    s.matchOwned
    || s.activelyRecording
    || s.disconnectedDuringRecording
    || s.outputActive
    || s.matchPerformanceModeActive === true
  )
}

export function canHardRecoverObs(s: ObsWatchdogSnapshot): boolean {
  if (!s.processRunning) return false // nothing to kill; launch path is separate
  return !encodeSensitive(s)
}

export function shouldReclaimAfterProcessDeath(s: ObsWatchdogSnapshot): boolean {
  return !s.processRunning && s.matchOwned
}

export function shouldRelaunchAfterFinalize(s: ObsWatchdogSnapshot): boolean {
  return !s.processRunning && !s.matchOwned && !s.activelyRecording && !s.disconnectedDuringRecording
}

export function canMutateObsCaptureHot(s: Pick<
  ObsWatchdogSnapshot,
  'matchOwned' | 'activelyRecording' | 'disconnectedDuringRecording' | 'outputActive'
>): boolean {
  return !(
    s.matchOwned
    || s.activelyRecording
    || s.disconnectedDuringRecording
    || s.outputActive
  )
}

export function buildRetargetMutationFlags(opts: {
  gameChanged: boolean
  matchOwned: boolean
  recording: boolean
  disconnectedDuringRecording: boolean
}): { forceRecreate: boolean; allowRecreate: boolean } {
  const cold = canMutateObsCaptureHot({
    matchOwned: opts.matchOwned,
    activelyRecording: opts.recording,
    disconnectedDuringRecording: opts.disconnectedDuringRecording,
    outputActive: false,
  })
  return {
    forceRecreate: cold && opts.gameChanged,
    allowRecreate: cold,
  }
}

/** Connect / setupUpForgeScene path — includes live outputActive from OBS. */
export function buildSetupMutationFlags(opts: {
  matchOwned: boolean
  recording: boolean
  disconnectedDuringRecording: boolean
  outputActive: boolean
}): { allowRecreate: boolean } {
  return {
    allowRecreate: canMutateObsCaptureHot({
      matchOwned: opts.matchOwned,
      activelyRecording: opts.recording,
      disconnectedDuringRecording: opts.disconnectedDuringRecording,
      outputActive: opts.outputActive,
    }),
  }
}
