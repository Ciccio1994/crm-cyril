'use server'

import { parseNominatimResult, type SuggestionAdresse } from '@/lib/geocode'

const USER_AGENT = 'CRM-Cyril/1.0 (cicero.cyril.pro@gmail.com)'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

type ActionResult<T> = { data?: T; erreur?: string }

export async function chercherAdresses(
  query: string,
): Promise<ActionResult<SuggestionAdresse[]>> {
  const q = query.trim()
  if (q.length < 3) return { data: [] }

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('countrycodes', 'ch')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('accept-language', 'fr')

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      // Nominatim tolère peu de charge — pas de cache Next.js
      cache: 'no-store',
    })
    if (!res.ok) {
      return { erreur: `Nominatim ${res.status}` }
    }
    const brut = (await res.json()) as unknown[]
    const suggestions = brut
      .map(parseNominatimResult)
      .filter((s): s is SuggestionAdresse => s !== null)
    return { data: suggestions }
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}
