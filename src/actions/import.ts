'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFichier, type LigneImport, type PayloadImport } from '@/lib/excel/parser'
import { normaliserHeader } from '@/lib/excel/normaliser'
import { mapperTournee } from '@/lib/excel/tournee-matcher'
import { splitContactName } from '@/lib/contact-picker'
import type { Horaires } from '@/types/horaires'

// -----------------------------------------------------------------------------
// Détection onglets « sans tournée » (import valide, tournee_id=NULL)
// -----------------------------------------------------------------------------
function estOngletSansTournee(nom: string): boolean {
  const n = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (n === 'prospects') return true
  if (n.startsWith('0.') && n.includes('autres')) return true
  if (n === 'autres') return true
  return false
}

// -----------------------------------------------------------------------------
// previewImport
// -----------------------------------------------------------------------------

export interface OngletPreview {
  nomOnglet: string
  tourneeId: string | null
  tourneeDb: string | null
  sansTournee: boolean          // true = onglet special (Prospects/Autres) importable sans tournée
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

  const candidats = (tourneesDb ?? []).map((t) => ({ id: t.id, nom: t.nom }))
  const nomsCandidats = candidats.map((c) => c.nom)

  let totalLignes = 0
  const previews: OngletPreview[] = onglets.map((o) => {
    const sansTournee = estOngletSansTournee(o.nomOnglet)
    const match = sansTournee ? null : mapperTournee(o.nomOnglet, candidats)
    totalLignes += o.lignes.length
    if (!match && !sansTournee) {
      console.log(
        `[previewImport] Onglet "${o.nomOnglet}" non mappé — tournées disponibles :`,
        nomsCandidats,
      )
    }
    return {
      nomOnglet: o.nomOnglet,
      tourneeId: match?.id ?? null,
      tourneeDb: match?.nom ?? null,
      sansTournee,
      motifNonAssociee: match || sansTournee
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
// importerBatch — établissements + contacts (dédup code_schenk puis enseigne+cp+tournée)
// -----------------------------------------------------------------------------

export interface LigneAImporter {
  tourneeId: string | null       // null = onglet Prospects/Autres (import sans tournée)
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

  // Index unique des horaires existants pour la règle first-write-wins.
  const horairesExistants = new Map<string, Horaires | null>()

  // Étape 1a : index établissements existants par code_schenk (priorité dédup #1)
  const codesSchenk = Array.from(
    new Set(
      lignes
        .map((l) => l.payload.code_schenk)
        .filter((c): c is string => c !== null && c !== ''),
    ),
  )
  const indexBySchenk = new Map<string, string>()
  if (codesSchenk.length > 0) {
    const { data: existantsBySchenk, error: errS } = await supabase
      .from('etablissement')
      .select('id, code_schenk, horaires_ouverture')
      .is('deleted_at', null)
      .in('code_schenk', codesSchenk)
    if (errS) return { erreur: `Erreur lecture etabs (schenk) : ${errS.message}` }
    for (const e of existantsBySchenk ?? []) {
      const row = e as { id: string; code_schenk: string | null; horaires_ouverture: Horaires | null }
      if (row.code_schenk) indexBySchenk.set(row.code_schenk, row.id)
      horairesExistants.set(row.id, row.horaires_ouverture)
    }
  }

  // Étape 1b : index établissements existants par (tournée + enseigne + cp) (priorité dédup #2)
  const tourneeIds = Array.from(
    new Set(
      lignes
        .map((l) => l.tourneeId)
        .filter((t): t is string => t !== null && t !== ''),
    ),
  )
  const indexByEnseigne = new Map<string, string>()
  const etabIdsPossibles = new Set<string>(indexBySchenk.values())
  if (tourneeIds.length > 0) {
    const { data: existants, error: errE } = await supabase
      .from('etablissement')
      .select('id, enseigne, code_postal, tournee_id, horaires_ouverture')
      .is('deleted_at', null)
      .in('tournee_id', tourneeIds)
    if (errE) return { erreur: `Erreur lecture etabs : ${errE.message}` }
    for (const e of existants ?? []) {
      const row = e as {
        id: string; enseigne: string; code_postal: string | null;
        tournee_id: string; horaires_ouverture: Horaires | null;
      }
      indexByEnseigne.set(
        `${row.tournee_id}::${cleDedup(row.enseigne, row.code_postal)}`,
        row.id,
      )
      etabIdsPossibles.add(row.id)
      horairesExistants.set(row.id, row.horaires_ouverture)
    }
  }

  // Étape 2 : index contacts existants pour tous les etabs identifiés
  const indexContact = new Map<string, string>()
  const etabIdsList = Array.from(etabIdsPossibles)
  if (etabIdsList.length > 0) {
    const { data: existantsContacts, error: errC } = await supabase
      .from('contact')
      .select('id, etablissement_id, nom')
      .is('deleted_at', null)
      .in('etablissement_id', etabIdsList)
    if (errC) return { erreur: `Erreur lecture contacts : ${errC.message}` }
    for (const c of existantsContacts ?? []) {
      indexContact.set(
        `${c.etablissement_id}::${normaliserHeader(c.nom)}`,
        c.id,
      )
    }
  }

  // Étape 3 : traitement ligne par ligne
  for (const l of lignes) {
    // Dédup #1 : code_schenk
    let etabId: string | null = null
    if (l.payload.code_schenk) {
      etabId = indexBySchenk.get(l.payload.code_schenk) ?? null
    }
    // Dédup #2 : enseigne + cp + tournée (uniquement si tournée définie)
    let cleEnseigne: string | null = null
    if (!etabId && l.tourneeId) {
      cleEnseigne = `${l.tourneeId}::${cleDedup(l.payload.enseigne, l.payload.code_postal)}`
      etabId = indexByEnseigne.get(cleEnseigne) ?? null
    }

    const dbPayloadEtab: Record<string, unknown> = {
      enseigne:            l.payload.enseigne,
      code_schenk:         l.payload.code_schenk,
      statut:              l.payload.statut,
      adresse_ligne_1:     l.payload.adresse_ligne_1,
      code_postal:         l.payload.code_postal,
      ville:               l.payload.ville,
      telephone_principal: l.payload.telephone_principal,
      telephone_mobile:    l.payload.telephone_mobile,
      email:               l.payload.email,
      groupe_prix:         l.payload.groupe_prix,
      notes_internes:      l.payload.notes_internes,
      tournee_id:          l.tourneeId,
    }

    // Horaires : first-write-wins.
    // - Nouveau etab (pas d'etabId) → écrit horaires_ouverture depuis Excel
    // - Etab existant avec horaires null en BDD → écrit horaires_ouverture depuis Excel
    // - Etab existant avec horaires déjà renseignés → ne touche PAS aux horaires
    const horairesEnBDD = etabId ? horairesExistants.get(etabId) : undefined
    if (!etabId || horairesEnBDD == null) {
      dbPayloadEtab.horaires_ouverture = l.payload.horaires_ouverture
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
        if (l.payload.code_schenk) indexBySchenk.set(l.payload.code_schenk, etabId)
        if (cleEnseigne) indexByEnseigne.set(cleEnseigne, etabId)
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

// -----------------------------------------------------------------------------
// reinitialiserImport — WIPE etablissement (contacts + visites cascade)
// Tournées PRÉSERVÉES : la table `tournee` n'est jamais touchée par cette action.
// -----------------------------------------------------------------------------

export async function reinitialiserImport(): Promise<ActionResult<{ supprimes: number }>> {
  const supabase = await createClient()

  // Compte pour le rapport
  const { count } = await supabase
    .from('etablissement')
    .select('*', { count: 'exact', head: true })

  // DELETE avec filtre trivial pour matcher toutes les lignes
  // (Supabase interdit .delete() sans filtre par sécurité)
  const { error } = await supabase
    .from('etablissement')
    .delete()
    .gt('created_at', '1900-01-01T00:00:00Z')

  if (error) return { erreur: `Erreur reset : ${error.message}` }
  return { data: { supprimes: count ?? 0 } }
}
