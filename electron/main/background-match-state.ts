/** Recording can fail or be disabled without ending the player's match. */
export class BackgroundMatchState {
  active = false
  private endedSamples = 0

  observe(inMatch: boolean | null): boolean {
    if (inMatch === null) { this.endedSamples = 0; return this.active }
    if (inMatch) { this.active = true; this.endedSamples = 0 }
    else if (++this.endedSamples >= 2) this.active = false
    return this.active
  }
}
