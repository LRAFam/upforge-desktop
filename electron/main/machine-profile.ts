/**
 * Hardware snapshot for ops telemetry cohorting.
 *
 * Bucket rules:
 * - low: cores < 6 OR ramGb < 12 OR encoder is software (libx264 / x264 / empty)
 * - high: cores >= 12 AND ramGb >= 32 AND hardware encoder
 * - mid: everything else
 */

import os from 'os'

export type HardwareBucket = 'low' | 'mid' | 'high'

export interface MachineProfile {
  cpuModel: string
  cpuCores: number
  ramGb: number
  gpuNames: string[]
  gpuDriverVersion: string | null
  os: string
  osRelease: string
  appVersion: string
  obsVersion: string | null
  encoder: string | null
  displayCount: number
  primaryResolution: string | null
  freeDiskGb: number | null
  bucket: HardwareBucket
  collectedAt: number
}

function isSoftwareEncoder(encoder: string | null): boolean {
  if (!encoder || !encoder.trim()) return true
  const lower = encoder.toLowerCase()
  return lower.includes('libx264') || lower === 'x264' || lower.includes('software')
}

function isHardwareEncoder(encoder: string | null): boolean {
  if (!encoder) return false
  const lower = encoder.toLowerCase()
  return (
    lower.includes('nvenc')
    || lower.includes('amf')
    || lower.includes('qsv')
    || lower.includes('quicksync')
    || lower.includes('videotoolbox')
  )
}

export function deriveHardwareBucket(input: {
  cpuCores: number
  ramGb: number
  encoder: string | null
}): HardwareBucket {
  if (input.cpuCores < 6 || input.ramGb < 12 || isSoftwareEncoder(input.encoder)) {
    return 'low'
  }
  if (input.cpuCores >= 12 && input.ramGb >= 32 && isHardwareEncoder(input.encoder)) {
    return 'high'
  }
  return 'mid'
}

export function collectMachineProfile(opts: {
  appVersion: string
  obsVersion?: string | null
  encoder?: string | null
  freeDiskGb?: number | null
  displayCount?: number
  primaryResolution?: string | null
  gpuNames?: string[]
  gpuDriverVersion?: string | null
  cpuModel?: string
  cpuCores?: number
  ramGb?: number
}): MachineProfile {
  try {
    const cpus = os.cpus()
    const cpuModel = opts.cpuModel ?? cpus[0]?.model?.trim() ?? 'unknown'
    const cpuCores = opts.cpuCores ?? cpus.length
    const ramGb = opts.ramGb ?? Math.round(os.totalmem() / (1024 ** 3))
    const encoder = opts.encoder ?? null
    const bucket = deriveHardwareBucket({ cpuCores, ramGb, encoder })

    return {
      cpuModel,
      cpuCores,
      ramGb,
      gpuNames: opts.gpuNames ?? [],
      gpuDriverVersion: opts.gpuDriverVersion ?? null,
      os: process.platform,
      osRelease: os.release(),
      appVersion: opts.appVersion,
      obsVersion: opts.obsVersion ?? null,
      encoder,
      displayCount: opts.displayCount ?? 1,
      primaryResolution: opts.primaryResolution ?? null,
      freeDiskGb: opts.freeDiskGb ?? null,
      bucket,
      collectedAt: Date.now(),
    }
  } catch {
    return {
      cpuModel: 'unknown',
      cpuCores: 0,
      ramGb: 0,
      gpuNames: [],
      gpuDriverVersion: null,
      os: process.platform,
      osRelease: '',
      appVersion: opts.appVersion,
      obsVersion: opts.obsVersion ?? null,
      encoder: opts.encoder ?? null,
      displayCount: 1,
      primaryResolution: null,
      freeDiskGb: null,
      bucket: 'low',
      collectedAt: Date.now(),
    }
  }
}
