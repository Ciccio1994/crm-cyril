import { describe, it, expect } from 'vitest'
import { EtablissementCreateSchema } from '@/lib/validation/etablissement'
import { ContactCreateSchema } from '@/lib/validation/contact'
import { VisiteCreateSchema, VisiteManqueeCreateSchema } from '@/lib/validation/visite'

describe('EtablissementCreateSchema', () => {
  it('accepte un payload minimal valide', () => {
    const result = EtablissementCreateSchema.safeParse({ enseigne: 'Test' })
    expect(result.success).toBe(true)
  })
  it('rejette une enseigne vide', () => {
    const result = EtablissementCreateSchema.safeParse({ enseigne: '' })
    expect(result.success).toBe(false)
  })
  it('rejette un statut inconnu', () => {
    const result = EtablissementCreateSchema.safeParse({
      enseigne: 'Test',
      statut: 'inventé',
    })
    expect(result.success).toBe(false)
  })
})

describe('ContactCreateSchema', () => {
  it('accepte payload minimal', () => {
    const result = ContactCreateSchema.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      nom: 'Dupont',
    })
    expect(result.success).toBe(true)
  })
  it('rejette sans etablissement_id', () => {
    const result = ContactCreateSchema.safeParse({ nom: 'Dupont' })
    expect(result.success).toBe(false)
  })
})

describe('VisiteCreateSchema', () => {
  it('accepte visite normale minimale', () => {
    const result = VisiteCreateSchema.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      date_visite: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })
  it('rejette duree_minutes négative', () => {
    const result = VisiteCreateSchema.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      date_visite: new Date().toISOString(),
      duree_minutes: -5,
    })
    expect(result.success).toBe(false)
  })
})

describe('VisiteManqueeCreateSchema', () => {
  it('accepte visite manquée sans motif', () => {
    const result = VisiteManqueeCreateSchema.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      date_visite: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })
  it('accepte un motif valide', () => {
    const result = VisiteManqueeCreateSchema.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      date_visite: new Date().toISOString(),
      motif_manquee: 'ferme',
    })
    expect(result.success).toBe(true)
  })
  it('rejette un motif invalide', () => {
    const result = VisiteManqueeCreateSchema.safeParse({
      etablissement_id: '11111111-1111-4111-8111-111111111111',
      date_visite: new Date().toISOString(),
      motif_manquee: 'pas_envie',
    })
    expect(result.success).toBe(false)
  })
})
