'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CandidatGoogle } from '@/actions/horaires-google'

interface Props {
  candidats: CandidatGoogle[] | null
  onChoisir: (placeId: string) => void
  onAnnuler: () => void
}

const COULEUR_CONFIANCE: Record<CandidatGoogle['confiance'], string> = {
  haute:   'bg-emerald-500 hover:bg-emerald-500',
  moyenne: 'bg-amber-500 hover:bg-amber-500',
  faible:  'bg-slate-400 hover:bg-slate-400',
}

const LIBELLE_CONFIANCE: Record<CandidatGoogle['confiance'], string> = {
  haute:   '✓ Haute confiance',
  moyenne: '⚠ Confiance moyenne',
  faible:  '? Confiance faible',
}

export function ModaleChoixGoogle({ candidats, onChoisir, onAnnuler }: Props) {
  const ouvert = candidats !== null && candidats.length > 0
  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onAnnuler()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {candidats?.length ?? 0} établissement(s) trouvé(s) sur Google
          </SheetTitle>
        </SheetHeader>
        <p className="mt-2 text-sm text-muted-foreground">
          Aucun candidat n&apos;a de correspondance certaine (téléphone identique).
          Choisis celui qui correspond à ton client, ou annule pour garder l&apos;enseigne actuelle.
        </p>
        <ul className="mt-4 space-y-2">
          {candidats?.map((c) => (
            <li key={c.place_id}>
              <Card className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={COULEUR_CONFIANCE[c.confiance]}>
                        {LIBELLE_CONFIANCE[c.confiance]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">via {c.strategie}</span>
                    </div>
                    <h4 className="mt-1 break-words font-medium">{c.display_name}</h4>
                    {c.formatted_address && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{c.formatted_address}</p>
                    )}
                    {c.national_phone_number && (
                      <p className="text-sm text-muted-foreground">📞 {c.national_phone_number}</p>
                    )}
                    {c.a_horaires && (
                      <p className="text-xs text-emerald-700">✓ Horaires disponibles</p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => onChoisir(c.place_id)}
                  className="h-11 w-full"
                >
                  Choisir cet établissement
                </Button>
              </Card>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          onClick={onAnnuler}
          className="mt-4 h-11 w-full"
        >
          Aucun ne correspond — garder l&apos;enseigne actuelle
        </Button>
      </SheetContent>
    </Sheet>
  )
}
