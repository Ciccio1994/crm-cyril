import { describe, it, expect } from 'vitest'
import { parseGooglePeriods } from '@/lib/horaires/google-parser'

describe('parseGooglePeriods', () => {
  it('renvoie null si periods vide ou undefined', () => {
    expect(parseGooglePeriods(undefined)).toBeNull()
    expect(parseGooglePeriods([])).toBeNull()
  })

  it('parse une semaine Lundi-Vendredi 8h-18h avec Samedi/Dimanche fermés', () => {
    const periods = [
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
      { open: { day: 2, hour: 8, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
      { open: { day: 3, hour: 8, minute: 0 }, close: { day: 3, hour: 18, minute: 0 } },
      { open: { day: 4, hour: 8, minute: 0 }, close: { day: 4, hour: 18, minute: 0 } },
      { open: { day: 5, hour: 8, minute: 0 }, close: { day: 5, hour: 18, minute: 0 } },
    ]
    expect(parseGooglePeriods(periods)).toEqual({
      lundi:    [{ debut: '08:00', fin: '18:00' }],
      mardi:    [{ debut: '08:00', fin: '18:00' }],
      mercredi: [{ debut: '08:00', fin: '18:00' }],
      jeudi:    [{ debut: '08:00', fin: '18:00' }],
      vendredi: [{ debut: '08:00', fin: '18:00' }],
      samedi:   null,
      dimanche: null,
    })
  })

  it('gère la pause déjeuner (2 créneaux/jour, tri ascendant)', () => {
    const periods = [
      // Volontairement dans le désordre pour tester le tri
      { open: { day: 1, hour: 14, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
      { open: { day: 1, hour: 8,  minute: 0 }, close: { day: 1, hour: 12, minute: 0 } },
    ]
    expect(parseGooglePeriods(periods)).toEqual({
      lundi: [
        { debut: '08:00', fin: '12:00' },
        { debut: '14:00', fin: '18:00' },
      ],
      mardi: null, mercredi: null, jeudi: null, vendredi: null,
      samedi: null, dimanche: null,
    })
  })

  it("Google day=0 → dimanche (JS et Google diffèrent d'un jour)", () => {
    const periods = [
      { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 16, minute: 0 } },
    ]
    const r = parseGooglePeriods(periods)!
    expect(r.dimanche).toEqual([{ debut: '10:00', fin: '16:00' }])
    expect(r.lundi).toBeNull()
  })

  it('formate correctement les minutes (padding à 2 chiffres)', () => {
    const periods = [
      { open: { day: 1, hour: 8, minute: 30 }, close: { day: 1, hour: 12, minute: 45 } },
    ]
    const r = parseGooglePeriods(periods)!
    expect(r.lundi).toEqual([{ debut: '08:30', fin: '12:45' }])
  })

  it('ignore les periods sans open ou sans close', () => {
    const periods = [
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 12, minute: 0 } },
      { open: { day: 2, hour: 8, minute: 0 } },  // pas de close
      { close: { day: 3, hour: 8, minute: 0 } },  // pas d'open
    ]
    const r = parseGooglePeriods(periods)!
    expect(r.lundi).toEqual([{ debut: '08:00', fin: '12:00' }])
    expect(r.mardi).toBeNull()
    expect(r.mercredi).toBeNull()
  })

  it('ignore les days invalides (< 0 ou > 6)', () => {
    const periods = [
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
      { open: { day: 7, hour: 8, minute: 0 }, close: { day: 7, hour: 18, minute: 0 } },
      { open: { day: -1, hour: 8, minute: 0 }, close: { day: -1, hour: 18, minute: 0 } },
    ]
    const r = parseGooglePeriods(periods)!
    expect(r.lundi).toEqual([{ debut: '08:00', fin: '18:00' }])
    // Rien d'autre corrompu
    expect(Object.keys(r)).toHaveLength(7)
  })
})
