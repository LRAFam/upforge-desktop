/**
 * What the player sees when a match replay cannot be read. Each one says what to do next and
 * promises nothing the app cannot keep (a new UpForge build may not read a new demo format yet).
 */

/** The .dem is complete but the bundled CS2 parser cannot read it: almost always a CS2 game update. */
export const CS2_DEMO_UNREADABLE_MESSAGE =
  "UpForge can't read this CS2 demo yet. A recent CS2 update likely changed the demo format. When an UpForge update adds support, rescan this match."

/** Opening the file failed outright (any game): usually the wrong or a damaged file. */
export const REPLAY_UNREADABLE_MESSAGE =
  'Could not open this replay file. Check it is the replay for this match, or pick another file.'
