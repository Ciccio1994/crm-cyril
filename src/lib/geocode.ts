// Google Places (NEW) API v1 — parsers purs, testables sans réseau.
// Le proxy Server Action se charge du secret X-Goog-Api-Key et de l'accept-language.

export interface AdresseComponents {
  adresse_ligne_1: string | null
  code_postal: string | null
  ville: string | null
}

export interface SuggestionLieu {
  placeId: string
  mainText: string
  secondaryText: string
}

export interface DetailsLieu {
  display_name: string
  adresse_ligne_1: string | null
  code_postal: string | null
  ville: string | null
  latitude: number
  longitude: number
  telephone?: string
  site_web?: string
}

interface RawAddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

function findComponent(
  components: RawAddressComponent[],
  ...types: string[]
): string | null {
  for (const t of types) {
    const match = components.find((c) => c.types?.includes(t))
    if (match?.longText) return match.longText
  }
  return null
}

export function parseAddressComponents(
  components: RawAddressComponent[],
): AdresseComponents {
  if (!Array.isArray(components) || components.length === 0) {
    return { adresse_ligne_1: null, code_postal: null, ville: null }
  }
  const numero = findComponent(components, 'street_number')
  const rue = findComponent(components, 'route', 'pedestrian')
  const adresse_ligne_1 =
    [numero, rue].filter(Boolean).join(' ').trim() || null

  const code_postal = findComponent(components, 'postal_code')

  const ville = findComponent(
    components,
    'locality',
    'postal_town',
    'sublocality',
    'sublocality_level_1',
    'administrative_area_level_2',
  )

  return { adresse_ligne_1, code_postal, ville }
}

interface RawPlaceDetails {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  addressComponents?: RawAddressComponent[]
  location?: { latitude?: number; longitude?: number }
  internationalPhoneNumber?: string
  nationalPhoneNumber?: string
  websiteUri?: string
}

export function parsePlaceDetails(raw: unknown): DetailsLieu | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as RawPlaceDetails

  const lat = p.location?.latitude
  const lng = p.location?.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const composants = parseAddressComponents(p.addressComponents ?? [])
  const nom = p.displayName?.text ?? p.formattedAddress ?? ''

  return {
    display_name: nom,
    adresse_ligne_1: composants.adresse_ligne_1,
    code_postal: composants.code_postal,
    ville: composants.ville,
    latitude: lat,
    longitude: lng,
    telephone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
    site_web: p.websiteUri,
  }
}

interface RawAutocompleteSuggestion {
  placePrediction?: {
    place?: string
    placeId?: string
    text?: { text?: string }
    structuredFormat?: {
      mainText?: { text?: string }
      secondaryText?: { text?: string }
    }
  }
  queryPrediction?: unknown
}

export function parseAutocompleteSuggestion(
  raw: unknown,
): SuggestionLieu | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as RawAutocompleteSuggestion
  const pred = s.placePrediction
  if (!pred?.placeId) return null

  const mainStructured = pred.structuredFormat?.mainText?.text
  const secondaryStructured = pred.structuredFormat?.secondaryText?.text

  return {
    placeId: pred.placeId,
    mainText: mainStructured ?? pred.text?.text ?? '',
    secondaryText: secondaryStructured ?? '',
  }
}
