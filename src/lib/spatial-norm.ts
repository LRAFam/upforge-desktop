import type { NormPoint } from './spatial-types'

/** Guard for API / timeline events that omit or partial-fill spatial coords. */
export function isNormPoint(p: NormPoint | null | undefined): p is NormPoint {
  return (
    !!p &&
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  )
}

const FALLBACK_NORM: NormPoint = { x: 0.5, y: 0.5 }

/** Safe norm for draw pipelines — never throws on missing coords. */
export function normOrCenter(p: NormPoint | null | undefined): NormPoint {
  return isNormPoint(p) ? p : FALLBACK_NORM
}
