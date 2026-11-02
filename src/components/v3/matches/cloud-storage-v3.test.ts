import { describe, expect, it } from 'vitest'
import { capacityFacts, capacitySentence, libraryCountLabel } from './cloud-storage-v3'

const uncapped = { included_bytes: null, addon_bytes: 0, capacity_bytes: null, used_bytes: 36_100_000_000, reserved_bytes: 0, remaining_bytes: null, unknown_size_files: 0 }
const capped = { included_bytes: 50_000_000_000, addon_bytes: 0, capacity_bytes: 50_000_000_000, used_bytes: 10_000_000_000, reserved_bytes: 2_000_000_000, remaining_bytes: 38_000_000_000, unknown_size_files: 0 }

describe('cloud storage copy', () => {
  it('does not repeat the used bytes in the sentence (the number sits right below it)', () => {
    expect(capacitySentence(uncapped)).toBe('No storage cap on your account.')
    expect(capacitySentence(capped)).toBe('38.00 GB free for clips and recordings.')
    expect(capacitySentence({ ...capped, remaining_bytes: 0 })).toMatch(/full/)
  })
  it('leaves out unknown and zero facts ("Size unavailable included" was broken copy)', () => {
    expect(capacityFacts(uncapped)).toEqual([])
    expect(capacityFacts(capped)).toEqual(['50.00 GB included', '2.00 GB reserved for uploads'])
  })
  it('names what the count covers', () => {
    expect(libraryCountLabel(51, 'all', null)).toBe('51 files (recordings and clips) · every game')
    expect(libraryCountLabel(1, 'clip', 'Valorant')).toBe('1 cloud clip · Valorant')
  })
})
