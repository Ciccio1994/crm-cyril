import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('creerRappel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crée un rappel valide et retourne la donnée', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const fakeRappel = {
      id: 'uuid-1',
      titre: 'Appeler M. Dupont',
      echeance: '2026-07-30T10:00:00+02:00',
      statut: 'a_faire',
      canal: null,
      etablissement_id: null,
      visite_id: null,
      conversation_id: null,
      fait_at: null,
      push_active: true,
      cree_par: 'utilisateur',
      description: null,
      created_at: '2026-07-29T10:00:00+02:00',
      updated_at: '2026-07-29T10:00:00+02:00',
      etablissement: null,
    }
    const single = vi.fn().mockResolvedValue({ data: fakeRappel, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => ({ insert }) })

    const { creerRappel } = await import('./rappels')
    const result = await creerRappel({
      titre: 'Appeler M. Dupont',
      echeance: '2026-07-30T10:00:00+02:00',
      push_active: true,
    })

    expect(result.erreur).toBeUndefined()
    expect(result.data?.titre).toBe('Appeler M. Dupont')
  })

  it('refuse un titre vide et retourne une erreur Zod', async () => {
    const { creerRappel } = await import('./rappels')
    const result = await creerRappel({
      titre: '',
      echeance: '2026-07-30T10:00:00+02:00',
      push_active: true,
    })

    expect(result.erreur).toContain('Titre requis')
    expect(result.data).toBeUndefined()
  })
})

describe('marquerRappelFait', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marque le rappel comme fait et retourne la donnée mise à jour', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const fakeRappel = {
      id: 'uuid-2',
      titre: 'Visiter Cave Orsat',
      statut: 'fait',
      fait_at: '2026-07-29T10:00:00+02:00',
      echeance: '2026-07-29T09:00:00+02:00',
      canal: null,
      etablissement_id: null,
      visite_id: null,
      conversation_id: null,
      push_active: true,
      cree_par: 'utilisateur',
      description: null,
      created_at: '2026-07-29T08:00:00+02:00',
      updated_at: '2026-07-29T10:00:00+02:00',
      etablissement: null,
    }
    const single = vi.fn().mockResolvedValue({ data: fakeRappel, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => ({ update }) })

    const { marquerRappelFait } = await import('./rappels')
    const result = await marquerRappelFait('uuid-2')

    expect(result.erreur).toBeUndefined()
    expect(result.data?.statut).toBe('fait')
  })
})

describe('reporterRappel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne une erreur pour une date invalide', async () => {
    const { reporterRappel } = await import('./rappels')
    const result = await reporterRappel('uuid-3', 'pas-une-date')

    expect(result.erreur).toBe('Date invalide')
    expect(result.data).toBeUndefined()
  })

  it('reporte correctement un rappel avec une date valide', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const fakeRappel = {
      id: 'uuid-3',
      titre: 'Rappel reporté',
      statut: 'a_faire',
      echeance: '2026-08-05T10:00:00+02:00',
      canal: null,
      etablissement_id: null,
      visite_id: null,
      conversation_id: null,
      fait_at: null,
      push_active: true,
      cree_par: 'utilisateur',
      description: null,
      created_at: '2026-07-29T08:00:00+02:00',
      updated_at: '2026-07-29T10:00:00+02:00',
      etablissement: null,
    }
    const single = vi.fn().mockResolvedValue({ data: fakeRappel, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => ({ update }) })

    const { reporterRappel } = await import('./rappels')
    const result = await reporterRappel('uuid-3', '2026-08-05T10:00:00+02:00')

    expect(result.erreur).toBeUndefined()
    expect(result.data?.id).toBe('uuid-3')
  })
})
