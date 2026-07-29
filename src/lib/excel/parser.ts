import * as XLSX from 'xlsx'
import { detecterMapping, type Mapping } from './mapping'
import { mapperGroupePrix, mapperStatut } from './normaliser'
import { parseJourExcel } from '@/lib/horaires/regles'
import type { Horaires, JourSemaine } from '@/types/horaires'
import type { StatutCommercial, GroupePrix } from '@/types/database'

export interface PayloadImport {
  enseigne: string
  code_schenk: string | null
  statut: StatutCommercial
  adresse_ligne_1: string | null
  code_postal: string | null
  ville: string | null
  telephone_principal: string | null
  telephone_mobile: string | null
  email: string | null
  groupe_prix: GroupePrix | null
  notes_internes: string | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  horaires_ouverture: Horaires | null
}

export interface LigneImport {
  numeroLigneExcel: number
  payload: PayloadImport
}

export interface OngletParse {
  nomOnglet: string
  headers: string[]
  colonnesInconnues: string[]
  ligneEntete: number
  lignes: LigneImport[]
}

function cell(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null
  const v = row[idx]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function buildNotesInternes(
  row: unknown[],
  mapping: Mapping,
  exclureNom1 = false,
  exclureNom2 = false,
): string | null {
  const nom1 = exclureNom1 ? null : cell(row, mapping.notes_nom_1)
  const nom2 = exclureNom2 ? null : cell(row, mapping.notes_nom_2)
  if (!nom1 && !nom2) return null
  const parts: string[] = []
  if (nom1) parts.push(`Nom raison sociale: ${nom1}`)
  if (nom2) parts.push(nom2)
  return parts.join(' / ')
}

// Mots-clés déclenchant la détection "adresse déguisée en enseigne".
// Rangés par ordre décroissant de fréquence pour lire vite. Case-insensitive.
const MOTS_CLES_ADRESSE = [
  'chemin', 'rue', 'route', 'rte', 'avenue', 'av.', 'av ',
  'impasse', 'chalet', 'batiment', 'bat.', 'bat ',
  'immeuble', 'place', 'ch.', 'ch ',
  'voie', 'sentier', 'passage',
]

// Retourne true si la valeur commence par un mot-clé adresse (case-insensitive,
// accents ignorés). Utilisé pour détecter les cas où la colonne "Adresse" de
// l'Excel Schenk contient une adresse au lieu du nom commercial (bug d'origine).
export function estAdresseDeguisee(valeur: string | null): boolean {
  if (!valeur) return false
  const n = valeur.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return MOTS_CLES_ADRESSE.some((m) => n.startsWith(m))
}

// Règle téléphones :
// - N° téléphone rempli, N° portable rempli    → principal = tel, mobile = portable
// - N° téléphone rempli, N° portable vide      → principal = tel, mobile = null
// - N° téléphone vide, N° portable rempli      → principal = portable (fallback), mobile = null
// - Les deux vides                             → null / null
function extraireTelephones(
  row: unknown[],
  mapping: Mapping,
): { telephone_principal: string | null; telephone_mobile: string | null } {
  const tel = cell(row, mapping.telephone_principal)
  const portable = cell(row, mapping.telephone_mobile)
  if (tel) {
    return { telephone_principal: tel, telephone_mobile: portable }
  }
  if (portable) {
    return { telephone_principal: portable, telephone_mobile: null }
  }
  return { telephone_principal: null, telephone_mobile: null }
}

export function parseLigne(
  row: unknown[],
  mapping: Mapping,
): PayloadImport | null {
  let enseigne = cell(row, mapping.enseigne)
  let adresse_ligne_1 = cell(row, mapping.adresse_ligne_1)
  let exclureNom1 = false
  let exclureNom2 = false

  // Correction "adresse déguisée en enseigne" :
  //
  // En format Schenk full, la colonne « Adresse » sert de nom commercial (enseigne).
  // Mais dans certaines lignes elle contient réellement une adresse (« Chemin de
  // Rossaix 12 ») et le vrai nom est dans « Nom 2 ». Si l'enseigne extraite
  // commence par un mot-clé adresse, on remonte enseigne depuis Nom 2 (fallback Nom)
  // et on déplace la valeur dans adresse_ligne_1.
  //
  // Ne s'applique que si notes_nom_1 ou notes_nom_2 sont mappés (format full Schenk).
  const enModeSchenkFull =
    mapping.notes_nom_1 !== undefined || mapping.notes_nom_2 !== undefined

  if (enModeSchenkFull && estAdresseDeguisee(enseigne)) {
    const nom2 = cell(row, mapping.notes_nom_2)
    const nom1 = cell(row, mapping.notes_nom_1)
    const nouveauNom = nom2 ?? nom1
    if (nouveauNom) {
      adresse_ligne_1 = enseigne
      enseigne = nouveauNom
      // Éviter de dupliquer dans notes_internes la valeur remontée en enseigne.
      if (nom2 !== null) exclureNom2 = true
      else if (nom1 !== null) exclureNom1 = true
    }
  }

  if (!enseigne) return null

  const { telephone_principal, telephone_mobile } = extraireTelephones(row, mapping)

  // Horaires : parse chaque colonne jour reconnue
  let horaires_ouverture: Horaires | null = null
  if (mapping.jours) {
    const h: Horaires = {}
    for (const [jour, idx] of Object.entries(mapping.jours) as [JourSemaine, number][]) {
      const val = cell(row, idx)
      const parsed = parseJourExcel(val)
      if (parsed !== undefined) h[jour] = parsed
    }
    if (Object.keys(h).length > 0) horaires_ouverture = h
  }

  return {
    enseigne,
    code_schenk:          cell(row, mapping.code_schenk),
    statut:               mapperStatut(cell(row, mapping.statut)),
    adresse_ligne_1,
    code_postal:          cell(row, mapping.code_postal),
    ville:                cell(row, mapping.ville),
    telephone_principal,
    telephone_mobile,
    email:                cell(row, mapping.email),
    groupe_prix:          mapperGroupePrix(cell(row, mapping.groupe_prix)),
    notes_internes:       buildNotesInternes(row, mapping, exclureNom1, exclureNom2),
    contact_nom:          cell(row, mapping.contact_nom),
    contact_fonction:     cell(row, mapping.contact_fonction),
    contact_telephone:    cell(row, mapping.contact_telephone),
    contact_email:        cell(row, mapping.contact_email),
    horaires_ouverture,
  }
}

function scoreMappingReconnu(m: Mapping): number {
  let score = 0
  if (m.enseigne !== undefined) score++
  if (m.adresse_ligne_1 !== undefined) score++
  if (m.code_postal !== undefined) score++
  if (m.ville !== undefined) score++
  if (m.telephone_principal !== undefined) score++
  if (m.telephone_mobile !== undefined) score++
  if (m.code_schenk !== undefined) score++
  if (m.groupe_prix !== undefined) score++
  return score
}

// Trouve la ligne d'en-tête en scannant les 10 premières lignes.
// Prend celle dont le mapping reconnaît le plus de champs (min. 2).
function trouverLigneEntete(rows: unknown[][]): number {
  let bestRow = 0
  let bestScore = 0
  const limite = Math.min(rows.length, 10)
  for (let i = 0; i < limite; i++) {
    const headers = (rows[i] ?? []).map((h) => String(h ?? ''))
    const mapping = detecterMapping(headers)
    const score = scoreMappingReconnu(mapping)
    if (score > bestScore) {
      bestScore = score
      bestRow = i
    }
  }
  return bestScore >= 2 ? bestRow : 0
}

export async function parseFichier(
  buffer: ArrayBuffer,
): Promise<OngletParse[]> {
  const wb = XLSX.read(buffer, { type: 'array' })
  const result: OngletParse[] = []

  for (const nomOnglet of wb.SheetNames) {
    const ws = wb.Sheets[nomOnglet]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
    })
    if (rows.length === 0) {
      result.push({
        nomOnglet, headers: [], colonnesInconnues: [], ligneEntete: 0, lignes: [],
      })
      continue
    }

    const ligneEntete = trouverLigneEntete(rows)
    const headers = (rows[ligneEntete] ?? []).map((h) => String(h ?? ''))
    const mapping = detecterMapping(headers)

    const lignes: LigneImport[] = []
    for (let i = ligneEntete + 1; i < rows.length; i++) {
      const payload = parseLigne(rows[i] ?? [], mapping)
      if (payload) {
        lignes.push({ numeroLigneExcel: i + 1, payload })
      }
    }

    result.push({
      nomOnglet,
      headers,
      colonnesInconnues: mapping.colonnesInconnues,
      ligneEntete,
      lignes,
    })
  }

  return result
}
