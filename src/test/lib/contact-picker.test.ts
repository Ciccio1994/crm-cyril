import { describe, it, expect } from 'vitest'
import {
  splitContactName,
  isContactPickerSupported,
  extraireTelephones,
} from '@/lib/contact-picker'

describe('splitContactName', () => {
  it('sépare "Prénom Nom" (dernier espace = séparateur)', () => {
    expect(splitContactName('Jean Dupont')).toEqual({
      prenom: 'Jean',
      nom: 'Dupont',
    })
  })

  it('préserve les prénoms composés (Jean-Michel Dupont)', () => {
    expect(splitContactName('Jean-Michel Dupont')).toEqual({
      prenom: 'Jean-Michel',
      nom: 'Dupont',
    })
  })

  it('preserve les prénoms multiples (Jean Michel Dupont → dernier mot = nom)', () => {
    expect(splitContactName('Jean Michel Dupont')).toEqual({
      prenom: 'Jean Michel',
      nom: 'Dupont',
    })
  })

  it('un seul mot → tout en nom, prénom undefined', () => {
    expect(splitContactName('Dupont')).toEqual({
      prenom: undefined,
      nom: 'Dupont',
    })
  })

  it('gère les espaces multiples et le trim', () => {
    expect(splitContactName('  Jean   Dupont  ')).toEqual({
      prenom: 'Jean',
      nom: 'Dupont',
    })
  })

  it('renvoie {} pour null/undefined/vide', () => {
    expect(splitContactName(null)).toEqual({})
    expect(splitContactName(undefined)).toEqual({})
    expect(splitContactName('')).toEqual({})
    expect(splitContactName('   ')).toEqual({})
  })
})

describe('isContactPickerSupported', () => {
  it("renvoie false en environnement de test (jsdom sans navigator.contacts)", () => {
    expect(isContactPickerSupported()).toBe(false)
  })
})

describe('extraireTelephones', () => {
  it('retourne {} si tableau vide ou undefined', () => {
    expect(extraireTelephones(undefined)).toEqual({})
    expect(extraireTelephones([])).toEqual({})
    expect(extraireTelephones(['', '  '])).toEqual({})
  })

  it('un seul numéro → telephone', () => {
    expect(extraireTelephones(['027 322 12 34'])).toEqual({
      telephone: '027 322 12 34',
    })
  })

  it('deux numéros → telephone + telephone_mobile', () => {
    expect(extraireTelephones(['027 322 12 34', '079 555 44 33'])).toEqual({
      telephone: '027 322 12 34',
      telephone_mobile: '079 555 44 33',
    })
  })

  it('trois numéros → prend seulement les 2 premiers', () => {
    expect(
      extraireTelephones(['027 322 12 34', '079 555 44 33', '076 111 22 33']),
    ).toEqual({
      telephone: '027 322 12 34',
      telephone_mobile: '079 555 44 33',
    })
  })

  it('trim les espaces des numéros', () => {
    expect(extraireTelephones(['  027 322  ', '  079 555  '])).toEqual({
      telephone: '027 322',
      telephone_mobile: '079 555',
    })
  })
})
