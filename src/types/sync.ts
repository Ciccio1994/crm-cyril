export type NomAction =
  | 'creerEtablissement' | 'mettreAJourEtablissement' | 'supprimerEtablissement'
  | 'creerContact' | 'mettreAJourContact' | 'supprimerContact'
  | 'creerVisite' | 'creerVisiteManquee' | 'mettreAJourVisite'
  | 'creerOffre' | 'mettreAJourOffre' | 'supprimerOffre'

export type StatutQueue = 'en_attente' | 'en_cours' | 'reussi' | 'echec'

export interface EntreeQueue {
  id?: number
  nom_action: NomAction
  payload_json: string
  cible_id: string | null
  created_at: string
  tentatives: number
  dernier_essai_at: string | null
  dernier_message: string | null
  statut: StatutQueue
}

export interface RapportSync {
  reussi: number
  echec: number
  restant: number
  erreurs: { id: number; nom_action: NomAction; message: string }[]
}
