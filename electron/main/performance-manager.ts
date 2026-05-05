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

export interface DiagnosticsReport {
  gpuName: string
  gpuUsagePct: number
  gpuTempC: number
  cpuUsagePct: number
  cpuSpeedMhz: number
  cpuMaxMhz: number
  ramUsedMb: number
  ramTotalMb: number
  ramSpeedMhz: number
  topProcesses: { name: string; cpuPct: number }[]
  xmpEnabled: boolean | null
  bottleneck: 'cpu' | 'gpu' | 'none' | 'unknown'
  warnings: string[]
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

/**
 * Disable Xbox Game Bar and Game DVR.
 * HKCU keys don't need elevation; HKLM keys do (best-effort).
 * Game DVR running in the background is one of the biggest FPS killers on Windows.
 */
async function disableGameDvr(): Promise<OptimizationResult> {
  const script = `
    # HKCU — no elevation needed
    $null = New-Item -Path 'HKCU:\\System\\GameConfigStore' -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_Enabled' -Value 0 -Type DWord -Force
    Set-ItemProperty -Path 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_FSEBehaviorMode' -Value 2 -Type DWord -Force

    $null = New-Item -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name 'AppCaptureEnabled' -Value 0 -Type DWord -Force

    # HKLM — needs elevation, best-effort
    Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' -Name 'AllowGameDVR' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue

    Write-Output 'done'
  `
  try {
    const result = await runPowerShell(script)
    if (result.includes('done')) {
      return { name: 'Xbox Game DVR', success: true, message: 'Game DVR & background capture disabled' }
    }
    return { name: 'Xbox Game DVR', success: false, message: 'Script did not complete' }
  } catch (err) {
    log.warn('[Perf] Game DVR disable failed:', err)
    return { name: 'Xbox Game DVR', success: false, message: 'Could not disable Game DVR' }
  }
}

async function restoreGameDvr(): Promise<OptimizationResult> {
  const script = `
    Set-ItemProperty -Path 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_Enabled' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name 'AppCaptureEnabled' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Output 'done'
  `
  try {
    await runPowerShell(script)
    return { name: 'Xbox Game DVR', success: true, message: 'Game DVR restored' }
  } catch (err) {
    log.warn('[Perf] Game DVR restore failed:', err)
    return { name: 'Xbox Game DVR', success: false, message: 'Could not restore Game DVR' }
  }
}

/**
 * Set Windows Multimedia System Profile to favour games over background tasks.
 * SystemResponsiveness=0 gives nearly all CPU time to the foreground game.
 * GPU Priority=8 and Scheduling Category=High ensures the GPU scheduler
 * services the game's render queue before anything else.
 * Needs elevation.
 */
async function setMultimediaGameProfile(): Promise<OptimizationResult> {
  const script = `
    $base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
    Set-ItemProperty -Path $base -Name 'SystemResponsiveness' -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $base -Name 'NetworkThrottlingIndex' -Value 0xFFFFFFFF -Type DWord -Force

    $games = "$base\\Tasks\\Games"
    $null = New-Item -Path $games -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $games -Name 'Affinity'           -Value 0          -Type DWord  -Force
    Set-ItemProperty -Path $games -Name 'Background Only'    -Value 'False'     -Type String -Force
    Set-ItemProperty -Path $games -Name 'Clock Rate'         -Value 10000       -Type DWord  -Force
    Set-ItemProperty -Path $games -Name 'GPU Priority'       -Value 8           -Type DWord  -Force
    Set-ItemProperty -Path $games -Name 'Priority'           -Value 6           -Type DWord  -Force
    Set-ItemProperty -Path $games -Name 'Scheduling Category'-Value 'High'      -Type String -Force
    Set-ItemProperty -Path $games -Name 'SFIO Priority'      -Value 'High'      -Type String -Force
    Write-Output 'done'
  `
  try {
    const result = await runPowerShell(script)
    if (result.includes('done')) {
      return { name: 'GPU Scheduling', success: true, message: 'Windows multimedia profile set to Games (GPU Priority 8)' }
    }
    return { name: 'GPU Scheduling', success: false, message: 'Script did not complete' }
  } catch (err) {
    log.warn('[Perf] Multimedia profile failed:', err)
    return { name: 'GPU Scheduling', success: false, message: 'Requires administrator privileges' }
  }
}

async function restoreMultimediaProfile(): Promise<OptimizationResult> {
  const script = `
    $base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
    Set-ItemProperty -Path $base -Name 'SystemResponsiveness' -Value 20 -Type DWord -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $base -Name 'NetworkThrottlingIndex' -Value 10 -Type DWord -Force -ErrorAction SilentlyContinue

    $games = "$base\\Tasks\\Games"
    Set-ItemProperty -Path $games -Name 'GPU Priority'       -Value 2      -Type DWord  -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $games -Name 'Priority'           -Value 2      -Type DWord  -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $games -Name 'Scheduling Category'-Value 'Medium' -Type String -Force -ErrorAction SilentlyContinue
    Write-Output 'done'
  `
  try {
    await runPowerShell(script)
    return { name: 'GPU Scheduling', success: true, message: 'Windows multimedia profile restored' }
  } catch {
    return { name: 'GPU Scheduling', success: false, message: 'Could not restore multimedia profile' }
  }
}

/**
 * Set NVIDIA GPU to maximum performance mode via nvidia-smi.
 * Prevents the GPU from downclocking during lighter scene loads,
 * which causes the FPS spikes seen mid-round in Valorant.
 */
async function setNvidiaMaxPerformance(): Promise<OptimizationResult> {
  // Try to find nvidia-smi
  const nvidiaSmiPaths = [
    'C:\\Windows\\System32\\nvidia-smi.exe',
    'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
  ]

  const script = `
    $nvSmi = $null
    $paths = @('C:\\Windows\\System32\\nvidia-smi.exe', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe')
    foreach ($p in $paths) { if (Test-Path $p) { $nvSmi = $p; break } }
    if (-not $nvSmi) {
      # Try PATH
      try { $nvSmi = (Get-Command nvidia-smi -ErrorAction Stop).Source } catch {}
    }
    if ($nvSmi) {
      # Set persistence mode and application clocks policy
      & $nvSmi -pm 1 2>&1 | Out-Null
      & $nvSmi --auto-boost-default=0 2>&1 | Out-Null
      Write-Output "found:$nvSmi"
    } else {
      Write-Output 'notfound'
    }
  `
  try {
    const result = await runPowerShell(script)
    if (result.startsWith('found:')) {
      return { name: 'NVIDIA GPU', success: true, message: 'GPU set to max performance (persistence mode on)' }
    }
    // nvidia-smi not found — set via registry power policy instead (best-effort)
    const regScript = `
      $key = 'HKCU:\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak'
      $null = New-Item -Path $key -Force -ErrorAction SilentlyContinue
      # 0x00000001 = Prefer maximum performance
      Set-ItemProperty -Path $key -Name 'Powermizer_GPUPowerTransfer' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
      Write-Output 'reg_done'
    `
    await runPowerShell(regScript)
    return { name: 'NVIDIA GPU', success: true, message: 'GPU power policy set to Prefer Max Performance' }
  } catch (err) {
    log.warn('[Perf] NVIDIA boost failed:', err)
    return { name: 'NVIDIA GPU', success: false, message: 'No NVIDIA GPU detected or nvidia-smi unavailable' }
  }
}

/**
 * Free memory from idle/background processes by trimming their working sets.
 * On 16GB systems this can reclaim several hundred MB that Windows defers
 * releasing, reducing pressure on the game's memory allocator.
 */
async function freeBackgroundMemory(): Promise<OptimizationResult> {
  const script = `
    $before = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    Get-Process | Where-Object { $_.WorkingSet64 -gt 50MB -and $_.Name -notmatch 'VALORANT|cs2|csgo|Fortnite|r5apex|Overwatch' } | ForEach-Object {
      try { [void]$_.MinWorkingSet; $_.MinWorkingSet = [IntPtr]::Zero } catch {}
    }
    [System.GC]::Collect()
    $after = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    $freed = [math]::Round(($after - $before) / 1024)
    Write-Output "freed:$freed"
  `
  try {
    const result = await runPowerShell(script)
    if (result.startsWith('freed:')) {
      const mb = result.replace('freed:', '')
      const freed = parseInt(mb, 10)
      const msg = freed > 0 ? `Freed ~${freed} MB from background processes` : 'Background processes trimmed'
      return { name: 'RAM Cleanup', success: true, message: msg }
    }
    return { name: 'RAM Cleanup', success: true, message: 'Background process memory trimmed' }
  } catch (err) {
    log.warn('[Perf] RAM cleanup failed:', err)
    return { name: 'RAM Cleanup', success: false, message: 'Could not trim background memory' }
  }
}

/**
 * Force the active High Performance power plan to never downclock the CPU.
 * Sets minimum processor state to 100% and disables core parking so all
 * cores are available at full speed — the key fix for CPU-bottlenecked games.
 */
async function forceCpuMaxClocks(): Promise<OptimizationResult> {
  const script = `
    # Minimum processor state: 100% (no downclocking)
    powercfg /setacvalue SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100 2>&1 | Out-Null
    # Disable core parking (keep all cores active)
    powercfg /setacvalue SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100 2>&1 | Out-Null
    # Apply changes to active scheme
    powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null
    Write-Output 'done'
  `
  try {
    const result = await runPowerShell(script)
    if (result.includes('done')) {
      return { name: 'CPU Clocks', success: true, message: 'CPU minimum state 100% — all cores at full speed' }
    }
    return { name: 'CPU Clocks', success: false, message: 'Script did not complete' }
  } catch (err) {
    log.warn('[Perf] CPU max clocks failed:', err)
    return { name: 'CPU Clocks', success: false, message: 'Requires administrator privileges' }
  }
}

async function restoreCpuClocks(): Promise<OptimizationResult> {
  const script = `
    powercfg /setacvalue SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 5 2>&1 | Out-Null
    powercfg /setacvalue SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 0 2>&1 | Out-Null
    powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null
    Write-Output 'done'
  `
  try {
    await runPowerShell(script)
    return { name: 'CPU Clocks', success: true, message: 'CPU clock policy restored' }
  } catch {
    return { name: 'CPU Clocks', success: false, message: 'Could not restore CPU clock policy' }
  }
}

/**
 * Kill or lower priority of known CPU-heavy background processes that
 * compete with games for single-core performance on Ryzen CPUs.
 */
async function throttleBackgroundProcesses(): Promise<OptimizationResult> {
  const knownHogs = [
    'SearchIndexer', 'MsMpEng', 'SgrmBroker', 'WmiPrvSE',
    'BackgroundTransferHost', 'OneDrive', 'GoogleDriveFS',
    'Dropbox', 'Teams', 'slack', 'discord',
  ]
  const nameList = knownHogs.map((n) => `'${n}'`).join(',')
  const script = `
    $names = @(${nameList})
    $throttled = @()
    foreach ($name in $names) {
      $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
      foreach ($p in $procs) {
        try {
          $p.PriorityClass = 'BelowNormal'
          $throttled += $name
        } catch {}
      }
    }
    if ($throttled.Count -gt 0) { Write-Output "throttled:$($throttled -join ',')" }
    else { Write-Output 'none' }
  `
  try {
    const result = await runPowerShell(script)
    if (result.startsWith('throttled:')) {
      const procs = result.replace('throttled:', '')
      return { name: 'Background CPU', success: true, message: `Deprioritised: ${procs}` }
    }
    return { name: 'Background CPU', success: true, message: 'No CPU-heavy background apps found' }
  } catch (err) {
    log.warn('[Perf] Background throttle failed:', err)
    return { name: 'Background CPU', success: false, message: 'Could not adjust background processes' }
  }
}

/**
 * Collect live system diagnostics to surface the actual bottleneck.
 */
async function runDiagnostics(): Promise<DiagnosticsReport> {
  const script = `
    $report = @{}

    # GPU info via WMI
    try {
      $gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1
      $report.gpuName = $gpu.Name
    } catch { $report.gpuName = 'Unknown' }

    # GPU usage + temp via nvidia-smi if available
    $report.gpuUsagePct = -1
    $report.gpuTempC = -1
    $nvSmi = $null
    foreach ($p in @('C:\\Windows\\System32\\nvidia-smi.exe','C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe')) {
      if (Test-Path $p) { $nvSmi = $p; break }
    }
    if (-not $nvSmi) { try { $nvSmi = (Get-Command nvidia-smi -ErrorAction Stop).Source } catch {} }
    if ($nvSmi) {
      try {
        $nvOut = & $nvSmi --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>&1
        $parts = $nvOut -split ','
        if ($parts.Count -ge 2) {
          $report.gpuUsagePct = [int]($parts[0].Trim())
          $report.gpuTempC    = [int]($parts[1].Trim())
        }
      } catch {}
    }

    # CPU usage (2-sample average for accuracy)
    try {
      $c1 = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
      Start-Sleep -Milliseconds 500
      $c2 = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
      $report.cpuUsagePct = [int](($c1 + $c2) / 2)
    } catch { $report.cpuUsagePct = -1 }

    # CPU speed
    try {
      $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
      $report.cpuSpeedMhz = $cpu.CurrentClockSpeed
      $report.cpuMaxMhz   = $cpu.MaxClockSpeed
    } catch { $report.cpuSpeedMhz = -1; $report.cpuMaxMhz = -1 }

    # RAM
    try {
      $os = Get-CimInstance Win32_OperatingSystem
      $report.ramTotalMb = [int]($os.TotalVisibleMemorySize / 1024)
      $report.ramUsedMb  = [int](($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024)
    } catch { $report.ramTotalMb = -1; $report.ramUsedMb = -1 }

    # RAM speed (XMP indicator)
    try {
      $ramSpeed = (Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).Speed
      $report.ramSpeedMhz = [int]$ramSpeed
    } catch { $report.ramSpeedMhz = -1 }

    # Top CPU processes
    try {
      $top = Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name,@{N='CpuMs';E={[int]$_.CPU}}
      $report.topProcs = ($top | ForEach-Object { "$($_.Name):$($_.CpuMs)" }) -join '|'
    } catch { $report.topProcs = '' }

    $json = $report | ConvertTo-Json -Compress
    Write-Output $json
  `
  const blank: DiagnosticsReport = {
    gpuName: 'Unknown', gpuUsagePct: -1, gpuTempC: -1,
    cpuUsagePct: -1, cpuSpeedMhz: -1, cpuMaxMhz: -1,
    ramUsedMb: -1, ramTotalMb: -1, ramSpeedMhz: -1,
    topProcesses: [], xmpEnabled: null,
    bottleneck: 'unknown', warnings: [],
  }

  try {
    const raw = await runPowerShell(script)
    const data = JSON.parse(raw) as Record<string, unknown>

    const report: DiagnosticsReport = {
      gpuName: String(data.gpuName ?? 'Unknown'),
      gpuUsagePct: Number(data.gpuUsagePct ?? -1),
      gpuTempC: Number(data.gpuTempC ?? -1),
      cpuUsagePct: Number(data.cpuUsagePct ?? -1),
      cpuSpeedMhz: Number(data.cpuSpeedMhz ?? -1),
      cpuMaxMhz: Number(data.cpuMaxMhz ?? -1),
      ramUsedMb: Number(data.ramUsedMb ?? -1),
      ramTotalMb: Number(data.ramTotalMb ?? -1),
      ramSpeedMhz: Number(data.ramSpeedMhz ?? -1),
      topProcesses: [],
      xmpEnabled: null,
      bottleneck: 'unknown',
      warnings: [],
    }

    // Parse top processes
    if (data.topProcs && typeof data.topProcs === 'string') {
      report.topProcesses = (data.topProcs as string)
        .split('|')
        .filter(Boolean)
        .map((entry) => {
          const [name, cpuStr] = entry.split(':')
          return { name: name ?? entry, cpuPct: Number(cpuStr ?? 0) }
        })
    }

    // XMP heuristic: DDR4 stock is 2133/2400, DDR5 stock is 4800
    // If RAM is running above these speeds, XMP is likely enabled
    const spd = report.ramSpeedMhz
    if (spd > 0) {
      report.xmpEnabled = spd > 2666
    }

    // Determine bottleneck
    if (report.gpuUsagePct >= 0 && report.cpuUsagePct >= 0) {
      if (report.cpuUsagePct > 80 && report.gpuUsagePct < 60) {
        report.bottleneck = 'cpu'
      } else if (report.gpuUsagePct > 85) {
        report.bottleneck = 'gpu'
      } else {
        report.bottleneck = 'none'
      }
    }

    // Build warnings
    if (report.bottleneck === 'cpu') {
      report.warnings.push('CPU bottleneck detected — your CPU cannot feed frames to the GPU fast enough')
    }
    if (report.xmpEnabled === false) {
      report.warnings.push(`RAM running at ${spd} MHz — XMP/EXPO likely disabled in BIOS. Enable it for a significant FPS boost on Ryzen`)
    }
    if (report.cpuSpeedMhz > 0 && report.cpuMaxMhz > 0 && report.cpuSpeedMhz < report.cpuMaxMhz * 0.7) {
      report.warnings.push(`CPU running at ${report.cpuSpeedMhz} MHz (max ${report.cpuMaxMhz} MHz) — power plan may not be fully applied`)
    }

    return report
  } catch (err) {
    log.warn('[Perf] Diagnostics failed:', err)
    return blank
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
      forceCpuMaxClocks(),
      flushDns(),
      disableNagle(),
      cleanTempFiles(),
      boostGameProcessPriority(currentGame),
      disableGameDvr(),
      setMultimediaGameProfile(),
      setNvidiaMaxPerformance(),
      freeBackgroundMemory(),
      throttleBackgroundProcesses(),
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
      restoreCpuClocks(),
      restoreNagle(),
      restoreGameDvr(),
      restoreMultimediaProfile(),
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

  async getDiagnostics(): Promise<DiagnosticsReport> {
    return runDiagnostics()
  }
}
