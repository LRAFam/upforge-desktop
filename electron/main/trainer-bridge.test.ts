import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainerBridge, type DrillConfig } from './trainer-bridge'

const state = vi.hoisted(() => ({ children: [] as any[], sockets: [] as any[] }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/tmp/upforge-desktop' } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('fs', () => ({ default: { existsSync: () => true } }))
vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return { spawn: vi.fn(() => {
    const child = Object.assign(new EventEmitter(), { exitCode: null, stderr: new EventEmitter(), kill: vi.fn() })
    state.children.push(child)
    return child
  }) }
})
vi.mock('net', async () => {
  const { EventEmitter } = await import('node:events')
  return { default: { Socket: class extends EventEmitter {
    destroyed = false
    write = vi.fn()
    destroy = vi.fn(() => { this.destroyed = true })
    constructor() { super(); state.sockets.push(this) }
    connect(_port: number, _host: string, ready: () => void) { queueMicrotask(ready) }
  } } }
})

beforeEach(() => { state.children.length = 0; state.sockets.length = 0 })
const drill: DrillConfig = { scenario: 'flick', duration_seconds: 60, difficulty: 'medium' }

describe('trainer startup', () => {
  it('sends a scenario exactly once after the connection is ready', async () => {
    const bridge = new TrainerBridge(() => null)
    await bridge.launch(drill)
    expect(state.sockets[0].write).toHaveBeenCalledOnce()
    expect(JSON.parse(state.sockets[0].write.mock.calls[0][0]).scenario).toBe('flick')
    bridge.kill()
  })

  it('ignores a previous process exit after the replacement trainer has started', async () => {
    const bridge = new TrainerBridge(() => null)
    await bridge.launch(drill)
    await bridge.launch({ ...drill, scenario: 'tracking' })
    state.children[0].emit('exit', 0)
    bridge.kill()
    expect(state.children[1].kill).toHaveBeenCalledOnce()
    expect(state.sockets[1].destroy).toHaveBeenCalledOnce()
  })

  it('ignores a previous socket closing after the replacement has connected', async () => {
    const bridge = new TrainerBridge(() => null)
    await bridge.launch(drill)
    await bridge.launch({ ...drill, scenario: 'tracking' })
    state.sockets[0].emit('close')
    bridge.kill()
    expect(state.sockets[1].destroy).toHaveBeenCalledOnce()
  })
})
