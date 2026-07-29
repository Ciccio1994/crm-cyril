import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/dexie'
import { enqueue } from '@/lib/sync/queue'

vi.mock('@/actions/visite', () => ({
  creerVisite: vi.fn(),
  creerVisiteManquee: vi.fn(),
  mettreAJourVisite: vi.fn(),
}))
vi.mock('@/actions/etablissement', () => ({
  creerEtablissement: vi.fn(),
  mettreAJourEtablissement: vi.fn(),
  supprimerEtablissement: vi.fn(),
}))
vi.mock('@/actions/contact', () => ({
  creerContact: vi.fn(),
  mettreAJourContact: vi.fn(),
  supprimerContact: vi.fn(),
}))
vi.mock('@/actions/offres', () => ({
  creerOffre: vi.fn(),
  mettreAJourOffre: vi.fn(),
  supprimerOffre: vi.fn(),
}))

import { synchroniser } from '@/lib/sync/dispatcher'
import * as visiteActions from '@/actions/visite'

beforeEach(async () => {
  await db.sync_queue.clear()
  vi.clearAllMocks()
})

describe('synchroniser', () => {
  it("appelle la Server Action pour une entrée 'creerVisite'", async () => {
    vi.mocked(visiteActions.creerVisite).mockResolvedValue({ data: { id: 'v1' } as never })
    const id = await enqueue('creerVisite', { etablissement_id: 'e1' }, null)
    const rapport = await synchroniser()
    expect(visiteActions.creerVisite).toHaveBeenCalledWith({ etablissement_id: 'e1' })
    expect(rapport.reussi).toBe(1)
    const row = await db.sync_queue.get(id)
    expect(row?.statut).toBe('reussi')
  })

  it("marque en échec si Server Action retourne { erreur }", async () => {
    vi.mocked(visiteActions.creerVisite).mockResolvedValue({ erreur: 'Boom' })
    const id = await enqueue('creerVisite', {}, null)
    const rapport = await synchroniser()
    expect(rapport.echec).toBe(1)
    const row = await db.sync_queue.get(id)
    expect(row?.tentatives).toBe(1)
    expect(row?.dernier_message).toBe('Boom')
  })

  it("passe cible_id en 1er argument pour les updates", async () => {
    vi.mocked(visiteActions.mettreAJourVisite).mockResolvedValue({ data: { id: 'v1' } as never })
    await enqueue('mettreAJourVisite', { notes: 'X' }, 'v1')
    await synchroniser()
    expect(visiteActions.mettreAJourVisite).toHaveBeenCalledWith('v1', { notes: 'X' })
  })

  it("traite plusieurs entrées en séquence", async () => {
    vi.mocked(visiteActions.creerVisite).mockResolvedValue({ data: { id: 'v1' } as never })
    await enqueue('creerVisite', { x: 1 }, null)
    await enqueue('creerVisite', { x: 2 }, null)
    const rapport = await synchroniser()
    expect(rapport.reussi).toBe(2)
    expect(visiteActions.creerVisite).toHaveBeenCalledTimes(2)
  })

  it("retourne rapport vide si queue vide", async () => {
    const rapport = await synchroniser()
    expect(rapport.reussi).toBe(0)
    expect(rapport.echec).toBe(0)
    expect(rapport.restant).toBe(0)
  })
})
