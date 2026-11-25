export interface RecoveryReportVisit { result: 'match_report' | 'vod_report'; result_id: string }
/** Observed foreground duration, not proof of attention; gaps and hidden time never qualify. */
export class RecoveryReportVisitClock {
  private key = ''
  private last = 0
  private active = false
  private elapsed = 0
  private sent = false
  sample(target: RecoveryReportVisit | null, foreground: boolean, now: number): number | null {
    const key = target ? `${target.result}:${target.result_id}` : ''
    if (key !== this.key) { this.key = key; this.elapsed = 0; this.sent = false; this.active = false }
    const delta = now - this.last
    if (key && this.active && foreground && delta > 0 && delta <= 2000) this.elapsed += delta
    this.last = now; this.active = !!key && foreground
    return this.active && !this.sent && this.elapsed >= 10000 ? Math.min(300000, Math.floor(this.elapsed)) : null
  }
  delivered() { this.sent = true }
}
