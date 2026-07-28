// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')

import {
  lireStatistiquesFunnel,
  lireClientsEnRetard,
  lireSuggestionsProspection,
  actualiserFunnel,
} from '@/actions/funnel'
import { createClient } from '@/lib/supabase/server'

function mockSelect(data: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data, error: null }),
  }
  return { from: vi.fn().mockReturnValue(chain), chain }
}

describe('lireStatistiquesFunnel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('compte les etabs par statut', async () => {
    const mock = mockSelect([
      { statut: 'prospect' }, { statut: 'prospect' },
      { statut: 'client_actif' }, { statut: 'client_actif' }, { statut: 'client_actif' },
      { statut: 'client_inactif' },
    ])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireStatistiquesFunnel()
    expect(r.data!.prospect).toBe(2)
    expect(r.data!.client_actif).toBe(3)
    expect(r.data!.client_inactif).toBe(1)
    expect(r.data!.total).toBe(6)
  })

  it('filtre par tournee_id', async () => {
    const mock = mockSelect([{ statut: 'prospect' }])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    await lireStatistiquesFunnel({ tournee_id: 't1' })
    expect(mock.chain.eq).toHaveBeenCalledWith('tournee_id', 't1')
  })
})

describe('lireClientsEnRetard', () => {
  beforeEach(() => vi.clearAllMocks())

  it("retourne clients actifs + inactifs triés par ancienneté de visite", async () => {
    const list = [{
      id: 'e1', enseigne: 'A', statut: 'client_actif',
      derniere_visite_at: '2026-04-01T00:00:00Z',
      tournee: { frequence_semaines: 2 },
    }]
    const mock = mockSelect(list)
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireClientsEnRetard()
    expect(r.data!.length).toBe(1)
    expect(mock.chain.in).toHaveBeenCalledWith('statut', ['client_actif', 'client_inactif'])
  })

  it('filtre par tournee_id si fourni', async () => {
    const mock = mockSelect([])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    await lireClientsEnRetard('t1')
    expect(mock.chain.eq).toHaveBeenCalledWith('tournee_id', 't1')
  })
})

describe('lireSuggestionsProspection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne les prospects triés par ancienneté (jamais visités en tête)', async () => {
    const mock = mockSelect([
      { id: 'p1', enseigne: 'P1', statut: 'prospect', derniere_visite_at: null },
    ])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireSuggestionsProspection()
    expect(r.data!.length).toBe(1)
    expect(mock.chain.eq).toHaveBeenCalledWith('statut', 'prospect')
  })
})

describe('actualiserFunnel', () => {
  beforeEach(() => vi.clearAllMocks())

  function mockActualise(
    etabs: {
      id: string
      statut: string
      derniere_commande_at: string | null
      derniere_visite_at: string | null
      seuil_inactivite_mois: number
    }[],
    visitesCount: Record<string, number> = {},
  ) {
    const updates: { id: string; payload: Record<string, unknown> }[] = []
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'etablissement') {
          return {
            select: vi.fn().mockReturnThis(),
            is:     vi.fn().mockReturnThis(),
            in:     vi.fn().mockResolvedValue({ data: etabs, error: null }),
            update: vi.fn().mockImplementation((p: Record<string, unknown>) => ({
              eq: vi.fn().mockImplementation((_c: string, id: string) => {
                updates.push({ id, payload: p })
                return Promise.resolve({ error: null })
              }),
            })),
          }
        }
        if (table === 'visite') {
          const chain = {
            select: vi.fn().mockReturnThis(),
            is:     vi.fn().mockReturnThis(),
            eq:     vi.fn().mockImplementation((_c: string, val: string) => {
              return Promise.resolve({
                data: Array(visitesCount[val] ?? 0).fill({ id: 'v' }),
                error: null,
              })
            }),
          }
          return chain
        }
        return {}
      }),
    }
    return { supabase, updates }
  }

  it('passe client_actif → client_inactif si commande > seuil', async () => {
    const mock = mockActualise([{
      id: 'e1', statut: 'client_actif',
      derniere_commande_at: '2024-01-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
    }])
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const r = await actualiserFunnel()
    expect(r.data!.vers_inactif).toBe(1)
    expect(mock.updates[0].payload.statut).toBe('client_inactif')
  })

  it('passe prospect → prospect_abandonne si 3 visites sans commande', async () => {
    const mock = mockActualise(
      [{
        id: 'p1', statut: 'prospect',
        derniere_commande_at: null,
        derniere_visite_at: '2026-06-01T00:00:00Z',
        seuil_inactivite_mois: 12,
      }],
      { p1: 3 },
    )
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const r = await actualiserFunnel()
    expect(r.data!.vers_abandonne).toBe(1)
    expect(mock.updates[0].payload.statut).toBe('prospect_abandonne')
  })

  it("ne touche pas ceux dont l'évaluation retourne le même statut", async () => {
    const mock = mockActualise([{
      id: 'e1', statut: 'client_actif',
      derniere_commande_at: '2026-05-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
    }])
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const r = await actualiserFunnel()
    expect(r.data!.vers_inactif).toBe(0)
    expect(mock.updates.length).toBe(0)
    expect(r.data!.examines).toBe(1)
  })
})
