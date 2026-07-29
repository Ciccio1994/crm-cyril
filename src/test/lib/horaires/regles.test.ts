import { describe, it, expect } from 'vitest'
import {
  parseCreneauExcel, parseJourExcel,
  estOuvertMaintenant, prochaineOuverture,
  heureJourLocal, jourDeLaSemaine, formaterCreneau,
} from '@/lib/horaires/regles'

describe('parseCreneauExcel', () => {
  it('parse "8h-12h"', () => {
    expect(parseCreneauExcel('8h-12h')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('parse "8:00-12:00"', () => {
    expect(parseCreneauExcel('8:00-12:00')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('parse "8-12" (heures pures)', () => {
    expect(parseCreneauExcel('8-12')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('parse "8h30-12h45"', () => {
    expect(parseCreneauExcel('8h30-12h45')).toEqual({ debut: '08:30', fin: '12:45' })
  })
  it('parse "14h00-18h30" (avec 00)', () => {
    expect(parseCreneauExcel('14h00-18h30')).toEqual({ debut: '14:00', fin: '18:30' })
  })
  it('tolère espaces autour du tiret', () => {
    expect(parseCreneauExcel('8h - 12h')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('renvoie null si non parsable', () => {
    expect(parseCreneauExcel("n'importe quoi")).toBeNull()
    expect(parseCreneauExcel('')).toBeNull()
    expect(parseCreneauExcel('8h')).toBeNull()
  })
})

describe('parseJourExcel', () => {
  it('vide ou undefined → undefined (pas renseigné)', () => {
    expect(parseJourExcel('')).toBeUndefined()
    expect(parseJourExcel(null)).toBeUndefined()
    expect(parseJourExcel(undefined)).toBeUndefined()
  })

  it('"Fermé" / "fermé" / "-" → null (fermé explicite)', () => {
    expect(parseJourExcel('Fermé')).toBeNull()
    expect(parseJourExcel('fermé')).toBeNull()
    expect(parseJourExcel('-')).toBeNull()
    expect(parseJourExcel('FERME')).toBeNull()
  })

  it('un seul créneau', () => {
    expect(parseJourExcel('8h-18h')).toEqual([{ debut: '08:00', fin: '18:00' }])
  })

  it('double créneau séparé par " / "', () => {
    expect(parseJourExcel('8h-12h / 14h-18h')).toEqual([
      { debut: '08:00', fin: '12:00' },
      { debut: '14:00', fin: '18:00' },
    ])
  })

  it('double créneau séparé par ","', () => {
    expect(parseJourExcel('8h-12h, 14h-18h')).toEqual([
      { debut: '08:00', fin: '12:00' },
      { debut: '14:00', fin: '18:00' },
    ])
  })

  it('ignore un créneau non parsable dans un double', () => {
    expect(parseJourExcel("8h-12h / n'importe quoi")).toEqual([
      { debut: '08:00', fin: '12:00' },
    ])
  })
})

describe('heureJourLocal', () => {
  it('renvoie HH:MM Zurich pour une ISO UTC', () => {
    // 2026-07-28 12:00 UTC = 14:00 Zurich (été)
    expect(heureJourLocal('2026-07-28T12:00:00Z')).toBe('14:00')
  })
})

describe('jourDeLaSemaine', () => {
  it("renvoie 'lundi' pour un lundi", () => {
    expect(jourDeLaSemaine('2026-07-27T10:00:00Z')).toBe('lundi')
  })
  it("renvoie 'dimanche' pour un dimanche", () => {
    expect(jourDeLaSemaine('2026-07-26T10:00:00Z')).toBe('dimanche')
  })
})

describe('estOuvertMaintenant', () => {
  const NOW_LUNDI_10H = '2026-07-27T08:00:00Z'  // 10:00 Zurich, lundi

  it('renvoie false si horaires null/undefined', () => {
    expect(estOuvertMaintenant(null, NOW_LUNDI_10H)).toBe(false)
    expect(estOuvertMaintenant({}, NOW_LUNDI_10H)).toBe(false)
  })

  it('renvoie true dans le créneau du jour', () => {
    const h = { lundi: [{ debut: '08:00', fin: '18:00' }] }
    expect(estOuvertMaintenant(h, NOW_LUNDI_10H)).toBe(true)
  })

  it("renvoie false avant l'ouverture", () => {
    const h = { lundi: [{ debut: '14:00', fin: '18:00' }] }
    expect(estOuvertMaintenant(h, NOW_LUNDI_10H)).toBe(false)
  })

  it('renvoie false pendant la pause déjeuner', () => {
    const h = {
      lundi: [
        { debut: '08:00', fin: '12:00' },
        { debut: '14:00', fin: '18:00' },
      ],
    }
    // 12:30 Zurich = 10:30 UTC été
    expect(estOuvertMaintenant(h, '2026-07-27T10:30:00Z')).toBe(false)
  })

  it('renvoie false si jour marqué fermé (null)', () => {
    const h = { lundi: null }
    expect(estOuvertMaintenant(h, NOW_LUNDI_10H)).toBe(false)
  })
})

describe('prochaineOuverture', () => {
  it('renvoie null si actuellement ouvert', () => {
    const h = { lundi: [{ debut: '08:00', fin: '18:00' }] }
    expect(prochaineOuverture(h, '2026-07-27T08:00:00Z')).toBeNull()
  })

  it("renvoie 'Ouvre à 14:00' si pause déjeuner en cours", () => {
    const h = {
      lundi: [
        { debut: '08:00', fin: '12:00' },
        { debut: '14:00', fin: '18:00' },
      ],
    }
    expect(prochaineOuverture(h, '2026-07-27T10:30:00Z')).toBe('Ouvre à 14:00')
  })

  it("renvoie 'Ouvre demain à 08:00' si fermé après horaires", () => {
    const h = {
      lundi: [{ debut: '08:00', fin: '18:00' }],
      mardi:  [{ debut: '08:00', fin: '18:00' }],
    }
    // Lundi 20h Zurich = 18h UTC été
    expect(prochaineOuverture(h, '2026-07-27T18:00:00Z')).toBe('Ouvre demain à 08:00')
  })

  it("renvoie 'Ouvre demain à 08:00' quand dimanche fermé + lundi ouvert (délai=1)", () => {
    const h = {
      lundi: [{ debut: '08:00', fin: '18:00' }],
      dimanche: null,
    }
    // Dimanche 12h Zurich = 10h UTC été
    expect(prochaineOuverture(h, '2026-07-26T10:00:00Z')).toBe('Ouvre demain à 08:00')
  })

  it("renvoie 'Ouvre mercredi à 08:00' quand délai > 1 jour", () => {
    const h = {
      mercredi: [{ debut: '08:00', fin: '18:00' }],
    }
    // Dimanche 12h Zurich = 10h UTC été → mercredi = +3 jours
    expect(prochaineOuverture(h, '2026-07-26T10:00:00Z')).toBe('Ouvre mercredi à 08:00')
  })

  it("renvoie null si aucun jour de la semaine n'est renseigné", () => {
    expect(prochaineOuverture({}, '2026-07-27T08:00:00Z')).toBeNull()
    expect(prochaineOuverture(null, '2026-07-27T08:00:00Z')).toBeNull()
  })
})

describe('formaterCreneau', () => {
  it('renvoie "8h – 18h" pour créneau entier', () => {
    expect(formaterCreneau({ debut: '08:00', fin: '18:00' })).toBe('8h – 18h')
  })
  it('renvoie "8h30 – 12h45" pour minutes ≠ 00', () => {
    expect(formaterCreneau({ debut: '08:30', fin: '12:45' })).toBe('8h30 – 12h45')
  })
})
