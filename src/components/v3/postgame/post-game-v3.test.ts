import { describe, expect, it } from 'vitest'
import { agentPortraitUrl, kdaText, metaLine, postGameFocusStrip, progressWidth, resultTone, resultWord, scoreText, toneColor, type PostGameSummary } from './post-game-v3'

const s = (o: Partial<PostGameSummary>): PostGameSummary =>
  ({ result: null, ally: null, enemy: null, kills: null, deaths: null, assists: null, ...o })

describe('post-game v3 helpers', () => {
  it('names the result only from real data', () => {
    expect(resultWord(s({ result: 'win' }))).toBe('VICTORY')
    expect(resultWord(s({ result: 'loss' }))).toBe('DEFEAT')
    expect(resultWord(s({ ally: 12, enemy: 12 }))).toBe('DRAW')
    expect(resultWord(s({}))).toBeNull()
    expect(resultWord(null)).toBeNull()
  })

  it('washes the hero teal for a win, red for a loss, nothing otherwise', () => {
    expect(resultTone(s({ result: 'win' }))).toBe('win')
    expect(resultTone(s({ result: 'loss' }))).toBe('loss')
    expect(resultTone(s({ ally: 12, enemy: 12 }))).toBe('none')
  })

  it('shows score and K/D/A only when every number is known', () => {
    expect(scoreText(s({ ally: 13, enemy: 11 }))).toBe('13–11')
    expect(scoreText(s({ ally: 13 }))).toBeNull()
    expect(kdaText(s({ kills: 18, deaths: 14, assists: 6 }))).toBe('18/14/6 K/D/A')
    expect(kdaText(s({ kills: 0, deaths: 0, assists: 0 }))).toBe('0/0/0 K/D/A')
    expect(kdaText(s({ kills: 18, deaths: 14 }))).toBeNull()
  })

  it('clamps progress and keeps a sliver visible', () => {
    expect(progressWidth(null)).toBeNull()
    expect(progressWidth(Number.NaN)).toBeNull()
    expect(progressWidth(0)).toBe(3)
    expect(progressWidth(47.6)).toBe(48)
    expect(progressWidth(140)).toBe(100)
  })

  it('maps status tones to colours by meaning, never brand red', () => {
    expect(toneColor('success')).toBe('var(--uf-win)')
    expect(toneColor('error')).toBe('var(--uf-loss)')
    expect(toneColor('paused')).toBe('var(--uf-gold)')
    expect(toneColor('active')).toBe('var(--uf-bone)')
    expect(Object.values({ a: toneColor('active'), n: toneColor('neutral') })).not.toContain('var(--uf-red)')
  })

  it('joins only the meta parts we know', () => {
    expect(metaLine(['Jett', null, 'Bind', '', undefined])).toBe('Jett · Bind')
    expect(metaLine([])).toBe('')
  })
  it('uses the full portrait for Valorant agents and leaves other art alone', () => {
    expect(agentPortraitUrl('https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/displayicon.png'))
      .toBe('https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/fullportrait.png')
    expect(agentPortraitUrl('https://ddragon.example/champion/Ahri.png')).toBe('https://ddragon.example/champion/Ahri.png')
    expect(agentPortraitUrl('')).toBeNull()
    expect(agentPortraitUrl(null)).toBeNull()
  })
})

describe('postGameFocusStrip', () => {
  const focus = (checks: boolean[], req = 5, need = 3) => ({
    label: 'Die first less', checks: checks.map(hit => ({ hit })),
    progress: { games_played: checks.length, hits: checks.filter(Boolean).length, games_required: req, hits_required: need, status: 'active' },
  })
  it('shows one pip per required game, oldest first, with open slots', () => {
    const s = postGameFocusStrip(focus([true, false]))!
    expect(s.pips).toEqual(['hit', 'miss', 'open', 'open', 'open'])
    expect(s.line).toBe('On target in 1 of your last 2 games, 3 needed.')
  })
  it('keeps only the most recent window', () => {
    expect(postGameFocusStrip(focus([false, false, true, true, true, true, true]))!.pips).toEqual(['hit', 'hit', 'hit', 'hit', 'hit'])
  })
  it('explains the start and handles no focus', () => {
    expect(postGameFocusStrip(focus([]))!.line).toBe('Your next 5 games check this focus.')
    expect(postGameFocusStrip(null)).toBeNull()
  })
})
