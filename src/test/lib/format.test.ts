import { describe, it, expect } from 'vitest'
import { formatCHF, formatDateSuisse, telHref } from '@/lib/format'

describe('formatCHF', () => {
  it("formate 1234.5 en 1'234.50 CHF", () => {
    expect(formatCHF(1234.5)).toBe("1'234.50 CHF")
  })
  it('formate 0 en 0.00 CHF', () => {
    expect(formatCHF(0)).toBe('0.00 CHF')
  })
  it('formate 1000000 en 1\'000\'000.00 CHF', () => {
    expect(formatCHF(1000000)).toBe("1'000'000.00 CHF")
  })
})

describe('formatDateSuisse', () => {
  it('formate ISO en JJ.MM.AAAA', () => {
    expect(formatDateSuisse('2026-07-28T10:00:00Z')).toBe('28.07.2026')
  })
  it('pad les jours et mois < 10', () => {
    expect(formatDateSuisse('2026-01-05T10:00:00Z')).toBe('05.01.2026')
  })
})

describe('telHref', () => {
  it('nettoie les espaces et retourne tel:+41…', () => {
    expect(telHref('027 322 12 34')).toBe('tel:+41273221234')
  })
  it('conserve le + initial', () => {
    expect(telHref('+41 27 322 12 34')).toBe('tel:+41273221234')
  })
  it('retourne null si vide', () => {
    expect(telHref(null)).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref(undefined)).toBeNull()
  })
})
