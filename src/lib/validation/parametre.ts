import { z } from 'zod'

// Whitelist des paramètres modifiables en V1c avec leur type valeur.
const SCHEMAS = {
  objectif_visites_clients_par_jour:   z.number().int().min(0).max(50),
  objectif_visites_prospects_par_jour: z.number().int().min(0).max(50),
  seuil_inactivite_mois_global:        z.number().int().min(1).max(60),
} as const

export type CleParametre = keyof typeof SCHEMAS

export const CLES_MODIFIABLES = Object.keys(SCHEMAS) as CleParametre[]

export function validerValeurParametre(
  cle: unknown,
  valeur: unknown,
): { data?: { cle: CleParametre; valeur: number }; erreur?: string } {
  if (typeof cle !== 'string' || !(cle in SCHEMAS)) {
    return { erreur: `Clé "${String(cle)}" non modifiable` }
  }
  const schema = SCHEMAS[cle as CleParametre]
  const parsed = schema.safeParse(valeur)
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? 'Valeur invalide' }
  }
  return { data: { cle: cle as CleParametre, valeur: parsed.data } }
}
