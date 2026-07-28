import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { lireOffresActives } from '@/actions/offres'
import { joursAvantExpiration } from '@/lib/offres/regles'

export async function WidgetOffresAccueil() {
  const r = await lireOffresActives()
  const offres = r.data ?? []
  if (offres.length === 0) return null

  const now = new Date().toISOString()

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Offres du moment ({offres.length})
        </h2>
        <Link href="/admin/offres" className="text-xs underline">
          Voir tout
        </Link>
      </div>
      <ul className="space-y-1.5">
        {offres.slice(0, 3).map((o) => {
          const j = joursAvantExpiration(o, now)
          return (
            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{o.cuvee_text}</span>
              {j !== null && (
                <Badge variant={j <= 2 ? 'destructive' : 'secondary'} className="shrink-0">
                  {j === 0 ? "Expire aujourd'hui" : `${j} j`}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
