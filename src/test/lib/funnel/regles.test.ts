import { describe, it, expect } from 'vitest'
import { moisEcoulesDepuis, evaluerStatutClient } from '@/lib/funnel/regles'

const NOW = '2026-07-28T00:00:00Z'

describe('moisEcoulesDepuis', () => {
  it("renvoie 0 si moins d'un mois", () => {
    expect(moisEcoulesDepuis('2026-07-15T00:00:00Z', NOW)).toBe(0)
  })
  it('renvoie 12 pour un an', () => {
    expect(moisEcoulesDepuis('2025-07-28T00:00:00Z', NOW)).toBe(12)
  })
  it('renvoie 13 pour 13 mois écoulés', () => {
    expect(moisEcoulesDepuis('2025-06-15T00:00:00Z', NOW)).toBe(13)
  })
  it('renvoie null si date null', () => {
    expect(moisEcoulesDepuis(null, NOW)).toBeNull()
  })
})

describe('evaluerStatutClient — client_actif → client_inactif', () => {
  it('reste client_actif si commande récente sous le seuil', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: '2026-05-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_actif')
    expect(r.motif).toBeNull()
  })

  it('passe en client_inactif si commande au-delà du seuil', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: '2024-06-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
    expect(r.motif).toMatch(/aucune commande depuis/i)
  })

  it('passe en client_inactif si jamais commandé (derniere_commande_at null)', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: null,
      derniere_visite_at: '2026-01-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
  })

  it('respecte un seuil personnalisé (6 mois au lieu de 12)', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: '2025-11-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 6,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
  })
})

describe('evaluerStatutClient — prospect → prospect_abandonne', () => {
  it('reste prospect si moins de 3 visites', () => {
    const r = evaluerStatutClient({
      statut: 'prospect',
      derniere_commande_at: null,
      derniere_visite_at: '2026-06-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 2,
    }, NOW)
    expect(r.nouveauStatut).toBe('prospect')
  })

  it('passe en prospect_abandonne à 3 visites sans commande', () => {
    const r = evaluerStatutClient({
      statut: 'prospect',
      derniere_commande_at: null,
      derniere_visite_at: '2026-06-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 3,
    }, NOW)
    expect(r.nouveauStatut).toBe('prospect_abandonne')
    expect(r.motif).toMatch(/3 visites sans commande/i)
  })

  it('reste prospect si 3 visites MAIS une commande (signal positif)', () => {
    const r = evaluerStatutClient({
      statut: 'prospect',
      derniere_commande_at: '2026-01-01T00:00:00Z',
      derniere_visite_at: '2026-06-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 3,
    }, NOW)
    expect(r.nouveauStatut).toBe('prospect')
  })
})

describe('evaluerStatutClient — statuts jamais modifiés automatiquement', () => {
  const statutsHumains = [
    'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux',
  ] as const

  for (const s of statutsHumains) {
    it(`${s} n'est jamais rétrogradé auto`, () => {
      const r = evaluerStatutClient({
        statut: s,
        derniere_commande_at: null,
        derniere_visite_at: null,
        seuil_inactivite_mois: 12,
        visites_count: 10,
      }, NOW)
      expect(r.nouveauStatut).toBe(s)
    })
  }

  it('client_inactif reste client_inactif (pas de re-rétrogradation)', () => {
    const r = evaluerStatutClient({
      statut: 'client_inactif',
      derniere_commande_at: null,
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
  })
})
