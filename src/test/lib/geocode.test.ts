import { describe, it, expect } from 'vitest'
import { parseNominatimResult } from '@/lib/geocode'

const verbierBrut = {
  place_id: 12345,
  lat: '46.09632',
  lon: '7.22843',
  display_name:
    "10, Rue de l'Église, Verbier, Bagnes, District d'Entremont, Valais, 1936, Suisse",
  address: {
    house_number: '10',
    road: "Rue de l'Église",
    town: 'Verbier',
    municipality: 'Bagnes',
    state: 'Valais',
    postcode: '1936',
    country_code: 'ch',
  },
}

describe('parseNominatimResult', () => {
  it('combine house_number + road → adresse_ligne_1', () => {
    const r = parseNominatimResult(verbierBrut)!
    expect(r.adresse_ligne_1).toBe("10 Rue de l'Église")
  })

  it('extrait postcode → code_postal', () => {
    expect(parseNominatimResult(verbierBrut)!.code_postal).toBe('1936')
  })

  it('extrait town → ville', () => {
    expect(parseNominatimResult(verbierBrut)!.ville).toBe('Verbier')
  })

  it('parse lat/lon en number', () => {
    const r = parseNominatimResult(verbierBrut)!
    expect(r.latitude).toBeCloseTo(46.09632, 5)
    expect(r.longitude).toBeCloseTo(7.22843, 5)
  })

  it('utilise village en fallback si pas de town', () => {
    const brut = {
      lat: '46.1',
      lon: '7.1',
      display_name: 'X',
      address: { village: 'Ovronnaz', postcode: '1911', road: 'Route du Coin' },
    }
    expect(parseNominatimResult(brut)!.ville).toBe('Ovronnaz')
  })

  it('utilise city en dernier fallback', () => {
    const brut = {
      lat: '46.1',
      lon: '7.1',
      display_name: 'X',
      address: { city: 'Sion', postcode: '1950', road: 'Rue du Grand-Pont' },
    }
    expect(parseNominatimResult(brut)!.ville).toBe('Sion')
  })

  it('adresse_ligne_1 = road seul si pas de house_number', () => {
    const brut = {
      lat: '46.1',
      lon: '7.1',
      display_name: 'X',
      address: { road: 'Route du Coin', postcode: '1911', town: 'Ovronnaz' },
    }
    expect(parseNominatimResult(brut)!.adresse_ligne_1).toBe('Route du Coin')
  })

  it('renvoie null si address absent', () => {
    expect(parseNominatimResult({ lat: '0', lon: '0', display_name: 'X' })).toBeNull()
  })

  it('renvoie null si lat/lon absent', () => {
    expect(
      parseNominatimResult({ display_name: 'X', address: { road: 'X' } }),
    ).toBeNull()
  })

  it('conserve le display_name pour affichage dans le dropdown', () => {
    expect(parseNominatimResult(verbierBrut)!.display_name).toContain('Verbier')
  })
})
