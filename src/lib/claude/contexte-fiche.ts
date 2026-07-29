import { createClient } from '@/lib/supabase/server'
import type { ContexteFiche } from './systeme'

/**
 * Charge le contexte complet d'un établissement pour enrichir le prompt système.
 * Requêtes parallèles : établissement + contacts + dernières visites + offres actives.
 * Retourne null si l'établissement n'existe pas.
 */
export async function chargerContexteFiche(etablissementId: string): Promise<ContexteFiche | null> {
  const supabase = await createClient()

  const [{ data: e }, { data: c }, { data: v }, { data: o }] = await Promise.all([
    supabase.from('etablissement').select('*').eq('id', etablissementId).single(),
    supabase
      .from('contact')
      .select('*')
      .eq('etablissement_id', etablissementId)
      .is('deleted_at', null),
    supabase
      .from('visite')
      .select('*')
      .eq('etablissement_id', etablissementId)
      .is('deleted_at', null)
      .order('date_visite', { ascending: false })
      .limit(3),
    supabase.from('offre').select('*').is('deleted_at', null).limit(20),
  ])

  if (!e) return null

  const jour = new Date().toISOString().slice(0, 10)
  const offresActives = (o ?? []).filter(
    (x) =>
      (!x.date_debut || jour >= x.date_debut) &&
      (!x.date_fin || jour <= x.date_fin),
  )

  return {
    etablissement: e,
    contacts: c ?? [],
    dernieres_visites: v ?? [],
    offres_actives: offresActives,
    horaires: e.horaires_ouverture ?? null,
  }
}
