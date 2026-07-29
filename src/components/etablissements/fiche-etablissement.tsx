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
import { CarteOffre } from '@/components/offres/carte-offre'
import { SectionHoraires } from './section-horaires'
import { BoutonChatFiche } from './bouton-chat-fiche'
import { BoutonEnrichirGoogle } from './bouton-enrichir-google'
import { estNomPersonne } from '@/lib/etablissements/nom-personne'
import type {
  Contact,
  Etablissement,
  Offre,
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

type ChampType = 'text' | 'tel' | 'email' | 'url'

interface Champ {
  label: string
  valeur: string | null
  type?: ChampType
}

// Auto-détecte le type d'un champ à partir de son label pour rendre le
// contenu cliquable (tel:, mailto:, https://) — sur mobile Android/iOS,
// tap sur un lien tel: ouvre l'app Téléphone directement.
function detecterType(label: string, type?: ChampType): ChampType {
  if (type) return type
  const n = label.toLowerCase()
  if (n.includes('tél') || n.includes('tel') || n.startsWith('mobile')) return 'tel'
  if (n.includes('email') || n.includes('mail')) return 'email'
  if (n.includes('site')) return 'url'
  return 'text'
}

function ValeurChamp({ valeur, type }: { valeur: string; type: ChampType }) {
  const commun = 'text-primary underline decoration-primary/40 underline-offset-2'
  if (type === 'tel') {
    return <a href={`tel:${valeur.replace(/\s+/g, '')}`} className={commun}>{valeur}</a>
  }
  if (type === 'email') {
    return <a href={`mailto:${valeur}`} className={commun}>{valeur}</a>
  }
  if (type === 'url') {
    const href = valeur.startsWith('http') ? valeur : `https://${valeur}`
    return <a href={href} target="_blank" rel="noopener noreferrer" className={commun}>{valeur}</a>
  }
  return <>{valeur}</>
}

function BlocInfos({ champs }: { champs: Champ[] }) {
  const visibles = champs.filter((c) => c.valeur)
  if (visibles.length === 0) return null
  return (
    <dl className="divide-y divide-border rounded-lg border bg-card">
      {visibles.map((c) => {
        const type = detecterType(c.label, c.type)
        return (
          <div key={c.label} className="grid grid-cols-3 gap-2 px-3 py-2.5">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {c.label}
            </dt>
            <dd className="col-span-2 break-words text-sm">
              <ValeurChamp valeur={c.valeur!} type={type} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export function FicheEtablissement({
  etablissement,
  contacts,
  visites,
  offresActives,
}: {
  etablissement: Etablissement
  contacts: Contact[]
  visites: Visite[]
  offresActives: Offre[]
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
            <h1 className="break-words text-base font-semibold leading-tight sm:text-lg">
              {etablissement.enseigne}
            </h1>
            {etablissement.code_schenk && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                N° {etablissement.code_schenk}
              </p>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-normal">
                {LIBELLE_STATUT[etablissement.statut]}
              </Badge>
              <BadgeRetard
                jours={retard.jours_depuis_visite}
                enRetard={retard.est_en_retard}
              />
              {estNomPersonne(etablissement.enseigne) && (
                <Badge className="bg-amber-500 hover:bg-amber-500" title="L'enseigne actuelle ressemble à un nom de personne. Vérifie via Google Maps et corrige si besoin.">
                  ⚠️ Nom personne
                </Badge>
              )}
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

      <div className="space-y-2 px-4 pt-3">
        <BoutonChatFiche etablissementId={etablissement.id} />
        {estNomPersonne(etablissement.enseigne) && (
          <BoutonEnrichirGoogle
            etablissementId={etablissement.id}
            enseigneActuelle={etablissement.enseigne}
          />
        )}
      </div>

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
          <SectionHoraires
            etablissementId={etablissement.id}
            enseigne={etablissement.enseigne}
            horaires={etablissement.horaires_ouverture}
          />
          {offresActives.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Offres en cours ({offresActives.length})
              </h3>
              <ul className="space-y-2">
                {offresActives.map((o) => (
                  <li key={o.id}>
                    <CarteOffre
                      offre={o}
                      href={`/admin/offres/${o.id}/modifier`}
                    />
                  </li>
                ))}
              </ul>
            </section>
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
