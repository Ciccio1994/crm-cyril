'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { marquerRappelFait, annulerRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

const CANAL_ICONE: Record<NonNullable<Rappel['canal']>, string> = {
  whatsapp: '💬', mail: '📧', telephone: '📞', sms: '📱', autre: '📌',
}

function formaterHeure(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function formaterDateComplete(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso))
}

interface Props {
  rappel: Rappel
  variante: 'auj' | 'sem' | 'tard' | 'retard' | 'termine'
  onReporter?: (r: Rappel) => void
}

export function CarteRappel({ rappel, variante, onReporter }: Props) {
  const [pending, startTransition] = useTransition()

  function onFait() {
    startTransition(async () => {
      const r = await marquerRappelFait(rappel.id)
      if (!r.erreur) notifierChangement()
    })
  }
  function onAnnuler() {
    startTransition(async () => {
      const r = await annulerRappel(rappel.id)
      if (!r.erreur) notifierChangement()
    })
  }

  const dateAffichee = variante === 'auj' ? formaterHeure(rappel.echeance) : formaterDateComplete(rappel.echeance)

  return (
    <Card className={`p-3 ${variante === 'termine' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={variante === 'termine'}
          disabled={pending || variante === 'termine'}
          onChange={onFait}
          className="mt-1 size-5"
          aria-label="Marquer comme fait"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {variante === 'retard' && <Badge variant="destructive">En retard</Badge>}
            {rappel.cree_par === 'claude' && <Badge variant="outline">✨ IA</Badge>}
            {rappel.canal && (
              <span className="text-xs text-muted-foreground">
                {CANAL_ICONE[rappel.canal]} {rappel.canal}
              </span>
            )}
          </div>
          <h4 className="mt-1 truncate font-medium leading-tight">{rappel.titre}</h4>
          {rappel.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{rappel.description}</p>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {dateAffichee}
            {rappel.etablissement && (
              <>
                {' · '}
                <Link href={`/etablissements/${rappel.etablissement_id}`} className="underline">
                  {rappel.etablissement.enseigne}
                </Link>
              </>
            )}
          </div>
          {variante !== 'termine' && (
            <div className="mt-2 flex gap-2">
              {onReporter && (
                <Button type="button" variant="outline" size="sm" onClick={() => onReporter(rappel)}>
                  📅 Reporter
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={onAnnuler} disabled={pending}>
                Annuler
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
