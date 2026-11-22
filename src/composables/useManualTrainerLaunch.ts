import { shallowRef } from 'vue'
import { trainerScenariosForGame } from '../lib/trainer-scenarios'
import {
  manualTrainerOptions, readManualTrainerOptions, writeManualTrainerOptions,
  type ManualTrainerOptions, type ManualTrainerScope,
} from '../lib/manual-trainer-options'

export interface ManualTrainerRequest extends ManualTrainerScope {
  label: string
  options: ManualTrainerOptions
}

/** Owns only manual starts. Prescribed sessions/attempts never pass through this picker. */
export function useManualTrainerLaunch(deps: {
  game: () => string
  busy: () => boolean
  accountId: () => Promise<number | null>
  defaults: (scenario: string) => unknown
  launch: (request: { scenario: string } & ManualTrainerOptions) => Promise<void>
}) {
  const request = shallowRef<ManualTrainerRequest | null>(null)
  let generation = 0
  let submitting = false
  function cancel() { generation++; request.value = null }

  async function open(scenario: string) {
    if (deps.busy() || submitting) return
    const game = deps.game()
    const drill = trainerScenariosForGame(game).find(d => d.key === scenario)
    if (!drill) return
    const seq = ++generation
    request.value = null
    const accountId = await deps.accountId().catch(() => null)
    if (seq !== generation || game !== deps.game() || deps.busy()) return
    const scope = { accountId, game, scenario }
    request.value = { ...scope, label: drill.label, options: readManualTrainerOptions(scope, deps.defaults(scenario)) }
  }

  async function start(value: unknown) {
    const current = request.value, options = manualTrainerOptions(value)
    if (!current || !options || submitting || deps.busy()) return
    const seq = generation
    submitting = true
    try {
      // Recheck after the dialog was open: a late auth reply or account/game switch must not
      // save one player's settings under another account or launch the previous game's drill.
      const accountId = await deps.accountId().catch(() => null)
      if (seq !== generation || current.game !== deps.game() || current.accountId !== accountId
        || deps.busy() || !trainerScenariosForGame(current.game).some(d => d.key === current.scenario)) {
        if (seq === generation) cancel()
        return
      }
      writeManualTrainerOptions(current, options)
      cancel()
      // A manual run has no assigned drill id, context, pass target or guided step attached.
      await deps.launch({ scenario: current.scenario, ...options })
    } finally { submitting = false }
  }

  return { request, open, start, cancel }
}
