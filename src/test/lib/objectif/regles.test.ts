import { describe, it, expect } from 'vitest'
import {
  estClient, estProspect, dateJourLocal,
  compterVisitesDuJour, aObjectifAtteint, calculerHistorique28j,
} from '@/lib/objectif/regles'
import type { Visite } from '@/types/database'

describe('estClient / estProspect', () => {
  it('client_actif et client_inactif sont clients', () => {
    expect(estClient('client_actif')).toBe(true)
    expect(estClient('client_inactif')).toBe(true)
  })
  it('prospect est prospect', () => {
    expect(estProspect('prospect')).toBe(true)
  })
  it("les autres statuts ne sont ni client ni prospect", () => {
    for (const s of ['pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux'] as const) {
      expect(estClient(s)).toBe(false)
      expect(estProspect(s)).toBe(false)
    }
  })
})

describe('dateJourLocal — YYYY-MM-DD en Europe/Zurich', () => {
  it('convertit une ISO UTC en date locale Zurich', () => {
    // 28 juillet 2026 23h30 UTC = 29 juillet 01h30 Zurich (été)
    expect(dateJourLocal('2026-07-28T23:30:00Z')).toBe('2026-07-29')
  })
  it('cas midi UTC (même jour partout)', () => {
    expect(dateJourLocal('2026-07-28T12:00:00Z')).toBe('2026-07-28')
  })
})

function v(
  date_visite: string,
  est_manquee: boolean,
  statut: 'client_actif' | 'client_inactif' | 'prospect',
): Visite & { etablissement: { statut: typeof statut } } {
  return {
    id: 'v',
    etablissement_id: 'e',
    contact_id: null,
    date_visite,
    duree_minutes: 60,
    notes: null,
    est_manquee,
    motif_manquee: null,
    prochaine_action: null,
    synced_at: null,
    created_at: date_visite,
    updated_at: date_visite,
    deleted_at: null,
    etablissement: { statut },
  } as never
}

describe('compterVisitesDuJour', () => {
  const JOUR = '2026-07-28'
  const NOW = '2026-07-28T12:00:00Z'

  it("compte 2 visites clients + 1 prospect faites aujourd'hui", () => {
    const visites = [
      v('2026-07-28T09:00:00Z', false, 'client_actif'),
      v('2026-07-28T11:00:00Z', false, 'client_inactif'),
      v('2026-07-28T15:00:00Z', false, 'prospect'),
    ]
    const r = compterVisitesDuJour(visites, NOW)
    expect(r.clients).toBe(2)
    expect(r.prospects).toBe(1)
    expect(r.jour).toBe(JOUR)
  })

  it("ignore les visites manquées", () => {
    const visites = [
      v('2026-07-28T09:00:00Z', true,  'client_actif'),
      v('2026-07-28T11:00:00Z', false, 'client_actif'),
    ]
    expect(compterVisitesDuJour(visites, NOW).clients).toBe(1)
  })

  it("ignore les visites d'un autre jour local Zurich", () => {
    const visites = [
      v('2026-07-28T09:00:00Z', false, 'client_actif'),  // aujourd'hui
      v('2026-07-26T09:00:00Z', false, 'client_actif'),  // il y a 2 jours
    ]
    expect(compterVisitesDuJour(visites, NOW).clients).toBe(1)
  })
})

describe('aObjectifAtteint', () => {
  it("atteint quand 6 clients + 2 prospects avec seuils par défaut", () => {
    expect(aObjectifAtteint({ clients: 6, prospects: 2 }, { objectif_clients: 6, objectif_prospects: 2 })).toBe(true)
  })
  it('non atteint si un des deux compteurs est en dessous', () => {
    expect(aObjectifAtteint({ clients: 6, prospects: 1 }, { objectif_clients: 6, objectif_prospects: 2 })).toBe(false)
    expect(aObjectifAtteint({ clients: 5, prospects: 2 }, { objectif_clients: 6, objectif_prospects: 2 })).toBe(false)
  })
  it('respecte des seuils personnalisés (5 + 3)', () => {
    expect(aObjectifAtteint({ clients: 5, prospects: 3 }, { objectif_clients: 5, objectif_prospects: 3 })).toBe(true)
  })
})

describe('calculerHistorique28j', () => {
  it('renvoie 28 entrées, une par jour, ordre chronologique', () => {
    const now = '2026-07-28T12:00:00Z'
    const h = calculerHistorique28j([], now, { objectif_clients: 6, objectif_prospects: 2 })
    expect(h).toHaveLength(28)
    expect(h[0].jour).toBe('2026-07-01')
    expect(h[27].jour).toBe('2026-07-28')
  })
  it('marque à objectif seulement les jours ≥ seuils', () => {
    const now = '2026-07-28T12:00:00Z'
    const visites = [
      v('2026-07-15T09:00:00Z', false, 'client_actif'),
      v('2026-07-15T10:00:00Z', false, 'client_actif'),
      v('2026-07-15T11:00:00Z', false, 'client_actif'),
      v('2026-07-15T14:00:00Z', false, 'prospect'),
      v('2026-07-15T15:00:00Z', false, 'prospect'),
    ]
    const h = calculerHistorique28j(visites, now, { objectif_clients: 3, objectif_prospects: 2 })
    const jour15 = h.find((d) => d.jour === '2026-07-15')!
    expect(jour15.clients).toBe(3)
    expect(jour15.prospects).toBe(2)
    expect(jour15.atteint).toBe(true)
    expect(h[0].atteint).toBe(false)
  })
})
