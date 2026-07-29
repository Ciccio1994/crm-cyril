'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  estOuvertMaintenant, prochaineOuverture, formaterCreneau,
  jourDeLaSemaine,
} from '@/lib/horaires/regles'
import { JOURS } from '@/types/horaires'
import type { Horaires, JourSemaine } from '@/types/horaires'

const LIBELLES: Record<JourSemaine, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

interface Props { horaires: Horaires | null }

export function SectionHoraires({ horaires }: Props) {
  const [now, setNow] = useState(() => new Date().toISOString())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!horaires || Object.keys(horaires).length === 0) return null

  const ouvert = estOuvertMaintenant(horaires, now)
  const prochaine = prochaineOuverture(horaires, now)
  const jourActuel = jourDeLaSemaine(now)

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Horaires
        </h3>
        <Badge
          className={
            ouvert
              ? 'bg-emerald-500 hover:bg-emerald-500'
              : 'bg-slate-400 hover:bg-slate-400'
          }
        >
          {ouvert ? '🟢 Ouvert' : '🔴 Fermé'}
        </Badge>
      </div>
      {!ouvert && prochaine && (
        <p className="text-sm text-muted-foreground">{prochaine}</p>
      )}
      <ul className="divide-y text-sm">
        {JOURS.map((j) => {
          const creneaux = horaires[j]
          const estAujourdhui = j === jourActuel
          return (
            <li
              key={j}
              className={`flex items-center justify-between py-1.5 ${
                estAujourdhui ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              <span>{LIBELLES[j]}</span>
              <span>
                {creneaux === undefined
                  ? '—'
                  : creneaux === null
                    ? 'Fermé'
                    : creneaux.map(formaterCreneau).join(' · ')}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
