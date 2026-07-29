// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

vi.mock('@/lib/supabase/server')

import {
  previewImport,
  importerBatch,
  reinitialiserImport,
  type LigneAImporter,
} from '@/actions/import'
import { createClient } from '@/lib/supabase/server'
import type { PayloadImport } from '@/lib/excel/parser'

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

  it('résout les tournées BDD par nom normalisé (matcher tolérant)', async () => {
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
    expect(res.data!.totalLignes).toBe(3)
  })

  it('marque tourneeId=null + motif si aucun match', async () => {
    const supabase = mockTournees([{ id: 't1', nom: 'Sion - Savièse' }])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: 'Onglet Fantôme', data: [['Enseigne'], ['X']] },
    ])
    const res = await previewImport(fd)
    expect(res.data!.onglets[0].tourneeId).toBeNull()
    expect(res.data!.onglets[0].sansTournee).toBe(false)
    expect(res.data!.onglets[0].motifNonAssociee).toContain('Fantôme')
  })

  it("marque sansTournee=true pour l'onglet 'Prospects' (import valide, tournée NULL)", async () => {
    const supabase = mockTournees([{ id: 't1', nom: 'Sion - Savièse' }])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: 'Prospects', data: [['Enseigne'], ['X']] },
    ])
    const res = await previewImport(fd)
    expect(res.data!.onglets[0].tourneeId).toBeNull()
    expect(res.data!.onglets[0].sansTournee).toBe(true)
    expect(res.data!.onglets[0].motifNonAssociee).toBeUndefined()
  })

  it("marque sansTournee=true pour '0. Autres - Fouly - Vernayaz'", async () => {
    const supabase = mockTournees([{ id: 't1', nom: 'Sion - Savièse' }])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: '0. Autres - Fouly - Vernayaz', data: [['Enseigne'], ['X']] },
    ])
    const res = await previewImport(fd)
    expect(res.data!.onglets[0].sansTournee).toBe(true)
    expect(res.data!.onglets[0].tourneeId).toBeNull()
  })

  it('renvoie erreur si pas de fichier', async () => {
    const supabase = mockTournees([])
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const fd = new FormData()
    const res = await previewImport(fd)
    expect(res.erreur).toBeDefined()
  })
})

// -----------------------------------------------------------------------------
// importerBatch
// -----------------------------------------------------------------------------

function makePayload(
  enseigne: string,
  code_postal: string | null,
  opts: Partial<PayloadImport> = {},
): PayloadImport {
  return {
    enseigne,
    code_schenk: opts.code_schenk ?? null,
    statut: opts.statut ?? 'prospect',
    adresse_ligne_1: opts.adresse_ligne_1 ?? null,
    code_postal,
    ville: opts.ville ?? null,
    telephone_principal: opts.telephone_principal ?? null,
    telephone_mobile: opts.telephone_mobile ?? null,
    email: opts.email ?? null,
    groupe_prix: opts.groupe_prix ?? null,
    notes_internes: opts.notes_internes ?? null,
    contact_nom: opts.contact_nom ?? null,
    contact_fonction: opts.contact_fonction ?? null,
    contact_telephone: opts.contact_telephone ?? null,
    contact_email: opts.contact_email ?? null,
    horaires_ouverture: opts.horaires_ouverture ?? null,
  }
}

function ligne(
  enseigne: string,
  cp: string | null,
  tourneeId: string | null,
  opts: Partial<PayloadImport> = {},
): LigneAImporter {
  return {
    tourneeId,
    numeroLigneExcel: 2,
    nomOnglet: 'T',
    payload: makePayload(enseigne, cp, opts),
  }
}

interface MockOpts {
  etabsBySchenk?: { id: string; code_schenk: string; horaires_ouverture?: unknown }[]
  etabsByEnseigne?: {
    id: string; enseigne: string; code_postal: string | null;
    tournee_id: string; horaires_ouverture?: unknown
  }[]
  contacts?: { id: string; etablissement_id: string; nom: string }[]
  insertedEtabId?: string
}

function mockSupabase(opts: MockOpts = {}) {
  const insertedEtabId = opts.insertedEtabId ?? 'new_etab'
  const inserts: { table: string; payload: Record<string, unknown> }[] = []
  const updates: { table: string; payload: Record<string, unknown>; id: string }[] = []

  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'etablissement') {
          return {
            select: vi.fn().mockImplementation(() => ({
              is: vi.fn().mockReturnThis(),
              in: vi.fn().mockImplementation((col: string) => {
                if (col === 'code_schenk') {
                  return Promise.resolve({
                    data: opts.etabsBySchenk ?? [], error: null,
                  })
                }
                if (col === 'tournee_id') {
                  return Promise.resolve({
                    data: opts.etabsByEnseigne ?? [], error: null,
                  })
                }
                return Promise.resolve({ data: [], error: null })
              }),
            })),
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
            delete: vi.fn().mockReturnThis(),
            gt: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'contact') {
          return {
            select: vi.fn().mockImplementation(() => ({
              is: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: opts.contacts ?? [], error: null,
              }),
            })),
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

describe('importerBatch — dédup par code_schenk (priorité #1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it("met à jour si un etab a le même code_schenk (même si tournée différente)", async () => {
    const mock = mockSupabase({
      etabsBySchenk: [{ id: 'e_existant', code_schenk: 'C0034046' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Hôtel de la Poste', '1936', 't1', { code_schenk: 'C0034046' }),
    ])
    expect(res.data!.etablissements.misAJour).toBe(1)
    expect(res.data!.etablissements.crees).toBe(0)
    expect(mock.updates.some((u) => u.table === 'etablissement' && u.id === 'e_existant')).toBe(true)
  })

  it("crée si code_schenk absent en BDD", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Alpha', '1936', 't1', { code_schenk: 'C_NEW' }),
    ])
    expect(res.data!.etablissements.crees).toBe(1)
    const insertPayload = mock.inserts.find((i) => i.table === 'etablissement')!.payload
    expect(insertPayload.code_schenk).toBe('C_NEW')
  })
})

describe('importerBatch — first-write-wins horaires', () => {
  beforeEach(() => vi.clearAllMocks())

  it("n'écrase PAS horaires_ouverture si etab existant en a déjà", async () => {
    const horairesExistants = {
      lundi: [{ debut: '08:00', fin: '18:00' }],
    }
    const mock = mockSupabase({
      etabsBySchenk: [
        {
          id: 'e_existant', code_schenk: 'C001',
          horaires_ouverture: horairesExistants,
        },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('X', '1936', 't1', {
        code_schenk: 'C001',
        horaires_ouverture: {
          lundi: [{ debut: '09:00', fin: '17:00' }],  // Excel différent
        },
      }),
    ])
    expect(res.data!.etablissements.misAJour).toBe(1)
    const upd = mock.updates.find((u) => u.table === 'etablissement')!
    expect(upd.payload.horaires_ouverture).toBeUndefined()
  })

  it("écrit horaires_ouverture si etab existant a horaires null en BDD", async () => {
    const mock = mockSupabase({
      etabsBySchenk: [
        { id: 'e_existant', code_schenk: 'C001', horaires_ouverture: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const horairesExcel = { lundi: [{ debut: '09:00', fin: '17:00' }] }
    await importerBatch([
      ligne('X', '1936', 't1', {
        code_schenk: 'C001',
        horaires_ouverture: horairesExcel,
      }),
    ])
    const upd = mock.updates.find((u) => u.table === 'etablissement')!
    expect(upd.payload.horaires_ouverture).toEqual(horairesExcel)
  })

  it("écrit horaires_ouverture pour un nouvel etab (INSERT)", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const horairesExcel = { mardi: [{ debut: '08:00', fin: '18:00' }] }
    await importerBatch([
      ligne('Nouveau', '1936', 't1', {
        code_schenk: 'C_NEW',
        horaires_ouverture: horairesExcel,
      }),
    ])
    const ins = mock.inserts.find((i) => i.table === 'etablissement')!
    expect(ins.payload.horaires_ouverture).toEqual(horairesExcel)
  })
})

describe('importerBatch — dédup par enseigne + cp + tournée (priorité #2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it("met à jour si enseigne+cp+tournée existe (sans code_schenk côté Excel)", async () => {
    const mock = mockSupabase({
      etabsByEnseigne: [{ id: 'e1', enseigne: 'Alpha', code_postal: '1936', tournee_id: 't1' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('Alpha', '1936', 't1')])
    expect(res.data!.etablissements.misAJour).toBe(1)
  })

  it("insensible à la casse et aux accents sur l'enseigne", async () => {
    const mock = mockSupabase({
      etabsByEnseigne: [{ id: 'e1', enseigne: 'Café Alpha', code_postal: '1936', tournee_id: 't1' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('CAFE ALPHA', '1936', 't1')])
    expect(res.data!.etablissements.misAJour).toBe(1)
  })
})

describe('importerBatch — tournée null (Prospects/Autres)', () => {
  beforeEach(() => vi.clearAllMocks())

  it("insère avec tournee_id=NULL si tourneeId=null (onglet Prospects)", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_p1' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Prospect X', null, null, { statut: 'prospect' }),
    ])
    expect(res.data!.etablissements.crees).toBe(1)
    const insertPayload = mock.inserts.find((i) => i.table === 'etablissement')!.payload
    expect(insertPayload.tournee_id).toBeNull()
  })
})

describe('importerBatch — contacts principaux', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crée le contact principal si contact_nom présent', async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Alpha', '1936', 't1', {
        contact_nom: 'Jean Dupont',
        telephone_principal: '+41 27 000',
      }),
    ])
    expect(res.data!.contacts.crees).toBe(1)
    const contactInsert = mock.inserts.find((i) => i.table === 'contact')!.payload
    expect(contactInsert.nom).toBe('Dupont')
    expect(contactInsert.prenom).toBe('Jean')
    expect(contactInsert.telephone).toBe('+41 27 000')  // fallback
    expect(contactInsert.est_principal).toBe(true)
  })

  it("ne crée pas de contact si contact_nom absent", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('Alpha', '1936', 't1')])
    expect(res.data!.contacts.crees).toBe(0)
  })
})

describe('importerBatch — notes_internes', () => {
  beforeEach(() => vi.clearAllMocks())

  it("écrit notes_internes dans l'INSERT établissement", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    await importerBatch([
      ligne('Hôtel de la Poste', '1936', 't1', {
        notes_internes: 'Nom raison sociale: MCB Sàrl',
      }),
    ])
    const insertPayload = mock.inserts.find((i) => i.table === 'etablissement')!.payload
    expect(insertPayload.notes_internes).toBe('Nom raison sociale: MCB Sàrl')
  })
})

// -----------------------------------------------------------------------------
// reinitialiserImport
// -----------------------------------------------------------------------------

describe('reinitialiserImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('supprime tous les établissements (contacts + visites cascade)', async () => {
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      gt:     vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const countChain = {
      select: vi.fn().mockResolvedValue({ count: 42, data: null, error: null }),
    }
    let call = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        call++
        return call === 1 ? countChain : deleteChain
      }),
    }
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await reinitialiserImport()
    expect(res.erreur).toBeUndefined()
    expect(res.data!.supprimes).toBe(42)
    expect(deleteChain.delete).toHaveBeenCalled()
    // Vérifie qu'on ne touche PAS la table `tournee`
    expect(supabase.from).not.toHaveBeenCalledWith('tournee')
  })
})
