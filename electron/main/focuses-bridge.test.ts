import { describe, expect, it } from 'vitest'
import { focusesReply, isFocusGame, isFocusId, parseAddFocus } from './focuses-bridge'

const state = { game: 'valorant', max_active: 3, focuses: [{ id: 1 }], options: [{ metric: 'traded_death_rate' }], recent: [] }

describe('focusesReply', () => {
  it('passes the list through on success', () => {
    expect(focusesReply({ status: 200, data: { success: true, ...state } })).toEqual({ ok: true, ...state })
    expect(focusesReply({ status: 201, data: { success: true, focus: { id: 2 }, ...state } })).toEqual({ ok: true, ...state })
  })

  it('reads a server without the endpoint as "unavailable", so the app keeps its single-focus screens', () => {
    expect(focusesReply({ status: 404, data: { message: 'Not Found' } })).toEqual({ ok: false, error: 'unavailable' })
    expect(focusesReply({ status: 500, data: '<html>' })).toEqual({ ok: false, error: 'unavailable' })
    expect(focusesReply({ status: 200, data: { success: true } })).toEqual({ ok: false, error: 'unavailable' })
  })

  it('keeps known refusal codes and the current list that came with them', () => {
    expect(focusesReply({ status: 422, data: { success: false, error: 'limit_reached', ...state } }))
      .toEqual({ ok: false, error: 'limit_reached', state })
    expect(focusesReply({ status: 404, data: { success: false, error: 'not_found' } })).toEqual({ ok: false, error: 'not_found' })
  })

  it('never passes on an error text it does not know', () => {
    expect(focusesReply({ status: 422, data: { success: false, error: 'SQLSTATE[42S02]: secret table' } })).toEqual({ ok: false, error: 'unavailable' })
    expect(focusesReply({ status: 401, data: { message: 'Unauthenticated.' } })).toEqual({ ok: false, error: 'signed_out' })
    expect(focusesReply(null)).toEqual({ ok: false, error: 'network_error' })
  })

  it('repairs a missing limit or recent list instead of failing', () => {
    expect(focusesReply({ status: 200, data: { success: true, game: 'lol', focuses: [], options: [] } }))
      .toEqual({ ok: true, game: 'lol', max_active: 1, focuses: [], options: [], recent: [] })
  })
})

describe('what the renderer may ask for', () => {
  it('only games with a focus loop', () => {
    expect(isFocusGame('valorant')).toBe(true)
    expect(isFocusGame('deadlock')).toBe(true)
    expect(isFocusGame('cs2')).toBe(true)
    expect(isFocusGame('dota2')).toBe(false)
    expect(isFocusGame(undefined)).toBe(false)
  })

  it('adds a measured habit, with or without the player’s own target', () => {
    expect(parseAddFocus({ game: 'valorant', metric: 'traded_death_rate' })).toEqual({ ok: true, body: { game: 'valorant', metric: 'traded_death_rate' } })
    expect(parseAddFocus({ game: 'lol', metric: 'deaths', target: 4.5 })).toEqual({ ok: true, body: { game: 'lol', metric: 'deaths', target: 4.5 } })
    expect(parseAddFocus({ game: 'lol', metric: 'deaths', target: null })).toEqual({ ok: true, body: { game: 'lol', metric: 'deaths' } })
  })

  it('refuses anything else before it reaches the API', () => {
    expect(parseAddFocus({ game: 'dota2', metric: 'adr' })).toEqual({ ok: false, error: 'unsupported_game' })
    expect(parseAddFocus({ game: 'valorant', metric: '../admin' })).toEqual({ ok: false, error: 'unknown_metric' })
    expect(parseAddFocus({ game: 'valorant', metric: 'deaths', target: '4' })).toEqual({ ok: false, error: 'invalid_target' })
    expect(parseAddFocus({ game: 'valorant', metric: 'deaths', target: Number.NaN })).toEqual({ ok: false, error: 'invalid_target' })
    expect(parseAddFocus({ game: 'valorant', metric: 'deaths', target: -1 })).toEqual({ ok: false, error: 'invalid_target' })
    expect(parseAddFocus(null)).toEqual({ ok: false, error: 'unsupported_game' })
  })

  it('only whole, positive focus ids', () => {
    expect(isFocusId(12)).toBe(true)
    expect(isFocusId(0)).toBe(false)
    expect(isFocusId(1.5)).toBe(false)
    expect(isFocusId('12')).toBe(false)
  })
})
