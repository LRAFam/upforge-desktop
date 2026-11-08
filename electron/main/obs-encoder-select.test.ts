import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildObsEncoderPlan,
  chooseSimpleRecEncoder,
  detectFromGpuVendor,
  detectFromObsLog,
  familiesFromObsEncoderIds,
  parseObsLogVideoEncoders,
} from './obs-encoder-select'

const OBS_LOG = [
  '12:00:00.001: ---------------------------------',
  '12:00:00.002: Available Encoders:',
  '12:00:00.003:   Video Encoders:',
  '12:00:00.004: \t- ffmpeg_svt_av1 (SVT-AV1)',
  '12:00:00.005: \t- obs_x264 (x264)',
  '12:00:00.006: \t- h264_texture_amf (AMD HW H.264 (AVC))',
  '12:00:00.007: \t- obs_qsv11_v2 (QuickSync H.264)',
  '12:00:00.008:   Audio Encoders:',
  '12:00:00.009: \t- ffmpeg_aac (FFmpeg AAC)',
  '12:00:00.010: ==== Startup complete ===============================================',
].join('\n')

let tmp: string | null = null
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null })

describe('encoder priority', () => {
  it.each([
    [['nvenc', 'amd', 'qsv'], 'nvenc'],
    [['qsv', 'amd'], 'amd'],
    [['qsv'], 'qsv'],
    [[], 'x264'],
  ] as const)('windows %j → %s', (available, expected) => {
    expect(chooseSimpleRecEncoder(available, 'win32')).toBe(expected)
  })

  it('uses VideoToolbox on macOS and never Windows-only encoders', () => {
    expect(chooseSimpleRecEncoder(['apple_h264'], 'darwin')).toBe('apple_h264')
    expect(chooseSimpleRecEncoder(['nvenc', 'amd'], 'darwin')).toBe('x264')
  })
})

describe('OBS log parsing', () => {
  it('reads only video encoder IDs from the Available Encoders block', () => {
    expect(parseObsLogVideoEncoders(OBS_LOG)).toEqual(['ffmpeg_svt_av1', 'obs_x264', 'h264_texture_amf', 'obs_qsv11_v2'])
    expect(familiesFromObsEncoderIds(parseObsLogVideoEncoders(OBS_LOG)!)).toEqual(['amd', 'qsv'])
  })

  it('maps every NVENC ID generation (jim_nvenc, obs_nvenc_h264_tex, ffmpeg_nvenc)', () => {
    for (const id of ['jim_nvenc', 'obs_nvenc_h264_tex', 'ffmpeg_nvenc']) {
      expect(familiesFromObsEncoderIds([id])).toEqual(['nvenc'])
    }
  })

  it('returns null for logs without the encoder block (OBS < 30)', () => {
    expect(parseObsLogVideoEncoders('12:00:00: some line\n')).toBeNull()
  })

  it('reads the newest log file in the OBS logs folder', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-obs-enc-'))
    const logs = path.join(tmp, 'logs')
    fs.mkdirSync(logs)
    fs.writeFileSync(path.join(logs, 'old.txt'), OBS_LOG.replace(/h264_texture_amf|obs_qsv11_v2/g, 'x'))
    fs.utimesSync(path.join(logs, 'old.txt'), new Date(1000), new Date(1000))
    fs.writeFileSync(path.join(logs, 'new.txt'), OBS_LOG)
    expect(detectFromObsLog(tmp)).toEqual({ available: ['amd', 'qsv'], source: 'obs-log' })
  })

  it('returns null when the logs folder is missing', () => {
    expect(detectFromObsLog(path.join(os.tmpdir(), 'definitely-missing-obs-root'))).toBeNull()
    expect(detectFromObsLog(null)).toBeNull()
  })
})

describe('GPU vendor fallback', () => {
  it('maps NVIDIA / AMD / Intel PCI vendor IDs', async () => {
    const info = { gpuDevice: [{ vendorId: 0x8086 }, { vendorId: 0x10de }, { vendorId: 0x1002 }] }
    expect(await detectFromGpuVendor(async () => info, 'win32'))
      .toEqual({ available: ['qsv', 'nvenc', 'amd'], source: 'gpu-vendor' })
  })

  it('returns null when GPU info throws or is empty', async () => {
    expect(await detectFromGpuVendor(async () => { throw new Error('no gpu') }, 'win32')).toBeNull()
    expect(await detectFromGpuVendor(async () => ({ gpuDevice: [] }), 'win32')).toBeNull()
  })
})

describe('profile plan', () => {
  it('sets only the recording encoder, with its own quality — never the stream', () => {
    const plan = buildObsEncoderPlan({ available: ['amd', 'qsv'], source: 'obs-log' }, 5, 'win32')
    expect(plan).toMatchObject({ encoder: 'amd' })
    // RecQuality=Stream would make the recording share (and force us to rewrite) the user's
    // streaming encoder + bitrate. Streamers' settings must never change.
    expect(plan!.keys).toEqual([
      ['SimpleOutput', 'RecEncoder', 'amd'],
      ['SimpleOutput', 'RecQuality', 'Small'],
    ])
    for (const [category, name] of plan!.keys) {
      expect(category).not.toBe('Stream1')
      expect(['StreamEncoder', 'VBitrate', 'ABitrate', 'Preset', 'NVENCPreset']).not.toContain(name)
    }
  })

  it('falls back to x264 at the preset bitrate when no hardware encoder exists', () => {
    const plan = buildObsEncoderPlan({ available: [], source: 'gpu-vendor' }, 10, 'win32')
    expect(plan).toMatchObject({ encoder: 'x264', bitrateKbps: 10000 })
  })

  it('returns no plan when detection failed or bitrate is unknown', () => {
    expect(buildObsEncoderPlan(null, 5, 'win32')).toBeNull()
    expect(buildObsEncoderPlan({ available: ['nvenc'], source: 'obs-log' }, 0, 'win32')).toBeNull()
  })
})
