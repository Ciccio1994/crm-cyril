// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

vi.mock('@/lib/supabase/server')

import { previewImport } from '@/actions/import'
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
