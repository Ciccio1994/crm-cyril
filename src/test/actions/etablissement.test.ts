// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { creerEtablissement, mettreAJourEtablissement, supprimerEtablissement }
  from '@/actions/etablissement'
import { createClient } from '@/lib/supabase/server'

function mockChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    insert:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    select:  vi.fn().mockReturnThis(),
    single:  vi.fn().mockResolvedValue({ data: { id: 'abc123', enseigne: 'Test' }, error: null }),
    eq:      vi.fn().mockReturnThis(),
    is:      vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    ...overrides,
  }
  return {
    supabase: {
      from: vi.fn().mockReturnValue(chain),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user1' } } }) },
    },
    chain,
  }
}

describe('creerEtablissement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne une erreur si enseigne vide', async () => {
    const result = await creerEtablissement({ enseigne: '' })
    expect(result.erreur).toBeDefined()
    expect(result.data).toBeUndefined()
  })

  it('insère dans Supabase et retourne la ligne créée', async () => {
    const { supabase } = mockChain()
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await creerEtablissement({ enseigne: 'Restaurant Alpha', statut: 'prospect' })
    expect(result.data).toEqual({ id: 'abc123', enseigne: 'Test' })
    expect(result.erreur).toBeUndefined()
  })

  it("remonte l'erreur Supabase", async () => {
    const chain: Record<string, unknown> = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }
    const supabase = {
      from: vi.fn().mockReturnValue(chain),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    }
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await creerEtablissement({ enseigne: 'Test' })
    expect(result.erreur).toBeDefined()
  })
})

describe('mettreAJourEtablissement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette un id invalide', async () => {
    const result = await mettreAJourEtablissement('pas-un-uuid', { enseigne: 'Test' })
    expect(result.erreur).toBeDefined()
  })

  it('met à jour dans Supabase', async () => {
    const { supabase } = mockChain()
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await mettreAJourEtablissement(
      '11111111-1111-4111-8111-111111111111',
      { notes_internes: 'Bon client' }
    )
    expect(result.data).toBeDefined()
  })
})

describe('supprimerEtablissement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('soft-delete (deleted_at) dans Supabase', async () => {
    const { supabase, chain } = mockChain()
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    await supprimerEtablissement('11111111-1111-4111-8111-111111111111')
    expect(supabase.from).toHaveBeenCalledWith('etablissement')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })
})
