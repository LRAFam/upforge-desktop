import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/** Local capture ownership survives expired credentials; explicit logout clears it. */
export class CaptureOwnership {
  private ownerId: number | null = null
  private readonly filePath = path.join(app.getPath('userData'), 'capture-owner.json')

  constructor() {
    if (!fs.existsSync(this.filePath)) return
    const value: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf8')).ownerId
    if (value !== null && (!Number.isSafeInteger(value) || (value as number) <= 0)) {
      throw new Error('Invalid local capture owner')
    }
    this.ownerId = value as number | null
  }

  get(): number | null { return this.ownerId }

  set(ownerId: number | null): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify({ ownerId }))
    fs.renameSync(temporaryPath, this.filePath)
    this.ownerId = ownerId
  }
}
