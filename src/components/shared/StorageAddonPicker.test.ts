import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { expect, it, vi } from 'vitest'
import * as storage from '../../lib/storage-addon'
import * as cloud from '../../lib/cloud-storage'

function picker(request: ReturnType<typeof vi.fn>) {
  const { descriptor } = parse(readFileSync(new URL('./StorageAddonPicker.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'storage-picker' })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, Date, Intl,
    window: { api: { storageAddon: { request }, on: () => () => {} } },
    require: (id: string) => id === 'vue' ? { ...vue, onMounted() {}, onBeforeUnmount() {} } : id.endsWith('/storage-addon') ? storage : id.endsWith('/cloud-storage') ? cloud : createRequire(import.meta.url)(id),
  })
  return exports.default.setup({}, { expose() {}, emit: vi.fn() })
}
const data = { usage: { active: false, status: 'none', capacity_bytes: 0 }, packs: [{ gb: 50, cents: 499, available: true }] }
it('ignores a late payment response after checkout is dismissed and allows another selection', async () => {
  vi.useFakeTimers()
  try {
    let resolve!: (result: any) => void
    const request = vi.fn().mockImplementation(({ action }) => action === 'sync' ? new Promise(r => { resolve = r }) : Promise.resolve({ ok: true, data }))
    const p = picker(request)
    await p.load()
    await p.act({ action: 'checkout', gb: 50 })
    const checking = p.checkPayment()
    p.closeCheckout()
    resolve({ ok: true, data: { ...data, usage: { active: true, status: 'active', capacity_bytes: 50e9 } } })
    await checking
    expect(p.pendingGb.value).toBeNull()
    expect(p.notice.value).toContain('dismissed')
    expect(p.checking.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await p.act({ action: 'checkout', gb: 100 })
    expect(p.pendingGb.value).toBe(100)
  } finally { vi.useRealTimers() }
})
it('coalesces loading and does not contact Stripe on an ordinary focus refresh', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, data })
  const p = picker(request)
  await Promise.all([p.load(), p.load(), p.load()])
  expect(request).toHaveBeenCalledTimes(1)
  p.refresh()
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith({ action: 'show' })
})
