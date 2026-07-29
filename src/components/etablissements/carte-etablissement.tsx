import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BadgeRetard } from './badge-retard'
import type { Etablissement, StatutCommercial } from '@/types/database'
import type { RetardInfo } from '@/lib/retard'

const LIBELLE_STATUT: Record<StatutCommercial, string> = {
  prospect:            'Prospect',
  client_actif:        'Client actif',
  client_inactif:      'Client inactif',
  pas_interesse:       'Pas intéressé',
  prospect_abandonne:  'Abandonné',
  ferme:               'Fermé',
  contentieux:         'Contentieux',
}

interface CarteEtablissementProps {
  etablissement: Etablissement
  retard: RetardInfo
}

export function CarteEtablissement({ etablissement, retard }: CarteEtablissementProps) {
  const villeLigne = [etablissement.code_postal, etablissement.ville]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      href={`/etablissements/${etablissement.id}`}
      className="block tap-target"
    >
      <Card className="gap-2 rounded-none border-x-0 border-t-0 px-4 py-3 shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-sm font-semibold leading-tight">
              {etablissement.enseigne}
            </h2>
            {etablissement.code_schenk && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                N° {etablissement.code_schenk}
              </p>
            )}
            {villeLigne && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {villeLigne}
              </p>
            )}
          </div>
          <BadgeRetard
            jours={retard.jours_depuis_visite}
            enRetard={retard.est_en_retard}
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {LIBELLE_STATUT[etablissement.statut]}
          </Badge>
          {etablissement.tournee?.nom && (
            <span className="truncate text-xs text-muted-foreground">
              {etablissement.tournee.nom}
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}
