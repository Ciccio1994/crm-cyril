// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')

import { lireObjectifDuJour, lireHistoriqueHebdo } from '@/actions/objectif'
import { createClient } from '@/lib/supabase/server'

function mockSelect(data: unknown[], parametres: unknown[] = []) {
  const visitesChain = {
    select: vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data, error: null }),
  }
  const parametresChain = {
    select: vi.fn().mockResolvedValue({ data: parametres, error: null }),
  }
  return {
    from: vi.fn().mockImplementation((table: string) =>
      table === 'visite' ? visitesChain : parametresChain,
    ),
  }
}

describe('lireObjectifDuJour', () => {
  beforeEach(() => vi.clearAllMocks())

  it("agrège clients + prospects du jour avec seuils BDD", async () => {
    const now = new Date().toISOString()
    const visites = [
      {
        id: 'v1', date_visite: now, est_manquee: false, deleted_at: null,
        etablissement_id: 'e1', contact_id: null, duree_minutes: 60,
        notes: null, motif_manquee: null, prochaine_action: null,
        synced_at: null, created_at: now, updated_at: now,
        etablissement: { statut: 'client_actif' },
      },
    ]
    const mock = mockSelect(visites, [
      { cle: 'objectif_visites_clients_par_jour', valeur: 6 },
      { cle: 'objectif_visites_prospects_par_jour', valeur: 2 },
    ])
    vi.mocked(createClient).mockResolvedValue(mock as never)

    const r = await lireObjectifDuJour()
    expect(r.data!.compteur.clients).toBe(1)
    expect(r.data!.compteur.prospects).toBe(0)
    expect(r.data!.seuils.objectif_clients).toBe(6)
    expect(r.data!.atteint).toBe(false)
  })
})

describe('lireHistoriqueHebdo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renvoie 28 jours', async () => {
    const mock = mockSelect([], [])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireHistoriqueHebdo()
    expect(r.data!.jours).toHaveLength(28)
  })
})
