export type DemoAttachGame = 'cs2' | 'deadlock'

export interface DemoAttachGuidePart {
  text: string
  emphasis?: boolean
  mono?: boolean
}

export interface DemoAttachGuideStep {
  parts: DemoAttachGuidePart[]
}

export const CS2_AUTOEXEC_LINE = 'cl_demo_auto_recording 1'

export function isDemoAttachGame(game: string | null | undefined): game is DemoAttachGame {
  return game === 'cs2' || game === 'deadlock'
}

export function demoAttachGuideTitle(game: DemoAttachGame): string {
  return game === 'cs2' ? 'How to get your CS2 demo' : 'How to get your Deadlock replay'
}

export const CS2_REPLAYS_FOLDER_HINT = 'Steam/…/game/csgo/replays/'

export function demoAttachGuideSteps(game: DemoAttachGame): DemoAttachGuideStep[] {
  if (game === 'cs2') {
    return [
      {
        parts: [
          { text: 'Open CS2 → ' },
          { text: 'Watch → Your Matches', emphasis: true },
          { text: ' → pick the match → ' },
          { text: 'Download', emphasis: true },
        ],
      },
      {
        parts: [
          { text: 'Download saves to ' },
          { text: CS2_REPLAYS_FOLDER_HINT, mono: true },
          { text: ' — extra .dem files from auto-record or other matches are normal' },
        ],
      },
      {
        parts: [
          { text: 'Or add ' },
          { text: CS2_AUTOEXEC_LINE, mono: true },
          { text: ' to autoexec — demos may also land in the csgo folder after each game' },
        ],
      },
      {
        parts: [
          { text: 'In UpForge: ' },
          { text: 'Attach demo', emphasis: true },
          { text: ' (pick the .dem from after your match) or ' },
          { text: 'Scan replay folder', emphasis: true },
        ],
      },
    ]
  }

  return [
    {
      parts: [
        { text: 'Open Deadlock → ' },
        { text: 'Match history', emphasis: true },
        { text: ' → open the match → ' },
        { text: 'Download replay', emphasis: true },
      ],
    },
    {
      parts: [
        { text: 'File saves under ' },
        { text: 'Steam/…/Deadlock/game/citadel/replays/', mono: true },
      ],
    },
    {
      parts: [
        { text: 'In UpForge: ' },
        { text: 'Attach demo', emphasis: true },
        { text: ' or ' },
        { text: 'Scan replay folder', emphasis: true },
      ],
    },
  ]
}
