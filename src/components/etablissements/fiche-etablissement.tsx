'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { BadgeRetard } from './badge-retard'
import { calculerRetard } from '@/lib/retard'
import { cn } from '@/lib/utils'
import { OngletContacts } from '@/components/contacts/onglet-contacts'
import { OngletVisites } from '@/components/visites/onglet-visites'
import { ActionsRapides } from './actions-rapides'
import type {
  Contact,
  Etablissement,
  StatutCommercial,
  Visite,
} from '@/types/database'

const LIBELLE_STATUT: Record<StatutCommercial, string> = {
  prospect:            'Prospect',
  client_actif:        'Client actif',
  client_inactif:      'Client inactif',
  pas_interesse:       'Pas intéressé',
  prospect_abandonne:  'Abandonné',
  ferme:               'Fermé',
  contentieux:         'Contentieux',
}

interface Champ {
  label: string
  valeur: string | null
}

function BlocInfos({ champs }: { champs: Champ[] }) {
  const visibles = champs.filter((c) => c.valeur)
  if (visibles.length === 0) return null
  return (
    <dl className="divide-y divide-border rounded-lg border bg-card">
      {visibles.map((c) => (
        <div key={c.label} className="grid grid-cols-3 gap-2 px-3 py-2.5">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {c.label}
          </dt>
          <dd className="col-span-2 text-sm">{c.valeur}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FicheEtablissement({
  etablissement,
  contacts,
  visites,
}: {
  etablissement: Etablissement
  contacts: Contact[]
  visites: Visite[]
}) {
  const router = useRouter()
  const retard = calculerRetard(
    etablissement.derniere_visite_at,
    etablissement.tournee?.frequence_semaines ?? 4,
  )

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-white/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="tap-target -ml-2 flex items-center justify-center rounded-md text-xl leading-none"
            aria-label="Retour"
          >
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight">
              {etablissement.enseigne}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-normal">
                {LIBELLE_STATUT[etablissement.statut]}
              </Badge>
              <BadgeRetard
                jours={retard.jours_depuis_visite}
                enRetard={retard.est_en_retard}
              />
            </div>
          </div>
          <Link
            href={`/etablissements/${etablissement.id}/modifier`}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'h-9 px-3 text-sm',
            )}
          >
            Modifier
          </Link>
        </div>
      </header>

      <ActionsRapides etab={etablissement} />

      <Tabs defaultValue="info" className="px-4 pt-4">
        <TabsList className="w-full">
          <TabsTrigger value="info" className="flex-1">
            Info
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex-1">
            Contacts
          </TabsTrigger>
          <TabsTrigger value="visites" className="flex-1">
            Visites
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 space-y-4 pb-8">
          <BlocInfos
            champs={[
              { label: 'Type', valeur: etablissement.type_etablissement },
              { label: 'Groupe prix', valeur: etablissement.groupe_prix },
              { label: 'Tournée', valeur: etablissement.tournee?.nom ?? null },
            ]}
          />
          <BlocInfos
            champs={[
              { label: 'Adresse', valeur: etablissement.adresse_ligne_1 },
              { label: 'Complément', valeur: etablissement.adresse_ligne_2 },
              {
                label: 'Ville',
                valeur:
                  [etablissement.code_postal, etablissement.ville]
                    .filter(Boolean)
                    .join(' ') || null,
              },
            ]}
          />
          <BlocInfos
            champs={[
              { label: 'Tél principal', valeur: etablissement.telephone_principal },
              { label: 'Tél mobile',    valeur: etablissement.telephone_mobile },
              { label: 'Email',         valeur: etablissement.email },
              { label: 'Site web',      valeur: etablissement.site_web },
              { label: 'Horaires',      valeur: etablissement.horaires_libre },
            ]}
          />
          {etablissement.notes_internes && (
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes internes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {etablissement.notes_internes}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="contacts" className="mt-4 pb-8">
          <OngletContacts
            etablissementId={etablissement.id}
            contacts={contacts}
          />
        </TabsContent>

        <TabsContent value="visites" className="mt-4 pb-8">
          <OngletVisites
            etablissementId={etablissement.id}
            visites={visites}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
