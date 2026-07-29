import { z } from 'zod'

export const ContactCreateSchema = z.object({
  etablissement_id: z.string().uuid(),
  nom:              z.string().min(1, 'Nom obligatoire').max(100),
  prenom:           z.string().max(100).nullable().optional(),
  fonction:         z.string().max(100).nullable().optional(),
  telephone:        z.string().max(30).nullable().optional(),
  telephone_mobile: z.string().max(30).nullable().optional(),
  email:            z.string().email().nullable().optional(),
  est_principal:    z.boolean().default(false),
  notes:            z.string().nullable().optional(),
})

export const ContactUpdateSchema = ContactCreateSchema.omit({ etablissement_id: true }).partial()

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>
