export type ValorantNextMatchRearmDecision =
  | 'reset_and_wait_for_process'
  | 'inspect_riot_session'

/**
 * After a match, Shipping.exe can disappear briefly before the next queue.
 * Clear GameDetector's previous active match in that gap so its normal poller
 * can emit a fresh game-started event when the next process appears.
 */
export function decideValorantNextMatchRearm(
  processRunning: boolean,
): ValorantNextMatchRearmDecision {
  return processRunning ? 'inspect_riot_session' : 'reset_and_wait_for_process'
}
