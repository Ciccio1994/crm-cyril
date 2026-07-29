import { describe, it, expect } from 'vitest'
import {
  normaliserTelephone,
  telephonesEquivalents,
  estFixeSuisse,
  estMobileSuisse,
  normaliserPourGoogle,
} from './telephone'

describe('normaliserTelephone', () => {
  it('retire espaces, tirets, points, parenthèses', () => {
    expect(normaliserTelephone('027 234 12 34')).toBe('0272341234')
    expect(normaliserTelephone('027-234-12-34')).toBe('0272341234')
    expect(normaliserTelephone('027.234.12.34')).toBe('0272341234')
    expect(normaliserTelephone('(027) 234 12 34')).toBe('0272341234')
  })

  it('gère le préfixe international "+"', () => {
    expect(normaliserTelephone('+41 27 234 12 34')).toBe('41272341234')
  })

  it('gère le préfixe international "00"', () => {
    expect(normaliserTelephone('0041 27 234 12 34')).toBe('41272341234')
  })

  it('retourne string vide pour null / undefined / vide', () => {
    expect(normaliserTelephone(null)).toBe('')
    expect(normaliserTelephone(undefined)).toBe('')
    expect(normaliserTelephone('')).toBe('')
    expect(normaliserTelephone('   ')).toBe('')
  })
})

describe('telephonesEquivalents', () => {
  it('true si strictement identiques après normalisation', () => {
    expect(telephonesEquivalents('027 234 12 34', '027-234-12-34')).toBe(true)
    expect(telephonesEquivalents('+41272341234', '+41 27 234 12 34')).toBe(true)
  })

  it('true si un est +41 et l\'autre 0 (cas fréquent CH BDD vs Google)', () => {
    // Google renvoie "+41 27 234 12 34", BDD a "027 234 12 34"
    expect(telephonesEquivalents('+41 27 234 12 34', '027 234 12 34')).toBe(true)
    expect(telephonesEquivalents('027 234 12 34', '+41 27 234 12 34')).toBe(true)
  })

  it('false si numéros différents', () => {
    expect(telephonesEquivalents('027 234 12 34', '027 999 99 99')).toBe(false)
    expect(telephonesEquivalents('+41 27 234 12 34', '+41 27 235 12 34')).toBe(false)
  })

  it('false si l\'un des deux est vide', () => {
    expect(telephonesEquivalents(null, '027 234 12 34')).toBe(false)
    expect(telephonesEquivalents('027 234 12 34', null)).toBe(false)
    expect(telephonesEquivalents('', '')).toBe(false)
  })

  it('false si nombre trop court (évite faux positifs sur 3-4 chiffres communs)', () => {
    expect(telephonesEquivalents('123', '00123')).toBe(false)
  })
})

describe('estFixeSuisse', () => {
  it('détecte fixes VS (027), VD (021), GE (022), FR (026)', () => {
    expect(estFixeSuisse('+41 27 746 34 83')).toBe(true)
    expect(estFixeSuisse('027 234 12 34')).toBe(true)
    expect(estFixeSuisse('+41 21 111 22 33')).toBe(true)
    expect(estFixeSuisse('022 000 00 00')).toBe(true)
    expect(estFixeSuisse('+41 26 555 44 33')).toBe(true)
  })

  it('détecte fixes Zurich (044), Berne (031), Bâle (061), Tessin (091)', () => {
    expect(estFixeSuisse('044 222 33 44')).toBe(true)
    expect(estFixeSuisse('+41 31 111 22 33')).toBe(true)
    expect(estFixeSuisse('061 555 66 77')).toBe(true)
    expect(estFixeSuisse('091 888 99 00')).toBe(true)
  })

  it('rejette les mobiles', () => {
    expect(estFixeSuisse('+41 76 452 71 70')).toBe(false)
    expect(estFixeSuisse('079 123 45 67')).toBe(false)
    expect(estFixeSuisse('078 000 00 00')).toBe(false)
  })

  it('rejette null/vide/format bizarre', () => {
    expect(estFixeSuisse(null)).toBe(false)
    expect(estFixeSuisse('')).toBe(false)
    expect(estFixeSuisse('abc')).toBe(false)
  })
})

describe('estMobileSuisse', () => {
  it('détecte mobiles 076, 077, 078, 079', () => {
    expect(estMobileSuisse('+41 76 452 71 70')).toBe(true)
    expect(estMobileSuisse('079 123 45 67')).toBe(true)
    expect(estMobileSuisse('078 000 00 00')).toBe(true)
    expect(estMobileSuisse('077 555 44 33')).toBe(true)
  })

  it('rejette les fixes', () => {
    expect(estMobileSuisse('+41 27 746 34 83')).toBe(false)
    expect(estMobileSuisse('027 234 12 34')).toBe(false)
    expect(estMobileSuisse('044 222 33 44')).toBe(false)
  })

  it('rejette null/vide', () => {
    expect(estMobileSuisse(null)).toBe(false)
    expect(estMobileSuisse('')).toBe(false)
  })
})

describe('normaliserPourGoogle', () => {
  it('retire les accents (crucial pour Google Places)', () => {
    expect(normaliserPourGoogle('Rue de l\'Église 51')).toBe("Rue de l'Eglise 51")
    expect(normaliserPourGoogle('Hôtel de la Poste')).toBe('Hotel de la Poste')
    expect(normaliserPourGoogle('Vétroz')).toBe('Vetroz')
    expect(normaliserPourGoogle('Café Le Central')).toBe('Cafe Le Central')
  })

  it('conserve la casse et la ponctuation', () => {
    expect(normaliserPourGoogle("L'Épicerie du Coin")).toBe("L'Epicerie du Coin")
    expect(normaliserPourGoogle('Chez Émile')).toBe('Chez Emile')
  })

  it('gère null / undefined / vide', () => {
    expect(normaliserPourGoogle(null)).toBe('')
    expect(normaliserPourGoogle(undefined)).toBe('')
    expect(normaliserPourGoogle('')).toBe('')
  })
})
