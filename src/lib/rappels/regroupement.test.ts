import { describe, it, expect } from 'vitest'
import { regrouperRappels } from './regroupement'
import type { Rappel } from '@/types/rappel'

function mk(id: string, echeance: string, statut: 'a_faire' | 'fait' | 'annule' = 'a_faire'): Rappel {
  return {
    id, titre: id, description: null, echeance, statut, canal: null,
    etablissement_id: null, visite_id: null, conversation_id: null,
    fait_at: statut === 'fait' ? echeance : null, push_active: true,
    cree_par: 'utilisateur',
    created_at: '2026-07-29T08:00:00+02:00', updated_at: '2026-07-29T08:00:00+02:00',
  }
}

describe('regrouperRappels (Europe/Zurich)', () => {
  const now = '2026-07-29T10:00:00+02:00' // mercredi

  it('groupe "aujourdhui" pour rappels du jour', () => {
    const g = regrouperRappels([mk('a', '2026-07-29T18:00:00+02:00')], now)
    expect(g.aujourdhui).toHaveLength(1)
    expect(g.cetteSemaine).toHaveLength(0)
  })

  it('groupe "cetteSemaine" pour demain à dimanche', () => {
    const g = regrouperRappels([mk('a', '2026-08-02T10:00:00+02:00')], now)
    expect(g.cetteSemaine).toHaveLength(1)
  })

  it('groupe "plusTard" pour lundi prochain et au-delà', () => {
    const g = regrouperRappels([mk('a', '2026-08-03T10:00:00+02:00')], now)
    expect(g.plusTard).toHaveLength(1)
  })

  it('groupe "enRetard" pour hier et avant', () => {
    const g = regrouperRappels([mk('a', '2026-07-28T18:00:00+02:00')], now)
    expect(g.enRetard).toHaveLength(1)
  })

  it('groupe "termines" pour statut = fait', () => {
    const g = regrouperRappels([mk('a', '2026-07-29T18:00:00+02:00', 'fait')], now)
    expect(g.termines).toHaveLength(1)
    expect(g.aujourdhui).toHaveLength(0)
  })

  it('exclut les rappels statut = annule', () => {
    const g = regrouperRappels([mk('a', '2026-07-29T18:00:00+02:00', 'annule')], now)
    expect(g.aujourdhui).toHaveLength(0)
    expect(g.termines).toHaveLength(0)
  })

  it('trie chaque groupe par échéance croissante', () => {
    const g = regrouperRappels([
      mk('tard', '2026-07-29T18:00:00+02:00'),
      mk('tot',  '2026-07-29T09:00:00+02:00'),
    ], now)
    expect(g.aujourdhui.map(r => r.id)).toEqual(['tot', 'tard'])
  })
})
