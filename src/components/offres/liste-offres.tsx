'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { buttonVariants } from '@/components/ui/button'
import { CarteOffre } from './carte-offre'
import { statutOffre } from '@/lib/offres/regles'
import { cn } from '@/lib/utils'
import type { Offre } from '@/types/database'

type Filtre = 'actives' | 'toutes' | 'expirees'

export function ListeOffres({ offres }: { offres: Offre[] }) {
  const [filtre, setFiltre] = useState<Filtre>('actives')
  const now = new Date().toISOString()

  const filtrees = useMemo(() => {
    if (filtre === 'toutes') return offres
    return offres.filter((o) => {
      const s = statutOffre(o, now)
      return filtre === 'actives'
        ? s === 'en_cours' || s === 'a_venir'
        : s === 'expiree'
    })
  }, [offres, filtre, now])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select value={filtre} onValueChange={(v) => v && setFiltre(v as Filtre)}>
          <SelectTrigger className="h-10 flex-1 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actives">Actives (en cours + à venir)</SelectItem>
            <SelectItem value="toutes">Toutes</SelectItem>
            <SelectItem value="expirees">Expirées</SelectItem>
          </SelectContent>
        </Select>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtrees.length}/{offres.length}
        </span>
      </div>

      {filtrees.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Aucune offre à afficher.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtrees.map((o) => (
            <li key={o.id}>
              <CarteOffre offre={o} href={`/admin/offres/${o.id}/modifier`} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/admin/offres/nouvelle"
        className={cn(
          buttonVariants({ variant: 'default' }),
          'fixed bottom-24 right-4 z-40 h-14 gap-1 rounded-full px-5 shadow-lg',
        )}
      >
        <span aria-hidden className="text-lg leading-none">+</span>
        Nouvelle
      </Link>
    </div>
  )
}
