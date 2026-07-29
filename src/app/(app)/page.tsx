'use client'

import { useEffect, useState } from 'react'
import { lireClientsEnRetard, lireSuggestionsProspection } from '@/actions/funnel'
import { SuggestionsAujourdhui } from '@/components/home/suggestions-aujourdhui'
import { WidgetObjectif } from '@/components/home/widget-objectif'
import { WidgetOffresAccueil } from '@/components/offres/widget-offres-accueil'
import { WidgetRappelsAujourdhui } from '@/components/rappels/widget-rappels-aujourdhui'
import { lireEtablissementsDexie } from '@/lib/sync/lecture-dexie'
import { hydraterTables } from '@/lib/sync/hydrate'
import { useOnline } from '@/hooks/use-online'
import { useRevalidation } from '@/lib/sync/revalidation'
import { formatDateSuisse } from '@/lib/format'
import { estClient, estProspect } from '@/lib/objectif/regles'
import type { Etablissement } from '@/types/database'

export default function AccueilPage() {
  const online = useOnline()
  const revalidation = useRevalidation()
  const [clients, setClients] = useState<Etablissement[]>([])
  const [prospects, setProspects] = useState<Etablissement[]>([])
  const [pret, setPret] = useState(false)
  const [origineLocale, setOrigineLocale] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function charger() {
      if (online) {
        try {
          const [c, p] = await Promise.all([
            lireClientsEnRetard(),
            lireSuggestionsProspection(),
          ])
          if (cancelled) return
          setClients(c.data ?? [])
          setProspects(p.data ?? [])
          setOrigineLocale(false)
          setPret(true)
          hydraterTables({
            etablissements: [...(c.data ?? []), ...(p.data ?? [])],
          }).catch(() => {})
          return
        } catch {
          /* fallback */
        }
      }
      const all = await lireEtablissementsDexie()
      if (cancelled) return
      setClients(all.filter((e) => estClient(e.statut)))
      setProspects(all.filter((e) => estProspect(e.statut)).slice(0, 10))
      setOrigineLocale(true)
      setPret(true)
    }
    charger()
    return () => {
      cancelled = true
    }
  }, [online, revalidation])

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Aujourd&apos;hui</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateSuisse(new Date().toISOString())} — tes priorités du jour.
        </p>
      </header>
      {origineLocale && (
        <p className="rounded-md border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          📴 Données locales — dernière synchronisation
        </p>
      )}
      <WidgetRappelsAujourdhui />
      {online && <WidgetObjectif />}
      {online && <WidgetOffresAccueil />}
      {pret && (
        <SuggestionsAujourdhui clients={clients} prospects={prospects} />
      )}
    </div>
  )
}
