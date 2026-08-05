import { describe, expect, it } from 'vitest'
import {
  resolveSettingsCategory,
  resolveSettingsSection,
} from './settings-nav'

describe('resolveSettingsCategory', () => {
  it('maps legacy and new tab ids', () => {
    expect(resolveSettingsCategory(undefined)).toBe('account')
    expect(resolveSettingsCategory('general')).toBe('account')
    expect(resolveSettingsCategory('account')).toBe('account')
    expect(resolveSettingsCategory('recording')).toBe('recording')
    expect(resolveSettingsCategory('trainer')).toBe('trainer')
    expect(resolveSettingsCategory('system')).toBe('advanced')
    expect(resolveSettingsCategory('advanced')).toBe('advanced')
    expect(resolveSettingsCategory('app')).toBe('app')
  })

  it('falls back to account for unknown values', () => {
    expect(resolveSettingsCategory('nope')).toBe('account')
    expect(resolveSettingsCategory(['recording', 'trainer'])).toBe('account')
  })
})

describe('resolveSettingsSection', () => {
  it('accepts known section ids', () => {
    expect(resolveSettingsSection('obs')).toBe('obs')
    expect(resolveSettingsSection('storage')).toBe('storage')
    expect(resolveSettingsSection('discord')).toBe('discord')
    expect(resolveSettingsSection('developer')).toBe('developer')
  })

  it('returns null for missing or unknown', () => {
    expect(resolveSettingsSection(undefined)).toBeNull()
    expect(resolveSettingsSection('nope')).toBeNull()
  })
})
