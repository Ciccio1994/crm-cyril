import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ActionsRapidesVisite } from './actions-rapides-visite'
import { calculerRetard } from '@/lib/retard'
import type { Etablissement } from '@/types/database'

interface Props {
  clients: Etablissement[]
  prospects: Etablissement[]
}

function Bloc({ titre, items }: { titre: string; items: Etablissement[] }) {
  if (items.length === 0) return null
  const now = new Date().toISOString()
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {titre} ({items.length})
      </h2>
      <ul className="space-y-2">
        {items.map((e) => {
          const r = calculerRetard(
            e.derniere_visite_at,
            e.tournee?.frequence_semaines ?? 4,
            now,
          )
          return (
            <li key={e.id}>
              <Card className="p-3">
                <Link href={`/etablissements/${e.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.enseigne}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.tournee?.nom ?? 'Sans tournée'}
                      </p>
                    </div>
                    {r.jours_depuis_visite === null ? (
                      <Badge variant="secondary">Jamais visité</Badge>
                    ) : r.est_en_retard ? (
                      <Badge variant="destructive">
                        Retard · {r.jours_depuis_visite} j
                      </Badge>
                    ) : null}
                  </div>
                </Link>
                <ActionsRapidesVisite etablissementId={e.id} />
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function SuggestionsAujourdhui({ clients, prospects }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Bloc titre="Clients à revoir en priorité" items={clients.slice(0, 10)} />
      <Bloc titre="Prospects à démarcher" items={prospects.slice(0, 5)} />
      {clients.length === 0 && prospects.length === 0 && (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Aucune suggestion pour aujourd&apos;hui. Bon travail !
        </p>
      )}
    </div>
  )
}
