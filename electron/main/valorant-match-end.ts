interface MatchEndProbe {
  isMatchProcessRunning(): Promise<boolean>
  getSessionState(): Promise<{ sessionLoopState: string } | null>
  isCoreGameSessionActive(): Promise<boolean | null>
  isPregameSessionActive(): Promise<boolean | null>
  hasMatchEndSessionEvidence(): boolean
}

/** Guard a confirmed match-end against a genuinely active game. */
export async function isValorantStillInLiveMatch(probe: MatchEndProbe): Promise<boolean> {
  try {
    const shippingUp = await probe.isMatchProcessRunning()
    if (!shippingUp) return false
    const state = await probe.getSessionState()
    if (state?.sessionLoopState === 'INGAME') {
      const coreActive = await probe.isCoreGameSessionActive()
      if (coreActive === true) return true
      // Range/unsupported routes can have no session throughout live gameplay.
      // Only trust missing sessions after this match had positive session/round evidence.
      if (coreActive === false
        && await probe.isPregameSessionActive() === false
        && probe.hasMatchEndSessionEvidence()) return false
    }
    // Keep protecting capture while presence/session evidence is still inconclusive.
    if (state?.sessionLoopState !== 'MENUS') return true
  } catch { /* not live */ }
  return false
}
