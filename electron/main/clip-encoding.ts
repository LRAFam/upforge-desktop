export function clipEncoders(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']
  if (platform === 'darwin') return ['h264_videotoolbox', 'libx264']
  return ['libx264']
}

export function withClipEncoder(args: string[], encoder: string): string[] {
  if (encoder === 'libx264') return args
  const result: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '-c:v' && args[i + 1] === 'libx264') {
      result.push('-c:v', encoder)
      i++
    } else if (arg === '-crf' || arg === '-preset') {
      i++
    } else {
      result.push(arg)
    }
  }
  const output = result.pop()!
  if (encoder === 'h264_nvenc') result.push('-preset', 'p4', '-rc', 'vbr', '-cq', '22', '-b:v', '0')
  else result.push('-b:v', '8M')
  result.push(output)
  return result
}

export function isEncoderUnavailable(error: unknown): boolean {
  return /unknown encoder|encoder.*not found|no capable devices|cannot load|failed to (?:load|initiali[sz]e)|error (?:while )?opening encoder|error initializing.*stream|unsupported device|not supported|driver.*(?:old|required)|cannot init|no device|function not implemented/i.test(String(error))
}
