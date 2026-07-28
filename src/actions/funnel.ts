'use server'

import { createClient } from '@/lib/supabase/server'
import { evaluerStatutClient } from '@/lib/funnel/regles'
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

// -----------------------------------------------------------------------------
// actualiserFunnel — batch retrogradation (déclenchée manuellement en V1b,
// automatisée via cron en V2).
// -----------------------------------------------------------------------------

export interface RapportActualisation {
  examines: number
  vers_inactif: number
  vers_abandonne: number
  erreurs: { etablissement_id: string; message: string }[]
}

export async function actualiserFunnel(): Promise<ActionResult<RapportActualisation>> {
  const supabase = await createClient()
  const rapport: RapportActualisation = {
    examines: 0, vers_inactif: 0, vers_abandonne: 0, erreurs: [],
  }

  const { data: etabs, error } = await supabase
    .from('etablissement')
    .select('id, statut, derniere_commande_at, derniere_visite_at, seuil_inactivite_mois')
    .is('deleted_at', null)
    .in('statut', ['client_actif', 'prospect'])
  if (error) return { erreur: error.message }
  if (!etabs || etabs.length === 0) return { data: rapport }

  const now = new Date().toISOString()

  for (const e of etabs) {
    rapport.examines++
    // Nombre de visites : requis uniquement pour les prospects
    let visites_count = 0
    if (e.statut === 'prospect') {
      const { data: vs } = await supabase
        .from('visite')
        .select('id')
        .is('deleted_at', null)
        .eq('etablissement_id', e.id)
      visites_count = vs?.length ?? 0
    }

    const evalRes = evaluerStatutClient({
      statut: e.statut,
      derniere_commande_at: e.derniere_commande_at,
      derniere_visite_at: e.derniere_visite_at,
      seuil_inactivite_mois: e.seuil_inactivite_mois ?? 12,
      visites_count,
    }, now)

    if (evalRes.nouveauStatut === e.statut) continue

    const { error: upErr } = await supabase
      .from('etablissement')
      .update({ statut: evalRes.nouveauStatut })
      .eq('id', e.id)
    if (upErr) {
      rapport.erreurs.push({ etablissement_id: e.id, message: upErr.message })
      continue
    }
    if (evalRes.nouveauStatut === 'client_inactif') rapport.vers_inactif++
    if (evalRes.nouveauStatut === 'prospect_abandonne') rapport.vers_abandonne++
  }

  return { data: rapport }
}
