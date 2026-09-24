/** Counts visible, focused playback time. Seeking and buffering do not count. */
export class PlaybackActivityMeter {
  private key = ''
  private previous: { wall: number; media: number } | null = null
  private seconds = 0
  private reported = false

  sample(input: { key: string; wallMs: number; mediaSeconds: number; playing: boolean; visible: boolean; seeking: boolean }): boolean {
    if (input.key !== this.key) {
      this.key = input.key
      this.previous = null
      this.seconds = 0
      this.reported = false
    }
    if (!input.playing || !input.visible || input.seeking || !Number.isFinite(input.mediaSeconds)) {
      this.previous = null
      return false
    }
    const previous = this.previous
    this.previous = { wall: input.wallMs, media: input.mediaSeconds }
    if (previous) {
      const elapsed = (input.wallMs - previous.wall) / 1000
      const progress = input.mediaSeconds - previous.media
      // Large gaps and seeks are not evidence of watched time; support normal 0.5x–2x playback.
      if (elapsed > 0 && elapsed <= 2 && progress > 0 && progress <= elapsed * 2.5 + 0.1) this.seconds += elapsed
    }
    if (!this.reported && this.seconds >= 10) {
      this.reported = true
      return true
    }
    return false
  }
}
