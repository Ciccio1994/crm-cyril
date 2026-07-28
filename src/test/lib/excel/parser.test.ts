import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseLigne, parseFichier } from '@/lib/excel/parser'
import { detecterMapping } from '@/lib/excel/mapping'

function buildXlsx(sheets: { nom: string; data: unknown[][] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.data)
    XLSX.utils.book_append_sheet(wb, ws, s.nom)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseLigne', () => {
  const headers = ['Enseigne', 'Adresse', 'CP', 'Ville', 'Tél', 'Email', 'Statut']
  const mapping = detecterMapping(headers)

  it('convertit une ligne complète en payload', () => {
    const row = [
      'Restaurant Alpha', 'Rue X 5', '1936', 'Verbier',
      '027 771 12 34', 'info@alpha.ch', 'client actif',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Restaurant Alpha')
    expect(p.adresse_ligne_1).toBe('Rue X 5')
    expect(p.code_postal).toBe('1936')
    expect(p.ville).toBe('Verbier')
    expect(p.telephone_principal).toBe('027 771 12 34')
    expect(p.email).toBe('info@alpha.ch')
    expect(p.statut).toBe('client_actif')
  })

  it('renvoie null si enseigne vide', () => {
    const row = ['', 'Rue X', '1936', 'Verbier', '', '', '']
    expect(parseLigne(row, mapping)).toBeNull()
  })

  it('renvoie null si ligne entièrement vide', () => {
    expect(parseLigne(['', '', '', '', '', '', ''], mapping)).toBeNull()
    expect(parseLigne([], mapping)).toBeNull()
  })

  it('champs absents → null dans le payload', () => {
    const mapMinimal = detecterMapping(['Enseigne'])
    const p = parseLigne(['Bar Beta'], mapMinimal)!
    expect(p.enseigne).toBe('Bar Beta')
    expect(p.ville).toBeNull()
    expect(p.email).toBeNull()
    expect(p.statut).toBe('prospect')
    expect(p.contact_nom).toBeNull()
    expect(p.contact_fonction).toBeNull()
    expect(p.contact_telephone).toBeNull()
    expect(p.contact_email).toBeNull()
  })

  it('conserve le code postal comme string (pas de conversion en number)', () => {
    const row = ['X', 'X', 1936, 'X', '', '', '']
    expect(parseLigne(row, mapping)!.code_postal).toBe('1936')
  })

  it('extrait les champs contact', () => {
    const headers = ['Enseigne', 'Contact', 'Fonction', 'Portable', 'Email contact']
    const m = detecterMapping(headers)
    const row = [
      'Café Gamma', 'Jean Dupont', 'Sommelier',
      '079 123 45 67', 'jean@gamma.ch',
    ]
    const p = parseLigne(row, m)!
    expect(p.contact_nom).toBe('Jean Dupont')
    expect(p.contact_fonction).toBe('Sommelier')
    expect(p.contact_telephone).toBe('079 123 45 67')
    expect(p.contact_email).toBe('jean@gamma.ch')
  })
})

describe('parseFichier', () => {
  it('renvoie un objet par onglet avec ses lignes', async () => {
    const buffer = buildXlsx([
      {
        nom: 'Sion - Savièse',
        data: [
          ['Enseigne', 'Ville'],
          ['Café A', 'Sion'],
          ['Café B', 'Savièse'],
        ],
      },
      {
        nom: 'Anzère - Ayent',
        data: [
          ['Nom', 'CP', 'Ville'],
          ['Hôtel C', '1971', 'Anzère'],
        ],
      },
    ])
    const result = await parseFichier(buffer)
    expect(result).toHaveLength(2)
    expect(result[0].nomOnglet).toBe('Sion - Savièse')
    expect(result[0].lignes).toHaveLength(2)
    expect(result[0].lignes[0].payload.enseigne).toBe('Café A')
    expect(result[1].nomOnglet).toBe('Anzère - Ayent')
    expect(result[1].lignes[0].payload.code_postal).toBe('1971')
  })

  it("ignore les lignes vides mais garde le n° de ligne Excel d'origine", async () => {
    const buffer = buildXlsx([
      {
        nom: 'Sion - Savièse',
        data: [
          ['Enseigne'],
          ['Café A'],
          [''],
          ['Café B'],
        ],
      },
    ])
    const result = await parseFichier(buffer)
    expect(result[0].lignes).toHaveLength(2)
    expect(result[0].lignes[0].numeroLigneExcel).toBe(2)
    expect(result[0].lignes[1].numeroLigneExcel).toBe(4)
  })
})
