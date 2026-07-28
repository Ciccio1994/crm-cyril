'use server'

import { createClient } from '@/lib/supabase/server'
import {
  compterVisitesDuJour,
  calculerHistorique28j,
  aObjectifAtteint,
  type CompteurJour,
  type JourHistorique,
  type SeuilsObjectif,
  type VisiteAvecStatut,
} from '@/lib/objectif/regles'

type ActionResult<T> = { data?: T; erreur?: string }

async function lireSeuils(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<SeuilsObjectif> {
  const { data } = await supabase.from('parametre').select('cle, valeur')
  const map = new Map<string, unknown>()
  for (const row of data ?? []) {
    map.set((row as { cle: string }).cle, (row as { valeur: unknown }).valeur)
  }
  return {
    objectif_clients:   Number(map.get('objectif_visites_clients_par_jour') ?? 6),
    objectif_prospects: Number(map.get('objectif_visites_prospects_par_jour') ?? 2),
  }
}

export interface ObjectifDuJour {
  compteur: CompteurJour
  seuils: SeuilsObjectif
  atteint: boolean
}

export async function lireObjectifDuJour(): Promise<ActionResult<ObjectifDuJour>> {
  const supabase = await createClient()
  const seuils = await lireSeuils(supabase)

  const now = new Date()
  const debut = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('visite')
    .select('*, etablissement(statut)')
    .is('deleted_at', null)
    .gte('date_visite', debut)
    .order('date_visite', { ascending: false })
  if (error) return { erreur: error.message }

  const compteur = compterVisitesDuJour(
    (data ?? []) as VisiteAvecStatut[],
    now.toISOString(),
  )
  return {
    data: {
      compteur,
      seuils,
      atteint: aObjectifAtteint(compteur, seuils),
    },
  }
}

export interface HistoriqueHebdo {
  jours: JourHistorique[]
  seuils: SeuilsObjectif
  joursAtteintCetteSemaine: number
  joursAtteint28j: number
}

export async function lireHistoriqueHebdo(): Promise<ActionResult<HistoriqueHebdo>> {
  const supabase = await createClient()
  const seuils = await lireSeuils(supabase)

  const now = new Date()
  const debut = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('visite')
    .select('*, etablissement(statut)')
    .is('deleted_at', null)
    .gte('date_visite', debut)
    .order('date_visite', { ascending: false })
  if (error) return { erreur: error.message }

  const jours = calculerHistorique28j(
    (data ?? []) as VisiteAvecStatut[],
    now.toISOString(),
    seuils,
  )
  const derniers7 = jours.slice(-7)
  return {
    data: {
      jours,
      seuils,
      joursAtteintCetteSemaine: derniers7.filter((j) => j.atteint).length,
      joursAtteint28j: jours.filter((j) => j.atteint).length,
    },
  }
}
