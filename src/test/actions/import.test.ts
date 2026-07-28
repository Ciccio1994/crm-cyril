// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

vi.mock('@/lib/supabase/server')

import { previewImport, importerBatch } from '@/actions/import'
import { createClient } from '@/lib/supabase/server'

function buildFormData(sheets: { nom: string; data: unknown[][] }[]): FormData {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.data), s.nom)
  }
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const fd = new FormData()
  fd.append('fichier', blob, 'test.xlsx')
  return fd
}

function mockTournees(tournees: { id: string; nom: string }[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    is:     vi.fn().mockResolvedValue({ data: tournees, error: null }),
  }
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('previewImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renvoie un onglet par sheet avec tournée résolue par nom normalisé', async () => {
    const supabase = mockTournees([
      { id: 't1', nom: 'Sion - Savièse' },
      { id: 't2', nom: 'Anzère - Ayent' },
    ])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: 'Sion - Savièse', data: [['Enseigne'], ['Alpha']] },
      { nom: 'ANZERE - AYENT', data: [['Enseigne'], ['Beta'], ['Gamma']] },
    ])
    const res = await previewImport(fd)
    expect(res.erreur).toBeUndefined()
    expect(res.data!.onglets).toHaveLength(2)
    expect(res.data!.onglets[0].tourneeId).toBe('t1')
    expect(res.data!.onglets[1].tourneeId).toBe('t2')
    expect(res.data!.onglets[1].nbLignes).toBe(2)
    expect(res.data!.totalLignes).toBe(3)
  })

  it('marque tourneeId=null si aucun match', async () => {
    const supabase = mockTournees([{ id: 't1', nom: 'Sion - Savièse' }])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: 'Onglet Fantôme', data: [['Enseigne'], ['X']] },
    ])
    const res = await previewImport(fd)
    expect(res.data!.onglets[0].tourneeId).toBeNull()
    expect(res.data!.onglets[0].motifNonAssociee).toContain('Fantôme')
  })

  it('renvoie erreur si pas de fichier', async () => {
    const supabase = mockTournees([])
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const fd = new FormData()
    const res = await previewImport(fd)
    expect(res.erreur).toBeDefined()
  })
})

describe('importerBatch', () => {
  beforeEach(() => vi.clearAllMocks())

  function ligne(
    enseigne: string,
    cp: string | null,
    tourneeId: string,
    opts: Partial<{
      contact_nom: string
      contact_telephone: string
      contact_email: string
      contact_fonction: string
      telephone_principal: string
      email: string
    }> = {},
  ) {
    return {
      tourneeId,
      numeroLigneExcel: 2,
      nomOnglet: 'T',
      payload: {
        enseigne,
        statut: 'prospect' as const,
        adresse_ligne_1: null,
        code_postal: cp,
        ville: null,
        telephone_principal: opts.telephone_principal ?? null,
        email: opts.email ?? null,
        groupe_prix: null,
        contact_nom: opts.contact_nom ?? null,
        contact_fonction: opts.contact_fonction ?? null,
        contact_telephone: opts.contact_telephone ?? null,
        contact_email: opts.contact_email ?? null,
      },
    }
  }

  interface MockOpts {
    etabs?: { id: string; enseigne: string; code_postal: string | null; tournee_id: string }[]
    contacts?: { id: string; etablissement_id: string; nom: string }[]
    insertedEtabId?: string
  }

  function mockSupabase(opts: MockOpts = {}) {
    const etabs = opts.etabs ?? []
    const contacts = opts.contacts ?? []
    const insertedEtabId = opts.insertedEtabId ?? 'new_etab'

    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const updates: { table: string; payload: Record<string, unknown>; id: string }[] = []

    // Compteurs pour distinguer les appels select initiaux vs les upserts suivants
    let etabCall = 0
    let contactCall = 0

    return {
      supabase: {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'etablissement') {
            etabCall++
            if (etabCall === 1) {
              // Premier appel : SELECT existants
              return {
                select: vi.fn().mockReturnThis(),
                is:     vi.fn().mockReturnThis(),
                in:     vi.fn().mockResolvedValue({ data: etabs, error: null }),
              }
            }
            // Appels suivants : INSERT ou UPDATE
            return {
              insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
                inserts.push({ table: 'etablissement', payload: p })
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({
                    data: { id: insertedEtabId }, error: null,
                  }),
                }
              }),
              update: vi.fn().mockImplementation((p: Record<string, unknown>) => ({
                eq: vi.fn().mockImplementation((_col: string, id: string) => {
                  updates.push({ table: 'etablissement', payload: p, id })
                  return Promise.resolve({ data: null, error: null })
                }),
              })),
            }
          }
          if (table === 'contact') {
            contactCall++
            // Le SELECT initial n'est fait par le code que si des etabs existants
            // ont été trouvés. Sinon le code passe directement aux INSERT.
            if (contactCall === 1 && etabs.length > 0) {
              return {
                select: vi.fn().mockReturnThis(),
                is:     vi.fn().mockReturnThis(),
                in:     vi.fn().mockResolvedValue({ data: contacts, error: null }),
              }
            }
            return {
              insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
                inserts.push({ table: 'contact', payload: p })
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({ data: { id: 'new_c' }, error: null }),
                }
              }),
              update: vi.fn().mockImplementation((p: Record<string, unknown>) => ({
                eq: vi.fn().mockImplementation((_col: string, id: string) => {
                  updates.push({ table: 'contact', payload: p, id })
                  return Promise.resolve({ data: null, error: null })
                }),
              })),
            }
          }
          return {}
        }),
      },
      inserts,
      updates,
    }
  }

  it('crée établissement + contact si les deux sont neufs', async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Alpha', '1936', 't1', {
        contact_nom: 'Jean Dupont',
        contact_fonction: 'Sommelier',
        telephone_principal: '+41 27 000',
      }),
    ])
    expect(res.data!.etablissements.crees).toBe(1)
    expect(res.data!.contacts.crees).toBe(1)
    const insertContact = mock.inserts.find((i) => i.table === 'contact')
    expect(insertContact).toBeDefined()
    const p = insertContact!.payload
    expect(p.etablissement_id).toBe('e_new')
    expect(p.nom).toBe('Dupont')
    expect(p.prenom).toBe('Jean')
    expect(p.fonction).toBe('Sommelier')
    expect(p.est_principal).toBe(true)
    // Fallback tel : contact_telephone absent → utilise telephone_principal
    expect(p.telephone).toBe('+41 27 000')
  })

  it('met à jour établissement + contact si les deux existent (idempotence)', async () => {
    const mock = mockSupabase({
      etabs: [{ id: 'e1', enseigne: 'Alpha', code_postal: '1936', tournee_id: 't1' }],
      contacts: [{ id: 'c1', etablissement_id: 'e1', nom: 'Dupont' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Alpha', '1936', 't1', { contact_nom: 'Jean Dupont' }),
    ])
    expect(res.data!.etablissements.misAJour).toBe(1)
    expect(res.data!.contacts.misAJour).toBe(1)
    expect(mock.updates.some((u) => u.table === 'contact' && u.id === 'c1')).toBe(true)
  })

  it("ne crée pas de contact si contact_nom absent", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('Alpha', '1936', 't1')])
    expect(res.data!.etablissements.crees).toBe(1)
    expect(res.data!.contacts.crees).toBe(0)
  })

  it('cas insensible casse/accents sur enseigne (dédup établissement)', async () => {
    const mock = mockSupabase({
      etabs: [{ id: 'e1', enseigne: 'Café Alpha', code_postal: '1936', tournee_id: 't1' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('CAFE ALPHA', '1936', 't1')])
    expect(res.data!.etablissements.misAJour).toBe(1)
  })

  it('ignore une ligne sans tournée', async () => {
    const mock = mockSupabase({})
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const l = ligne('Alpha', '1936', '')
    l.tourneeId = ''
    const res = await importerBatch([l])
    expect(res.data!.etablissements.ignores).toBe(1)
    expect(res.data!.etablissements.crees).toBe(0)
    expect(res.data!.contacts.crees).toBe(0)
  })
})
