'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { lireEtablissement } from '@/actions/etablissement'
import { lireContacts } from '@/actions/contact'
import { lireVisites } from '@/actions/visite'
import { lireOffresActives } from '@/actions/offres'
import { FicheEtablissement } from '@/components/etablissements/fiche-etablissement'
import {
  lireEtablissementDexie, lireContactsDexie, lireVisitesDexie, lireOffresActivesDexie,
} from '@/lib/sync/lecture-dexie'
import { hydraterTables } from '@/lib/sync/hydrate'
import { useOnline } from '@/hooks/use-online'
import { useRevalidation } from '@/lib/sync/revalidation'
import type { Contact, Etablissement, Offre, Visite } from '@/types/database'

export default function EtablissementPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const online = useOnline()
  const revalidation = useRevalidation()
  const [etab, setEtab] = useState<Etablissement | null | undefined>(undefined)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [visites, setVisites] = useState<Visite[]>([])
  const [offres, setOffres] = useState<Offre[]>([])
  const [origineLocale, setOrigineLocale] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function charger() {
      if (online) {
        try {
          const [e, c, v, o] = await Promise.all([
            lireEtablissement(id),
            lireContacts(id),
            lireVisites(id),
            lireOffresActives(),
          ])
          if (cancelled) return
          if (e.data) {
            setEtab(e.data)
            setContacts(c.data ?? [])
            setVisites(v.data ?? [])
            setOffres(o.data ?? [])
            setOrigineLocale(false)
            hydraterTables({
              etablissements: [e.data],
              contacts: c.data ?? [],
              visites: v.data ?? [],
              offres: o.data ?? [],
            }).catch(() => {})
            return
          }
        } catch {
          /* fallback Dexie */
        }
      }
      const [e, c, v, o] = await Promise.all([
        lireEtablissementDexie(id),
        lireContactsDexie(id),
        lireVisitesDexie(id),
        lireOffresActivesDexie(),
      ])
      if (cancelled) return
      setEtab(e)
      setContacts(c)
      setVisites(v)
      setOffres(o)
      setOrigineLocale(true)
    }
    charger()
    return () => {
      cancelled = true
    }
  }, [id, online, revalidation])

  if (etab === undefined) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  }
  if (etab === null) {
    return (
      <p className="p-6 text-sm text-destructive">
        Établissement introuvable {origineLocale && '(cache local vide, connexion requise)'}.
      </p>
    )
  }
  return (
    <>
      {origineLocale && (
        <p className="mx-4 mt-2 rounded-md border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          📴 Données locales — dernière synchronisation
        </p>
      )}
      <FicheEtablissement
        etablissement={etab}
        contacts={contacts}
        visites={visites}
        offresActives={offres}
      />
    </>
  )
}
