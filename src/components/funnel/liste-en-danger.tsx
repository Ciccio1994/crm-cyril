'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { calculerRetard } from '@/lib/retard'
import { formatDateSuisse } from '@/lib/format'
import type { Etablissement } from '@/types/database'

export function ListeEnDanger({ etabs }: { etabs: Etablissement[] }) {
  const now = new Date().toISOString()
  const enRetard = etabs
    .map((e) => ({
      etab: e,
      retard: calculerRetard(
        e.derniere_visite_at,
        e.tournee?.frequence_semaines ?? 4,
        now,
      ),
    }))
    .filter((x) => x.retard.est_en_retard || x.retard.jours_depuis_visite === null)

  if (enRetard.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Aucun client en retard.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {enRetard.slice(0, 20).map(({ etab, retard }) => (
        <li key={etab.id}>
          <Link href={`/etablissements/${etab.id}`}>
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{etab.enseigne}</p>
                  <p className="text-xs text-muted-foreground">
                    {etab.tournee?.nom ?? 'Sans tournée'}
                    {etab.derniere_visite_at &&
                      ` · dernière visite ${formatDateSuisse(etab.derniere_visite_at)}`}
                  </p>
                </div>
                {retard.jours_depuis_visite === null ? (
                  <Badge variant="secondary">Jamais visité</Badge>
                ) : (
                  <Badge variant="destructive">
                    Retard · {retard.jours_depuis_visite} j
                  </Badge>
                )}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
