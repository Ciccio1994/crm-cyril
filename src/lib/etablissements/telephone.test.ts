import { describe, it, expect } from 'vitest'
import { normaliserTelephone, telephonesEquivalents } from './telephone'

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
