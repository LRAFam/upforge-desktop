/**
 * Shared "Ask AI" panel state for one match page. The review composable only knows the notes and
 * map panels, so this keeps the Ask flag next to it (keyed by the review context object) and lets
 * the header tabs and the side panel read the same state.
 */
import { effectScope, nextTick, ref, watch, type Ref } from 'vue'
import type { MatchSideTab } from '../match-page-v3'

export type MatchHeaderTab = MatchSideTab | 'ask'

export interface AskPanelHost {
  showInsightsPanel: Ref<boolean>
  spatialMapVisible: Ref<boolean>
  theaterMode: Ref<boolean>
  setSidePanelTab: (tab: 'notes' | 'map' | null) => void
  toggleTheaterMode: () => void
}

export interface AskPanelState {
  /** Ask AI is the visible panel (it sits on top of the notes panel). */
  open: Ref<boolean>
  /** Mounted once and kept, so a typed question survives tab switches. */
  mounted: Ref<boolean>
  openAsk: () => Promise<void>
  /** Header tab click: Replay / notes / map / ask. Leaves theater mode first, because theater hides the side panel. */
  selectTab: (key: string) => Promise<void>
}

const states = new WeakMap<object, AskPanelState>()

/** The header's underlined tab. In theater mode only the video shows, so it reads "Replay". */
export function headerTab(s: { theater: boolean; notes: boolean; map: boolean; ask: boolean }): MatchHeaderTab {
  if (s.theater) return 'replay'
  if (s.map) return 'map'
  if (s.notes) return s.ask ? 'ask' : 'notes'
  return 'replay'
}

export function askPanelState(host: AskPanelHost): AskPanelState {
  const existing = states.get(host)
  if (existing) return existing

  const open = ref(false)
  const mounted = ref(false)
  // Any notes/map change (close button, N / M keys, another tab) closes Ask. Detached scope: the
  // state outlives whichever component asked first (the header remounts while the timeline loads).
  effectScope(true).run(() => {
    watch([host.showInsightsPanel, host.spatialMapVisible], () => { open.value = false })
  })

  async function openAsk() {
    if (!host.showInsightsPanel.value) { host.setSidePanelTab('notes'); await nextTick() }
    open.value = true
    mounted.value = true
  }

  async function selectTab(key: string) {
    if (key !== 'replay' && host.theaterMode.value) host.toggleTheaterMode()
    if (key === 'ask') return openAsk()
    open.value = false
    host.setSidePanelTab(key === 'replay' ? null : (key as 'notes' | 'map'))
  }

  const state: AskPanelState = { open, mounted, openAsk, selectTab }
  states.set(host, state)
  return state
}
