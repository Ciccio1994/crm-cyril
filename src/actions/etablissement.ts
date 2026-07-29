'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  EtablissementCreateSchema,
  EtablissementUpdateSchema,
} from '@/lib/validation/etablissement'
import type { Etablissement } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: unknown }

export async function creerEtablissement(input: unknown): Promise<ActionResult<Etablissement>> {
  const parsed = EtablissementCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .insert(parsed.data)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath('/etablissements')
  return { data: data as Etablissement }
}

export async function mettreAJourEtablissement(
  id: unknown,
  input: unknown
): Promise<ActionResult<Etablissement>> {
  if (typeof id !== 'string' || !id.match(/^[0-9a-f-]{36}$/i)) {
    return { erreur: { message: 'ID invalide' } }
  }
  const parsed = EtablissementUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath('/etablissements')
  revalidatePath(`/etablissements/${id}`)
  return { data: data as Etablissement }
}

export async function supprimerEtablissement(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('etablissement')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { erreur: { message: error.message } }
  revalidatePath('/etablissements')
  return {}
}

export interface FiltresEtablissement {
  tournee_id?: string
  statut?: string
  recherche?: string
}

export async function lireEtablissements(
  filtres: FiltresEtablissement = {}
): Promise<ActionResult<Etablissement[]>> {
  const supabase = await createClient()

  let query = supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines), contacts:contact(*)')
    .is('deleted_at', null)

  if (filtres.tournee_id) query = query.eq('tournee_id', filtres.tournee_id)
  if (filtres.statut)     query = query.eq('statut', filtres.statut)
  if (filtres.recherche) {
    const q = `%${filtres.recherche}%`
    query = query.or(`enseigne.ilike.${q},ville.ilike.${q},code_postal.ilike.${q}`)
  }

  const { data, error } = await query.order('enseigne', { ascending: true })
  if (error) return { erreur: { message: error.message } }
  // Filtre les contacts soft-deleted côté client (Supabase n'accepte pas de filtre nested inline simple).
  const filtered = (data as Etablissement[]).map((e) => ({
    ...e,
    contacts: e.contacts?.filter((c) => c.deleted_at === null),
  }))
  return { data: filtered }
}

export async function lireEtablissement(id: string): Promise<ActionResult<Etablissement>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines), entreprise(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) return { erreur: { message: error.message } }
  return { data: data as Etablissement }
}
