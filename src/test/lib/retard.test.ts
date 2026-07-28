import { describe, it, expect } from 'vitest'
import { calculerRetard } from '@/lib/retard'

describe('calculerRetard', () => {
  it('renvoie non en retard si visité récemment (freq 4 sem)', () => {
    const r = calculerRetard('2026-07-20T00:00:00Z', 4, '2026-07-28T00:00:00Z')
    expect(r.est_en_retard).toBe(false)
    expect(r.jours_depuis_visite).toBe(8)
  })
  it('renvoie en retard si jours > freq_semaines * 7', () => {
    const r = calculerRetard('2026-05-01T00:00:00Z', 4, '2026-07-28T00:00:00Z')
    expect(r.est_en_retard).toBe(true)
  })
  it('renvoie non en retard si pile freq_semaines * 7 jours', () => {
    const r = calculerRetard('2026-06-30T00:00:00Z', 4, '2026-07-28T00:00:00Z')
    expect(r.jours_depuis_visite).toBe(28)
    expect(r.est_en_retard).toBe(false)
  })
  it('renvoie null jours et non en retard si jamais visité', () => {
    const r = calculerRetard(null, 4, '2026-07-28T00:00:00Z')
    expect(r.jours_depuis_visite).toBeNull()
    expect(r.est_en_retard).toBe(false)
  })
  it('respecte la fréquence hot (2 sem)', () => {
    const r = calculerRetard('2026-07-10T00:00:00Z', 2, '2026-07-28T00:00:00Z')
    expect(r.jours_depuis_visite).toBe(18)
    expect(r.est_en_retard).toBe(true)
  })
})
