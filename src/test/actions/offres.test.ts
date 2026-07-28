// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  creerOffre, mettreAJourOffre, supprimerOffre,
  lireOffres, lireOffresActives, lireOffreParId, uploadOffrePdf,
} from '@/actions/offres'
import { createClient } from '@/lib/supabase/server'

function singleOk(data: unknown = { id: 'o1' }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: [data], error: null }),
    lte:    vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
  }
  return { from: vi.fn().mockReturnValue(chain), chain }
}

describe('creerOffre', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette cuvee_text vide', async () => {
    const r = await creerOffre({ cuvee_text: '' })
    expect(r.erreur).toBeDefined()
  })

  it('rejette si date_fin < date_debut', async () => {
    const r = await creerOffre({
      cuvee_text: 'Fendant',
      date_debut: '2026-08-15',
      date_fin: '2026-08-01',
    })
    expect(r.erreur).toBeDefined()
  })

  it('insère quand valide', async () => {
    const mock = singleOk({ id: 'o_new' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await creerOffre({ cuvee_text: 'Fendant', prix_promo_chf: 12.5 })
    expect(r.data?.id).toBe('o_new')
  })
})

describe('lireOffresActives', () => {
  it("retourne uniquement les offres dont la fenêtre couvre aujourd'hui", async () => {
    const mock = singleOk({ id: 'o1', cuvee_text: 'A' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireOffresActives()
    expect(r.data?.length).toBe(1)
    expect(mock.chain.lte).toHaveBeenCalled()
    expect(mock.chain.gte).toHaveBeenCalled()
  })
})

describe('mettreAJourOffre', () => {
  it('met à jour avec payload valide', async () => {
    const mock = singleOk({ id: 'o1', cuvee_text: 'Nouvelle' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await mettreAJourOffre('o1', { cuvee_text: 'Nouvelle' })
    expect(r.data?.id).toBe('o1')
  })
})

describe('supprimerOffre', () => {
  it('soft-delete', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never)
    const r = await supprimerOffre('o1')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
    expect(r.erreur).toBeUndefined()
  })
})

describe('lireOffres', () => {
  it("liste toutes offres (filtre 'toutes' par défaut)", async () => {
    const mock = singleOk({ id: 'o1' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireOffres()
    expect(r.data?.length).toBe(1)
  })
})

describe('lireOffreParId', () => {
  it("renvoie l'offre par id", async () => {
    const mock = singleOk({ id: 'o1', cuvee_text: 'X' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireOffreParId('o1')
    expect(r.data?.cuvee_text).toBe('X')
  })
})

describe('uploadOffrePdf', () => {
  it('rejette si pas de fichier', async () => {
    const fd = new FormData()
    const r = await uploadOffrePdf(fd)
    expect(r.erreur).toBeDefined()
  })

  it("upload vers bucket 'offres' et retourne l'URL publique", async () => {
    const uploadRes = { data: { path: 'abc.pdf' }, error: null }
    const publicUrlRes = { data: { publicUrl: 'https://x.co/abc.pdf' } }
    const supabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue(uploadRes),
          getPublicUrl: vi.fn().mockReturnValue(publicUrlRes),
        }),
      },
    }
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = new FormData()
    fd.append('fichier', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'test.pdf')
    const r = await uploadOffrePdf(fd)
    expect(r.data).toBe('https://x.co/abc.pdf')
  })
})
