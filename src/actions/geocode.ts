'use server'

import {
  parseAutocompleteSuggestion,
  parsePlaceDetails,
  type DetailsLieu,
  type SuggestionLieu,
} from '@/lib/geocode'

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const PLACE_URL = (id: string) => `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`

const DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'location',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'websiteUri',
].join(',')

type ActionResult<T> = { data?: T; erreur?: string }

function apiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY ?? null
}

export async function chercherLieux(
  query: string,
  sessionToken: string,
): Promise<ActionResult<SuggestionLieu[]>> {
  const q = query.trim()
  if (q.length < 3) return { data: [] }
  const key = apiKey()
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  try {
    const res = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ['ch'],
        languageCode: 'fr',
        sessionToken,
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      return { erreur: `Google Places ${res.status}` }
    }
    const json = (await res.json()) as { suggestions?: unknown[] }
    const suggestions = (json.suggestions ?? [])
      .map(parseAutocompleteSuggestion)
      .filter((s): s is SuggestionLieu => s !== null)
    return { data: suggestions }
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function detailsLieu(
  placeId: string,
  sessionToken: string,
): Promise<ActionResult<DetailsLieu>> {
  const id = placeId.trim()
  if (!id) return { erreur: 'placeId vide' }
  const key = apiKey()
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  const url = new URL(PLACE_URL(id))
  url.searchParams.set('languageCode', 'fr')
  url.searchParams.set('sessionToken', sessionToken)

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': DETAILS_FIELDS,
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      return { erreur: `Google Places ${res.status}` }
    }
    const brut = (await res.json()) as unknown
    const details = parsePlaceDetails(brut)
    if (!details) return { erreur: 'Réponse Google inexploitable' }
    return { data: details }
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}
