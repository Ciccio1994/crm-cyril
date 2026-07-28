import { describe, it, expect } from 'vitest'
import { statutOffre, joursAvantExpiration } from '@/lib/offres/regles'
import type { Offre } from '@/types/database'

function o(overrides: Partial<Offre> = {}): Offre {
  return {
    id: 'x',
    cuvee_text: 'Fendant',
    cuvee_id: null,
    prix_promo_chf: 12.5,
    date_debut: null,
    date_fin: null,
    conditions: null,
    source_pdf_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

const NOW = '2026-07-28T12:00:00Z'

describe('statutOffre', () => {
  it("en_cours si aujourd'hui entre date_debut et date_fin", () => {
    expect(statutOffre(o({ date_debut: '2026-07-01', date_fin: '2026-08-15' }), NOW)).toBe('en_cours')
  })
  it("en_cours si aujourd'hui = date_debut (inclusif)", () => {
    expect(statutOffre(o({ date_debut: '2026-07-28', date_fin: '2026-08-15' }), NOW)).toBe('en_cours')
  })
  it("en_cours si aujourd'hui = date_fin (inclusif)", () => {
    expect(statutOffre(o({ date_debut: '2026-07-01', date_fin: '2026-07-28' }), NOW)).toBe('en_cours')
  })
  it("a_venir si date_debut > aujourd'hui", () => {
    expect(statutOffre(o({ date_debut: '2026-08-01', date_fin: '2026-08-15' }), NOW)).toBe('a_venir')
  })
  it("expiree si date_fin < aujourd'hui", () => {
    expect(statutOffre(o({ date_debut: '2026-06-01', date_fin: '2026-07-15' }), NOW)).toBe('expiree')
  })
  it("en_cours si aucune date renseignée (offre permanente)", () => {
    expect(statutOffre(o(), NOW)).toBe('en_cours')
  })
  it("respecte la timezone Zurich (23h30 UTC = jour suivant Zurich)", () => {
    // 2026-07-28 23:30 UTC = 2026-07-29 01:30 Zurich (été)
    const now = '2026-07-28T23:30:00Z'
    expect(statutOffre(o({ date_debut: '2026-07-29', date_fin: '2026-07-29' }), now)).toBe('en_cours')
  })
})

describe('joursAvantExpiration', () => {
  it("renvoie null si pas de date_fin", () => {
    expect(joursAvantExpiration(o(), NOW)).toBeNull()
  })
  it("renvoie 0 si date_fin = aujourd'hui", () => {
    expect(joursAvantExpiration(o({ date_fin: '2026-07-28' }), NOW)).toBe(0)
  })
  it("renvoie 7 si date_fin dans 7 jours", () => {
    expect(joursAvantExpiration(o({ date_fin: '2026-08-04' }), NOW)).toBe(7)
  })
  it("renvoie -3 si date_fin il y a 3 jours (expirée)", () => {
    expect(joursAvantExpiration(o({ date_fin: '2026-07-25' }), NOW)).toBe(-3)
  })
})
