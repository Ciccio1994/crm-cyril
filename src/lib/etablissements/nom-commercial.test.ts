import { describe, it, expect } from 'vitest'
import { extraireNomCommercial, motsCommuns } from './nom-commercial'

describe('extraireNomCommercial', () => {
  it('cas terrain Cyril : "Nom raison sociale: M. Alberto Santos / Cambuse d\'Alberto Sàrl"', () => {
    const notes = "Nom raison sociale: M. Alberto Santos / Cambuse d'Alberto Sàrl"
    expect(extraireNomCommercial(notes)).toBe("Cambuse d'Alberto Sàrl")
  })

  it('cas terrain Cyril : "Café Le Central" en 2e segment', () => {
    const notes = 'Nom raison sociale: Cedric Taramarcaz / Café Le Central'
    expect(extraireNomCommercial(notes)).toBe('Café Le Central')
  })

  it('priorité 1 mot-clé commercial > priorité 2 raison sociale', () => {
    const notes = 'Machin Sàrl / Café Le Central'
    expect(extraireNomCommercial(notes)).toBe('Café Le Central')
  })

  it('détecte Restaurant en tête', () => {
    expect(extraireNomCommercial('Nom raison sociale: X / Restaurant du Pont')).toBe('Restaurant du Pont')
  })

  it('détecte Hôtel avec accent', () => {
    expect(extraireNomCommercial('X / Hôtel Beau Site')).toBe('Hôtel Beau Site')
  })

  it('fallback sur raison sociale si aucun mot-clé commercial', () => {
    expect(extraireNomCommercial('Nom raison sociale: Fellay et Fils SA')).toBe('Fellay et Fils SA')
  })

  it('retourne null si notes ne contient aucun candidat', () => {
    expect(extraireNomCommercial('Client sympa, offre 20% habituelle')).toBeNull()
  })

  it('retourne null pour null / vide', () => {
    expect(extraireNomCommercial(null)).toBeNull()
    expect(extraireNomCommercial(undefined)).toBeNull()
    expect(extraireNomCommercial('')).toBeNull()
  })

  it('gère les séparateurs virgule et retour ligne', () => {
    expect(extraireNomCommercial('M. Untel, Café des Alpes')).toBe('Café des Alpes')
    expect(extraireNomCommercial('M. Untel\nRestaurant du Lac')).toBe('Restaurant du Lac')
  })
})

describe('motsCommuns', () => {
  it('compte les mots partagés ≥ 3 caractères', () => {
    expect(motsCommuns('Café Le Central', 'Central Bar Fully')).toBe(1)
    expect(motsCommuns('Cambuse d\'Alberto', 'La Cambuse d\'Alberto Sàrl')).toBe(2) // cambuse + alberto (d' filtré <3)
  })

  it('insensible casse et accents', () => {
    expect(motsCommuns('Café Central', 'CAFE central')).toBe(2)
    expect(motsCommuns('Restauration Épicurienne', 'restauration epicurienne')).toBe(2)
  })

  it('ignore les mots courts (<3 chars)', () => {
    expect(motsCommuns('Le Dahu', 'Le Chalet')).toBe(0) // "le" ignoré
  })

  it('retourne 0 si aucun mot commun', () => {
    expect(motsCommuns('Restaurant A', 'Bar B')).toBe(0)
  })
})
