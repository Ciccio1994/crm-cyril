'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buttonVariants } from '@/components/ui/button'
import { CarteEtablissement } from './carte-etablissement'
import { cn } from '@/lib/utils'
import { calculerRetard } from '@/lib/retard'
import { estOuvertMaintenant } from '@/lib/horaires/regles'
import type { Etablissement, StatutCommercial } from '@/types/database'

interface ListeEtablissementsProps {
  etablissements: Etablissement[]
}

const STATUTS: { value: StatutCommercial | 'tous'; label: string }[] = [
  { value: 'tous',                label: 'Tous statuts' },
  { value: 'prospect',            label: 'Prospects' },
  { value: 'client_actif',        label: 'Clients actifs' },
  { value: 'client_inactif',      label: 'Clients inactifs' },
  { value: 'pas_interesse',       label: 'Pas intéressés' },
  { value: 'prospect_abandonne',  label: 'Abandonnés' },
  { value: 'ferme',               label: 'Fermés' },
  { value: 'contentieux',         label: 'Contentieux' },
]

export function ListeEtablissements({ etablissements }: ListeEtablissementsProps) {
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState<StatutCommercial | 'tous'>('tous')
  const [tourneeId, setTourneeId] = useState<string>('toutes')
  const [ouvertMaintenant, setOuvertMaintenant] = useState(false)

  const tournees = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of etablissements) {
      if (e.tournee?.id) map.set(e.tournee.id, e.tournee.nom)
    }
    return Array.from(map, ([id, nom]) => ({ id, nom })).sort((a, b) =>
      a.nom.localeCompare(b.nom, 'fr'),
    )
  }, [etablissements])

  const maintenantIso = useMemo(() => new Date().toISOString(), [])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return etablissements.filter((e) => {
      if (statut !== 'tous' && e.statut !== statut) return false
      if (tourneeId !== 'toutes' && e.tournee_id !== tourneeId) return false
      if (ouvertMaintenant && !estOuvertMaintenant(e.horaires_ouverture)) return false
      if (q) {
        const combo = [e.enseigne, e.ville, e.code_postal]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!combo.includes(q)) return false
      }
      return true
    })
  }, [etablissements, recherche, statut, tourneeId, ouvertMaintenant])

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Établissements</h1>
          <span className="text-xs text-muted-foreground">
            {filtres.length}/{etablissements.length}
          </span>
        </div>
        <Input
          type="search"
          inputMode="search"
          placeholder="Rechercher enseigne, ville…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-11"
        />
        <div className="flex gap-2">
          <Select
            value={statut}
            onValueChange={(v) => setStatut((v ?? 'tous') as StatutCommercial | 'tous')}
          >
            <SelectTrigger className="h-10 flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tourneeId}
            onValueChange={(v) => setTourneeId(v ?? 'toutes')}
          >
            <SelectTrigger className="h-10 flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes tournées</SelectItem>
              {tournees.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={ouvertMaintenant}
            onChange={(e) => setOuvertMaintenant(e.target.checked)}
            className="size-4"
          />
          🟢 Ouvert maintenant
        </label>
      </header>

      <ul>
        {filtres.length === 0 && (
          <li className="px-4 py-16 text-center text-sm text-muted-foreground">
            Aucun établissement ne correspond à la recherche.
          </li>
        )}
        {filtres.map((e) => {
          const retard = calculerRetard(
            e.derniere_visite_at,
            e.tournee?.frequence_semaines ?? 4,
            maintenantIso,
          )
          return (
            <li key={e.id}>
              <CarteEtablissement etablissement={e} retard={retard} />
            </li>
          )
        })}
      </ul>

      <Link
        href="/etablissements/nouveau"
        className={cn(
          buttonVariants({ variant: 'default' }),
          'fixed bottom-24 right-4 z-40 h-14 gap-1 rounded-full px-5 shadow-lg',
        )}
      >
        <span aria-hidden className="text-lg leading-none">+</span>
        Nouveau
      </Link>
    </div>
  )
}
