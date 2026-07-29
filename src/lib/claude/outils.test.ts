import { describe, it, expect } from 'vitest'
import { descriptionHumaine, SCHEMAS_OUTILS, OUTILS_LECTURE, OUTILS_MODIFICATION } from './outils'

describe('descriptionHumaine', () => {
  it('creerRappel : titre + date formatée fr-CH', () => {
    const d = descriptionHumaine('creerRappel', {
      titre: 'Rappeler M. Dupont',
      echeance: '2026-08-05T14:00:00+02:00',
    })
    expect(d).toContain('Rappeler M. Dupont')
    expect(d).toMatch(/05\.08\.2026/)
  })

  it('creerVisite : contient la durée en minutes', () => {
    const d = descriptionHumaine('creerVisite', { etablissement_id: 'uuid', duree_minutes: 60 })
    expect(d).toContain('60')
    expect(d).toContain('min')
  })

  it('mettreAJourHoraires : message fixe', () => {
    const d = descriptionHumaine('mettreAJourHoraires', { etablissement_id: 'uuid', horaires: {} })
    expect(d).toContain('horaires')
  })

  it('mettreAJourEtablissement : liste des champs modifiés', () => {
    const d = descriptionHumaine('mettreAJourEtablissement', {
      id: '11111111-1111-4111-8111-111111111111',
      champs: { enseigne: 'Nouveau', ville: 'Sion' },
    })
    expect(d).toContain('enseigne')
    expect(d).toContain('ville')
  })
})

describe('SCHEMAS_OUTILS', () => {
  it('creerRappel accepte un input valide', () => {
    const r = SCHEMAS_OUTILS.creerRappel.safeParse({
      titre: 'Rappel test',
      echeance: '2026-08-05T14:00:00+02:00',
    })
    expect(r.success).toBe(true)
  })

  it('creerRappel refuse un titre vide', () => {
    const r = SCHEMAS_OUTILS.creerRappel.safeParse({ titre: '', echeance: '2026-08-05T14:00:00+02:00' })
    expect(r.success).toBe(false)
  })

  it('creerRappel refuse une date sans offset', () => {
    const r = SCHEMAS_OUTILS.creerRappel.safeParse({ titre: 'Test', echeance: '2026-08-05T14:00:00' })
    expect(r.success).toBe(false)
  })

  it('mettreAJourEtablissement refuse un objet champs vide', () => {
    const r = SCHEMAS_OUTILS.mettreAJourEtablissement.safeParse({
      id: '11111111-1111-4111-8111-111111111111', champs: {},
    })
    expect(r.success).toBe(false)
  })

  it('mettreAJourEtablissement accepte un champ valide', () => {
    const r = SCHEMAS_OUTILS.mettreAJourEtablissement.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      champs: { enseigne: 'Cave du Rhône' },
    })
    expect(r.success).toBe(true)
  })

  it('creerVisite refuse une durée négative', () => {
    const r = SCHEMAS_OUTILS.creerVisite.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      duree_minutes: -5,
    })
    expect(r.success).toBe(false)
  })

  it('chercherEtablissements refuse une requête vide', () => {
    const r = SCHEMAS_OUTILS.chercherEtablissements.safeParse({ requete: '' })
    expect(r.success).toBe(false)
  })

  it('lireVisites applique la valeur par défaut de limite', () => {
    const r = SCHEMAS_OUTILS.lireVisites.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.limite).toBe(10)
  })

  it('mettreAJourHoraires refuse une clé jour anglaise', () => {
    const r = SCHEMAS_OUTILS.mettreAJourHoraires.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      horaires: { monday: null },
    })
    expect(r.success).toBe(false)
  })
})

describe('classification lecture / modification', () => {
  it('les 6 outils sont classés', () => {
    expect([...OUTILS_LECTURE, ...OUTILS_MODIFICATION].sort()).toEqual(
      ['chercherEtablissements', 'creerRappel', 'creerVisite', 'lireVisites', 'mettreAJourEtablissement', 'mettreAJourHoraires'],
    )
  })

  it('OUTILS_LECTURE contient exactement lireVisites et chercherEtablissements', () => {
    expect(OUTILS_LECTURE).toHaveLength(2)
    expect(OUTILS_LECTURE).toContain('lireVisites')
    expect(OUTILS_LECTURE).toContain('chercherEtablissements')
  })

  it('OUTILS_MODIFICATION contient exactement les 4 outils de modification', () => {
    expect(OUTILS_MODIFICATION).toHaveLength(4)
    expect(OUTILS_MODIFICATION).toContain('creerRappel')
    expect(OUTILS_MODIFICATION).toContain('creerVisite')
    expect(OUTILS_MODIFICATION).toContain('mettreAJourHoraires')
    expect(OUTILS_MODIFICATION).toContain('mettreAJourEtablissement')
  })
})
