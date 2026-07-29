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
async function appelerGooglePlaces(
  query: string,
): Promise<{ horaires?: Horaires | null; erreur?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  try {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        includedRegionCodes: ['ch'],
        languageCode: 'fr',
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      return { erreur: `Google Places ${res.status}` }
    }
    const json = (await res.json()) as { places?: GooglePlace[] }
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
    .select('enseigne, adresse_ligne_1, code_postal, ville')
    .eq('id', etablissementId)
    .is('deleted_at', null)
    .single()
  if (errE || !etab) return { erreur: 'Établissement introuvable' }

  const parts = [etab.enseigne, etab.adresse_ligne_1, etab.code_postal, etab.ville]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  if (parts.length === 0) {
    return { erreur: 'Adresse insuffisante pour la recherche' }
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
// Permet à Cyril d'auto-remplir le formulaire depuis l'enseigne + adresse
// qu'il vient de saisir (avant d'enregistrer).
export async function chercherHorairesGoogle(
  query: string,
): Promise<ActionResult<Horaires>> {
  if (!query || query.trim().length === 0) {
    return { erreur: 'Requête vide' }
  }
  const r = await appelerGooglePlaces(query.trim())
  if (r.erreur || !r.horaires) return { erreur: r.erreur ?? 'Erreur inconnue' }
  return { data: r.horaires }
}
