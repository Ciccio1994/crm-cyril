import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { statutOffre, joursAvantExpiration } from '@/lib/offres/regles'
import { formatCHF, formatDateSuisse } from '@/lib/format'
import type { Offre } from '@/types/database'

function libelleStatut(s: ReturnType<typeof statutOffre>) {
  if (s === 'en_cours') return 'En cours'
  if (s === 'a_venir')  return 'À venir'
  return 'Expirée'
}

function variantStatut(s: ReturnType<typeof statutOffre>) {
  if (s === 'en_cours') return 'default' as const
  if (s === 'a_venir')  return 'secondary' as const
  return 'outline' as const
}

function BadgeExpiration({ jours }: { jours: number | null }) {
  if (jours === null || jours < 0) return null
  const style =
    jours <= 2
      ? 'bg-red-500 text-white'
      : jours <= 7
        ? 'bg-orange-500 text-white'
        : 'bg-slate-200 text-slate-700'
  return (
    <Badge className={style}>
      {jours === 0 ? "Expire aujourd'hui" : `Expire dans ${jours} j`}
    </Badge>
  )
}

export function CarteOffre({ offre, href }: { offre: Offre; href?: string }) {
  const now = new Date().toISOString()
  const s = statutOffre(offre, now)
  const jours = joursAvantExpiration(offre, now)
  const content = (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{offre.cuvee_text}</p>
          <p className="text-xs text-muted-foreground">
            {offre.date_debut && offre.date_fin
              ? `${formatDateSuisse(offre.date_debut)} → ${formatDateSuisse(offre.date_fin)}`
              : 'Sans dates'}
            {offre.prix_promo_chf !== null && ` · ${formatCHF(offre.prix_promo_chf)}`}
          </p>
          {offre.conditions && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {offre.conditions}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={variantStatut(s)}>{libelleStatut(s)}</Badge>
          {s === 'en_cours' && <BadgeExpiration jours={jours} />}
        </div>
      </div>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}
