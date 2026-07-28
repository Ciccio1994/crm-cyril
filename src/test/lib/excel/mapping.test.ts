import { describe, it, expect } from 'vitest'
import { detecterMapping } from '@/lib/excel/mapping'

describe('detecterMapping — structure Schenk complète', () => {
  const HEADERS_SCHENK = [
    'N°',                    // 0 → code_schenk
    'Nom',                   // 1 → notes_nom_1
    'Ventes DS',             // 2 → ignoré
    'Nom 2',                 // 3 → notes_nom_2
    'Adresse',               // 4 → enseigne (nom commercial)
    'Adresse (2ème ligne)',  // 5 → adresse_ligne_1
    'Ville',                 // 6 → ville
    'Code postal',           // 7 → code_postal
    'N° téléphone',          // 8 → telephone_principal
    'N° portable',           // 9 → telephone_mobile
    'Contact',               // 10 → contact_nom
    'Groupe prix client',    // 11 → groupe_prix
    'Date création',         // 12 → ignoré
    'Goot',                  // 13 → ignoré
    'Janvier',               // 14 → ignoré
  ]

  it('mappe les 15 colonnes de la structure Schenk correctement', () => {
    const m = detecterMapping(HEADERS_SCHENK)
    expect(m.code_schenk).toBe(0)
    expect(m.notes_nom_1).toBe(1)
    expect(m.notes_nom_2).toBe(3)
    expect(m.enseigne).toBe(4)
    expect(m.adresse_ligne_1).toBe(5)
    expect(m.ville).toBe(6)
    expect(m.code_postal).toBe(7)
    expect(m.telephone_principal).toBe(8)
    expect(m.telephone_mobile).toBe(9)
    expect(m.contact_nom).toBe(10)
    expect(m.groupe_prix).toBe(11)
  })

  it("ignore Ventes DS, Date création, Goot, mois — pas dans colonnesInconnues", () => {
    const m = detecterMapping(HEADERS_SCHENK)
    expect(m.colonnesInconnues).toEqual([])
  })
})

describe('detecterMapping — Adresse est enseigne SI Adresse (2ème ligne) présent', () => {
  it("full Schenk : Adresse → enseigne, Adresse (2ème ligne) → adresse_ligne_1", () => {
    const m = detecterMapping(['Adresse', 'Adresse (2ème ligne)', 'Ville'])
    expect(m.enseigne).toBe(0)
    expect(m.adresse_ligne_1).toBe(1)
  })

  it("simple : Adresse seule → adresse_ligne_1 (pas d'enseigne)", () => {
    const m = detecterMapping(['Enseigne', 'Adresse', 'Ville'])
    expect(m.enseigne).toBe(0)
    expect(m.adresse_ligne_1).toBe(1)
  })

  it("simple : Nom seul → enseigne (pas de Nom 2 ni Adresse 2eme)", () => {
    const m = detecterMapping(['Nom', 'Adresse', 'Ville'])
    expect(m.enseigne).toBe(0)
    expect(m.adresse_ligne_1).toBe(1)
  })

  it("full : Nom + Nom 2 + Adresse + Adresse (2ème ligne) → notes / enseigne / adresse", () => {
    const m = detecterMapping(['Nom', 'Nom 2', 'Adresse', 'Adresse (2ème ligne)', 'Ville'])
    expect(m.notes_nom_1).toBe(0)
    expect(m.notes_nom_2).toBe(1)
    expect(m.enseigne).toBe(2)
    expect(m.adresse_ligne_1).toBe(3)
  })
})

describe('detecterMapping — code_schenk', () => {
  it("reconnait 'N°' comme code_schenk (° stripé)", () => {
    expect(detecterMapping(['N°']).code_schenk).toBe(0)
  })
  it("reconnait 'No' et 'Numéro' comme code_schenk", () => {
    expect(detecterMapping(['No']).code_schenk).toBe(0)
    expect(detecterMapping(['Numéro']).code_schenk).toBe(0)
  })
})

describe('detecterMapping — téléphones', () => {
  it("distingue N° téléphone (principal) et N° portable (mobile)", () => {
    const m = detecterMapping(['N° téléphone', 'N° portable'])
    expect(m.telephone_principal).toBe(0)
    expect(m.telephone_mobile).toBe(1)
  })
})

describe('detecterMapping — autres champs et fallbacks', () => {
  it('reconnait CP / NPA / Code postal', () => {
    expect(detecterMapping(['CP']).code_postal).toBe(0)
    expect(detecterMapping(['NPA']).code_postal).toBe(0)
    expect(detecterMapping(['Code Postal']).code_postal).toBe(0)
  })

  it('reconnait Groupe prix client', () => {
    expect(detecterMapping(['Groupe prix client']).groupe_prix).toBe(0)
    expect(detecterMapping(['Groupe']).groupe_prix).toBe(0)
  })

  it('renvoie undefined pour un champ absent', () => {
    expect(detecterMapping(['Enseigne']).ville).toBeUndefined()
    expect(detecterMapping(['Enseigne']).email).toBeUndefined()
  })

  it('insensible à la casse et aux accents', () => {
    expect(detecterMapping(['ENSEIGNE', 'VILLE']).enseigne).toBe(0)
    expect(detecterMapping(['Localité']).ville).toBe(0)
  })

  it('renvoie la liste des colonnes non reconnues (hors ignore list)', () => {
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
})
