import type { StatutCommercial } from '@/types/database'

export function moisEcoulesDepuis(
  iso: string | null,
  maintenantIso: string = new Date().toISOString(),
): number | null {
  if (!iso) return null
  const debut = new Date(iso)
  const maintenant = new Date(maintenantIso)
  let mois =
    (maintenant.getUTCFullYear() - debut.getUTCFullYear()) * 12 +
    (maintenant.getUTCMonth() - debut.getUTCMonth())
  if (maintenant.getUTCDate() < debut.getUTCDate()) mois--
  return Math.max(0, mois)
}

export interface EntreeEvaluation {
  statut: StatutCommercial
  derniere_commande_at: string | null
  derniere_visite_at: string | null
  seuil_inactivite_mois: number
  visites_count: number
}

export interface ResultatEvaluation {
  nouveauStatut: StatutCommercial
  motif: string | null
}

const NB_VISITES_ABANDON = 3

// Statuts humains : jamais modifiés automatiquement. Cyril les gère via
// le formulaire de fiche.
const STATUTS_HUMAINS: StatutCommercial[] = [
  'pas_interesse',
  'prospect_abandonne',
  'ferme',
  'contentieux',
  'client_inactif',
]

export function evaluerStatutClient(
  input: EntreeEvaluation,
  maintenantIso: string = new Date().toISOString(),
): ResultatEvaluation {
  if (STATUTS_HUMAINS.includes(input.statut)) {
    return { nouveauStatut: input.statut, motif: null }
  }

  if (input.statut === 'client_actif') {
    const mois = moisEcoulesDepuis(input.derniere_commande_at, maintenantIso)
    if (mois === null || mois >= input.seuil_inactivite_mois) {
      return {
        nouveauStatut: 'client_inactif',
        motif: mois === null
          ? 'Aucune commande enregistrée'
          : `Aucune commande depuis ${mois} mois`,
      }
    }
    return { nouveauStatut: 'client_actif', motif: null }
  }

  if (input.statut === 'prospect') {
    const aSignalPositif = input.derniere_commande_at !== null
    if (input.visites_count >= NB_VISITES_ABANDON && !aSignalPositif) {
      return {
        nouveauStatut: 'prospect_abandonne',
        motif: `${input.visites_count} visites sans commande`,
      }
    }
    return { nouveauStatut: 'prospect', motif: null }
  }

  return { nouveauStatut: input.statut, motif: null }
}
