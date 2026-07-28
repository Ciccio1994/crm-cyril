import { describe, it, expect } from 'vitest'
import {
  normaliserHeader,
  mapperStatut,
  mapperGroupePrix,
} from '@/lib/excel/normaliser'

describe('normaliserHeader', () => {
  it('lowercase + retire accents + trim', () => {
    expect(normaliserHeader('Enseigne')).toBe('enseigne')
    expect(normaliserHeader('  Téléphone  ')).toBe('telephone')
    expect(normaliserHeader('Code Postal')).toBe('code postal')
  })
  it('renvoie chaîne vide sur null/undefined/espaces', () => {
    expect(normaliserHeader(null)).toBe('')
    expect(normaliserHeader(undefined)).toBe('')
    expect(normaliserHeader('   ')).toBe('')
  })
})

describe('mapperStatut', () => {
  it('reconnait client actif', () => {
    expect(mapperStatut('client actif')).toBe('client_actif')
    expect(mapperStatut('actif')).toBe('client_actif')
    expect(mapperStatut('Client Actif')).toBe('client_actif')
  })
  it('reconnait prospect', () => {
    expect(mapperStatut('prospect')).toBe('prospect')
  })
  it('reconnait inactif', () => {
    expect(mapperStatut('inactif')).toBe('client_inactif')
    expect(mapperStatut('client inactif')).toBe('client_inactif')
  })
  it('défaut prospect si vide ou inconnu', () => {
    expect(mapperStatut(null)).toBe('prospect')
    expect(mapperStatut('')).toBe('prospect')
    expect(mapperStatut('bizarre')).toBe('prospect')
  })
})

describe('mapperGroupePrix', () => {
  it('uppercase les codes valides', () => {
    expect(mapperGroupePrix('horeca')).toBe('HORECA')
    expect(mapperGroupePrix('EPI')).toBe('EPI')
    expect(mapperGroupePrix('Part')).toBe('PART')
  })
  it('renvoie null si inconnu ou vide', () => {
    expect(mapperGroupePrix('inconnu')).toBeNull()
    expect(mapperGroupePrix(null)).toBeNull()
    expect(mapperGroupePrix('')).toBeNull()
  })
})
