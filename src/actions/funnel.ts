'use server'

import { createClient } from '@/lib/supabase/server'
import type { Etablissement, StatutCommercial } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: string }

export interface FiltresFunnel {
  tournee_id?: string
}

export type StatistiquesFunnel = Record<StatutCommercial, number> & { total: number }

export async function lireStatistiquesFunnel(
  filtres: FiltresFunnel = {},
): Promise<ActionResult<StatistiquesFunnel>> {
  const supabase = await createClient()
  let query = supabase
    .from('etablissement')
    .select('statut')
    .is('deleted_at', null)
  if (filtres.tournee_id) query = query.eq('tournee_id', filtres.tournee_id)
  const { data, error } = await query.order('statut')
  if (error) return { erreur: error.message }

  const stats: StatistiquesFunnel = {
    prospect: 0, client_actif: 0, client_inactif: 0,
    pas_interesse: 0, prospect_abandonne: 0, ferme: 0, contentieux: 0,
    total: 0,
  }
  for (const row of data ?? []) {
    const s = (row as { statut: StatutCommercial }).statut
    stats[s] = (stats[s] ?? 0) + 1
    stats.total++
  }
  return { data: stats }
}

export async function lireClientsEnRetard(
  tournee_id?: string,
): Promise<ActionResult<Etablissement[]>> {
  const supabase = await createClient()
  let query = supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines)')
    .is('deleted_at', null)
    .in('statut', ['client_actif', 'client_inactif'])
  if (tournee_id) query = query.eq('tournee_id', tournee_id)
  const { data, error } = await query.order('derniere_visite_at', {
    ascending: true, nullsFirst: true,
  })
  if (error) return { erreur: error.message }
  return { data: (data ?? []) as Etablissement[] }
}

export async function lireSuggestionsProspection(
  tournee_id?: string,
): Promise<ActionResult<Etablissement[]>> {
  const supabase = await createClient()
  let query = supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines)')
    .is('deleted_at', null)
    .eq('statut', 'prospect')
  if (tournee_id) query = query.eq('tournee_id', tournee_id)
  const { data, error } = await query.order('derniere_visite_at', {
    ascending: true, nullsFirst: true,
  })
  if (error) return { erreur: error.message }
  return { data: (data ?? []).slice(0, 10) as Etablissement[] }
}
