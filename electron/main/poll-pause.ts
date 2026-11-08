import { PollPauseController } from '../../src/lib/poll-pause'

/** Main-process instance; index.ts configures it with the match/recording state. */
export const matchPollPause = new PollPauseController()
