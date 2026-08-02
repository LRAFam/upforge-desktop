/** Decide next action while clearing unowned OBS output. */
export type UnownedClearPhase = 'settle' | 'stop' | 'recheck' | 'cleared' | 'blocked'

export function nextUnownedClearAction(opts: {
  attempt: number // 0-based stop attempts completed
  maxStopAttempts: number
  outputActive: boolean
}): 'cleared' | 'stop' | 'blocked' {
  if (!opts.outputActive) return 'cleared'
  if (opts.attempt < opts.maxStopAttempts) return 'stop'
  return 'blocked'
}
