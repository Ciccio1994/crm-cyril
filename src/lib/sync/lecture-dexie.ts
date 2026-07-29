'use client'

import { db } from '@/lib/db/dexie'
import type { Contact, Etablissement, Offre, Visite } from '@/types/database'

export async function lireEtablissementsDexie(): Promise<Etablissement[]> {
  const all = await db.etablissements.toArray()
  return all.filter((e) => e.deleted_at === null)
}

export async function lireEtablissementDexie(id: string): Promise<Etablissement | null> {
  const e = await db.etablissements.get(id)
  return e && e.deleted_at === null ? e : null
}

export async function lireContactsDexie(etabId: string): Promise<Contact[]> {
  const all = await db.contacts.where('etablissement_id').equals(etabId).toArray()
  return all.filter((c) => c.deleted_at === null)
}

export async function lireVisitesDexie(etabId: string): Promise<Visite[]> {
  const all = await db.visites.where('etablissement_id').equals(etabId).toArray()
  return all
    .filter((v) => v.deleted_at === null)
    .sort((a, b) => b.date_visite.localeCompare(a.date_visite))
}

export async function lireOffresActivesDexie(): Promise<Offre[]> {
  const all = await db.offres.toArray()
  const jour = new Date().toISOString().slice(0, 10)
  return all.filter((o) => {
    if (o.deleted_at !== null) return false
    if (o.date_debut && jour < o.date_debut) return false
    if (o.date_fin && jour > o.date_fin) return false
    return true
  })
}
