import type { StatutCommercial, Visite } from '@/types/database'

const ZONE = 'Europe/Zurich'

export function estClient(s: StatutCommercial): boolean {
  return s === 'client_actif' || s === 'client_inactif'
}

export function estProspect(s: StatutCommercial): boolean {
  return s === 'prospect'
}

// Renvoie YYYY-MM-DD selon la zone Europe/Zurich (gère l'heure d'été).
export function dateJourLocal(iso: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('fr-CH', {
    timeZone: ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(d)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const j = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${j}`
}

export interface VisiteAvecStatut extends Visite {
  etablissement: { statut: StatutCommercial } | null
}

export interface CompteurJour {
  jour: string
  clients: number
  prospects: number
}

export interface SeuilsObjectif {
  objectif_clients: number
  objectif_prospects: number
}

export function compterVisitesDuJour(
  visites: VisiteAvecStatut[],
  maintenantIso: string = new Date().toISOString(),
): CompteurJour {
  const jour = dateJourLocal(maintenantIso)
  let clients = 0
  let prospects = 0
  for (const v of visites) {
    if (v.est_manquee) continue
    if (v.deleted_at) continue
    if (dateJourLocal(v.date_visite) !== jour) continue
    const s = v.etablissement?.statut
    if (!s) continue
    if (estClient(s)) clients++
    else if (estProspect(s)) prospects++
  }
  return { jour, clients, prospects }
}

export function aObjectifAtteint(
  compteur: { clients: number; prospects: number },
  seuils: SeuilsObjectif,
): boolean {
  return (
    compteur.clients >= seuils.objectif_clients &&
    compteur.prospects >= seuils.objectif_prospects
  )
}

export interface JourHistorique {
  jour: string
  clients: number
  prospects: number
  atteint: boolean
}

export function calculerHistorique28j(
  visites: VisiteAvecStatut[],
  maintenantIso: string,
  seuils: SeuilsObjectif,
): JourHistorique[] {
  const jourAujourdhui = dateJourLocal(maintenantIso)
  const [y, m, d] = jourAujourdhui.split('-').map(Number)
  const jours: string[] = []
  for (let i = 27; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i, 12))
    jours.push(dateJourLocal(dt.toISOString()))
  }

  const compteurParJour = new Map<string, { clients: number; prospects: number }>()
  for (const j of jours) compteurParJour.set(j, { clients: 0, prospects: 0 })

  for (const v of visites) {
    if (v.est_manquee || v.deleted_at) continue
    const j = dateJourLocal(v.date_visite)
    const c = compteurParJour.get(j)
    if (!c) continue
    const s = v.etablissement?.statut
    if (!s) continue
    if (estClient(s)) c.clients++
    else if (estProspect(s)) c.prospects++
  }

  return jours.map((j) => {
    const c = compteurParJour.get(j)!
    return {
      jour: j,
      clients: c.clients,
      prospects: c.prospects,
      atteint:
        c.clients >= seuils.objectif_clients &&
        c.prospects >= seuils.objectif_prospects,
    }
  })
}
