interface MatchEndProbe {
  isMatchProcessRunning(): Promise<boolean>
  getSessionState(): Promise<{ sessionLoopState: string } | null>
  isCoreGameSessionActive(): Promise<boolean | null>
  isPregameSessionActive(): Promise<boolean | null>
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
      // Presence can stay INGAME after Riot has confirmed both sessions ended.
      // Do not undo that confirmation merely because the game stays open in its lobby.
      if (coreActive === false && await probe.isPregameSessionActive() === false) return false
    }
    // Keep protecting capture while presence/session evidence is still inconclusive.
    if (state?.sessionLoopState !== 'MENUS') return true
  } catch { /* not live */ }
  return false
}
