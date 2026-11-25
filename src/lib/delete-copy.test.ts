import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clipDeleteMessage, clipsBulkDeleteMessage, recordingDeleteMessage, recordingsBulkDeleteMessage } from './delete-copy'

describe('recording delete copy says what goes and from where', () => {
  it('single recordings', () => {
    expect(recordingDeleteMessage({ hasLocalFile: true })).toBe("Delete this recording from this PC? It isn't in the cloud, so the video can't be recovered.")
    expect(recordingDeleteMessage({ hasLocalFile: true, archiveId: 4 })).toBe('Delete this recording from this PC? The cloud copy stays in Cloud storage.')
    expect(recordingDeleteMessage({ hasLocalFile: false, cloudUploaded: true, analysisId: 9 })).toBe("Remove this match from your list? There's no video file on this PC to delete. The cloud copy stays in Cloud storage. Your AI coaching for this match stays in your account.")
  })
  it('bulk recordings', () => {
    expect(recordingsBulkDeleteMessage([{ hasLocalFile: true, archiveId: 1 }, { hasLocalFile: true }, { hasLocalFile: true }]))
      .toBe("Delete 3 recordings from this PC? 1 has a cloud copy, which stays in Cloud storage. 2 aren't in the cloud and can't be recovered.")
    expect(recordingsBulkDeleteMessage([{ hasLocalFile: false }])).toBe('Delete 1 recording from this PC? 1 has no file on this PC and is only removed from the list.')
  })
})

describe('clip delete copy', () => {
  it('names the PC and the cloud', () => {
    expect(clipDeleteMessage({ uploadStatus: 'uploaded' })).toBe('Delete from this PC? The cloud copy stays in Cloud storage.')
    expect(clipDeleteMessage({ uploadStatus: 'none' })).toMatch(/can't be recovered/)
    expect(clipsBulkDeleteMessage([{ uploadStatus: 'uploaded' }, { uploadStatus: 'none' }, { uploadStatus: null }]))
      .toBe("Delete 3 clips from this PC? 1 in the cloud stays there. 2 aren't in the cloud and can't be recovered.")
  })
})

describe('delete buttons look like delete', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
  it('uses a trash icon, never the close X, on rows and clips', () => {
    const row = read('../components/v3/matches/MatchRowV3.vue')
    const tile = read('../components/v3/matches/ClipTileV3.vue')
    expect(row).toMatch(/aria-label="Delete recording"[^>]*>\s*<UfIcon name="trash"/)
    expect(tile).toMatch(/<UfIcon name="trash" :size="14" \/>Delete<\/button>/)
    expect(tile).not.toMatch(/aria-label="Delete clip"[^>]*><UfIcon name="close"/)
  })
  it('keeps "delete all clips from this match" inside Select mode', () => {
    const clips = read('../views/ClipsView.vue')
    expect(clips).toMatch(/v-else-if="bulkMode" type="button" class="uf-link uf-cl-del"/)
  })
})
