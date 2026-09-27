import { sameNotebookSource, type NotebookSource, type NotebookNote, type SavedComparison } from './review-notebook'

export interface ReviewNoteMarker {
  key: string
  item: SavedComparison
  note: NotebookNote
  side: 0 | 1
  seconds: number
}
export interface ReviewNoteMarkerGroup { key: number; percent: number; markers: ReviewNoteMarker[] }
/** Attachments refer to the saved A/B positions; source identity decides which video can show them. */
export function reviewNoteMarkers(items: SavedComparison[], source: NotebookSource | null, duration: number): ReviewNoteMarker[] {
  if (!source || !Number.isFinite(duration) || duration <= 0) return []
  return items.flatMap(item => item.notes.flatMap(note => ([0, 1] as const).flatMap(side => {
    if ((note.attachment === 'a' && side !== 0) || (note.attachment === 'b' && side !== 1)) return []
    const moment = note.context.moments[side]
    if (!sameNotebookSource(moment.source, source) || !Number.isFinite(moment.position) || moment.position < 0 || moment.position > duration) return []
    return [{ key: `${item.id}:${note.id}:${side}`, item, note, side, seconds: moment.position }]
  }))).sort((a, b) => a.seconds - b.seconds)
}
/** Keep a 28px gap between group anchors at the actual rendered timeline width. */
export function groupReviewNoteMarkers(markers: ReviewNoteMarker[], duration: number, width: number): ReviewNoteMarkerGroup[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0) return []
  const groups: ReviewNoteMarkerGroup[] = []
  for (const marker of markers) {
    const percent = marker.seconds / duration * 100
    const previous = groups.at(-1)
    if (previous && (percent - previous.percent) / 100 * width < 28) previous.markers.push(marker)
    else groups.push({ key: groups.length, percent, markers: [marker] })
  }
  return groups
}
