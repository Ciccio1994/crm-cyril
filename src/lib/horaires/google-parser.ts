import type { Horaires, JourSemaine } from '@/types/horaires'
import { JOURS } from '@/types/horaires'

// Google Places API : les jours vont de 0 (dimanche) à 6 (samedi)
const GOOGLE_DAY_TO_JOUR: Record<number, JourSemaine> = {
  0: 'dimanche',
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
}

export interface GoogleHeure {
  day?: number
  hour?: number
  minute?: number
}

export interface GooglePeriod {
  open?: GoogleHeure
  close?: GoogleHeure
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function parseGooglePeriods(
  periods: GooglePeriod[] | undefined,
): Horaires | null {
  if (!periods || periods.length === 0) return null

  // Initialisation : tous les jours à null (fermé) par défaut
  const horaires: Horaires = {}
  for (const j of JOURS) horaires[j] = null

  let auMoinsUneVraiePeriode = false

  for (const p of periods) {
    if (!p.open || !p.close) continue
    if (typeof p.open.day !== 'number') continue
    const jour = GOOGLE_DAY_TO_JOUR[p.open.day]
    if (!jour) continue

    const debut = `${pad(p.open.hour ?? 0)}:${pad(p.open.minute ?? 0)}`
    const fin = `${pad(p.close.hour ?? 0)}:${pad(p.close.minute ?? 0)}`

    if (horaires[jour] === null) horaires[jour] = []
    horaires[jour]!.push({ debut, fin })
    auMoinsUneVraiePeriode = true
  }

  if (!auMoinsUneVraiePeriode) return null

  // Tri des créneaux par heure de début (Google peut envoyer désordonné)
  for (const j of JOURS) {
    const cr = horaires[j]
    if (cr) cr.sort((a, b) => a.debut.localeCompare(b.debut))
  }

  return horaires
}
