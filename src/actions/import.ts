'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFichier, type LigneImport, type PayloadImport } from '@/lib/excel/parser'
import { normaliserHeader, normaliserTournee } from '@/lib/excel/normaliser'
import { splitContactName } from '@/lib/contact-picker'

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

// -----------------------------------------------------------------------------
// importerBatch — insère/met à jour établissements + contacts principaux
// -----------------------------------------------------------------------------

export interface LigneAImporter {
  tourneeId: string
  numeroLigneExcel: number
  nomOnglet: string
  payload: PayloadImport
}

export interface RapportImport {
  etablissements: { crees: number; misAJour: number; ignores: number }
  contacts:       { crees: number; misAJour: number }
  erreurs: { onglet: string; ligne: number; message: string }[]
}

function cleDedup(enseigne: string, cp: string | null): string {
  return `${normaliserHeader(enseigne)}|${cp ?? ''}`
}

function construireContactPayload(
  etablissementId: string,
  p: PayloadImport,
): {
  nom: string
  prenom: string | null
  fonction: string | null
  telephone: string | null
  email: string | null
  etablissement_id: string
  est_principal: boolean
} | null {
  if (!p.contact_nom) return null
  const { prenom, nom } = splitContactName(p.contact_nom)
  return {
    etablissement_id: etablissementId,
    nom: nom ?? p.contact_nom,
    prenom: prenom ?? null,
    fonction: p.contact_fonction,
    telephone: p.contact_telephone ?? p.telephone_principal,
    email:     p.contact_email     ?? p.email,
    est_principal: true,
  }
}

export async function importerBatch(
  lignes: LigneAImporter[],
): Promise<ActionResult<RapportImport>> {
  const rapport: RapportImport = {
    etablissements: { crees: 0, misAJour: 0, ignores: 0 },
    contacts:       { crees: 0, misAJour: 0 },
    erreurs: [],
  }
  if (lignes.length === 0) return { data: rapport }

  const supabase = await createClient()

  const tourneeIds = Array.from(
    new Set(lignes.map((l) => l.tourneeId).filter(Boolean)),
  )
  if (tourneeIds.length === 0) {
    rapport.etablissements.ignores = lignes.length
    return { data: rapport }
  }

  // Étape 1 : index établissements existants
  const { data: existantsEtabs, error: errE } = await supabase
    .from('etablissement')
    .select('id, enseigne, code_postal, tournee_id')
    .is('deleted_at', null)
    .in('tournee_id', tourneeIds)
  if (errE) return { erreur: `Erreur lecture etabs : ${errE.message}` }

  const indexEtab = new Map<string, string>()
  for (const e of existantsEtabs ?? []) {
    indexEtab.set(
      `${e.tournee_id}::${cleDedup(e.enseigne, e.code_postal)}`,
      e.id,
    )
  }

  // Étape 2 : index contacts existants (uniquement pour les etabs existants —
  //           les etabs qu'on va créer n'ont par définition aucun contact)
  const etabIdsConnus = Array.from(
    new Set((existantsEtabs ?? []).map((e) => e.id)),
  )
  const indexContact = new Map<string, string>()
  if (etabIdsConnus.length > 0) {
    const { data: existantsContacts, error: errC } = await supabase
      .from('contact')
      .select('id, etablissement_id, nom')
      .is('deleted_at', null)
      .in('etablissement_id', etabIdsConnus)
    if (errC) return { erreur: `Erreur lecture contacts : ${errC.message}` }
    for (const c of existantsContacts ?? []) {
      indexContact.set(
        `${c.etablissement_id}::${normaliserHeader(c.nom)}`,
        c.id,
      )
    }
  }

  // Étape 3 : traitement ligne par ligne (etab d'abord, puis contact)
  for (const l of lignes) {
    if (!l.tourneeId) {
      rapport.etablissements.ignores++
      continue
    }
    const cleEtab = `${l.tourneeId}::${cleDedup(l.payload.enseigne, l.payload.code_postal)}`
    let etabId: string | null = indexEtab.get(cleEtab) ?? null

    const dbPayloadEtab = {
      enseigne:            l.payload.enseigne,
      statut:              l.payload.statut,
      adresse_ligne_1:     l.payload.adresse_ligne_1,
      code_postal:         l.payload.code_postal,
      ville:               l.payload.ville,
      telephone_principal: l.payload.telephone_principal,
      email:               l.payload.email,
      groupe_prix:         l.payload.groupe_prix,
      tournee_id:          l.tourneeId,
    }

    try {
      if (etabId) {
        const { error: upErr } = await supabase
          .from('etablissement')
          .update(dbPayloadEtab)
          .eq('id', etabId)
        if (upErr) throw new Error(`etab update: ${upErr.message}`)
        rapport.etablissements.misAJour++
      } else {
        const { data: newE, error: insErr } = await supabase
          .from('etablissement')
          .insert(dbPayloadEtab)
          .select()
          .single()
        if (insErr || !newE) throw new Error(`etab insert: ${insErr?.message ?? 'no data'}`)
        etabId = newE.id as string
        indexEtab.set(cleEtab, etabId)
        rapport.etablissements.crees++
      }
    } catch (e) {
      rapport.erreurs.push({
        onglet: l.nomOnglet,
        ligne: l.numeroLigneExcel,
        message: e instanceof Error ? e.message : 'Erreur inconnue',
      })
      continue
    }

    // Contact principal (optionnel)
    const contactPayload = construireContactPayload(etabId!, l.payload)
    if (!contactPayload) continue

    const cleContact = `${etabId}::${normaliserHeader(contactPayload.nom)}`
    const contactExistantId = indexContact.get(cleContact)

    try {
      if (contactExistantId) {
        const { error: upErr } = await supabase
          .from('contact')
          .update(contactPayload)
          .eq('id', contactExistantId)
        if (upErr) throw new Error(`contact update: ${upErr.message}`)
        rapport.contacts.misAJour++
      } else {
        const { data: newC, error: insErr } = await supabase
          .from('contact')
          .insert(contactPayload)
          .select()
          .single()
        if (insErr || !newC) throw new Error(`contact insert: ${insErr?.message ?? 'no data'}`)
        indexContact.set(cleContact, newC.id as string)
        rapport.contacts.crees++
      }
    } catch (e) {
      rapport.erreurs.push({
        onglet: l.nomOnglet,
        ligne: l.numeroLigneExcel,
        message: e instanceof Error ? e.message : 'Erreur contact inconnue',
      })
    }
  }

  return { data: rapport }
}
