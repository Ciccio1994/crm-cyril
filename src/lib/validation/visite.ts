import { z } from 'zod'

const MOTIFS_MANQUEE = ['ferme', 'absent', 'urgence_personnelle', 'autre'] as const

export const VisiteCreateSchema = z.object({
  etablissement_id: z.string().uuid(),
  contact_id:       z.string().uuid().nullable().optional(),
  date_visite:      z.string().datetime(),
  duree_minutes:    z.number().int().min(1).max(480).nullable().optional(),
  notes:            z.string().nullable().optional(),
  prochaine_action: z.string().max(500).nullable().optional(),
})

export const VisiteManqueeCreateSchema = z.object({
  etablissement_id: z.string().uuid(),
  date_visite:      z.string().datetime(),
  motif_manquee:    z.enum(MOTIFS_MANQUEE).nullable().optional(),
})

export const VisiteUpdateSchema = z.object({
  notes:            z.string().nullable().optional(),
  duree_minutes:    z.number().int().min(1).max(480).nullable().optional(),
  prochaine_action: z.string().max(500).nullable().optional(),
})

export type VisiteCreateInput = z.infer<typeof VisiteCreateSchema>
export type VisiteManqueeCreateInput = z.infer<typeof VisiteManqueeCreateSchema>
export type VisiteUpdateInput = z.infer<typeof VisiteUpdateSchema>
