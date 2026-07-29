'use server'

import { createClient } from '@/lib/supabase/server'
import { estNomPersonne } from '@/lib/etablissements/nom-personne'

export interface CandidatEnrichissement {
  id: string
  enseigne: string
  ville: string | null
  code_postal: string | null
  telephone_principal: string | null
  a_horaires: boolean
}

// Liste les établissements dont l'enseigne ressemble à un nom de personne
// physique (heuristique `estNomPersonne`). Pré-filtre SQL sur les préfixes
// courants pour éviter de scanner toute la table côté JS.
export async function listerCandidatsEnrichissement(): Promise<{
  data?: CandidatEnrichissement[]
  erreur?: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .select('id, enseigne, ville, code_postal, telephone_principal, horaires_ouverture')
    .is('deleted_at', null)
    // Pré-filtre SQL : préfixes typiques de titres de politesse
    .or(
      'enseigne.ilike.M. %,' +
      'enseigne.ilike.Mme %,' +
      'enseigne.ilike.Mlle %,' +
      'enseigne.ilike.Monsieur %,' +
      'enseigne.ilike.Madame %,' +
      'enseigne.ilike.Dr %,' +
      'enseigne.ilike.Prof %',
    )
    .order('enseigne', { ascending: true })
  if (error) return { erreur: error.message }

  // Confirmation par l'heuristique côté JS (aligne avec ce qui déclenche le badge UI)
  const candidats: CandidatEnrichissement[] = (data ?? [])
    .filter((e) => estNomPersonne(e.enseigne))
    .map((e) => ({
      id: e.id,
      enseigne: e.enseigne,
      ville: e.ville,
      code_postal: e.code_postal,
      telephone_principal: e.telephone_principal,
      a_horaires: e.horaires_ouverture != null,
    }))

  return { data: candidats }
}
