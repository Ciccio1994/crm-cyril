import { z } from 'zod'

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu YYYY-MM-DD')

const base = {
  cuvee_text:     z.string().min(1, 'Cuvée obligatoire').max(200),
  prix_promo_chf: z.number().positive().max(100000).nullable().optional(),
  date_debut:     dateIso.nullable().optional(),
  date_fin:       dateIso.nullable().optional(),
  conditions:     z.string().max(1000).nullable().optional(),
  notes:          z.string().max(2000).nullable().optional(),
  source_pdf_url: z.string().url().nullable().optional(),
}

function crossValideDates(v: { date_debut?: string | null; date_fin?: string | null }) {
  if (v.date_debut && v.date_fin && v.date_fin < v.date_debut) {
    return { message: 'date_fin doit être ≥ date_debut', path: ['date_fin'] as string[] }
  }
  return null
}

export const OffreCreateSchema = z.object(base).superRefine((v, ctx) => {
  const err = crossValideDates(v)
  if (err) ctx.addIssue({ code: 'custom', ...err })
})

export const OffreUpdateSchema = z.object(base).partial().superRefine((v, ctx) => {
  const err = crossValideDates(v)
  if (err) ctx.addIssue({ code: 'custom', ...err })
})

export type OffreCreateInput = z.infer<typeof OffreCreateSchema>
export type OffreUpdateInput = z.infer<typeof OffreUpdateSchema>
