'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFichier, type LigneImport } from '@/lib/excel/parser'
import { normaliserTournee } from '@/lib/excel/normaliser'

export interface OngletPreview {
  nomOnglet: string
  tourneeId: string | null
  tourneeDb: string | null
  motifNonAssociee?: string
  nbLignes: number
  colonnesInconnues: string[]
  lignes: LigneImport[]
}

export interface PreviewImport {
  onglets: OngletPreview[]
  totalLignes: number
}

type ActionResult<T> = { data?: T; erreur?: string }

export async function previewImport(
  formData: FormData,
): Promise<ActionResult<PreviewImport>> {
  const fichier = formData.get('fichier')
  if (!(fichier instanceof Blob) || fichier.size === 0) {
    return { erreur: 'Aucun fichier reçu' }
  }

  const buffer = await fichier.arrayBuffer()
  const onglets = await parseFichier(buffer)

  const supabase = await createClient()
  const { data: tourneesDb, error } = await supabase
    .from('tournee')
    .select('id, nom')
    .is('deleted_at', null)
  if (error) return { erreur: `Erreur BDD tournées : ${error.message}` }

  const index = new Map<string, { id: string; nom: string }>()
  for (const t of tourneesDb ?? []) {
    index.set(normaliserTournee(t.nom), { id: t.id, nom: t.nom })
  }

  let totalLignes = 0
  const previews: OngletPreview[] = onglets.map((o) => {
    const cle = normaliserTournee(o.nomOnglet)
    const match = index.get(cle) ?? null
    totalLignes += o.lignes.length
    return {
      nomOnglet: o.nomOnglet,
      tourneeId: match?.id ?? null,
      tourneeDb: match?.nom ?? null,
      motifNonAssociee: match
        ? undefined
        : `Onglet "${o.nomOnglet}" — aucune tournée BDD correspondante`,
      nbLignes: o.lignes.length,
      colonnesInconnues: o.colonnesInconnues,
      lignes: o.lignes,
    }
  })

  return { data: { onglets: previews, totalLignes } }
}
