export interface SuggestionAdresse {
  display_name: string
  adresse_ligne_1: string
  code_postal: string | null
  ville: string | null
  latitude: number
  longitude: number
}

interface NominatimAddress {
  house_number?: string
  road?: string
  pedestrian?: string
  postcode?: string
  town?: string
  village?: string
  city?: string
  hamlet?: string
  municipality?: string
}

interface NominatimRaw {
  lat?: string
  lon?: string
  display_name?: string
  address?: NominatimAddress
}

export function parseNominatimResult(
  raw: unknown,
): SuggestionAdresse | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as NominatimRaw

  if (!item.address) return null
  if (!item.lat || !item.lon) return null

  const latitude = Number(item.lat)
  const longitude = Number(item.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const rue = item.address.road ?? item.address.pedestrian ?? ''
  const numero = item.address.house_number ?? ''
  const adresse_ligne_1 = [numero, rue].filter(Boolean).join(' ').trim()

  const ville =
    item.address.town ??
    item.address.village ??
    item.address.city ??
    item.address.hamlet ??
    item.address.municipality ??
    null

  return {
    display_name: item.display_name ?? adresse_ligne_1,
    adresse_ligne_1,
    code_postal: item.address.postcode ?? null,
    ville,
    latitude,
    longitude,
  }
}
