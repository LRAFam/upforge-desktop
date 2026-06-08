import { app } from 'electron'
import path from 'path'

export function userDataRoot(userId: number): string {
  return path.join(app.getPath('userData'), 'users', String(userId))
}

export function userOverlayPath(userId: number): string {
  return path.join(userDataRoot(userId), 'overlay.json')
}

export function userPendingJobPath(userId: number): string {
  return path.join(userDataRoot(userId), 'pending-job.json')
}
