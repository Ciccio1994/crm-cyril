import { describe, it, expect } from 'vitest'
import { calculerCoutCHF, estAuDelaSeuil } from './monitoring'

describe('calculerCoutCHF', () => {
  it('claude-haiku-4-5 : 1$/1M in + 5$/1M out, converti CHF (~0.88)', () => {
    const c = calculerCoutCHF('haiku', 10_000, 2_000)
    // (10k/1M)*1 + (2k/1M)*5 = 0.01 + 0.01 = 0.02 USD ≈ 0.0176 CHF
    expect(c).toBeGreaterThan(0.015)
    expect(c).toBeLessThan(0.025)
  })

  it('claude-sonnet-4-6 est 3× plus cher que haiku sur input', () => {
    const haiku = calculerCoutCHF('haiku', 100_000, 0)
    const sonnet = calculerCoutCHF('sonnet', 100_000, 0)
    expect(sonnet / haiku).toBeCloseTo(3, 1)
  })

  it('retourne 0 pour 0 tokens', () => {
    expect(calculerCoutCHF('haiku', 0, 0)).toBe(0)
    expect(calculerCoutCHF('sonnet', 0, 0)).toBe(0)
  })

  it('arrondit à 4 décimales', () => {
    const c = calculerCoutCHF('haiku', 1, 1)
    const decimales = c.toString().split('.')[1]?.length ?? 0
    expect(decimales).toBeLessThanOrEqual(4)
  })

  it('sonnet output est 3× plus cher que haiku output', () => {
    const haiku = calculerCoutCHF('haiku', 0, 100_000)
    const sonnet = calculerCoutCHF('sonnet', 0, 100_000)
    expect(sonnet / haiku).toBeCloseTo(3, 1)
  })
})

describe('estAuDelaSeuil', () => {
  it('true quand cumulé >= 80% du seuil', () => {
    expect(estAuDelaSeuil(80, 100)).toBe(true)
    expect(estAuDelaSeuil(79.99, 100)).toBe(false)
  })

  it('true exactement à 80%', () => {
    expect(estAuDelaSeuil(24, 30)).toBe(true)
  })

  it('false quand seuil = 0 (désactivé)', () => {
    expect(estAuDelaSeuil(50, 0)).toBe(false)
  })

  it('false quand seuil négatif', () => {
    expect(estAuDelaSeuil(50, -1)).toBe(false)
  })

  it('false quand bien en dessous du seuil', () => {
    expect(estAuDelaSeuil(0, 30)).toBe(false)
    expect(estAuDelaSeuil(1, 30)).toBe(false)
  })
})
