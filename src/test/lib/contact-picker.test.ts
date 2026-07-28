import { describe, it, expect } from 'vitest'
import { splitContactName, isContactPickerSupported } from '@/lib/contact-picker'

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
