import * as XLSX from 'xlsx'
import { detecterMapping, type Mapping } from './mapping'
import { mapperGroupePrix, mapperStatut } from './normaliser'
import type { StatutCommercial, GroupePrix } from '@/types/database'

export interface PayloadImport {
  enseigne: string
  statut: StatutCommercial
  adresse_ligne_1: string | null
  code_postal: string | null
  ville: string | null
  telephone_principal: string | null
  email: string | null
  groupe_prix: GroupePrix | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
}

export interface LigneImport {
  numeroLigneExcel: number
  payload: PayloadImport
}

export interface OngletParse {
  nomOnglet: string
  headers: string[]
  colonnesInconnues: string[]
  lignes: LigneImport[]
}

function cell(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null
  const v = row[idx]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function parseLigne(
  row: unknown[],
  mapping: Mapping,
): PayloadImport | null {
  const enseigne = cell(row, mapping.enseigne)
  if (!enseigne) return null

  return {
    enseigne,
    statut: mapperStatut(cell(row, mapping.statut)),
    adresse_ligne_1:      cell(row, mapping.adresse_ligne_1),
    code_postal:          cell(row, mapping.code_postal),
    ville:                cell(row, mapping.ville),
    telephone_principal:  cell(row, mapping.telephone_principal),
    email:                cell(row, mapping.email),
    groupe_prix:          mapperGroupePrix(cell(row, mapping.groupe_prix)),
    contact_nom:          cell(row, mapping.contact_nom),
    contact_fonction:     cell(row, mapping.contact_fonction),
    contact_telephone:    cell(row, mapping.contact_telephone),
    contact_email:        cell(row, mapping.contact_email),
  }
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
      result.push({ nomOnglet, headers: [], colonnesInconnues: [], lignes: [] })
      continue
    }
    const headers = (rows[0] ?? []).map((h) => String(h ?? ''))
    const mapping = detecterMapping(headers)

    const lignes: LigneImport[] = []
    for (let i = 1; i < rows.length; i++) {
      const payload = parseLigne(rows[i] ?? [], mapping)
      if (payload) {
        lignes.push({ numeroLigneExcel: i + 1, payload })
      }
    }

    result.push({
      nomOnglet,
      headers,
      colonnesInconnues: mapping.colonnesInconnues,
      lignes,
    })
  }

  return result
}
