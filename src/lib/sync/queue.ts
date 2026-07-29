import { db } from '@/lib/db/dexie'
import type { EntreeQueue, NomAction } from '@/types/sync'

const MAX_TENTATIVES = 3
const BACKOFF_MS = [1_000, 5_000, 30_000]

export function calculerBackoff(tentatives: number): number {
  return BACKOFF_MS[Math.min(tentatives, BACKOFF_MS.length - 1)]
}

export async function enqueue(
  nom_action: NomAction,
  payload: unknown,
  cible_id: string | null,
): Promise<number> {
  const entree: EntreeQueue = {
    nom_action,
    payload_json: JSON.stringify(payload),
    cible_id,
    created_at: new Date().toISOString(),
    tentatives: 0,
    dernier_essai_at: null,
    dernier_message: null,
    statut: 'en_attente',
  }
  return (await db.sync_queue.add(entree)) as number
}

export async function prochainesTaches(): Promise<EntreeQueue[]> {
  const now = Date.now()
  const enAttente = await db.sync_queue
    .where('statut').equals('en_attente')
    .toArray()
  return enAttente
    .filter((e) => {
      if (!e.dernier_essai_at) return true
      const backoff = calculerBackoff(e.tentatives - 1)
      return new Date(e.dernier_essai_at).getTime() + backoff <= now
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function marquerReussi(id: number): Promise<void> {
  await db.sync_queue.update(id, {
    statut: 'reussi',
    dernier_essai_at: new Date().toISOString(),
  })
}

export async function marquerEchec(id: number, message: string): Promise<void> {
  const entree = await db.sync_queue.get(id)
  if (!entree) return
  const nouvellesTentatives = entree.tentatives + 1
  const definitif = nouvellesTentatives >= MAX_TENTATIVES
  await db.sync_queue.update(id, {
    tentatives: nouvellesTentatives,
    dernier_essai_at: new Date().toISOString(),
    dernier_message: message,
    statut: definitif ? 'echec' : 'en_attente',
  })
}
