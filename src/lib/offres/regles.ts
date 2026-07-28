import { dateJourLocal } from '@/lib/objectif/regles'
import type { Offre } from '@/types/database'

export type StatutOffre = 'en_cours' | 'a_venir' | 'expiree'

export function statutOffre(
  offre: Offre,
  maintenantIso: string = new Date().toISOString(),
): StatutOffre {
  const jour = dateJourLocal(maintenantIso)
  const { date_debut, date_fin } = offre
  if (date_debut && jour < date_debut) return 'a_venir'
  if (date_fin && jour > date_fin) return 'expiree'
  return 'en_cours'
}

export function joursAvantExpiration(
  offre: Offre,
  maintenantIso: string = new Date().toISOString(),
): number | null {
  if (!offre.date_fin) return null
  const jour = dateJourLocal(maintenantIso)
  const [jy, jm, jj] = jour.split('-').map(Number)
  const [fy, fm, fj] = offre.date_fin.split('-').map(Number)
  const now = Date.UTC(jy, jm - 1, jj)
  const fin = Date.UTC(fy, fm - 1, fj)
  return Math.round((fin - now) / (1000 * 60 * 60 * 24))
}
