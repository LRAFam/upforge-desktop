import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import log from 'electron-log'

export interface OptimizationResult {
  name: string
  success: boolean
  message: string
}

export interface PerformanceStatus {
  boosted: boolean
  powerPlan: string
  platform: string
}

// High Performance power plan GUID (built-in on all Windows versions)
const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
const BALANCED_GUID = '381b4222-f694-41f0-9685-ff5bb260df2e'

// Known competitive game process names
const GAME_PROCESSES: Record<string, string[]> = {
  valorant: ['VALORANT-Win64-Shipping.exe'],
  csgo: ['cs2.exe', 'csgo.exe'],
  fortnite: ['FortniteClient-Win64-Shipping.exe'],
  apex: ['r5apex.exe'],
  overwatch: ['Overwatch.exe'],
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.trim() || err.message))
        } else {
          resolve(stdout?.trim() ?? '')
        }
      }
    )
  })
}

function runCmd(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message))
      } else {
        resolve(stdout?.trim() ?? '')
      }
    })
  })
}

async function setHighPerformancePowerPlan(): Promise<OptimizationResult> {
  try {
    await runCmd('powercfg.exe', ['/setactive', HIGH_PERF_GUID])
    return { name: 'Power Plan', success: true, message: 'Set to High Performance' }
  } catch (err) {
    log.warn('[Perf] Power plan set failed:', err)
    return { name: 'Power Plan', success: false, message: 'Requires administrator privileges' }
  }
}

async function restoreBalancedPowerPlan(): Promise<OptimizationResult> {
  try {
    await runCmd('powercfg.exe', ['/setactive', BALANCED_GUID])
    return { name: 'Power Plan', success: true, message: 'Restored to Balanced' }
  } catch (err) {
    log.warn('[Perf] Power plan restore failed:', err)
    return { name: 'Power Plan', success: false, message: 'Could not restore power plan' }
  }
}

async function flushDns(): Promise<OptimizationResult> {
  try {
    await runCmd('ipconfig.exe', ['/flushdns'])
    return { name: 'DNS Cache', success: true, message: 'DNS cache flushed' }
  } catch (err) {
    log.warn('[Perf] DNS flush failed:', err)
    return { name: 'DNS Cache', success: false, message: 'Requires administrator privileges' }
  }
}

async function disableNagle(): Promise<OptimizationResult> {
  // Disabling Nagle's algorithm reduces latency for small TCP packets (lower ping)
  const script = `
    $interfaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
    foreach ($iface in $interfaces) {
      Set-ItemProperty -Path $iface.PSPath -Name 'TcpAckFrequency' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
      Set-ItemProperty -Path $iface.PSPath -Name 'TCPNoDelay' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    }
    Write-Output 'done'
  `
  try {
    const result = await runPowerShell(script)
    if (result.includes('done')) {
      return { name: 'Network Latency', success: true, message: 'Nagle algorithm disabled (lower ping)' }
    }
    return { name: 'Network Latency', success: false, message: 'Registry write returned no confirmation' }
  } catch (err) {
    log.warn('[Perf] Nagle disable failed:', err)
    return { name: 'Network Latency', success: false, message: 'Requires administrator privileges' }
  }
}

async function restoreNagle(): Promise<OptimizationResult> {
  const script = `
    $interfaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
    foreach ($iface in $interfaces) {
      Remove-ItemProperty -Path $iface.PSPath -Name 'TcpAckFrequency' -Force -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path $iface.PSPath -Name 'TCPNoDelay' -Force -ErrorAction SilentlyContinue
    }
    Write-Output 'done'
  `
  try {
    await runPowerShell(script)
    return { name: 'Network Latency', success: true, message: 'Nagle algorithm restored' }
  } catch (err) {
    log.warn('[Perf] Nagle restore failed:', err)
    return { name: 'Network Latency', success: false, message: 'Could not restore network settings' }
  }
}

async function cleanTempFiles(): Promise<OptimizationResult> {
  const tempDir = os.tmpdir()
  let cleaned = 0
  let failed = 0
  try {
    const entries = await fs.promises.readdir(tempDir)
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(tempDir, entry)
        try {
          const stat = await fs.promises.stat(fullPath)
          // Only delete files older than 1 day to avoid touching active temp files
          const ageMs = Date.now() - stat.mtimeMs
          if (ageMs > 86_400_000) {
            if (stat.isFile()) {
              await fs.promises.unlink(fullPath)
              cleaned++
            }
          }
        } catch {
          failed++
        }
      })
    )
    return {
      name: 'Temp Files',
      success: true,
      message: `Cleaned ${cleaned} file${cleaned !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} in use, skipped)` : ''}`,
    }
  } catch (err) {
    log.warn('[Perf] Temp clean failed:', err)
    return { name: 'Temp Files', success: false, message: 'Could not access temp directory' }
  }
}

async function boostGameProcessPriority(gameName?: string): Promise<OptimizationResult> {
  const candidates = gameName
    ? GAME_PROCESSES[gameName.toLowerCase()] ?? []
    : Object.values(GAME_PROCESSES).flat()

  const processListStr = candidates.map((p) => `'${p.replace('.exe', '')}'`).join(',')
  const script = `
    $names = @(${processListStr})
    $found = @()
    foreach ($name in $names) {
      $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
      foreach ($p in $procs) {
        try {
          $p.PriorityClass = 'High'
          $found += $name
        } catch {}
      }
    }
    if ($found.Count -gt 0) { Write-Output "boosted:$($found -join ',')" } else { Write-Output 'none' }
  `
  try {
    const result = await runPowerShell(script)
    if (result.startsWith('boosted:')) {
      const procs = result.replace('boosted:', '')
      return { name: 'Process Priority', success: true, message: `${procs} set to High priority` }
    }
    return { name: 'Process Priority', success: true, message: 'No game process found — will apply when game launches' }
  } catch (err) {
    log.warn('[Perf] Process priority failed:', err)
    return { name: 'Process Priority', success: false, message: 'Could not set process priority' }
  }
}

async function getCurrentPowerPlan(): Promise<string> {
  try {
    const output = await runCmd('powercfg.exe', ['/getactivescheme'])
    // Output: "Power Scheme GUID: 8c5e7fda-...  (High performance)"
    const match = output.match(/\((.+)\)/)
    return match ? match[1].trim() : 'Unknown'
  } catch {
    return 'Unknown'
  }
}

export class PerformanceManager {
  private _boosted = false

  async boost(currentGame?: string): Promise<OptimizationResult[]> {
    if (process.platform !== 'win32') {
      return [{ name: 'Boost', success: false, message: 'Performance boost is only available on Windows' }]
    }

    log.info('[Perf] Running boost...')

    const results = await Promise.all([
      setHighPerformancePowerPlan(),
      flushDns(),
      disableNagle(),
      cleanTempFiles(),
      boostGameProcessPriority(currentGame),
    ])

    const anySuccess = results.some((r) => r.success)
    if (anySuccess) this._boosted = true

    log.info('[Perf] Boost results:', results)
    return results
  }

  async restore(): Promise<OptimizationResult[]> {
    if (process.platform !== 'win32') {
      return [{ name: 'Restore', success: false, message: 'Not applicable on this platform' }]
    }

    log.info('[Perf] Restoring defaults...')

    const results = await Promise.all([
      restoreBalancedPowerPlan(),
      restoreNagle(),
    ])

    this._boosted = false
    log.info('[Perf] Restore results:', results)
    return results
  }

  async getStatus(): Promise<PerformanceStatus> {
    const powerPlan = process.platform === 'win32' ? await getCurrentPowerPlan() : 'N/A'
    return {
      boosted: this._boosted,
      powerPlan,
      platform: process.platform,
    }
  }

  isBoosted(): boolean {
    return this._boosted
  }
}
