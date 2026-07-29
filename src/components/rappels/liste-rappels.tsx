'use client'

import { useEffect, useMemo, useState } from 'react'
import { CarteRappel } from './carte-rappel'
import { FiltreEtablissement } from './filtre-etablissement'
import { BottomSheetReporter } from './bottom-sheet-reporter'
import { lireRappels } from '@/actions/rappels'
import { regrouperRappels } from '@/lib/rappels/regroupement'
import { useRevalidation } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

function Section({
  titre,
  icone,
  rappels,
  variante,
  onReporter,
}: {
  titre: string
  icone: string
  rappels: Rappel[]
  variante: 'auj' | 'sem' | 'tard' | 'retard' | 'termine'
  onReporter?: (r: Rappel) => void
}) {
  if (rappels.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icone} {titre} ({rappels.length})
      </h3>
      <ul className="space-y-2">
        {rappels.map((r) => (
          <li key={r.id}>
            <CarteRappel rappel={r} variante={variante} onReporter={onReporter} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ListeRappels({ rappelsInitiaux }: { rappelsInitiaux: Rappel[] }) {
  const [rappels, setRappels] = useState(rappelsInitiaux)
  const [filtreEtabId, setFiltreEtabId] = useState<string | null>(null)
  const [rappelReporter, setRappelReporter] = useState<Rappel | null>(null)
  const version = useRevalidation()

  useEffect(() => {
    void lireRappels().then(setRappels)
  }, [version])

  const etablissements = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rappels) {
      if (r.etablissement_id && r.etablissement) {
        map.set(r.etablissement_id, r.etablissement.enseigne)
      }
    }
    return Array.from(map, ([id, enseigne]) => ({ id, enseigne }))
      .sort((a, b) => a.enseigne.localeCompare(b.enseigne, 'fr'))
  }, [rappels])

  const rappelsFiltres = useMemo(
    () => (filtreEtabId ? rappels.filter(r => r.etablissement_id === filtreEtabId) : rappels),
    [rappels, filtreEtabId],
  )

  const g = regrouperRappels(rappelsFiltres, new Date().toISOString())
  const total =
    g.enRetard.length + g.aujourdhui.length + g.cetteSemaine.length + g.plusTard.length + g.termines.length

  return (
    <div className="space-y-4">
      {etablissements.length > 0 && (
        <FiltreEtablissement
          etablissements={etablissements}
          valeur={filtreEtabId}
          onChange={setFiltreEtabId}
        />
      )}
      {total === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun rappel actif. Utilise le chat Claude ou le bouton « + » pour en créer.
        </div>
      ) : (
        <div className="space-y-6">
          <Section
            titre="En retard"
            icone="⚠️"
            rappels={g.enRetard}
            variante="retard"
            onReporter={setRappelReporter}
          />
          <Section
            titre="Aujourd'hui"
            icone="⏰"
            rappels={g.aujourdhui}
            variante="auj"
            onReporter={setRappelReporter}
          />
          <Section
            titre="Cette semaine"
            icone="📅"
            rappels={g.cetteSemaine}
            variante="sem"
            onReporter={setRappelReporter}
          />
          <Section
            titre="Plus tard"
            icone="📆"
            rappels={g.plusTard}
            variante="tard"
            onReporter={setRappelReporter}
          />
          <Section titre="Terminés" icone="✅" rappels={g.termines} variante="termine" />
        </div>
      )}
      <BottomSheetReporter rappel={rappelReporter} onClose={() => setRappelReporter(null)} />
    </div>
  )
}
