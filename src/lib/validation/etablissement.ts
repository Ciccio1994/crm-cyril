import { z } from 'zod'

const STATUTS = [
  'prospect', 'client_actif', 'client_inactif',
  'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux',
] as const

const TYPES_ETAB = [
  'restaurant', 'bar', 'hotel', 'cafe_tearoom', 'caviste',
  'epicerie', 'cabane_montagne', 'institution', 'association',
  'revendeur', 'particulier', 'autre',
] as const

const GROUPES_PRIX = [
  'HORECA', 'PART', 'EPI', 'REVENDEURS', 'NEG', 'HORECASRB', 'HELICO',
] as const

export const EtablissementCreateSchema = z.object({
  enseigne:              z.string().min(1, 'Enseigne obligatoire').max(200),
  code_schenk:           z.string().max(50).nullable().optional(),
  statut:                z.enum(STATUTS).default('prospect'),
  type_etablissement:    z.enum(TYPES_ETAB).nullable().optional(),
  groupe_prix:           z.enum(GROUPES_PRIX).nullable().optional(),
  entreprise_id:         z.string().uuid().nullable().optional(),
  tournee_id:            z.string().uuid().nullable().optional(),
  adresse_ligne_1:       z.string().max(200).nullable().optional(),
  adresse_ligne_2:       z.string().max(200).nullable().optional(),
  code_postal:           z.string().max(20).nullable().optional(),
  ville:                 z.string().max(100).nullable().optional(),
  telephone_principal:   z.string().max(30).nullable().optional(),
  telephone_mobile:      z.string().max(30).nullable().optional(),
  email:                 z.string().email().nullable().optional(),
  site_web:              z.string().url().nullable().optional(),
  horaires_libre:        z.string().nullable().optional(),
  notes_internes:        z.string().nullable().optional(),
  seuil_inactivite_mois: z.number().int().min(1).max(60).default(12),
  latitude:              z.number().min(-90).max(90).nullable().optional(),
  longitude:             z.number().min(-180).max(180).nullable().optional(),
})

export const EtablissementUpdateSchema = EtablissementCreateSchema.partial()

export type EtablissementCreateInput = z.infer<typeof EtablissementCreateSchema>
export type EtablissementUpdateInput = z.infer<typeof EtablissementUpdateSchema>
