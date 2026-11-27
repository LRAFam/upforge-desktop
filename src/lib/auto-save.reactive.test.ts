import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref, watch } from 'vue'
import { createAutoSaver, plainCopy } from './auto-save'

// ERR1127-08: Settings auto-save threw "structuredClone ... could not be cloned" because a deep
// watch hands the saver a Vue reactive Proxy. Every value must reach IPC as plain, cloneable data.
interface Prefs { mode: string; pregame_enabled: boolean; daily_limit: number; nested: { tags: string[] } }
const initial = (): Prefs => ({ mode: 'smart', pregame_enabled: true, daily_limit: 2, nested: { tags: ['a'] } })

describe('auto-save with reactive settings', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('plainCopy turns a reactive Proxy (with nested proxies) into cloneable data', () => {
    const state = reactive(initial())
    expect(() => structuredClone(state)).toThrow()
    const copy = plainCopy(state)
    expect(() => structuredClone(copy)).not.toThrow()
    expect(copy).toEqual(initial())
    state.nested.tags.push('b')
    expect(copy.nested.tags).toEqual(['a'])
  })

  it('schedule + markSaved accept reactive values without throwing', () => {
    const saver = createAutoSaver<Prefs>({ save: async () => {}, onState: () => {} })
    expect(() => saver.markSaved(reactive(initial()))).not.toThrow()
    expect(() => saver.schedule(reactive({ ...initial(), daily_limit: 3 }))).not.toThrow()
    saver.dispose()
  })

  it('a deep watch on a ref (the Settings pattern) saves a plain, IPC-cloneable payload', async () => {
    const sent: unknown[] = []
    // Electron IPC structured-clones arguments; emulate that so a Proxy would fail here.
    const save = vi.fn(async (v: Prefs) => { sent.push(structuredClone(v)); return v })
    const saver = createAutoSaver<Prefs>({ save, onState: () => {}, delayMs: 100 })
    const prefs = ref<Prefs | null>(null)
    watch(prefs, value => { if (value) saver.schedule(value) }, { deep: true })
    saver.markSaved(initial())
    prefs.value = initial()
    await nextTick()
    prefs.value!.daily_limit = 4
    prefs.value!.nested.tags.push('x')
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(save).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([{ ...initial(), daily_limit: 4, nested: { tags: ['a', 'x'] } }])
  })

  it('later edits to the reactive source do not change the value being saved', async () => {
    let resolve!: () => void
    const save = vi.fn((_v: Prefs) => new Promise<void>(r => { resolve = r }))
    const saver = createAutoSaver<Prefs>({ save, onState: () => {}, delayMs: 50 })
    const state = reactive(initial())
    saver.schedule(state)
    state.daily_limit = 5
    await vi.advanceTimersByTimeAsync(50)
    expect(save.mock.calls[0][0].daily_limit).toBe(2)
    resolve()
    saver.dispose()
  })
})

describe('settings sections send plain data over IPC', () => {
  const dir = new URL('../components/settings/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.vue'))

  it.each(files)('%s never structuredClones reactive state', file => {
    const src = readFileSync(new URL(file, dir), 'utf8')
    expect(src).not.toMatch(/structuredClone\(/)
  })

  it('coaching briefs saves through plainCopy', () => {
    const src = readFileSync(new URL('SettingsCoachingBriefs.vue', dir), 'utf8')
    expect(src).toMatch(/savePreferences\(plainCopy\(value\)\)/)
    expect(src).toMatch(/savePreferences\(plainCopy\(preferences\.value\)\)/)
  })

  it('the main settings save strips proxies before IPC', () => {
    const src = readFileSync(new URL('../composables/useSettings.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/settings\.save\(JSON\.parse\(JSON\.stringify\(toRaw\(settings\)\)\)\)/)
  })
})
