'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  VisiteCreateSchema,
  VisiteManqueeCreateSchema,
  VisiteUpdateSchema,
} from '@/lib/validation/visite'
import type { Visite } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: unknown }

export async function creerVisite(input: unknown): Promise<ActionResult<Visite>> {
  const parsed = VisiteCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .insert({ ...parsed.data, est_manquee: false })
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath(`/etablissements/${parsed.data.etablissement_id}`)
  return { data: data as Visite }
}

export async function creerVisiteManquee(input: unknown): Promise<ActionResult<Visite>> {
  const parsed = VisiteManqueeCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .insert({ ...parsed.data, est_manquee: true })
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath(`/etablissements/${parsed.data.etablissement_id}`)
  return { data: data as Visite }
}

export async function lireVisites(etablissementId: string): Promise<ActionResult<Visite[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .is('deleted_at', null)
    .order('date_visite', { ascending: false })

  if (error) return { erreur: { message: error.message } }
  return { data: data as Visite[] }
}

export async function mettreAJourVisite(
  id: string,
  input: unknown
): Promise<ActionResult<Visite>> {
  const parsed = VisiteUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  return { data: data as Visite }
}
