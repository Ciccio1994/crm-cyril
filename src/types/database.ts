// Enums (miroir des types Postgres)
export type StatutCommercial =
  | 'prospect'
  | 'client_actif'
  | 'client_inactif'
  | 'pas_interesse'
  | 'prospect_abandonne'
  | 'ferme'
  | 'contentieux'

export type TypeEtablissement =
  | 'restaurant' | 'bar' | 'hotel' | 'cafe_tearoom' | 'caviste'
  | 'epicerie' | 'cabane_montagne' | 'institution' | 'association'
  | 'revendeur' | 'particulier' | 'autre'

export type GroupePrix =
  | 'HORECA' | 'PART' | 'EPI' | 'REVENDEURS' | 'NEG' | 'HORECASRB' | 'HELICO'

export type MotifVisiteManquee = 'ferme' | 'absent' | 'urgence_personnelle' | 'autre'

export type CanalRappel = 'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre'

export type StatutRappel = 'a_faire' | 'fait' | 'annule'

// Tables

// Note V1 : Zone reste comme placeholder (table vide en V1, réservée V2+).
// Tournee n'a donc pas de zone_id côté TS.
export interface Zone {
  id: string
  nom: string
  code: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Tournee {
  id: string
  nom: string
  frequence_semaines: number
  jour_prefere: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Entreprise {
  id: string
  raison_sociale: string
  forme_juridique: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Etablissement {
  id: string
  enseigne: string
  code_schenk: string | null
  type_etablissement: TypeEtablissement | null
  statut: StatutCommercial
  groupe_prix: GroupePrix | null
  adresse_ligne_1: string | null
  adresse_ligne_2: string | null
  code_postal: string | null
  ville: string | null
  latitude: number | null
  longitude: number | null
  telephone_principal: string | null
  telephone_mobile: string | null
  email: string | null
  site_web: string | null
  horaires_libre: string | null
  notes_internes: string | null
  seuil_inactivite_mois: number
  entreprise_id: string | null
  tournee_id: string | null
  derniere_visite_at: string | null
  derniere_commande_at: string | null
  // Relations (optionnelles, chargées si select avec join)
  tournee?: Tournee
  entreprise?: Entreprise
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Contact {
  id: string
  etablissement_id: string
  prenom: string | null
  nom: string
  fonction: string | null
  telephone: string | null
  telephone_mobile: string | null
  email: string | null
  est_principal: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Visite {
  id: string
  etablissement_id: string
  contact_id: string | null
  date_visite: string
  duree_minutes: number | null
  notes: string | null
  est_manquee: boolean
  motif_manquee: MotifVisiteManquee | null
  prochaine_action: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Rappel {
  id: string
  titre: string
  description: string | null
  echeance: string
  statut: StatutRappel
  canal: CanalRappel | null
  etablissement_id: string | null
  visite_id: string | null
  fait_at: string | null
  push_active: boolean
  cree_par: 'utilisateur' | 'claude'
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Offre {
  id: string
  cuvee_text: string
  cuvee_id: string | null
  prix_promo_chf: number | null
  date_debut: string | null
  date_fin: string | null
  conditions: string | null
  source_pdf_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// EtablissementAvecRetard : type enrichi pour l'affichage (calculé côté client)
export interface EtablissementAvecRetard extends Etablissement {
  jours_depuis_visite: number | null
  est_en_retard: boolean
}
