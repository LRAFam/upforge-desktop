type SeekVideo = Pick<HTMLVideoElement, 'currentTime' | 'seeking' | 'addEventListener' | 'removeEventListener'>

/** Only the latest jump may complete; elapsed time is not evidence of a decoded frame. */
export function createReviewSeek() {
  let cleanup: (() => void) | undefined
  function cancel() {
    cleanup?.()
    cleanup = undefined
  }
  function seek(video: SeekVideo, target: number, completed: () => void, failed: () => void) {
    cancel()
    if (video.currentTime === target && !video.seeking) {
      completed()
      return
    }
    const onSeeked = () => {
      if (video.seeking) return
      cancel()
      completed()
    }
    const onError = () => { cancel(); failed() }
    cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.removeEventListener('emptied', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.addEventListener('emptied', onError)
    try { video.currentTime = target } catch { onError() }
  }
  return { seek, cancel }
}
