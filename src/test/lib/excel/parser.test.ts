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

const HEADERS_SCHENK = [
  'N°', 'Nom', 'Ventes DS', 'Nom 2',
  'Adresse', 'Adresse (2ème ligne)', 'Ville', 'Code postal',
  'N° téléphone', 'N° portable', 'Contact', 'Groupe prix client',
]

describe('parseLigne — structure Schenk full', () => {
  const mapping = detecterMapping(HEADERS_SCHENK)

  it('enseigne = valeur de Adresse (col 4)', () => {
    const row = [
      'C0034046', 'MCB Hospitality Sàrl', '', '',
      'Hôtel de la Poste', 'Rue du Bourg 22', 'Verbier', '1936',
      '027 771 12 34', '079 555 44 33', '', 'HORECA',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Hôtel de la Poste')
    expect(p.code_schenk).toBe('C0034046')
    expect(p.adresse_ligne_1).toBe('Rue du Bourg 22')
    expect(p.ville).toBe('Verbier')
    expect(p.code_postal).toBe('1936')
    expect(p.telephone_principal).toBe('027 771 12 34')
    expect(p.telephone_mobile).toBe('079 555 44 33')
    expect(p.groupe_prix).toBe('HORECA')
  })

  it('notes_internes = "Nom raison sociale: X" quand Nom seul rempli', () => {
    const row = [
      'C1', 'MCB Hospitality Sàrl', '', '',
      'Hôtel de la Poste', 'Rue X', 'Verbier', '1936',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.notes_internes).toBe('Nom raison sociale: MCB Hospitality Sàrl')
  })

  it('notes_internes concatène Nom + " / " + Nom 2 si les deux remplis', () => {
    const row = [
      'C1', 'MCB Hospitality Sàrl', '', 'La Marlénaz',
      'Hôtel de la Poste', 'Rue X', 'Verbier', '1936',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.notes_internes).toBe(
      'Nom raison sociale: MCB Hospitality Sàrl / La Marlénaz',
    )
  })

  it('notes_internes = null si ni Nom ni Nom 2', () => {
    const row = [
      'C1', '', '', '',
      'Hôtel de la Poste', 'Rue X', 'Verbier', '1936',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.notes_internes).toBeNull()
  })

  it('telephone_mobile en fallback vers telephone_principal si col téléphone vide', () => {
    const row = [
      'C1', 'X', '', '',
      'Hôtel de la Poste', 'Rue X', 'Verbier', '1936',
      '', '079 555 44 33', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.telephone_principal).toBe('079 555 44 33')
    expect(p.telephone_mobile).toBeNull()
  })

  it('renvoie null si Adresse (= enseigne) vide en full Schenk', () => {
    const row = [
      'C1', 'MCB', '', '',
      '', 'Rue X', 'Verbier', '1936',
      '', '', '', '',
    ]
    expect(parseLigne(row, mapping)).toBeNull()
  })
})

describe('parseLigne — format simple', () => {
  const mapping = detecterMapping(['Enseigne', 'Adresse', 'CP', 'Ville', 'Tél', 'Email'])

  it('convertit une ligne complète (Enseigne = col 0)', () => {
    const row = [
      'Restaurant Alpha', 'Rue X 5', '1936', 'Verbier',
      '027 771 12 34', 'info@alpha.ch',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Restaurant Alpha')
    expect(p.adresse_ligne_1).toBe('Rue X 5')
    expect(p.code_postal).toBe('1936')
    expect(p.ville).toBe('Verbier')
    expect(p.telephone_principal).toBe('027 771 12 34')
    expect(p.email).toBe('info@alpha.ch')
  })

  it('renvoie null si enseigne vide', () => {
    expect(parseLigne(['', 'Rue X', '1936', 'Verbier', '', ''], mapping)).toBeNull()
  })

  it('renvoie null si ligne entièrement vide', () => {
    expect(parseLigne([], mapping)).toBeNull()
  })
})

describe('parseLigne — horaires', () => {
  it('parse les colonnes jours en horaires_ouverture', () => {
    const headers = ['Nom', 'Lundi', 'Mardi', 'Mercredi']
    const m = detecterMapping(headers)
    const p = parseLigne(['Café X', '8h-18h', 'Fermé', ''], m)!
    expect(p.horaires_ouverture).toEqual({
      lundi: [{ debut: '08:00', fin: '18:00' }],
      mardi: null,
    })
  })

  it('horaires_ouverture = null si aucun jour reconnu', () => {
    const m = detecterMapping(['Enseigne', 'Ville'])
    const p = parseLigne(['Café Y', 'Sion'], m)!
    expect(p.horaires_ouverture).toBeNull()
  })

  it('double créneau parsé correctement', () => {
    const headers = ['Nom', 'Lundi']
    const m = detecterMapping(headers)
    const p = parseLigne(['Café Z', '8h-12h / 14h-18h'], m)!
    expect(p.horaires_ouverture).toEqual({
      lundi: [
        { debut: '08:00', fin: '12:00' },
        { debut: '14:00', fin: '18:00' },
      ],
    })
  })
})

describe('parseFichier — détection auto de la ligne d\'en-tête', () => {
  it('trouve la ligne header même en ligne 3 (précédée de 2 lignes de titre)', async () => {
    const buffer = buildXlsx([
      {
        nom: 'Sion - Savièse',
        data: [
          ['Extract Schenk 2026', '', '', ''],  // ligne 1 : titre
          ['Généré le', '2026-07-29', '', ''],  // ligne 2 : métadonnées
          ['N°', 'Nom', 'Adresse', 'Adresse (2ème ligne)'],  // ligne 3 : vrai header
          ['C1', 'MCB', 'Hôtel Post', 'Rue X'],
        ],
      },
    ])
    const result = await parseFichier(buffer)
    expect(result[0].lignes).toHaveLength(1)
    expect(result[0].lignes[0].payload.code_schenk).toBe('C1')
    expect(result[0].lignes[0].payload.enseigne).toBe('Hôtel Post')
    expect(result[0].lignes[0].numeroLigneExcel).toBe(4)
  })

  it('trouve le header en ligne 1 par défaut', async () => {
    const buffer = buildXlsx([
      {
        nom: 'Sion - Savièse',
        data: [
          ['Enseigne', 'Ville'],
          ['Café A', 'Sion'],
        ],
      },
    ])
    const result = await parseFichier(buffer)
    expect(result[0].lignes).toHaveLength(1)
    expect(result[0].lignes[0].payload.enseigne).toBe('Café A')
    expect(result[0].lignes[0].numeroLigneExcel).toBe(2)
  })

  it('ignore les lignes vides mais garde le n° de ligne Excel', async () => {
    const buffer = buildXlsx([
      {
        nom: 'X',
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
