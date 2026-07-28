// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')

import {
  lireStatistiquesFunnel,
  lireClientsEnRetard,
  lireSuggestionsProspection,
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
