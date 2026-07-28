import { describe, it, expect } from 'vitest'
import {
  parseAddressComponents,
  parsePlaceDetails,
  parseAutocompleteSuggestion,
} from '@/lib/geocode'

const dahuComponents = [
  { longText: '10',        shortText: '10',   types: ['street_number'] },
  { longText: 'Rue de la Poste', shortText: 'Rue de la Poste', types: ['route'] },
  { longText: 'Verbier',   shortText: 'Verbier', types: ['locality', 'political'] },
  { longText: 'Bagnes',    shortText: 'Bagnes',  types: ['administrative_area_level_2', 'political'] },
  { longText: 'Valais',    shortText: 'VS',      types: ['administrative_area_level_1', 'political'] },
  { longText: 'Switzerland', shortText: 'CH',    types: ['country', 'political'] },
  { longText: '1936',      shortText: '1936',    types: ['postal_code'] },
]

describe('parseAddressComponents', () => {
  it('combine street_number + route → adresse_ligne_1', () => {
    const r = parseAddressComponents(dahuComponents)
    expect(r.adresse_ligne_1).toBe('10 Rue de la Poste')
  })
  it('extrait postal_code → code_postal', () => {
    expect(parseAddressComponents(dahuComponents).code_postal).toBe('1936')
  })
  it('extrait locality → ville', () => {
    expect(parseAddressComponents(dahuComponents).ville).toBe('Verbier')
  })
  it('adresse_ligne_1 = route seule si pas de street_number', () => {
    const c = dahuComponents.filter((c) => !c.types.includes('street_number'))
    expect(parseAddressComponents(c).adresse_ligne_1).toBe('Rue de la Poste')
  })
  it('fallback ville : sublocality si pas de locality', () => {
    const c = [
      { longText: 'Grimentz', shortText: 'Grimentz', types: ['sublocality', 'political'] },
      { longText: '3961',     shortText: '3961',     types: ['postal_code'] },
    ]
    expect(parseAddressComponents(c).ville).toBe('Grimentz')
  })
  it('fallback ville : administrative_area_level_2', () => {
    const c = [
      { longText: 'Bagnes', shortText: 'Bagnes', types: ['administrative_area_level_2', 'political'] },
      { longText: '1936',   shortText: '1936',   types: ['postal_code'] },
    ]
    expect(parseAddressComponents(c).ville).toBe('Bagnes')
  })
  it('renvoie tout à null si tableau vide', () => {
    expect(parseAddressComponents([])).toEqual({
      adresse_ligne_1: null,
      code_postal: null,
      ville: null,
    })
  })
})

const dahuDetails = {
  id: 'ChIJxxxxx',
  displayName: { text: 'Restaurant Le Dahu', languageCode: 'fr' },
  formattedAddress: 'Rue de la Poste 10, 1936 Verbier, Suisse',
  addressComponents: dahuComponents,
  location: { latitude: 46.09632, longitude: 7.22843 },
  internationalPhoneNumber: '+41 27 771 25 24',
  websiteUri: 'https://ledahu.ch',
}

describe('parsePlaceDetails', () => {
  it('extrait toutes les infos utiles', () => {
    const d = parsePlaceDetails(dahuDetails)!
    expect(d.adresse_ligne_1).toBe('10 Rue de la Poste')
    expect(d.code_postal).toBe('1936')
    expect(d.ville).toBe('Verbier')
    expect(d.latitude).toBeCloseTo(46.09632, 5)
    expect(d.longitude).toBeCloseTo(7.22843, 5)
    expect(d.telephone).toBe('+41 27 771 25 24')
    expect(d.site_web).toBe('https://ledahu.ch')
    expect(d.display_name).toBe('Restaurant Le Dahu')
  })

  it('telephone et site_web undefined si absents', () => {
    const d = parsePlaceDetails({
      id: 'x',
      displayName: { text: 'X' },
      addressComponents: dahuComponents,
      location: { latitude: 46, longitude: 7 },
    })!
    expect(d.telephone).toBeUndefined()
    expect(d.site_web).toBeUndefined()
  })

  it('renvoie null si location absente', () => {
    expect(
      parsePlaceDetails({
        id: 'x',
        displayName: { text: 'X' },
        addressComponents: dahuComponents,
      }),
    ).toBeNull()
  })

  it('renvoie null si input non objet', () => {
    expect(parsePlaceDetails(null)).toBeNull()
    expect(parsePlaceDetails('bloup')).toBeNull()
  })
})

describe('parseAutocompleteSuggestion', () => {
  it('extrait placeId + mainText + secondaryText de structuredFormat', () => {
    const raw = {
      placePrediction: {
        place: 'places/ChIJxxxxx',
        placeId: 'ChIJxxxxx',
        text: { text: 'Restaurant Le Dahu, Rue de la Poste, Verbier' },
        structuredFormat: {
          mainText: { text: 'Restaurant Le Dahu' },
          secondaryText: { text: 'Rue de la Poste, Verbier' },
        },
      },
    }
    const s = parseAutocompleteSuggestion(raw)!
    expect(s.placeId).toBe('ChIJxxxxx')
    expect(s.mainText).toBe('Restaurant Le Dahu')
    expect(s.secondaryText).toBe('Rue de la Poste, Verbier')
  })

  it('fallback : text.text si pas de structuredFormat', () => {
    const raw = {
      placePrediction: {
        placeId: 'ChIJx',
        text: { text: 'Adresse complète' },
      },
    }
    const s = parseAutocompleteSuggestion(raw)!
    expect(s.mainText).toBe('Adresse complète')
    expect(s.secondaryText).toBe('')
  })

  it('renvoie null si pas de placeId', () => {
    expect(
      parseAutocompleteSuggestion({ placePrediction: { text: { text: 'X' } } }),
    ).toBeNull()
  })

  it('renvoie null si pas de placePrediction (ex: queryPrediction)', () => {
    expect(parseAutocompleteSuggestion({ queryPrediction: {} })).toBeNull()
  })
})
