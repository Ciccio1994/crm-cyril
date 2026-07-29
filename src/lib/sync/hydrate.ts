import { db } from '@/lib/db/dexie'
import type {
  Etablissement, Contact, Visite, Rappel, Tournee, Zone, Offre,
} from '@/types/database'

export interface TablesAHydrater {
  etablissements?: Etablissement[]
  contacts?:       Contact[]
  visites?:        Visite[]
  rappels?:        Rappel[]
  tournees?:       Tournee[]
  zones?:          Zone[]
  offres?:         Offre[]
}

// Écrit chaque liste dans Dexie via bulkPut (upsert). Ne supprime rien.
export async function hydraterTables(tables: TablesAHydrater): Promise<void> {
  const ops: Promise<unknown>[] = []
  if (tables.etablissements?.length) ops.push(db.etablissements.bulkPut(tables.etablissements))
  if (tables.contacts?.length)       ops.push(db.contacts.bulkPut(tables.contacts))
  if (tables.visites?.length)        ops.push(db.visites.bulkPut(tables.visites))
  if (tables.rappels?.length)        ops.push(db.rappels.bulkPut(tables.rappels))
  if (tables.tournees?.length)       ops.push(db.tournees.bulkPut(tables.tournees))
  if (tables.zones?.length)          ops.push(db.zones.bulkPut(tables.zones))
  if (tables.offres?.length)         ops.push(db.offres.bulkPut(tables.offres))
  await Promise.all(ops)
}
