'use client'

import { useEffect, useState } from 'react'
import { lireEtablissements } from '@/actions/etablissement'
import { ListeEtablissements } from '@/components/etablissements/liste-etablissements'
import { lireEtablissementsDexie } from '@/lib/sync/lecture-dexie'
import { hydraterTables } from '@/lib/sync/hydrate'
import { useOnline } from '@/hooks/use-online'
import { useRevalidation } from '@/lib/sync/revalidation'
import type { Etablissement } from '@/types/database'

export default function EtablissementsPage() {
  const online = useOnline()
  const revalidation = useRevalidation()
  const [data, setData] = useState<Etablissement[] | null>(null)
  const [origineLocale, setOrigineLocale] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function charger() {
      if (online) {
        try {
          const r = await lireEtablissements()
          if (cancelled) return
          if (r.data) {
            setData(r.data)
            setOrigineLocale(false)
            hydraterTables({ etablissements: r.data }).catch(() => {})
            return
          }
        } catch {
          /* fallback Dexie */
        }
      }
      const local = await lireEtablissementsDexie()
      if (cancelled) return
      setData(local)
      setOrigineLocale(true)
    }
    charger()
    return () => {
      cancelled = true
    }
  }, [online, revalidation])

  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  }
  return (
    <>
      {origineLocale && (
        <p className="mx-4 mt-2 rounded-md border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          📴 Données locales — dernière synchronisation
        </p>
      )}
      <ListeEtablissements etablissements={data} />
    </>
  )
}
