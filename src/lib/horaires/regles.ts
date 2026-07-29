import type { Creneau, HorairesJour, Horaires, JourSemaine } from '@/types/horaires'
import { JOURS } from '@/types/horaires'

const ZONE = 'Europe/Zurich'

// ---------------------------------------------------------------------------
// Parse Excel
// ---------------------------------------------------------------------------

function normaliseHeure(brut: string): string | null {
  const m = brut.trim().match(/^(\d{1,2})(?:h|:)?(\d{2})?$/i)
  if (!m) return null
  const h = Number(m[1])
  const mm = m[2] ? Number(m[2]) : 0
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function parseCreneauExcel(v: string | null | undefined): Creneau | null {
  if (!v) return null
  const parts = v.trim().split(/\s*-\s*/)
  if (parts.length !== 2) return null
  const debut = normaliseHeure(parts[0])
  const fin = normaliseHeure(parts[1])
  if (!debut || !fin) return null
  return { debut, fin }
}

export function parseJourExcel(
  v: string | null | undefined,
): HorairesJour | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return undefined
  const s = String(v).trim()
  const bas = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (bas === 'ferme' || bas === 'fermee' || bas === '-') return null
  const parts = s.split(/\s*[/,]\s*/)
  const creneaux: Creneau[] = []
  for (const p of parts) {
    const c = parseCreneauExcel(p)
    if (c) creneaux.push(c)
  }
  return creneaux.length > 0 ? creneaux : undefined
}

// ---------------------------------------------------------------------------
// Ouvert maintenant
// ---------------------------------------------------------------------------

export function heureJourLocal(iso: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('fr-CH', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return fmt.format(d).replace('.', ':')
}

export function jourDeLaSemaine(iso: string): JourSemaine {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'long',
  })
  const jourEn = fmt.format(d).toLowerCase()
  const map: Record<string, JourSemaine> = {
    monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi',
    thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche',
  }
  return map[jourEn]
}

function heureEnMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function estOuvertMaintenant(
  horaires: Horaires | null | undefined,
  iso: string = new Date().toISOString(),
): boolean {
  if (!horaires) return false
  const jour = jourDeLaSemaine(iso)
  const creneaux = horaires[jour]
  if (!creneaux || creneaux.length === 0) return false
  const now = heureEnMinutes(heureJourLocal(iso))
  return creneaux.some(
    (c) => now >= heureEnMinutes(c.debut) && now < heureEnMinutes(c.fin),
  )
}

// ---------------------------------------------------------------------------
// Prochaine ouverture
// ---------------------------------------------------------------------------

function prochainCreneauMemeJour(
  creneaux: HorairesJour,
  heureCourante: string,
): Creneau | null {
  if (!creneaux) return null
  const now = heureEnMinutes(heureCourante)
  const suivant = creneaux.find((c) => heureEnMinutes(c.debut) > now)
  return suivant ?? null
}

function libelleJour(index: number, jourActuel: JourSemaine): string {
  const jour = JOURS[index]
  if (jour === jourActuel) return "aujourd'hui"
  const jourActuelIdx = JOURS.indexOf(jourActuel)
  const delta = (index - jourActuelIdx + 7) % 7
  if (delta === 1) return 'demain'
  return jour
}

export function prochaineOuverture(
  horaires: Horaires | null | undefined,
  iso: string = new Date().toISOString(),
): string | null {
  if (!horaires) return null
  if (estOuvertMaintenant(horaires, iso)) return null

  const jourActuel = jourDeLaSemaine(iso)
  const heureCourante = heureJourLocal(iso)

  // 1. Prochain créneau aujourd'hui
  const creneauMemeJour = prochainCreneauMemeJour(
    horaires[jourActuel] ?? null,
    heureCourante,
  )
  if (creneauMemeJour) return `Ouvre à ${creneauMemeJour.debut}`

  // 2. Chercher le prochain jour ouvert (max 7 jours)
  const idxActuel = JOURS.indexOf(jourActuel)
  for (let i = 1; i <= 7; i++) {
    const idx = (idxActuel + i) % 7
    const creneaux = horaires[JOURS[idx]]
    if (creneaux && creneaux.length > 0) {
      const label = libelleJour(idx, jourActuel)
      return `Ouvre ${label} à ${creneaux[0].debut}`
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Formatage affichage
// ---------------------------------------------------------------------------

function formaterHeure(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  const heureInt = Number(h)
  return m === '00' ? `${heureInt}h` : `${heureInt}h${m}`
}

export function formaterCreneau(c: Creneau): string {
  return `${formaterHeure(c.debut)} – ${formaterHeure(c.fin)}`
}
