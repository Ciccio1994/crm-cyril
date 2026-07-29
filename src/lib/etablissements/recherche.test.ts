import { describe, it, expect } from 'vitest'
import { normaliserRecherche, correspondRecherche } from './recherche'
import type { Etablissement, Contact } from '@/types/database'

function mkEtab(partial: Partial<Etablissement>): Etablissement {
  return {
    id: 'e1', enseigne: '', code_schenk: null, type_etablissement: null,
    statut: 'prospect', groupe_prix: null,
    adresse_ligne_1: null, adresse_ligne_2: null, code_postal: null, ville: null,
    latitude: null, longitude: null,
    telephone_principal: null, telephone_mobile: null, email: null, site_web: null,
    horaires_libre: null, notes_internes: null, seuil_inactivite_mois: 12,
    horaires_ouverture: null, jours_fermeture_annuelle: null,
    entreprise_id: null, tournee_id: null,
    derniere_visite_at: null, derniere_commande_at: null,
    created_at: '', updated_at: '', deleted_at: null,
    ...partial,
  }
}

function mkContact(partial: Partial<Contact>): Contact {
  return {
    id: 'c1', etablissement_id: 'e1',
    prenom: null, nom: '', fonction: null,
    telephone: null, telephone_mobile: null, email: null,
    est_principal: false, notes: null,
    created_at: '', updated_at: '', deleted_at: null,
    ...partial,
  }
}

describe('normaliserRecherche', () => {
  it('supprime les accents', () => {
    expect(normaliserRecherche('Café Épicerie')).toBe('cafe epicerie')
  })
  it('réduit les espaces multiples et les tirets', () => {
    expect(normaliserRecherche('Ste-Croix   du   Vin')).toBe('ste croix du vin')
  })
  it('gère null / undefined', () => {
    expect(normaliserRecherche(null)).toBe('')
    expect(normaliserRecherche(undefined)).toBe('')
  })
  it('conserve les chiffres et lettres', () => {
    expect(normaliserRecherche('C0034046')).toBe('c0034046')
  })
})

describe('correspondRecherche', () => {
  it('trouve par enseigne (accent-insensible)', () => {
    const e = mkEtab({ enseigne: 'Café des Alpes' })
    expect(correspondRecherche(e, normaliserRecherche('cafe alpes'))).toBe(true)
    expect(correspondRecherche(e, normaliserRecherche('CAFE'))).toBe(true)
  })

  it('trouve par code_schenk complet (C0034046)', () => {
    const e = mkEtab({ enseigne: 'X', code_schenk: 'C0034046' })
    expect(correspondRecherche(e, normaliserRecherche('C0034046'))).toBe(true)
  })

  it('trouve par code_schenk sans préfixe C (34046)', () => {
    const e = mkEtab({ enseigne: 'X', code_schenk: 'C0034046' })
    expect(correspondRecherche(e, normaliserRecherche('34046'))).toBe(true)
  })

  it('trouve par nom de contact', () => {
    const e = mkEtab({
      enseigne: 'Restaurant Y',
      contacts: [mkContact({ prenom: 'Jean', nom: 'Dupont' })],
    })
    expect(correspondRecherche(e, normaliserRecherche('dupont'))).toBe(true)
    expect(correspondRecherche(e, normaliserRecherche('jean dupont'))).toBe(true)
  })

  it('trouve par adresse_ligne_1', () => {
    const e = mkEtab({ enseigne: 'X', adresse_ligne_1: 'Route de Sion 12' })
    expect(correspondRecherche(e, normaliserRecherche('sion'))).toBe(true)
  })

  it('trouve par téléphone principal ou mobile', () => {
    const e = mkEtab({
      enseigne: 'X',
      telephone_principal: '+41 27 123 45 67',
      telephone_mobile: '+41 79 555 44 33',
    })
    expect(correspondRecherche(e, normaliserRecherche('123 45'))).toBe(true)
    expect(correspondRecherche(e, normaliserRecherche('79 555'))).toBe(true)
  })

  it('rejette quand aucun champ ne correspond', () => {
    const e = mkEtab({ enseigne: 'Café des Alpes', ville: 'Sion' })
    expect(correspondRecherche(e, normaliserRecherche('inexistant'))).toBe(false)
  })

  it('accepte une requête vide (match tout)', () => {
    const e = mkEtab({ enseigne: 'X' })
    expect(correspondRecherche(e, '')).toBe(true)
  })
})
