import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock des Server Actions et Supabase avant import du module testé
vi.mock('@/actions/rappels', () => ({
  creerRappel: vi.fn(),
}))

vi.mock('@/actions/visite', () => ({
  creerVisite: vi.fn(),
}))

vi.mock('@/actions/etablissement', () => ({
  mettreAJourEtablissement: vi.fn(),
  lireEtablissements: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/etablissements/recherche', () => ({
  normaliserRecherche: vi.fn((v: string) => v.toLowerCase()),
  correspondRecherche: vi.fn(
    (etab: { enseigne: string }, requete: string) =>
      etab.enseigne.toLowerCase().includes(requete),
  ),
}))

import { creerRappel } from '@/actions/rappels'
import { lireEtablissements } from '@/actions/etablissement'
import { mettreAJourEtablissement } from '@/actions/etablissement'
import { createClient } from '@/lib/supabase/server'
import { executerOutil } from './executeur-outils'

const mockCreerRappel = vi.mocked(creerRappel)
const mockLireEtablissements = vi.mocked(lireEtablissements)
const mockMettreAJourEtablissement = vi.mocked(mettreAJourEtablissement)
const mockCreateClient = vi.mocked(createClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('executerOutil — creerRappel', () => {
  it('retourne ok: true avec contenu quand la Server Action réussit', async () => {
    mockCreerRappel.mockResolvedValue({
      data: {
        id: 'rappel-123',
        titre: 'Test',
        description: null,
        echeance: '2026-08-05T14:00:00+02:00',
        statut: 'a_faire',
        canal: null,
        etablissement_id: null,
        visite_id: null,
        conversation_id: null,
        fait_at: null,
        push_active: true,
        cree_par: 'claude',
        created_at: '2026-07-29T10:00:00+02:00',
        updated_at: '2026-07-29T10:00:00+02:00',
      },
    })

    const r = await executerOutil(
      'creerRappel',
      { titre: 'Test', echeance: '2026-08-05T14:00:00+02:00' },
      'conv-abc',
    )

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.contenu).toContain('rappel-123')
    expect(mockCreerRappel).toHaveBeenCalledWith(
      expect.objectContaining({ titre: 'Test', push_active: true }),
      'claude',
      'conv-abc',
    )
  })

  it('retourne ok: false quand la Server Action retourne une erreur', async () => {
    mockCreerRappel.mockResolvedValue({ erreur: 'Connexion Supabase échouée' })

    const r = await executerOutil(
      'creerRappel',
      { titre: 'Test', echeance: '2026-08-05T14:00:00+02:00' },
      null,
    )

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toContain('Connexion Supabase')
  })

  it('retourne ok: false (Zod) pour un titre vide', async () => {
    const r = await executerOutil(
      'creerRappel',
      { titre: '', echeance: '2026-08-05T14:00:00+02:00' },
      null,
    )

    expect(r.ok).toBe(false)
    expect(mockCreerRappel).not.toHaveBeenCalled()
  })

  it('retourne ok: false (Zod) pour une date sans offset', async () => {
    const r = await executerOutil(
      'creerRappel',
      { titre: 'Test', echeance: '2026-08-05T14:00:00' },
      null,
    )

    expect(r.ok).toBe(false)
    expect(mockCreerRappel).not.toHaveBeenCalled()
  })
})

describe('executerOutil — mettreAJourEtablissement', () => {
  it('retourne ok: false (Zod) pour champs vide', async () => {
    const r = await executerOutil(
      'mettreAJourEtablissement',
      { id: '11111111-1111-4111-8111-111111111111', champs: {} },
      null,
    )

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toBeTruthy()
    expect(mockMettreAJourEtablissement).not.toHaveBeenCalled()
  })

  it('appelle mettreAJourEtablissement avec les bons paramètres', async () => {
    mockMettreAJourEtablissement.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        enseigne: 'Cave du Rhône',
        code_schenk: null,
        type_etablissement: null,
        statut: 'client_actif',
        groupe_prix: null,
        adresse_ligne_1: null,
        adresse_ligne_2: null,
        code_postal: null,
        ville: 'Sion',
        latitude: null,
        longitude: null,
        telephone_principal: null,
        telephone_mobile: null,
        email: null,
        site_web: null,
        horaires_libre: null,
        notes_internes: null,
        seuil_inactivite_mois: 3,
        horaires_ouverture: null,
        jours_fermeture_annuelle: null,
        entreprise_id: null,
        tournee_id: null,
        derniere_visite_at: null,
        derniere_commande_at: null,
        created_at: '2026-01-01T00:00:00+00:00',
        updated_at: '2026-07-29T10:00:00+00:00',
        deleted_at: null,
      },
    })

    const r = await executerOutil(
      'mettreAJourEtablissement',
      {
        id: '11111111-1111-4111-8111-111111111111',
        champs: { enseigne: 'Cave du Rhône' },
      },
      null,
    )

    expect(r.ok).toBe(true)
    expect(mockMettreAJourEtablissement).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { enseigne: 'Cave du Rhône' },
    )
  })
})

describe('executerOutil — chercherEtablissements', () => {
  it('filtre les établissements via correspondRecherche et retourne du JSON', async () => {
    mockLireEtablissements.mockResolvedValue({
      data: [
        {
          id: 'etab-1',
          enseigne: 'Cave du Rhône',
          code_schenk: null,
          type_etablissement: null,
          statut: 'client_actif',
          groupe_prix: null,
          adresse_ligne_1: null,
          adresse_ligne_2: null,
          code_postal: null,
          ville: 'Sion',
          latitude: null,
          longitude: null,
          telephone_principal: null,
          telephone_mobile: null,
          email: null,
          site_web: null,
          horaires_libre: null,
          notes_internes: null,
          seuil_inactivite_mois: 3,
          horaires_ouverture: null,
          jours_fermeture_annuelle: null,
          entreprise_id: null,
          tournee_id: null,
          derniere_visite_at: null,
          derniere_commande_at: null,
          created_at: '2026-01-01T00:00:00+00:00',
          updated_at: '2026-01-01T00:00:00+00:00',
          deleted_at: null,
          contacts: [],
        },
        {
          id: 'etab-2',
          enseigne: 'Restaurant Le Valais',
          code_schenk: null,
          type_etablissement: null,
          statut: 'prospect',
          groupe_prix: null,
          adresse_ligne_1: null,
          adresse_ligne_2: null,
          code_postal: null,
          ville: 'Martigny',
          latitude: null,
          longitude: null,
          telephone_principal: null,
          telephone_mobile: null,
          email: null,
          site_web: null,
          horaires_libre: null,
          notes_internes: null,
          seuil_inactivite_mois: 3,
          horaires_ouverture: null,
          jours_fermeture_annuelle: null,
          entreprise_id: null,
          tournee_id: null,
          derniere_visite_at: null,
          derniere_commande_at: null,
          created_at: '2026-01-01T00:00:00+00:00',
          updated_at: '2026-01-01T00:00:00+00:00',
          deleted_at: null,
          contacts: [],
        },
      ],
    })

    const r = await executerOutil(
      'chercherEtablissements',
      { requete: 'cave', limite: 20 },
      null,
    )

    expect(r.ok).toBe(true)
    if (r.ok) {
      const parsed = JSON.parse(r.contenu)
      expect(Array.isArray(parsed)).toBe(true)
      // "cave" matche "cave du rhône" (toLowerCase), pas "restaurant le valais"
      expect(parsed.some((e: { enseigne: string }) => e.enseigne === 'Cave du Rhône')).toBe(true)
    }
  })

  it('retourne ok: false (Zod) pour une requête vide', async () => {
    const r = await executerOutil('chercherEtablissements', { requete: '' }, null)
    expect(r.ok).toBe(false)
    expect(mockLireEtablissements).not.toHaveBeenCalled()
  })
})

describe('executerOutil — lireVisites', () => {
  it('retourne ok: true avec JSON des visites', async () => {
    const fakeVisites = [
      { date_visite: '2026-07-20', duree_minutes: 60, notes: 'RAS', est_manquee: false },
    ]

    const mockLimit = vi.fn().mockResolvedValue({ data: fakeVisites, error: null })
    const mockOrder = vi.fn(() => ({ limit: mockLimit }))
    const mockIs = vi.fn(() => ({ order: mockOrder }))
    const mockEq = vi.fn(() => ({ is: mockIs }))
    const mockSelect = vi.fn(() => ({ eq: mockEq }))
    const mockFrom = vi.fn(() => ({ select: mockSelect }))

    mockCreateClient.mockResolvedValue({ from: mockFrom } as unknown as Awaited<ReturnType<typeof createClient>>)

    const r = await executerOutil(
      'lireVisites',
      { etablissement_id: '11111111-1111-4111-8111-111111111111', limite: 5 },
      null,
    )

    expect(r.ok).toBe(true)
    if (r.ok) {
      const parsed = JSON.parse(r.contenu)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].date_visite).toBe('2026-07-20')
    }
  })

  it('retourne ok: false (Zod) pour un UUID invalide', async () => {
    const r = await executerOutil(
      'lireVisites',
      { etablissement_id: 'pas-un-uuid', limite: 5 },
      null,
    )
    expect(r.ok).toBe(false)
  })
})
