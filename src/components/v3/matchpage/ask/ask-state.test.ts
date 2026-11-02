import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { askPanelState, headerTab, type AskPanelHost } from './ask-state'

function host(over: Partial<{ notes: boolean; map: boolean; theater: boolean }> = {}) {
  const showInsightsPanel = ref(over.notes ?? false)
  const spatialMapVisible = ref(over.map ?? false)
  const theaterMode = ref(over.theater ?? false)
  const h: AskPanelHost = {
    showInsightsPanel,
    spatialMapVisible,
    theaterMode,
    setSidePanelTab: vi.fn((tab) => {
      showInsightsPanel.value = tab === 'notes'
      spatialMapVisible.value = tab === 'map'
    }),
    toggleTheaterMode: vi.fn(() => { theaterMode.value = !theaterMode.value }),
  }
  return h
}

describe('headerTab', () => {
  it('underlines Ask AI, not Coach notes, while Ask is open', () => {
    expect(headerTab({ theater: false, notes: true, map: false, ask: true })).toBe('ask')
    expect(headerTab({ theater: false, notes: true, map: false, ask: false })).toBe('notes')
  })
  it('map wins, and a closed panel reads Replay', () => {
    expect(headerTab({ theater: false, notes: false, map: true, ask: false })).toBe('map')
    expect(headerTab({ theater: false, notes: false, map: false, ask: false })).toBe('replay')
  })
  it('theater mode reads Replay because the side panel is hidden', () => {
    expect(headerTab({ theater: true, notes: true, map: false, ask: true })).toBe('replay')
  })
})

describe('askPanelState', () => {
  it('is one state per review context', () => {
    const h = host()
    expect(askPanelState(h)).toBe(askPanelState(h))
    expect(askPanelState(host())).not.toBe(askPanelState(h))
  })

  it('Ask from theater mode leaves theater and opens the Ask panel', async () => {
    const h = host({ theater: true })
    const s = askPanelState(h)
    await s.selectTab('ask')
    expect(h.toggleTheaterMode).toHaveBeenCalledOnce()
    expect(h.theaterMode.value).toBe(false)
    expect(h.showInsightsPanel.value).toBe(true)
    expect(s.open.value).toBe(true)
    expect(s.mounted.value).toBe(true)
  })

  it('Coach notes / Map from theater mode also leave theater; Replay does not', async () => {
    const h = host({ theater: true })
    const s = askPanelState(h)
    await s.selectTab('replay')
    expect(h.toggleTheaterMode).not.toHaveBeenCalled()
    await s.selectTab('map')
    expect(h.theaterMode.value).toBe(false)
    expect(h.spatialMapVisible.value).toBe(true)
  })

  it('switching to notes, or closing the panel, closes Ask but keeps it mounted', async () => {
    const h = host({ notes: true })
    const s = askPanelState(h)
    await s.openAsk()
    expect(s.open.value).toBe(true)
    await s.selectTab('notes')
    expect(s.open.value).toBe(false)
    await s.openAsk()
    h.setSidePanelTab(null)
    await nextTick()
    expect(s.open.value).toBe(false)
    expect(s.mounted.value).toBe(true)
  })
})
