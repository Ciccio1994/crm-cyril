'use client'

import { enqueue } from './queue'
import type { NomAction } from '@/types/sync'

interface ActionResult { data?: unknown; erreur?: unknown }
export type ResultatAvecSync = ActionResult & { differee?: boolean }

// Décide entre appel Server Action direct et enqueue selon navigator.onLine.
// Utilisé pour les CREATE (payload seul).
export async function executerAvecSync(
  nomAction: NomAction,
  payload: unknown,
  actionServeur: (payload: unknown) => Promise<ActionResult>,
): Promise<ResultatAvecSync> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(nomAction, payload, null)
    return { data: { deferred: true }, differee: true }
  }
  try {
    return await actionServeur(payload)
  } catch {
    // Erreur réseau (RSC fetch échoue) → enqueue
    await enqueue(nomAction, payload, null)
    return { data: { deferred: true }, differee: true }
  }
}

// Variante UPDATE/DELETE : cibleId séparé.
export async function executerAvecSyncCible(
  nomAction: NomAction,
  cibleId: string,
  payload: unknown,
  actionServeur: (id: string, payload: unknown) => Promise<ActionResult>,
): Promise<ResultatAvecSync> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(nomAction, payload, cibleId)
    return { data: { deferred: true }, differee: true }
  }
  try {
    return await actionServeur(cibleId, payload)
  } catch {
    await enqueue(nomAction, payload, cibleId)
    return { data: { deferred: true }, differee: true }
  }
}
