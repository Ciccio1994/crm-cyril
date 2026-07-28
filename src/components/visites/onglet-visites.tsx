'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateSuisse } from '@/lib/format'
import { FormulaireVisite } from './formulaire-visite'
import { BoutonVisiteManquee } from './bouton-visite-manquee'
import type { MotifVisiteManquee, Visite } from '@/types/database'

interface OngletVisitesProps {
  etablissementId: string
  visites: Visite[]
}

const LIBELLE_MOTIF: Record<MotifVisiteManquee, string> = {
  ferme:                'Fermé',
  absent:               'Absent',
  urgence_personnelle:  'Urgence perso',
  autre:                'Autre',
}

export function OngletVisites({
  etablissementId,
  visites,
}: OngletVisitesProps) {
  const router = useRouter()
  const [openForm, setOpenForm] = useState(false)
  const [dureeInitiale, setDureeInitiale] = useState(60)

  function ouvrir(duree: number) {
    setDureeInitiale(duree)
    setOpenForm(true)
  }
  function onSuccess() {
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          onClick={() => ouvrir(60)}
          className="h-16 flex-col gap-1 text-sm"
        >
          <span aria-hidden className="text-xl leading-none">✅</span>
          60 min
        </Button>
        <Button
          type="button"
          onClick={() => ouvrir(120)}
          className="h-16 flex-col gap-1 text-sm"
        >
          <span aria-hidden className="text-xl leading-none">⏱️</span>
          120 min
        </Button>
        <BoutonVisiteManquee
          etablissementId={etablissementId}
          onSuccess={onSuccess}
        />
      </div>

      {visites.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Aucune visite enregistrée.
        </p>
      ) : (
        <ul className="space-y-2">
          {visites.map((v) => (
            <li key={v.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">
                      {formatDateSuisse(v.date_visite)}
                    </span>
                    {v.duree_minutes && !v.est_manquee && (
                      <span className="text-sm text-muted-foreground">
                        · {v.duree_minutes} min
                      </span>
                    )}
                    {v.est_manquee && (
                      <Badge variant="destructive">
                        Manquée
                        {v.motif_manquee && ` · ${LIBELLE_MOTIF[v.motif_manquee]}`}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {v.notes && (
                <p className="mt-1 whitespace-pre-wrap text-sm">{v.notes}</p>
              )}
              {v.prochaine_action && (
                <p className="mt-1 text-sm text-muted-foreground">
                  → {v.prochaine_action}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <FormulaireVisite
        open={openForm}
        onOpenChange={setOpenForm}
        etablissementId={etablissementId}
        dureeInitiale={dureeInitiale}
        onSuccess={onSuccess}
      />
    </div>
  )
}
