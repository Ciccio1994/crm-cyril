'use server'

import { createClient } from '@/lib/supabase/server'
import { rappelInputSchema, type Rappel, type RappelInput, type CreePar } from '@/types/rappel'

type ActionResult<T> = { data?: T; erreur?: string }

const SELECT_RAPPEL = '*, etablissement:etablissement_id (id, enseigne)'

export async function creerRappel(
  input: RappelInput,
  origine: CreePar = 'utilisateur',
  conversationId: string | null = null,
): Promise<ActionResult<Rappel>> {
  const parsed = rappelInputSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues.map(i => i.message).join(' — ') }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .insert({ ...parsed.data, cree_par: origine, conversation_id: conversationId })
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Erreur inconnue' }
  return { data: data as Rappel }
}

export async function marquerRappelFait(id: string): Promise<ActionResult<Rappel>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update({ statut: 'fait', fait_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function reporterRappel(id: string, nouvelleEcheance: string): Promise<ActionResult<Rappel>> {
  const echeance = rappelInputSchema.shape.echeance.safeParse(nouvelleEcheance)
  if (!echeance.success) return { erreur: 'Date invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update({ echeance: echeance.data })
    .eq('id', id)
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function annulerRappel(id: string): Promise<ActionResult<Rappel>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update({ statut: 'annule' })
    .eq('id', id)
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function modifierRappel(id: string, input: RappelInput): Promise<ActionResult<Rappel>> {
  const parsed = rappelInputSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues.map(i => i.message).join(' — ') }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update(parsed.data)
    .eq('id', id)
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function lireRappels(etabId?: string): Promise<Rappel[]> {
  const supabase = await createClient()
  let q = supabase.from('rappel').select(SELECT_RAPPEL).is('deleted_at', null)
  if (etabId) q = q.eq('etablissement_id', etabId)
  const { data } = await q.order('echeance', { ascending: true })
  return (data ?? []) as Rappel[]
}

export async function compterRappelsDus(): Promise<number> {
  const supabase = await createClient()
  const finJour = new Date()
  finJour.setHours(23, 59, 59, 999)
  const { count } = await supabase
    .from('rappel')
    .select('*', { count: 'exact', head: true })
    .eq('statut', 'a_faire')
    .is('deleted_at', null)
    .lte('echeance', finJour.toISOString())
  return count ?? 0
}
