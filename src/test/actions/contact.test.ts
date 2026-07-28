// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { creerContact, mettreAJourContact, supprimerContact, lireContacts }
  from '@/actions/contact'
import { createClient } from '@/lib/supabase/server'

const ETAB_ID = '11111111-1111-4111-8111-111111111111'

function singleOk(payload: unknown = { id: 'c1', nom: 'Dupont' }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: payload, error: null }),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: [payload], error: null }),
  }
  return { from: vi.fn().mockReturnValue(chain), chain }
}

describe('creerContact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette sans etablissement_id', async () => {
    const r = await creerContact({ nom: 'Dupont' })
    expect(r.erreur).toBeDefined()
  })

  it('insère et retourne le contact', async () => {
    const mock = singleOk()
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await creerContact({
      etablissement_id: ETAB_ID,
      nom: 'Dupont',
    })
    expect(r.data?.nom).toBe('Dupont')
  })
})

describe('lireContacts', () => {
  it("retourne les contacts d'un établissement", async () => {
    const mock = singleOk()
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireContacts(ETAB_ID)
    expect(r.data).toHaveLength(1)
  })
})

describe('mettreAJourContact', () => {
  it('met à jour avec payload valide', async () => {
    const mock = singleOk()
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await mettreAJourContact('c1', { fonction: 'Sommelier' })
    expect(r.data).toBeDefined()
  })
})

describe('supprimerContact', () => {
  it('soft-delete', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never)
    const r = await supprimerContact('c1')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    expect(r.erreur).toBeUndefined()
  })
})
