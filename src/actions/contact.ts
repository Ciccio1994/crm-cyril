'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ContactCreateSchema, ContactUpdateSchema } from '@/lib/validation/contact'
import type { Contact } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: unknown }

export async function creerContact(input: unknown): Promise<ActionResult<Contact>> {
  const parsed = ContactCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact')
    .insert(parsed.data)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath(`/etablissements/${parsed.data.etablissement_id}`)
  return { data: data as Contact }
}

export async function lireContacts(etablissementId: string): Promise<ActionResult<Contact[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .is('deleted_at', null)
    .order('est_principal', { ascending: false })

  if (error) return { erreur: { message: error.message } }
  return { data: data as Contact[] }
}

export async function mettreAJourContact(
  id: string,
  input: unknown
): Promise<ActionResult<Contact>> {
  const parsed = ContactUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  return { data: data as Contact }
}

export async function supprimerContact(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contact')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { erreur: { message: error.message } }
  return {}
}
