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
