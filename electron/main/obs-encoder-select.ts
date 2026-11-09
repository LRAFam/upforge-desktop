/**
 * Pick a hardware recording encoder for OBS Simple Output and build the
 * profile keys that make OBS record with it (recording output only).
 *
 * Why: OBS only defaults Simple Output to NVENC. AMD / Intel machines get
 * software x264, which encodes on the CPU while the user is gaming.
 *
 * Simple Output encoder names are stable short names (OBS 28 → 32):
 *   x264, nvenc, amd, qsv, apple_h264
 * OBS maps them to real encoder IDs itself (e.g. nvenc → obs_nvenc_h264_tex,
 * amd → h264_texture_amf, qsv → obs_qsv11_v2). If a chosen encoder is missing,
 * OBS swaps it back to x264 on startup (CheckForSimpleModeX264Fallback).
 *
 * Bitrate: RecQuality "Small" / "HQ" use CQP/CRF and ignore any bitrate. Only
 * RecQuality "Stream" honours a bitrate, but it records with the user's
 * *streaming* encoder + VBitrate, so forcing it would change streamers' OBS
 * settings. We use "Small" with our own RecEncoder and never touch StreamEncoder,
 * VBitrate or Stream1. bitrateKbps is kept for logging only.
 *
 * Detection order: OBS's own "Available Encoders" log block (authoritative),
 * then Electron GPU vendor IDs. If both fail, callers keep the old behaviour.
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export type SimpleRecEncoder = 'nvenc' | 'amd' | 'qsv' | 'apple_h264' | 'x264'

export type HardwareEncoderFamily = Exclude<SimpleRecEncoder, 'x264'>

export interface EncoderDetection {
  /** Hardware encoder families that this machine/OBS can use. May be empty. */
  available: HardwareEncoderFamily[]
  source: 'obs-log' | 'gpu-vendor'
}

export type EncoderDetector = () => Promise<EncoderDetection | null>

export interface ObsEncoderPlan {
  encoder: SimpleRecEncoder
  bitrateKbps: number
  source: EncoderDetection['source']
  /** [category, name, value] written via SetProfileParameter. */
  keys: Array<[string, string, string]>
}

const WINDOWS_PRIORITY: HardwareEncoderFamily[] = ['nvenc', 'amd', 'qsv']
const MAC_PRIORITY: HardwareEncoderFamily[] = ['apple_h264']

/** OBS encoder IDs (as printed in the OBS log) → Simple Output family. */
const OBS_ENCODER_ID_FAMILY: Record<string, HardwareEncoderFamily> = {
  ffmpeg_nvenc: 'nvenc',
  jim_nvenc: 'nvenc',
  obs_nvenc_h264_tex: 'nvenc',
  obs_nvenc_h264_soft: 'nvenc',
  h264_texture_amf: 'amd',
  amd_amf_h264: 'amd',
  obs_qsv11: 'qsv',
  obs_qsv11_v2: 'qsv',
  obs_qsv11_soft: 'qsv',
  obs_qsv11_soft_v2: 'qsv',
  'com.apple.videotoolbox.videoencoder.ave.avc': 'apple_h264',
}

/** PCI vendor IDs reported by Chromium's GPU info. */
const GPU_VENDOR_FAMILY: Record<number, HardwareEncoderFamily> = {
  0x10de: 'nvenc',
  0x1002: 'amd',
  0x1022: 'amd',
  0x8086: 'qsv',
}

function priorityFor(platform: NodeJS.Platform): HardwareEncoderFamily[] {
  return platform === 'darwin' ? MAC_PRIORITY : platform === 'win32' ? WINDOWS_PRIORITY : []
}

/** NVENC → AMF → QSV (Windows), VideoToolbox (macOS), else x264. */
export function chooseSimpleRecEncoder(
  available: readonly HardwareEncoderFamily[],
  platform: NodeJS.Platform = process.platform,
): SimpleRecEncoder {
  for (const family of priorityFor(platform)) {
    if (available.includes(family)) return family
  }
  return 'x264'
}

/** Parse the "Available Encoders → Video Encoders" block of an OBS log (OBS 30+). */
export function parseObsLogVideoEncoders(logText: string): string[] | null {
  const lines = logText.split(/\r?\n/)
  const start = lines.findIndex(line => /Available Encoders:/.test(line))
  if (start < 0) return null
  const ids: string[] = []
  let inVideo = false
  for (const line of lines.slice(start + 1)) {
    if (/Video Encoders:/.test(line)) { inVideo = true; continue }
    if (/Audio Encoders:/.test(line) || /-{5,}/.test(line)) break
    if (!inVideo) continue
    const match = line.match(/^\S*\s+- (\S+) \(/)
    if (match) ids.push(match[1])
  }
  return inVideo ? ids : null
}

export function familiesFromObsEncoderIds(ids: readonly string[]): HardwareEncoderFamily[] {
  const families = new Set<HardwareEncoderFamily>()
  for (const id of ids) {
    const family = OBS_ENCODER_ID_FAMILY[id]
    if (family) families.add(family)
  }
  return [...families]
}

export function familiesFromGpuVendors(
  vendorIds: readonly number[],
  platform: NodeJS.Platform = process.platform,
): HardwareEncoderFamily[] {
  if (platform === 'darwin') return ['apple_h264']
  const families = new Set<HardwareEncoderFamily>()
  for (const id of vendorIds) {
    const family = GPU_VENDOR_FAMILY[id]
    if (family) families.add(family)
  }
  return [...families]
}

/** Newest OBS session log (the running OBS writes the newest file). */
export function readNewestObsLog(obsRoot: string): string | null {
  const dir = path.join(obsRoot, 'logs')
  const files = fs.readdirSync(dir)
    .filter(name => name.endsWith('.txt'))
    .map(name => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (!files.length) return null
  return fs.readFileSync(path.join(dir, files[0].name), 'utf-8')
}

export function detectFromObsLog(obsRoot: string | null): EncoderDetection | null {
  if (!obsRoot) return null
  try {
    const text = readNewestObsLog(obsRoot)
    if (!text) return null
    const ids = parseObsLogVideoEncoders(text)
    if (!ids || !ids.length) return null
    return { available: familiesFromObsEncoderIds(ids), source: 'obs-log' }
  } catch {
    return null
  }
}

export async function detectFromGpuVendor(
  getGpuInfo: () => Promise<unknown>,
  platform: NodeJS.Platform = process.platform,
): Promise<EncoderDetection | null> {
  try {
    const info = await getGpuInfo() as { gpuDevice?: Array<{ vendorId?: number }> } | null
    const vendors = (info?.gpuDevice ?? [])
      .map(device => device.vendorId)
      .filter((id): id is number => typeof id === 'number' && id > 0)
    if (!vendors.length && platform !== 'darwin') return null
    return { available: familiesFromGpuVendors(vendors, platform), source: 'gpu-vendor' }
  } catch {
    return null
  }
}

function defaultObsRoot(): string | null {
  if (process.platform === 'win32') {
    return process.env.APPDATA ? path.join(process.env.APPDATA, 'obs-studio') : null
  }
  if (process.platform === 'darwin' && process.env.HOME) {
    return path.join(process.env.HOME, 'Library', 'Application Support', 'obs-studio')
  }
  return null
}

const GPU_INFO_TIMEOUT_MS = 1500

function gpuInfoWithTimeout(): Promise<unknown> {
  const pending = app.getGPUInfo('basic')
  return Promise.race([
    pending,
    new Promise((_, reject) => setTimeout(() => reject(new Error('getGPUInfo timed out')), GPU_INFO_TIMEOUT_MS)),
  ])
}

/** Real detector: OBS log first, Electron GPU vendor second, null when both fail. */
export const detectHardwareEncoders: EncoderDetector = async () => {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return null
  const fromLog = detectFromObsLog(defaultObsRoot())
  if (fromLog) return fromLog
  return detectFromGpuVendor(gpuInfoWithTimeout)
}

/** Build the Simple Output keys for a detected encoder set + preset bitrate (Mbps). */
export function buildObsEncoderPlan(
  detection: EncoderDetection | null,
  bitrateMbps: number | undefined,
  platform: NodeJS.Platform = process.platform,
): ObsEncoderPlan | null {
  if (!detection) return null
  if (!bitrateMbps || !Number.isFinite(bitrateMbps) || bitrateMbps <= 0) return null
  const encoder = chooseSimpleRecEncoder(detection.available, platform)
  const bitrateKbps = Math.round(bitrateMbps * 1000)
  return {
    encoder,
    bitrateKbps,
    source: detection.source,
    // Recording encoder only. RecQuality=Stream would share the user's *streaming* encoder
    // and bitrate (and need Stream1 IgnoreRecommended), changing streamers' OBS settings —
    // so recording keeps its own quality-based mode and the stream is never touched.
    keys: [
      ['SimpleOutput', 'RecEncoder', encoder],
      ['SimpleOutput', 'RecQuality', 'Small'],
    ],
  }
}
