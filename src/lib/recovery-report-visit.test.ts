import { describe, expect, it } from 'vitest'
import { RecoveryReportVisitClock } from './recovery-report-visit'
const a = { result: 'match_report' as const, result_id: 'a' }
describe('actual foreground report qualification', () => {
  it('requires ten seconds on one ready report and emits only once', () => {
    const clock = new RecoveryReportVisitClock()
    for (let time = 0; time < 10000; time += 1000) expect(clock.sample(a, true, time)).toBeNull()
    expect(clock.sample(a, true, 10000)).toBe(10000); clock.delivered(); expect(clock.sample(a, true, 11000)).toBeNull()
  })
  it('does not count hidden time, sleep gaps, missing content or another report', () => {
    const clock = new RecoveryReportVisitClock()
    clock.sample(a, true, 0); clock.sample(a, true, 1000); clock.sample(a, false, 2000)
    expect(clock.sample(a, true, 20000)).toBeNull(); expect(clock.sample(a, true, 40000)).toBeNull()
    for (let time = 41000; time < 46000; time += 1000) expect(clock.sample(a, true, time)).toBeNull()
    clock.sample(null, true, 46000); clock.sample({ ...a, result_id: 'b' }, true, 47000)
    expect(clock.sample({ ...a, result_id: 'b' }, true, 48000)).toBeNull()
  })
})
