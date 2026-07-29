import { marquerReussi, marquerEchec, prochainesTaches } from './queue'
import type { NomAction, RapportSync } from '@/types/sync'

import {
  creerEtablissement, mettreAJourEtablissement, supprimerEtablissement,
} from '@/actions/etablissement'
import { creerContact, mettreAJourContact, supprimerContact } from '@/actions/contact'
import {
  creerVisite, creerVisiteManquee, mettreAJourVisite,
} from '@/actions/visite'
import { creerOffre, mettreAJourOffre, supprimerOffre } from '@/actions/offres'

type ActionResult = { data?: unknown; erreur?: unknown }
type ActionOneArg = (payload: unknown) => Promise<ActionResult>
type ActionTwoArgs = (id: string, payload: unknown) => Promise<ActionResult>

const ACTIONS_ONE_ARG: Record<string, ActionOneArg | undefined> = {
  creerEtablissement,
  creerContact,
  creerVisite,
  creerVisiteManquee,
  creerOffre,
}

const ACTIONS_TWO_ARGS: Record<string, ActionTwoArgs | undefined> = {
  mettreAJourEtablissement,
  supprimerEtablissement: (id) => supprimerEtablissement(id),
  mettreAJourContact,
  supprimerContact: (id) => supprimerContact(id),
  mettreAJourVisite,
  mettreAJourOffre,
  supprimerOffre: (id) => supprimerOffre(id),
}

function extraireMessageErreur(erreur: unknown): string {
  if (!erreur) return 'Erreur inconnue'
  if (typeof erreur === 'string') return erreur
  if (typeof erreur === 'object' && erreur !== null && 'message' in erreur) {
    return String((erreur as { message: unknown }).message)
  }
  return JSON.stringify(erreur)
}

async function executerAction(
  nom: NomAction,
  payload: unknown,
  cibleId: string | null,
): Promise<ActionResult> {
  const oneArg = ACTIONS_ONE_ARG[nom]
  if (oneArg) return await oneArg(payload)
  const twoArgs = ACTIONS_TWO_ARGS[nom]
  if (twoArgs) {
    if (!cibleId) return { erreur: `cible_id manquant pour ${nom}` }
    return await twoArgs(cibleId, payload)
  }
  return { erreur: `Action inconnue : ${nom}` }
}

export async function synchroniser(): Promise<RapportSync> {
  const rapport: RapportSync = { reussi: 0, echec: 0, restant: 0, erreurs: [] }
  const taches = await prochainesTaches()

  for (const t of taches) {
    const payload = JSON.parse(t.payload_json)
    try {
      const res = await executerAction(t.nom_action, payload, t.cible_id)
      if (res.erreur) {
        const msg = extraireMessageErreur(res.erreur)
        await marquerEchec(t.id!, msg)
        rapport.echec++
        rapport.erreurs.push({ id: t.id!, nom_action: t.nom_action, message: msg })
      } else {
        await marquerReussi(t.id!)
        rapport.reussi++
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Exception inconnue'
      await marquerEchec(t.id!, msg)
      rapport.echec++
      rapport.erreurs.push({ id: t.id!, nom_action: t.nom_action, message: msg })
    }
  }

  const restantes = await prochainesTaches()
  rapport.restant = restantes.length
  return rapport
}
