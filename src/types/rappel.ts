import { z } from 'zod'

export type StatutRappel = 'a_faire' | 'fait' | 'annule'
export type CanalRappel = 'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre'
export type CreePar = 'utilisateur' | 'claude'

export const rappelInputSchema = z.object({
  titre: z.string().min(1, 'Titre requis').max(200),
  description: z.string().max(2000).nullable().optional(),
  echeance: z.string().datetime({ offset: true }),
  canal: z.enum(['whatsapp', 'mail', 'telephone', 'sms', 'autre']).nullable().optional(),
  etablissement_id: z.string().uuid().nullable().optional(),
  visite_id: z.string().uuid().nullable().optional(),
  push_active: z.boolean().default(true),
})
export type RappelInput = z.infer<typeof rappelInputSchema>

export interface Rappel {
  id: string
  titre: string
  description: string | null
  echeance: string
  statut: StatutRappel
  canal: CanalRappel | null
  etablissement_id: string | null
  visite_id: string | null
  conversation_id: string | null
  fait_at: string | null
  push_active: boolean
  cree_par: CreePar
  created_at: string
  updated_at: string
  etablissement?: { id: string; enseigne: string } | null
}

export interface RappelsRegroupes {
  enRetard: Rappel[]
  aujourdhui: Rappel[]
  cetteSemaine: Rappel[]
  plusTard: Rappel[]
  termines: Rappel[]
}
