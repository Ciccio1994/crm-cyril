import { describe, it, expect } from 'vitest'
import { estNomPersonne, contientRaisonSociale } from './nom-personne'

describe('estNomPersonne', () => {
  it('détecte les titres de politesse (M., Mme, Monsieur, Dr…)', () => {
    expect(estNomPersonne('M. Alberto Santos')).toBe(true)
    expect(estNomPersonne('Mme Dupont')).toBe(true)
    expect(estNomPersonne('Monsieur Jean Martin')).toBe(true)
    expect(estNomPersonne('Dr Ferrari')).toBe(true)
    expect(estNomPersonne('Prof Meyer')).toBe(true)
  })

  it('sans titre : "Prénom Nom" seul NON détecté (conservateur — évite faux positifs Le Dahu, Maison X)', () => {
    // Cyril peut préfixer "M." s'il veut signaler explicitement
    expect(estNomPersonne('Jean-Marc Fellay')).toBe(false)
    expect(estNomPersonne('Alberto Santos')).toBe(false)
    expect(estNomPersonne('Paula Meyer')).toBe(false)
  })

  it('cas anti-faux-positifs : noms commerciaux courants non détectés', () => {
    expect(estNomPersonne('Le Dahu')).toBe(false)
    expect(estNomPersonne('Maison Cocotte')).toBe(false)
    expect(estNomPersonne('Chez Pierre')).toBe(false)
    expect(estNomPersonne('Aux Deux Cheminées')).toBe(false)
  })

  it('EXCEPTION mot-clé commercial en tête → nom commercial (pas personne)', () => {
    expect(estNomPersonne('Cave Fellay')).toBe(false)
    expect(estNomPersonne('Domaine Anna')).toBe(false)
    expect(estNomPersonne('Restaurant Chez Pierre')).toBe(false)
    expect(estNomPersonne('Hôtel Beau Site')).toBe(false)
    expect(estNomPersonne('Café Central')).toBe(false)
    expect(estNomPersonne('Chalet Blanc')).toBe(false)
    expect(estNomPersonne('Buvette du Lac')).toBe(false)
  })

  it('EXCEPTION raison sociale (Sàrl/SA/SNC) → nom commercial', () => {
    expect(estNomPersonne('Cambuse d\'Alberto Sàrl')).toBe(false)
    expect(estNomPersonne('Fellay et Fils SA')).toBe(false)
    expect(estNomPersonne('Meyer SNC')).toBe(false)
    expect(estNomPersonne('Weinkeller GmbH')).toBe(false)
  })

  it('renvoie false pour null / undefined / vide', () => {
    expect(estNomPersonne(null)).toBe(false)
    expect(estNomPersonne(undefined)).toBe(false)
    expect(estNomPersonne('')).toBe(false)
    expect(estNomPersonne('   ')).toBe(false)
  })

  it('renvoie false pour un seul mot (trop court pour "Prénom Nom")', () => {
    expect(estNomPersonne('Fellay')).toBe(false)
    expect(estNomPersonne('Dupont')).toBe(false)
  })

  it('renvoie false pour chaîne contenant des chiffres ou caractères non-alpha', () => {
    expect(estNomPersonne('Local 12')).toBe(false)
    expect(estNomPersonne('Chez Paul 24/7')).toBe(false)
  })

  it('renvoie false pour ALL CAPS (probablement enseigne)', () => {
    expect(estNomPersonne('MCB HOSPITALITY')).toBe(false)
    expect(estNomPersonne('COOP BÂTIMENT')).toBe(false)
  })

  it('cas terrain : nom composé long non capitalisé standard', () => {
    // "les 3 amis" — pas de majuscules initiales, pas nom personne
    expect(estNomPersonne('les 3 amis')).toBe(false)
  })
})

describe('contientRaisonSociale', () => {
  it('détecte Sàrl (avec accent)', () => {
    expect(contientRaisonSociale('Cambuse Sàrl')).toBe(true)
    expect(contientRaisonSociale('X Sarl')).toBe(true)
  })

  it('détecte SA, SNC, GmbH, AG', () => {
    expect(contientRaisonSociale('Fellay SA')).toBe(true)
    expect(contientRaisonSociale('Meyer SNC')).toBe(true)
    expect(contientRaisonSociale('Weinkeller GmbH')).toBe(true)
    expect(contientRaisonSociale('Beispiel AG')).toBe(true)
  })

  it('accepte S.A. et S.à.r.l.', () => {
    expect(contientRaisonSociale('X S.A.')).toBe(true)
    expect(contientRaisonSociale('X S.à.r.l.')).toBe(true)
  })

  it('renvoie false quand aucun marqueur', () => {
    expect(contientRaisonSociale('Le Dahu')).toBe(false)
    expect(contientRaisonSociale('Cave Fellay')).toBe(false)
    expect(contientRaisonSociale(null)).toBe(false)
  })
})
