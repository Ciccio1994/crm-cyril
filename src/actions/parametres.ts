'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validerValeurParametre, type CleParametre } from '@/lib/validation/parametre'

type ActionResult<T> = { data?: T; erreur?: string }

export type MapParametres = Partial<Record<CleParametre, unknown>> & Record<string, unknown>

export async function lireParametres(): Promise<ActionResult<MapParametres>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('parametre').select('cle, valeur')
  if (error) return { erreur: error.message }
  const map: MapParametres = {}
  for (const row of data ?? []) {
    map[(row as { cle: string }).cle] = (row as { valeur: unknown }).valeur
  }
  return { data: map }
}

export async function mettreAJourParametre(
  cle: unknown,
  valeur: unknown,
): Promise<ActionResult<{ cle: CleParametre; valeur: number }>> {
  const val = validerValeurParametre(cle, valeur)
  if (val.erreur || !val.data) return { erreur: val.erreur ?? 'Erreur validation' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('parametre')
    .upsert({ cle: val.data.cle, valeur: val.data.valeur }, { onConflict: 'cle' })
  if (error) return { erreur: error.message }
  revalidatePath('/admin/parametres')
  revalidatePath('/')
  revalidatePath('/funnel')
  return { data: val.data }
}
