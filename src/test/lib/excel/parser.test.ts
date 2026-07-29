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

describe('parseLigne — heuristique "adresse déguisée en enseigne"', () => {
  const mapping = detecterMapping(HEADERS_SCHENK)

  it('cas signalé : ACP Sàrl / Maison Cocotte / Chemin de Rossaix 12', () => {
    // Col Adresse contient une vraie adresse ; Nom 2 contient le vrai nom.
    const row = [
      'C99999', 'ACP Sàrl', '', 'Maison Cocotte',
      'Chemin de Rossaix 12', '1955 Chamoson', 'Chamoson', '1955',
      '027 000 00 00', '', '', 'HORECA',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Maison Cocotte')
    expect(p.adresse_ligne_1).toBe('Chemin de Rossaix 12')
    // notes_internes ne doit pas contenir "Maison Cocotte" (déjà remonté en enseigne)
    expect(p.notes_internes).toBe('Nom raison sociale: ACP Sàrl')
  })

  it('Nom 2 vide → fallback sur Nom (col 3) comme enseigne', () => {
    const row = [
      'C1', 'Hôtel de la Poste', '', '',
      'Rue du Bourg 22', 'Bourg-en-Verbier', 'Verbier', '1936',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Hôtel de la Poste')
    expect(p.adresse_ligne_1).toBe('Rue du Bourg 22')
    // notes_internes vide : Nom a été remonté en enseigne
    expect(p.notes_internes).toBeNull()
  })

  it('Chalet Blanc en col Adresse + Cave X en Nom → enseigne = Cave X', () => {
    const row = [
      'C2', 'Cave X', '', '',
      'Chalet Blanc 5', 'Route du Vin', 'Fully', '1926',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Cave X')
    expect(p.adresse_ligne_1).toBe('Chalet Blanc 5')
  })

  it('col Adresse commence par un vrai nom (ex "Le Chemineau") → PAS de swap', () => {
    // "Le Chemineau" ne commence pas par "chemin" (le mot est "le")
    const row = [
      'C3', 'Bar Y', '', 'Nom 2 ignoré',
      'Le Chemineau', 'Rue X 12', 'Sion', '1950',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Le Chemineau')
    expect(p.adresse_ligne_1).toBe('Rue X 12')
  })

  it('accents dans le mot-clé ("Bâtiment") détectés', () => {
    const row = [
      'C4', 'Société Z', '', 'Restaurant Réel',
      'Bâtiment A, 3ème étage', 'Rue X', 'Sion', '1950',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Restaurant Réel')
    expect(p.adresse_ligne_1).toBe('Bâtiment A, 3ème étage')
  })

  it('col Adresse commence par mot-clé MAIS Nom 2 et Nom vides → conserve la valeur (pas de swap possible)', () => {
    const row = [
      'C5', '', '', '',
      'Chemin de Palézieux 5', 'Sion Sud', 'Sion', '1950',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    // Fallback : conserve la valeur d'origine dans enseigne (sinon on perdrait la ligne)
    expect(p.enseigne).toBe('Chemin de Palézieux 5')
  })

  it('heuristique inactive en format simple (pas de notes_nom)', () => {
    const mSimple = detecterMapping(['Enseigne', 'Adresse', 'CP', 'Ville'])
    const row = ['Cave Chemin', 'Rue X 5', '1950', 'Sion']
    // Enseigne provient de col 0 en format simple, pas de swap possible ni nécessaire
    const p = parseLigne(row, mSimple)!
    expect(p.enseigne).toBe('Cave Chemin')
    expect(p.adresse_ligne_1).toBe('Rue X 5')
  })
})

describe('parseLigne — fallback "nom personne physique" (FIX terrain 2026-07)', () => {
  const mapping = detecterMapping(HEADERS_SCHENK)

  it('cas signalé : Nom = "M. Alberto Santos" (personne), Nom 2 vide → enseigne = "M. Alberto Santos" (dernier fallback + badge en UI)', () => {
    const row = [
      'C0025641', 'M. Alberto Santos', '', '',
      'Rte cantonale 186', '1963 Vétroz', 'Vétroz', '1963',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    // Faute de raison sociale ailleurs, on garde le nom personne comme enseigne
    // (mieux que garder l'adresse). Le badge "vérifier" s'affichera sur la fiche.
    expect(p.enseigne).toBe('M. Alberto Santos')
    expect(p.adresse_ligne_1).toBe('Rte cantonale 186')
  })

  it('Nom = "Cambuse d\'Alberto Sàrl" (raison sociale) → enseigne = raison sociale', () => {
    const row = [
      'C1', "Cambuse d'Alberto Sàrl", '', '',
      'Rte X 5', 'Vétroz', 'Vétroz', '1963',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe("Cambuse d'Alberto Sàrl")
    expect(p.adresse_ligne_1).toBe('Rte X 5')
  })

  it('Nom = "Jean-Marc Fellay" (personne), Nom 2 = "Le Dahu" → enseigne = "Le Dahu"', () => {
    const row = [
      'C2', 'Jean-Marc Fellay', '', 'Le Dahu',
      'Route XY', 'Verbier', 'Verbier', '1936',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Le Dahu')
    expect(p.adresse_ligne_1).toBe('Route XY')
  })

  it('EXCEPTION mot-clé commercial : Nom = "Cave Fellay" → enseigne = "Cave Fellay" (pas nom personne)', () => {
    const row = [
      'C3', 'Cave Fellay', '', '',
      'Route XY', 'Fully', 'Fully', '1926',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Cave Fellay')
    expect(p.adresse_ligne_1).toBe('Route XY')
  })

  it('Nom = personne, Nom 2 = personne aussi → utilise Nom 2 quand même (mieux que garder adresse)', () => {
    const row = [
      'C4', 'M. Alberto Santos', '', 'Paula Santos',
      'Rte X', 'Sion', 'Sion', '1950',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    // Priorité Nom 2 en dernier recours (même si aussi personne)
    expect(p.enseigne).toBe('Paula Santos')
  })

  it('Priorité raison sociale : Nom = personne, Nom 2 = "Cambuse Sàrl" → enseigne = Nom 2', () => {
    const row = [
      'C5', 'M. Alberto Santos', '', 'Cambuse d\'Alberto Sàrl',
      'Rte X', 'Sion', 'Sion', '1950',
      '', '', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe("Cambuse d'Alberto Sàrl")
  })
})

describe('parseLigne — swap fixe/mobile (FIX terrain 2026-07 Cedric Taramarcaz)', () => {
  const mapping = detecterMapping(HEADERS_SCHENK)

  it('cas signalé : col 9 = mobile 076..., col 10 = fixe 027... → INVERSE (fixe en principal)', () => {
    const row = [
      'C0036589', 'Cedric Taramarcaz', '', 'Café Le Central',
      "Rue de l'Église 51", '1926 Fully', 'Fully', '1926',
      '+41 76 452 71 70', '+41 27 746 34 83', '', 'HORECA',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.telephone_principal).toBe('+41 27 746 34 83')  // fixe → principal
    expect(p.telephone_mobile).toBe('+41 76 452 71 70')     // mobile → secondaire
  })

  it('ordre normal : col 9 = fixe, col 10 = mobile → ordre conservé', () => {
    const row = [
      'C1', 'X', '', 'Restaurant Y',
      'Rue X', 'Ville', 'Ville', '1950',
      '027 771 12 34', '079 555 44 33', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.telephone_principal).toBe('027 771 12 34')
    expect(p.telephone_mobile).toBe('079 555 44 33')
  })

  it('deux fixes : ordre Excel conservé', () => {
    const row = [
      'C2', 'X', '', 'Restaurant Y',
      'Rue X', 'Ville', 'Ville', '1950',
      '027 111 11 11', '027 222 22 22', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.telephone_principal).toBe('027 111 11 11')
    expect(p.telephone_mobile).toBe('027 222 22 22')
  })

  it('deux mobiles : ordre Excel conservé', () => {
    const row = [
      'C3', 'X', '', 'Restaurant Y',
      'Rue X', 'Ville', 'Ville', '1950',
      '079 111 11 11', '076 222 22 22', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.telephone_principal).toBe('079 111 11 11')
    expect(p.telephone_mobile).toBe('076 222 22 22')
  })

  it('un seul renseigné (fixe en col 10) : passe en principal', () => {
    const row = [
      'C4', 'X', '', 'Restaurant Y',
      'Rue X', 'Ville', 'Ville', '1950',
      '', '027 234 12 34', '', '',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.telephone_principal).toBe('027 234 12 34')
    expect(p.telephone_mobile).toBeNull()
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
