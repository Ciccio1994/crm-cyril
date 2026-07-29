'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  creerEtablissement,
  mettreAJourEtablissement,
} from '@/actions/etablissement'
import { executerAvecSync, executerAvecSyncCible } from '@/lib/sync/wrapper'
import { ChampAdresseAutocomplete } from './champ-adresse-autocomplete'
import type { DetailsLieu } from '@/lib/geocode'
import type {
  Etablissement,
  StatutCommercial,
  TypeEtablissement,
  GroupePrix,
} from '@/types/database'

const STATUTS: { value: StatutCommercial; label: string }[] = [
  { value: 'prospect',            label: 'Prospect' },
  { value: 'client_actif',        label: 'Client actif' },
  { value: 'client_inactif',      label: 'Client inactif' },
  { value: 'pas_interesse',       label: 'Pas intéressé' },
  { value: 'prospect_abandonne',  label: 'Abandonné' },
  { value: 'ferme',               label: 'Fermé' },
  { value: 'contentieux',         label: 'Contentieux' },
]

const TYPES: { value: TypeEtablissement; label: string }[] = [
  { value: 'restaurant',       label: 'Restaurant' },
  { value: 'bar',              label: 'Bar' },
  { value: 'hotel',            label: 'Hôtel' },
  { value: 'cafe_tearoom',     label: 'Café / Tea-room' },
  { value: 'caviste',          label: 'Caviste' },
  { value: 'epicerie',         label: 'Épicerie' },
  { value: 'cabane_montagne',  label: 'Cabane de montagne' },
  { value: 'institution',      label: 'Institution' },
  { value: 'association',      label: 'Association' },
  { value: 'revendeur',        label: 'Revendeur' },
  { value: 'particulier',      label: 'Particulier' },
  { value: 'autre',            label: 'Autre' },
]

const GROUPES: { value: GroupePrix; label: string }[] = [
  { value: 'HORECA',    label: 'HORECA' },
  { value: 'PART',      label: 'PART' },
  { value: 'EPI',       label: 'EPI' },
  { value: 'REVENDEURS', label: 'Revendeurs' },
  { value: 'NEG',       label: 'NEG' },
  { value: 'HORECASRB', label: 'HORECASRB' },
  { value: 'HELICO',    label: 'HELICO' },
]

interface FormulaireEtablissementProps {
  mode: 'creation' | 'edition'
  initial?: Etablissement
}

type FormState = {
  enseigne: string
  statut: StatutCommercial
  type_etablissement: TypeEtablissement | ''
  groupe_prix: GroupePrix | ''
  adresse_ligne_1: string
  adresse_ligne_2: string
  code_postal: string
  ville: string
  telephone_principal: string
  telephone_mobile: string
  email: string
  site_web: string
  horaires_libre: string
  notes_internes: string
  latitude: number | null
  longitude: number | null
}

function initFromEtab(e?: Etablissement): FormState {
  return {
    enseigne:              e?.enseigne ?? '',
    statut:                e?.statut ?? 'prospect',
    type_etablissement:    e?.type_etablissement ?? '',
    groupe_prix:           e?.groupe_prix ?? '',
    adresse_ligne_1:       e?.adresse_ligne_1 ?? '',
    adresse_ligne_2:       e?.adresse_ligne_2 ?? '',
    code_postal:           e?.code_postal ?? '',
    ville:                 e?.ville ?? '',
    telephone_principal:   e?.telephone_principal ?? '',
    telephone_mobile:      e?.telephone_mobile ?? '',
    email:                 e?.email ?? '',
    site_web:              e?.site_web ?? '',
    horaires_libre:        e?.horaires_libre ?? '',
    notes_internes:        e?.notes_internes ?? '',
    latitude:              e?.latitude ?? null,
    longitude:             e?.longitude ?? null,
  }
}

function payloadFromState(s: FormState) {
  const clean = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    enseigne: s.enseigne.trim(),
    statut: s.statut,
    type_etablissement: s.type_etablissement || null,
    groupe_prix: s.groupe_prix || null,
    adresse_ligne_1: clean(s.adresse_ligne_1),
    adresse_ligne_2: clean(s.adresse_ligne_2),
    code_postal: clean(s.code_postal),
    ville: clean(s.ville),
    telephone_principal: clean(s.telephone_principal),
    telephone_mobile: clean(s.telephone_mobile),
    email: clean(s.email),
    site_web: clean(s.site_web),
    horaires_libre: clean(s.horaires_libre),
    notes_internes: clean(s.notes_internes),
    latitude: s.latitude,
    longitude: s.longitude,
  }
}

export function FormulaireEtablissement({
  mode,
  initial,
}: FormulaireEtablissementProps) {
  const router = useRouter()
  const [state, setState] = useState<FormState>(() => initFromEtab(initial))
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((s) => ({ ...s, [k]: v }))
  }

  function appliquerSuggestion(details: DetailsLieu) {
    setState((s) => ({
      ...s,
      // Adresse : toujours remplacer par Google si dispo
      adresse_ligne_1:      details.adresse_ligne_1 || s.adresse_ligne_1,
      code_postal:          details.code_postal ?? s.code_postal,
      ville:                details.ville ?? s.ville,
      latitude:             details.latitude,
      longitude:            details.longitude,
      // Tel & site : uniquement si l'utilisateur n'a rien tapé
      telephone_principal:  s.telephone_principal || details.telephone || '',
      site_web:             s.site_web || details.site_web || '',
      // Si l'enseigne est vide, on la remplit avec le displayName Google
      enseigne:             s.enseigne || details.display_name,
    }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!state.enseigne.trim()) {
      setErreur('Enseigne obligatoire.')
      return
    }
    const payload = payloadFromState(state)
    startTransition(async () => {
      const result =
        mode === 'creation'
          ? await executerAvecSync(
              'creerEtablissement', payload,
              (p) => creerEtablissement(p),
            )
          : await executerAvecSyncCible(
              'mettreAJourEtablissement', initial!.id, payload,
              (id, p) => mettreAJourEtablissement(id, p),
            )
      if (result.erreur) {
        setErreur('Impossible d\'enregistrer. Vérifie les champs.')
        return
      }
      // Si offline (differee), on renvoie vers la liste plutôt que la fiche (id inconnu)
      if ('differee' in result && result.differee) {
        router.push('/etablissements')
        return
      }
      const dataId = (result.data as { id?: string } | undefined)?.id
      const id = mode === 'creation' ? dataId : initial!.id
      if (id) router.push(`/etablissements/${id}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          className="tap-target -ml-2 rounded-md text-xl leading-none"
          aria-label="Retour"
        >
          ‹
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold">
          {mode === 'creation' ? 'Nouvel établissement' : 'Modifier'}
        </h1>
      </header>

      <div className="flex flex-col gap-6 px-4 py-4 pb-32">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Identité
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="enseigne">Enseigne *</Label>
            <Input
              id="enseigne"
              value={state.enseigne}
              onChange={(e) => set('enseigne', e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="statut">Statut</Label>
            <Select
              value={state.statut}
              onValueChange={(v) => v && set('statut', v as StatutCommercial)}
            >
              <SelectTrigger id="statut" className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select
              value={state.type_etablissement || undefined}
              onValueChange={(v) =>
                set('type_etablissement', (v ?? '') as TypeEtablissement | '')
              }
            >
              <SelectTrigger id="type" className="h-12 text-base">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="groupe">Groupe prix</Label>
            <Select
              value={state.groupe_prix || undefined}
              onValueChange={(v) =>
                set('groupe_prix', (v ?? '') as GroupePrix | '')
              }
            >
              <SelectTrigger id="groupe" className="h-12 text-base">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {GROUPES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Adresse
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="adresse1">Adresse ou nom d&apos;établissement</Label>
            <ChampAdresseAutocomplete
              id="adresse1"
              value={state.adresse_ligne_1}
              onChange={(v) => set('adresse_ligne_1', v)}
              onSuggestion={appliquerSuggestion}
            />
            <p className="text-xs text-muted-foreground">
              Cherche par nom d&apos;établissement ou par adresse (Suisse).
              L&apos;enseigne, le CP, la ville, le téléphone, le site et les
              coordonnées se remplissent si vides.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adresse2">Complément</Label>
            <Input
              id="adresse2"
              value={state.adresse_ligne_2}
              onChange={(e) => set('adresse_ligne_2', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp">Code postal</Label>
              <Input
                id="cp"
                inputMode="numeric"
                value={state.code_postal}
                onChange={(e) => set('code_postal', e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ville">Ville</Label>
              <Input
                id="ville"
                value={state.ville}
                onChange={(e) => set('ville', e.target.value)}
                className="h-12 text-base"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Contact
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="tel1">Tél principal</Label>
            <Input
              id="tel1"
              inputMode="tel"
              value={state.telephone_principal}
              onChange={(e) => set('telephone_principal', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tel2">Tél mobile</Label>
            <Input
              id="tel2"
              inputMode="tel"
              value={state.telephone_mobile}
              onChange={(e) => set('telephone_mobile', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              value={state.email}
              onChange={(e) => set('email', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="web">Site web</Label>
            <Input
              id="web"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              value={state.site_web}
              onChange={(e) => set('site_web', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Interne
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="horaires">Horaires</Label>
            <Textarea
              id="horaires"
              rows={2}
              value={state.horaires_libre}
              onChange={(e) => set('horaires_libre', e.target.value)}
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes internes</Label>
            <Textarea
              id="notes"
              rows={4}
              value={state.notes_internes}
              onChange={(e) => set('notes_internes', e.target.value)}
              className="text-base"
            />
          </div>
        </section>

        {erreur && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {erreur}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-white/95 px-4 py-3 safe-bottom backdrop-blur">
        <div className="flex gap-2">
          {mode === 'edition' && initial ? (
            <Link
              href={`/etablissements/${initial.id}`}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-12 flex-1 text-base',
              )}
            >
              Annuler
            </Link>
          ) : (
            <Link
              href="/etablissements"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-12 flex-1 text-base',
              )}
            >
              Annuler
            </Link>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="h-12 flex-1 text-base"
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  )
}
