export type JourSemaine =
  | 'lundi' | 'mardi' | 'mercredi' | 'jeudi'
  | 'vendredi' | 'samedi' | 'dimanche'

export const JOURS: JourSemaine[] = [
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
]

export interface Creneau {
  debut: string  // format HH:MM (24h)
  fin: string
}

// null = fermé toute la journée (info explicite)
// Absent du record parent = pas renseigné
export type HorairesJour = Creneau[] | null

export type Horaires = Partial<Record<JourSemaine, HorairesJour>>
