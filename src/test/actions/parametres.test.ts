// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { lireParametres, mettreAJourParametre } from '@/actions/parametres'
import { createClient } from '@/lib/supabase/server'

describe('lireParametres', () => {
  beforeEach(() => vi.clearAllMocks())

  it("retourne les paramètres BDD sous forme d'objet", async () => {
    const chain = {
      select: vi.fn().mockResolvedValue({
        data: [
          { cle: 'objectif_visites_clients_par_jour', valeur: 6 },
          { cle: 'objectif_visites_prospects_par_jour', valeur: 2 },
          { cle: 'seuil_inactivite_mois_global', valeur: 12 },
        ],
        error: null,
      }),
    }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as never)
    const r = await lireParametres()
    expect(r.data!.objectif_visites_clients_par_jour).toBe(6)
    expect(r.data!.objectif_visites_prospects_par_jour).toBe(2)
    expect(r.data!.seuil_inactivite_mois_global).toBe(12)
  })
})

describe('mettreAJourParametre', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette une clé non modifiable', async () => {
    const r = await mettreAJourParametre('claude_chat_active', true)
    expect(r.erreur).toBeDefined()
  })

  it('rejette une valeur hors bornes', async () => {
    const r = await mettreAJourParametre('objectif_visites_clients_par_jour', 999)
    expect(r.erreur).toBeDefined()
  })

  it('UPSERT dans Supabase quand valide', async () => {
    const upsertChain = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(upsertChain),
    } as never)
    const r = await mettreAJourParametre('objectif_visites_clients_par_jour', 8)
    expect(r.erreur).toBeUndefined()
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cle: 'objectif_visites_clients_par_jour', valeur: 8,
      }),
      expect.any(Object),
    )
  })
})
