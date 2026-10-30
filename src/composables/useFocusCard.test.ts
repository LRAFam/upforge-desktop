import { describe, expect, it, vi } from 'vitest'
import { createFocusCardState } from './useFocusCard'
import type { Focus, FocusResponse, FocusUpdate } from '../lib/focus'

const focus: Focus = {
  id: 2, label: 'Opening deaths', metric: 'opening_death_rate', better: 'lower', baseline: 0.17, target: 0.1,
  checks: [{ match_id: 'new', value: 0.13, hit: false, played_at: null }],
  progress: { games_played: 1, hits: 0, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null,
}
const latest: FocusUpdate = {
  match_id: 'new', focus_event: 'checked', focus,
  report: { notes: { headline: { finding_id: 'opening', text: 'Your opening deaths improved.' }, next_action: { finding_id: 'opening', text: 'Pair up before peeking.' } } },
}
const snapshot: FocusResponse = { success: true, focus, latest, history: [], notes_usage: { used: 1, limit: 10 } }
const api = () => ({
  getFocus: vi.fn().mockResolvedValue(snapshot),
  syncFocus: vi.fn().mockResolvedValue({ ok: true, uploaded: 0, skipped: 0, latest: null }),
})

describe('focus card lifecycle', () => {
  it('restores headline and Next game on a fresh mount even when no update event was received', async () => {
    const first = createFocusCardState(api())
    await first.load()
    first.dispose()
    const homeAgain = createFocusCardState(api())
    await homeAgain.load()
    expect(homeAgain.data.value?.latest?.report?.notes?.headline?.text).toBe('Your opening deaths improved.')
    expect(homeAgain.data.value?.latest?.report?.notes?.next_action?.text).toBe('Pair up before peeking.')
    expect(homeAgain.data.value?.focus?.checks[0]).toMatchObject({ hit: false, value: 0.13 })
  })

  it('keeps the restored notes when the user checks and there are no new matches', async () => {
    const state = createFocusCardState(api())
    await state.load()
    await state.syncNow()
    expect(state.syncMessage.value).toBe("You're up to date.")
    expect(state.data.value?.latest?.report?.notes?.next_action?.text).toBe('Pair up before peeking.')
  })

  it('does not overwrite an update with a request that began before the event', async () => {
    let resolve!: (value: FocusResponse) => void
    const services = api()
    services.getFocus.mockImplementationOnce(() => new Promise<FocusResponse>(done => { resolve = done }))
    const state = createFocusCardState(services)
    const pending = state.load()
    state.applyUpdate(latest)
    resolve({ ...snapshot, focus: { ...focus, id: 1 }, latest: null })
    await pending
    expect(state.data.value?.focus?.id).toBe(2)
    expect(state.data.value?.latest?.match_id).toBe('new')
  })

  it('accepts a newer authoritative focus instead of pinning the last event forever', async () => {
    const services = api()
    services.getFocus.mockResolvedValue({ ...snapshot, focus: { ...focus, id: 3 }, latest: null })
    const state = createFocusCardState(services)
    state.applyUpdate(latest)
    await state.load()
    expect(state.data.value?.focus?.id).toBe(3)
    expect(state.data.value?.latest).toBeNull()
  })

  it('does not update an unmounted account view when a request completes', async () => {
    let resolve!: (value: FocusResponse) => void
    const services = api()
    services.getFocus.mockImplementationOnce(() => new Promise<FocusResponse>(done => { resolve = done }))
    const state = createFocusCardState(services)
    const pending = state.load()
    state.dispose()
    resolve(snapshot)
    await pending
    expect(state.data.value).toBeNull()
  })

  it('shows a load failure without falsely offering to create a first focus', async () => {
    const services = api()
    services.getFocus.mockRejectedValue(new Error('offline'))
    const state = createFocusCardState(services)
    await state.load()
    expect(state.loading.value).toBe(false)
    expect(state.loadError.value).toContain('Could not load your focus')
  })

  it('reports a busy automatic sync accurately and handles rejected IPC calls', async () => {
    const services = api()
    services.syncFocus.mockResolvedValueOnce({ ok: false, reason: 'sync_in_progress', uploaded: 0, skipped: 0, latest: null })
    const state = createFocusCardState(services)
    await state.syncNow()
    expect(state.syncMessage.value).toBe('Your matches are already being checked.')
    services.syncFocus.mockRejectedValueOnce(new Error('IPC failed'))
    await state.syncNow()
    expect(state.syncMessage.value).toBe('Could not check your matches. Please try again.')
    expect(state.syncing.value).toBe(false)
  })
})

describe('focus card cache start (UI v3)', () => {
  it('draws the cached focus at once, without a loading state', () => {
    const state = createFocusCardState(api(), { initial: snapshot })
    expect(state.loading.value).toBe(false)
    expect(state.data.value?.focus?.label).toBe('Opening deaths')
  })

  it('a failed refresh keeps the cached focus on screen', async () => {
    const failing = { ...api(), getFocus: vi.fn().mockRejectedValue(new Error('timeout')) }
    const state = createFocusCardState(failing, { initial: snapshot })
    await state.load()
    expect(state.data.value?.focus?.label).toBe('Opening deaths')
    expect(state.loadError.value).not.toBe('')
  })

  it('without a cache it starts in the loading state, as before', () => {
    expect(createFocusCardState(api()).loading.value).toBe(true)
  })
})
