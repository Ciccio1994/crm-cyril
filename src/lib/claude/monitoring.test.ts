import { describe, it, expect } from 'vitest'
import { calculerCoutCHF, estAuDelaSeuil, normaliserDataParametre } from './monitoring'

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

describe('normaliserDataParametre', () => {
  it('accepte un objet déjà parsé (parametre.valeur JSONB)', () => {
    const r = normaliserDataParametre({ tokens_mois: 100, cout_chf_mois: 1.5, seuil_chf: 30 })
    expect(r).toEqual({ tokens_mois: 100, cout_chf_mois: 1.5, seuil_chf: 30 })
  })

  it('accepte une chaîne JSON (rétrocompatibilité TEXT)', () => {
    const r = normaliserDataParametre('{"tokens_mois":50,"cout_chf_mois":0.8,"seuil_chf":20}')
    expect(r).toEqual({ tokens_mois: 50, cout_chf_mois: 0.8, seuil_chf: 20 })
  })

  it('migre les clés du seed V0 (tokens_mois_courant, seuil_alerte_chf)', () => {
    const r = normaliserDataParametre({ tokens_mois_courant: 200, seuil_alerte_chf: 50 })
    expect(r).toEqual({ tokens_mois: 200, cout_chf_mois: 0, seuil_chf: 50 })
  })

  it('retourne les défauts sur null/undefined', () => {
    expect(normaliserDataParametre(null)).toEqual({ tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 })
    expect(normaliserDataParametre(undefined)).toEqual({ tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 })
  })

  it('retourne les défauts sur chaîne invalide', () => {
    expect(normaliserDataParametre('pas du json')).toEqual({ tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 })
  })

  it('ne crash PAS avec un objet imbriqué inattendu (régression bug "[object Object]")', () => {
    // Cas d'origine du bug : JSON.parse(objet) → String(objet) = "[object Object]" → SyntaxError
    expect(() => normaliserDataParametre({ tokens_mois_courant: 0, seuil_alerte_chf: 50 })).not.toThrow()
  })
})
