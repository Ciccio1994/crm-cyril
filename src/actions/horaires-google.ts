'use server'

import { createClient } from '@/lib/supabase/server'
import { parseGooglePeriods, type GooglePeriod } from '@/lib/horaires/google-parser'
import type { Horaires } from '@/types/horaires'

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours'

type ActionResult<T> = { data?: T; erreur?: string }

interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  regularOpeningHours?: {
    periods?: GooglePeriod[]
  }
}

// Appel Google Places Text Search (partagé par les 2 actions publiques).
// NB : la New API places:searchText attend `regionCode` (string CLDR),
// PAS `includedRegionCodes` (qui est un paramètre autocomplete uniquement).
async function appelerGooglePlaces(
  query: string,
): Promise<{ horaires?: Horaires | null; erreur?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  console.log('[Google Horaires] textQuery construite:', query)
  console.log('[Google Horaires] KEY exists:', !!key)
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  const body = {
    textQuery: query,
    regionCode: 'ch',
    languageCode: 'fr',
  }
  console.log('[Google Horaires] body envoyé:', JSON.stringify(body))

  try {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    console.log('[Google Horaires] status Google:', res.status)
    const rawText = await res.text()
    if (!res.ok) {
      console.log('[Google Horaires] réponse Google (erreur):', rawText.slice(0, 500))
      return { erreur: `Google Places ${res.status}: ${rawText.slice(0, 200)}` }
    }
    const json = JSON.parse(rawText) as { places?: GooglePlace[] }
    console.log('[Google Horaires] nb résultats:', json.places?.length ?? 0)
    const premier = json.places?.[0]
    if (!premier) {
      return { erreur: 'Établissement non trouvé sur Google Maps' }
    }
    const horaires = parseGooglePeriods(premier.regularOpeningHours?.periods)
    if (!horaires) {
      return { erreur: 'Aucun horaire disponible sur Google Maps pour ce lieu' }
    }
    return { horaires }
  } catch (e) {
    console.log('[Google Horaires] fetch error:', e instanceof Error ? e.message : e)
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
  if (r.erreur || !r.horaires) return { erreur: r.erreur ?? 'Erreur inconnue' }

  const { error: errU } = await supabase
    .from('etablissement')
    .update({ horaires_ouverture: r.horaires })
    .eq('id', etablissementId)
  if (errU) return { erreur: `Erreur BDD : ${errU.message}` }

  return { data: r.horaires }
}

// Version formulaire édition : takes free-form query, no DB write.
export async function chercherHorairesGoogle(
  query: string,
): Promise<ActionResult<Horaires>> {
  if (!query || query.trim().length === 0) {
    return { erreur: 'Données insuffisantes pour rechercher' }
  }
  const r = await appelerGooglePlaces(query.trim())
  if (r.erreur || !r.horaires) return { erreur: r.erreur ?? 'Erreur inconnue' }
  return { data: r.horaires }
}
