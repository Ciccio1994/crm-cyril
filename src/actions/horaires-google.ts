'use server'

import { createClient } from '@/lib/supabase/server'
import { parseGooglePeriods, type GooglePeriod } from '@/lib/horaires/google-parser'
import { estNomPersonne } from '@/lib/etablissements/nom-personne'
import type { Horaires } from '@/types/horaires'

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours'
const FIELD_MASK_ENRICHI = 'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours,places.nationalPhoneNumber'

type ActionResult<T> = { data?: T; erreur?: string }

interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  regularOpeningHours?: {
    periods?: GooglePeriod[]
  }
  nationalPhoneNumber?: string
}

// Appel Google Places Text Search (partagé par toutes les actions publiques).
// NB : la New API places:searchText attend `regionCode` (string CLDR),
// PAS `includedRegionCodes` (qui est un paramètre autocomplete uniquement).
async function appelerGooglePlaces(
  query: string,
  fieldMask: string = FIELD_MASK,
): Promise<{ place?: GooglePlace; erreur?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  const body = {
    textQuery: query,
    regionCode: 'ch',
    languageCode: 'fr',
  }

  try {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const rawText = await res.text()
    if (!res.ok) {
      return { erreur: `Google Places ${res.status}: ${rawText.slice(0, 200)}` }
    }
    const json = JSON.parse(rawText) as { places?: GooglePlace[] }
    const premier = json.places?.[0]
    if (!premier) return { erreur: 'Établissement non trouvé sur Google Maps' }
    return { place: premier }
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

// Version fiche : lit l'etab, appelle Google, écrit horaires_ouverture en BDD.
export async function recupererHorairesDepuisGoogle(
  etablissementId: string,
): Promise<ActionResult<Horaires>> {
  const supabase = await createClient()
  const { data: etab, error: errE } = await supabase
    .from('etablissement')
    .select('enseigne, adresse_ligne_1, code_postal, ville, telephone_principal')
    .eq('id', etablissementId)
    .is('deleted_at', null)
    .single()
  if (errE || !etab) return { erreur: 'Établissement introuvable' }

  // Concatène TOUTES les infos disponibles pour maximiser le taux de match.
  // Le téléphone fixe est particulièrement discriminant : Google Places
  // matche très bien par numéro.
  const parts = [
    etab.enseigne,
    etab.adresse_ligne_1,
    etab.code_postal,
    etab.ville,
    etab.telephone_principal,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

  if (parts.length === 0) {
    return { erreur: 'Données insuffisantes pour rechercher' }
  }
  const query = parts.join(' ')

  const r = await appelerGooglePlaces(query)
  if (r.erreur || !r.place) return { erreur: r.erreur ?? 'Erreur inconnue' }

  const horaires = parseGooglePeriods(r.place.regularOpeningHours?.periods)
  if (!horaires) return { erreur: 'Aucun horaire disponible sur Google Maps pour ce lieu' }

  const { error: errU } = await supabase
    .from('etablissement')
    .update({ horaires_ouverture: horaires })
    .eq('id', etablissementId)
  if (errU) return { erreur: `Erreur BDD : ${errU.message}` }

  return { data: horaires }
}

// Version formulaire édition : takes free-form query, no DB write.
export async function chercherHorairesGoogle(
  query: string,
): Promise<ActionResult<Horaires>> {
  if (!query || query.trim().length === 0) {
    return { erreur: 'Données insuffisantes pour rechercher' }
  }
  const r = await appelerGooglePlaces(query.trim())
  if (r.erreur || !r.place) return { erreur: r.erreur ?? 'Erreur inconnue' }
  const horaires = parseGooglePeriods(r.place.regularOpeningHours?.periods)
  if (!horaires) return { erreur: 'Aucun horaire disponible sur Google Maps pour ce lieu' }
  return { data: horaires }
}

// ===========================================================================
// Enrichissement : récupérer nom commercial + horaires depuis Google Places
// ===========================================================================
//
// Utilisé pour compléter les fiches où l'enseigne est un nom de personne
// (ex "M. Alberto Santos") et qu'on veut le remplacer par le vrai nom
// commercial (ex "La Cambuse"). Peut aussi être utilisé pour enrichir
// horaires manquants sur des fiches à enseigne déjà correcte.

export interface ResultatEnrichissement {
  ancien_nom: string
  nouveau_nom: string | null       // null si Google ne renvoie pas de displayName
  enseigne_ecrasee: boolean         // true si la BDD a été mise à jour avec le nouveau nom
  horaires_ecrites: boolean         // true si horaires_ouverture a été mis à jour
  formatted_address: string | null  // renseignement pour debug/verif
  google_phone: string | null       // pour vérification manuelle
}

export async function recupererNomEtHorairesDepuisGoogle(
  etablissementId: string,
): Promise<ActionResult<ResultatEnrichissement>> {
  const supabase = await createClient()
  const { data: etab, error: errE } = await supabase
    .from('etablissement')
    .select('enseigne, adresse_ligne_1, code_postal, ville, telephone_principal, horaires_ouverture')
    .eq('id', etablissementId)
    .is('deleted_at', null)
    .single()
  if (errE || !etab) return { erreur: 'Établissement introuvable' }

  const parts = [
    etab.enseigne,
    etab.adresse_ligne_1,
    etab.code_postal,
    etab.ville,
    etab.telephone_principal,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

  if (parts.length === 0) return { erreur: 'Données insuffisantes pour rechercher' }
  const query = parts.join(' ')

  const r = await appelerGooglePlaces(query, FIELD_MASK_ENRICHI)
  if (r.erreur || !r.place) return { erreur: r.erreur ?? 'Erreur inconnue' }

  const nouveauNom = r.place.displayName?.text?.trim() ?? null
  const nouveauxHoraires = parseGooglePeriods(r.place.regularOpeningHours?.periods)

  // Sécurité : n'écrase l'enseigne QUE si l'actuelle est un nom personne physique.
  // Cyril peut avoir corrigé manuellement une enseigne — on ne veut pas la remplacer
  // par une suggestion Google qui pourrait être moins bonne (établissement voisin, etc.)
  const doitEcraserEnseigne =
    nouveauNom != null &&
    nouveauNom !== etab.enseigne &&
    estNomPersonne(etab.enseigne)

  const patch: Record<string, unknown> = {}
  if (doitEcraserEnseigne) patch.enseigne = nouveauNom
  // Horaires : first-write-wins classique (n'écrase pas les horaires déjà en BDD)
  const doitEcrireHoraires = nouveauxHoraires !== null && etab.horaires_ouverture == null
  if (doitEcrireHoraires) patch.horaires_ouverture = nouveauxHoraires

  if (Object.keys(patch).length > 0) {
    const { error: errU } = await supabase.from('etablissement').update(patch).eq('id', etablissementId)
    if (errU) return { erreur: `Erreur BDD : ${errU.message}` }
  }

  return {
    data: {
      ancien_nom:         etab.enseigne,
      nouveau_nom:        nouveauNom,
      enseigne_ecrasee:   doitEcraserEnseigne,
      horaires_ecrites:   doitEcrireHoraires,
      formatted_address:  r.place.formattedAddress ?? null,
      google_phone:       r.place.nationalPhoneNumber ?? null,
    },
  }
}
