'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { OffreCreateSchema, OffreUpdateSchema } from '@/lib/validation/offre'
import { dateJourLocal } from '@/lib/objectif/regles'
import type { Offre } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: string }

export interface FiltresOffres {
  statut?: 'actives' | 'toutes' | 'expirees'
}

export async function creerOffre(input: unknown): Promise<ActionResult<Offre>> {
  const parsed = OffreCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? 'Payload invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offre').insert(parsed.data).select().single()
  if (error) return { erreur: error.message }
  revalidatePath('/admin/offres')
  revalidatePath('/')
  return { data: data as Offre }
}

export async function mettreAJourOffre(id: string, input: unknown): Promise<ActionResult<Offre>> {
  const parsed = OffreUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? 'Payload invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offre').update(parsed.data).eq('id', id).select().single()
  if (error) return { erreur: error.message }
  revalidatePath('/admin/offres')
  revalidatePath(`/admin/offres/${id}/modifier`)
  revalidatePath('/')
  return { data: data as Offre }
}

export async function supprimerOffre(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('offre').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return { erreur: error.message }
  revalidatePath('/admin/offres')
  return {}
}

export async function lireOffres(filtres: FiltresOffres = {}): Promise<ActionResult<Offre[]>> {
  const supabase = await createClient()
  let query = supabase.from('offre').select('*').is('deleted_at', null)
  const jour = dateJourLocal(new Date().toISOString())
  if (filtres.statut === 'actives') {
    query = query.lte('date_debut', jour).gte('date_fin', jour)
  } else if (filtres.statut === 'expirees') {
    query = query.lte('date_fin', jour)
  }
  const { data, error } = await query.order('date_fin', {
    ascending: false, nullsFirst: false,
  })
  if (error) return { erreur: error.message }
  return { data: (data ?? []) as Offre[] }
}

export async function lireOffresActives(): Promise<ActionResult<Offre[]>> {
  const supabase = await createClient()
  const jour = dateJourLocal(new Date().toISOString())
  const { data, error } = await supabase
    .from('offre').select('*').is('deleted_at', null)
    .lte('date_debut', jour).gte('date_fin', jour)
    .order('date_fin', { ascending: true })
  if (error) return { erreur: error.message }
  return { data: (data ?? []) as Offre[] }
}

export async function lireOffreParId(id: string): Promise<ActionResult<Offre>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offre').select('*').eq('id', id).is('deleted_at', null).single()
  if (error) return { erreur: error.message }
  return { data: data as Offre }
}

export async function uploadOffrePdf(formData: FormData): Promise<ActionResult<string>> {
  const fichier = formData.get('fichier')
  if (!(fichier instanceof Blob) || fichier.size === 0) {
    return { erreur: 'Aucun fichier reçu' }
  }
  const nom = fichier instanceof File ? fichier.name : 'offre.pdf'
  const cleanNom = nom.replace(/[^\w.\-]/g, '_').slice(-100)
  const path = `${Date.now()}-${cleanNom}`

  const supabase = await createClient()
  const { error } = await supabase.storage
    .from('offres')
    .upload(path, fichier, { cacheControl: '3600', upsert: false })
  if (error) return { erreur: `Upload : ${error.message}` }

  const { data } = supabase.storage.from('offres').getPublicUrl(path)
  return { data: data.publicUrl }
}
