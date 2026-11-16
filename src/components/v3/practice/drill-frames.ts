/**
 * A real frame of each drill in play (captured from the trainer with no HUD) and where its target
 * is, so Practice shows the drill itself with the aim point marked instead of stock artwork.
 * Frames live in src/assets/training/frames, one per drill.
 */
const FRAME_URLS = import.meta.glob('../../../assets/training/frames/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>

/** Every frame is 16:9. */
export const FRAME_ASPECT = 16 / 9

// Run-through clips recorded in the trainer with a scripted player (src/assets/training/clips):
// a muted loop plus a still for before it loads and for reduced motion.
const CLIP_VIDEOS = import.meta.glob('../../../assets/training/clips/*.mp4', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>
const CLIP_STILLS = import.meta.glob('../../../assets/training/clips/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>

/** Width ÷ height of the clips (1920×1056). */
export const CLIP_ASPECT = 1920 / 1056

/** The clip shown when there is no drill to picture ("no drill yet", an unknown key). */
export const DEFAULT_CLIP = 'head_height'
/** Said under the default clip: the drill it shows, whatever the hero is about. */
export const DEFAULT_CLIP_CAPTION = 'Head Height Corridor'

/**
 * Drills pictured by a clip instead of a still: the drill itself, played through by a scripted hand.
 * A clip never stands in for another drill, so every caption here is null. A clip of a drill this
 * app cannot start does not belong here (drill-frames.test.ts fails on one).
 */
export const DRILL_CLIP: Record<string, { clip: string; caption: string | null }> = {
  head_height: { clip: 'head_height', caption: null },
  microflick: { clip: 'microflick', caption: null },
  gridshot: { clip: 'gridshot', caption: null },
  strafe_track: { clip: 'strafe_track', caption: null },
  flick: { clip: 'flick', caption: null },
}

/** A drill's own clip, for places that show the drill itself: its tile. */
export function ownClip(scenario: string | null | undefined): DrillClip | null {
  const clip = drillClip(scenario)
  return clip && clip.caption === null ? clip : null
}

export interface DrillClip {
  video: string
  still: string
  /** Replaces the drill's name under the picture when the clip is of another drill. */
  caption: string | null
}

const byName = (urls: Record<string, string>, name: string, ext: string) =>
  Object.entries(urls).find(([path]) => path.endsWith(`/${name}.${ext}`))?.[1] ?? null

/** The clip for a drill, or null when it has none. */
export function drillClip(
  scenario: string | null | undefined,
  videos: Record<string, string> = CLIP_VIDEOS,
  stills: Record<string, string> = CLIP_STILLS,
): DrillClip | null {
  const entry = scenario ? DRILL_CLIP[scenario] : undefined
  if (!entry) return null
  const video = byName(videos, entry.clip, 'mp4')
  const still = byName(stills, entry.clip, 'webp')
  return video && still ? { video, still, caption: entry.caption } : null
}

/**
 * What to show behind the Practice hero: the drill's clip, else its frame, else the default clip
 * under its own name ("no drill yet"). Always real footage of the trainer, never artwork.
 */
export function drillPicture(scenario: string | null | undefined): { clip: DrillClip | null; frame: DrillFrame | null } {
  const clip = drillClip(scenario)
  if (clip) return { clip, frame: null }
  const frame = drillFrame(scenario)
  if (frame) return { clip: null, frame }
  const video = byName(CLIP_VIDEOS, DEFAULT_CLIP, 'mp4')
  const still = byName(CLIP_STILLS, DEFAULT_CLIP, 'webp')
  return { clip: video && still ? { video, still, caption: DEFAULT_CLIP_CAPTION } : null, frame: null }
}

/**
 * Where the target is in the frame, 0–1 from the top-left corner. Null: the frame has no single
 * target to mark (a site of corners, a teammate, an empty long angle), so only the picture is shown.
 * Drills that open on cover are photographed from a spot, or at a moment, where the enemy is in view.
 */
export const DRILL_FRAME_TARGET: Record<string, readonly [number, number] | null> = {
  angle_clearing: [0.5587, 0.4874],
  clear_site: null,
  defuse_decision: [0.4995, 0.5107],
  distance_switching: [0.3802, 0.4801],
  duel: [0.6682, 0.5021],
  flash_swing: null,
  flick: [0.5552, 0.5664],
  gridshot: [0.4995, 0.6137],
  head_height: [0.4995, 0.4802],
  hold_angle: [0.5813, 0.5019],
  jiggle_peek: [0.5039, 0.3969],
  microadjust: [0.5123, 0.4476],
  microflick: [0.4378, 0.4267],
  operator_hold: null,
  retake_crossfire: [0.4052, 0.5019],
  sixshot: [0.575, 0.5793],
  strafe_aim: [0.5948, 0.5175],
  strafe_track: [0.4128, 0.4922],
  switching: [0.738, 0.5445],
  tracking: [0.5083, 0.343],
  trade_window: null,
}

export interface DrillFrame {
  url: string
  target: readonly [number, number] | null
}

/** The frame for a drill, or null when it has none (flat drills, unknown keys). */
export function drillFrame(scenario: string | null | undefined, urls: Record<string, string> = FRAME_URLS): DrillFrame | null {
  if (!scenario) return null
  const hit = Object.entries(urls).find(([path]) => path.endsWith(`/${scenario}.webp`))
  return hit ? { url: hit[1], target: DRILL_FRAME_TARGET[scenario] ?? null } : null
}

export interface FrameLayout {
  /** Image width, left and top as percentages of the box (CSS `top` % is of the box height). */
  width: number
  left: number
  top: number
  /** Where the target ends up in the box, 0–1. Null when the frame has none. */
  target: { x: number; y: number } | null
}

/**
 * Places a 16:9 frame in a box so the target sits right of the text (62% across, 46% down by
 * default) and the picture always covers the box. The picture is scaled up a little so there is
 * room to slide it; where the edge of the frame stops it, the target mark follows the picture.
 */
export function frameLayout(
  target: readonly [number, number] | null,
  box: { width: number; height: number },
  anchor: { x: number; y: number } = { x: 0.62, y: 0.46 },
  zoom = 1.25,
  aspect = FRAME_ASPECT,
): FrameLayout {
  const w = Math.max(1, box.width)
  const h = Math.max(1, box.height)
  const cover = Math.max(1, (h * aspect) / w)
  const iw = w * cover * zoom
  const ih = iw / aspect
  const [tx, ty] = target ?? [0.5, 0.5]
  const left = Math.min(0, Math.max(w - iw, anchor.x * w - tx * iw))
  const top = Math.min(0, Math.max(h - ih, anchor.y * h - ty * ih))
  return {
    width: (iw / w) * 100,
    left: (left / w) * 100,
    top: (top / h) * 100,
    target: target ? { x: (left + tx * iw) / w, y: (top + ty * ih) / h } : null,
  }
}
