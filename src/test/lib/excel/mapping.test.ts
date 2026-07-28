import { describe, it, expect } from 'vitest'
import { detecterMapping } from '@/lib/excel/mapping'

describe('detecterMapping', () => {
  it('reconnait Enseigne / Nom / Client comme enseigne', () => {
    expect(detecterMapping(['Enseigne', 'Ville']).enseigne).toBe(0)
    expect(detecterMapping(['Ville', 'Nom']).enseigne).toBe(1)
    expect(detecterMapping(['Client', 'Ville']).enseigne).toBe(0)
    expect(detecterMapping(['Raison sociale']).enseigne).toBe(0)
  })

  it('reconnait CP / NPA / Code postal', () => {
    expect(detecterMapping(['CP']).code_postal).toBe(0)
    expect(detecterMapping(['NPA']).code_postal).toBe(0)
    expect(detecterMapping(['Code Postal']).code_postal).toBe(0)
  })

  it('reconnait Tél / Téléphone / Fixe', () => {
    expect(detecterMapping(['Tél']).telephone_principal).toBe(0)
    expect(detecterMapping(['Fixe']).telephone_principal).toBe(0)
  })

  it('renvoie undefined pour un champ absent', () => {
    expect(detecterMapping(['Enseigne']).ville).toBeUndefined()
    expect(detecterMapping(['Enseigne']).email).toBeUndefined()
  })

  it('insensible à la casse et aux accents', () => {
    expect(detecterMapping(['ENSEIGNE', 'VILLE']).enseigne).toBe(0)
    expect(detecterMapping(['Localité']).ville).toBe(0)
  })

  it('renvoie la liste des colonnes non reconnues', () => {
    const m = detecterMapping(['Enseigne', 'ColonneBizarre', 'Ville'])
    expect(m.colonnesInconnues).toEqual(['ColonneBizarre'])
  })

  it('reconnait Contact / Représentant / Personne comme contact_nom', () => {
    expect(detecterMapping(['Contact']).contact_nom).toBe(0)
    expect(detecterMapping(['Représentant']).contact_nom).toBe(0)
    expect(detecterMapping(['Personne']).contact_nom).toBe(0)
    expect(detecterMapping(['Interlocuteur']).contact_nom).toBe(0)
  })

  it('reconnait Fonction / Poste comme contact_fonction', () => {
    expect(detecterMapping(['Fonction']).contact_fonction).toBe(0)
    expect(detecterMapping(['Poste']).contact_fonction).toBe(0)
  })

  it('reconnait Portable / Natel comme contact_telephone', () => {
    expect(detecterMapping(['Portable']).contact_telephone).toBe(0)
    expect(detecterMapping(['Natel']).contact_telephone).toBe(0)
  })

  it('reconnait Email contact comme contact_email', () => {
    expect(detecterMapping(['Email contact']).contact_email).toBe(0)
  })
})
