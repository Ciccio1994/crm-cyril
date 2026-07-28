// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { creerVisite, creerVisiteManquee, lireVisites, mettreAJourVisite }
  from '@/actions/visite'
import { createClient } from '@/lib/supabase/server'

const ETAB_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date().toISOString()

function chainOk(payload: unknown = { id: 'v1' }) {
  const c = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: payload, error: null }),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: [payload], error: null }),
  }
  return { from: vi.fn().mockReturnValue(c), c }
}

describe('creerVisite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette sans date_visite', async () => {
    const r = await creerVisite({ etablissement_id: ETAB_ID })
    expect(r.erreur).toBeDefined()
  })

  it('rejette duree_minutes négative', async () => {
    const r = await creerVisite({ etablissement_id: ETAB_ID, date_visite: NOW, duree_minutes: -1 })
    expect(r.erreur).toBeDefined()
  })

  it('insère avec est_manquee false', async () => {
    const { from, c } = chainOk()
    vi.mocked(createClient).mockResolvedValue({ from } as never)
    const r = await creerVisite({ etablissement_id: ETAB_ID, date_visite: NOW, duree_minutes: 60 })
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ est_manquee: false })
    )
    expect(r.data).toBeDefined()
  })
})

describe('creerVisiteManquee', () => {
  beforeEach(() => vi.clearAllMocks())

  it('insère avec est_manquee true', async () => {
    const { from, c } = chainOk()
    vi.mocked(createClient).mockResolvedValue({ from } as never)
    await creerVisiteManquee({ etablissement_id: ETAB_ID, date_visite: NOW })
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ est_manquee: true })
    )
  })

  it('rejette un motif invalide', async () => {
    const r = await creerVisiteManquee({
      etablissement_id: ETAB_ID,
      date_visite: NOW,
      motif_manquee: 'pas_envie',
    })
    expect(r.erreur).toBeDefined()
  })
})

describe('lireVisites', () => {
  it('retourne les visites triées par date desc', async () => {
    const { from } = chainOk([{ id: 'v1', date_visite: NOW }])
    vi.mocked(createClient).mockResolvedValue({ from } as never)
    const r = await lireVisites(ETAB_ID)
    expect(r.data).toBeDefined()
  })
})

describe('mettreAJourVisite', () => {
  it('rejette un payload invalide', async () => {
    const r = await mettreAJourVisite('v1', { duree_minutes: -5 })
    expect(r.erreur).toBeDefined()
  })

  it('met à jour les notes', async () => {
    const { from } = chainOk({ id: 'v1', notes: 'Nouveau contenu' })
    vi.mocked(createClient).mockResolvedValue({ from } as never)
    const r = await mettreAJourVisite('v1', { notes: 'Nouveau contenu' })
    expect(r.data).toBeDefined()
  })
})
