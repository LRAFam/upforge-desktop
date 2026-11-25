
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainDevPreviewContext = Pick<MainRuntimeBindings,
  | 'createPostGameWindow'
  | 'postGameWindow'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainDevPreview(mainProcess: MainDevPreviewContext) {
  function showDevelopmentPostGamePreview(): void {
      mainProcess.postGameWindow = mainProcess.createPostGameWindow()
      mainProcess.postGameWindow.webContents.once('did-finish-load', () => {
        mainProcess.postGameWindow?.webContents.send('post-game:upload-start', { game: 'valorant', map: 'Bind', agent: 'Jett' })
        setTimeout(() => mainProcess.postGameWindow?.webContents.send('post-game:upload-progress', 45), 800)
        setTimeout(() => mainProcess.postGameWindow?.webContents.send('post-game:upload-progress', 100), 1600)
        setTimeout(() => mainProcess.postGameWindow?.webContents.send('post-game:upload-complete', {}), 2000)
        setTimeout(() => mainProcess.postGameWindow?.webContents.send('post-game:analysis-ready', {
          overall_score: 72,
          analysis_id: 999,
          session_start: Date.now() - 35 * 60 * 1000,
          match_id: 'dev-preview-match',
          kills: 18,
          deaths: 14,
          assists: 6,
          match_result: 'win',
          ally_score: 13,
          enemy_score: 11,
          top_issue: 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.',
          priority_improvements: [
            'Hold off-angles after plant instead of wide peeking.',
            'Pre-aim head height on B site entries.',
          ],
          match_highlights: [{
            id: 'dev-h1',
            kind: 'mistake',
            title: 'Wide swing after plant',
            reason: 'Peeked A main alone with 20s left — lost the round win condition.',
            round: 11,
            videoOffsetMs: 312000,
            clipId: null,
            rank: 90,
          }],
        }), 5500)
      })

  }

  return { showDevelopmentPostGamePreview }
}
