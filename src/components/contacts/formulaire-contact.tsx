'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { creerContact, mettreAJourContact } from '@/actions/contact'
import {
  isContactPickerSupported,
  selectContact as pickContactFromDevice,
} from '@/lib/contact-picker'
import type { Contact } from '@/types/database'

interface FormulaireContactProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  etablissementId: string
  contact?: Contact | null
  onSuccess: () => void
}

type FormState = {
  prenom: string
  nom: string
  fonction: string
  telephone: string
  email: string
  est_principal: boolean
  notes: string
}

function initFrom(c?: Contact | null): FormState {
  return {
    prenom:        c?.prenom ?? '',
    nom:           c?.nom ?? '',
    fonction:      c?.fonction ?? '',
    telephone:     c?.telephone ?? '',
    email:         c?.email ?? '',
    est_principal: c?.est_principal ?? false,
    notes:         c?.notes ?? '',
  }
}

export function FormulaireContact({
  open,
  onOpenChange,
  etablissementId,
  contact,
  onSuccess,
}: FormulaireContactProps) {
  const [state, setState] = useState<FormState>(() => initFrom(contact))
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [pickerSupported, setPickerSupported] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    setPickerSupported(isContactPickerSupported())
  }, [])

  useEffect(() => {
    if (open) {
      setState(initFrom(contact))
      setErreur(null)
    }
  }, [open, contact])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((s) => ({ ...s, [k]: v }))
  }

  async function importerDepuisContacts() {
    setErreur(null)
    setPicking(true)
    try {
      const preselect = await pickContactFromDevice()
      if (!preselect) return
      // Ne remplace pas ce que l'utilisateur a déjà tapé
      setState((s) => ({
        ...s,
        prenom:    s.prenom    || preselect.prenom    || '',
        nom:       s.nom       || preselect.nom       || '',
        telephone: s.telephone || preselect.telephone || '',
        email:     s.email     || preselect.email     || '',
      }))
    } finally {
      setPicking(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!state.nom.trim()) {
      setErreur('Nom obligatoire.')
      return
    }
    const clean = (v: string) => (v.trim() === '' ? null : v.trim())
    const payload = {
      nom: state.nom.trim(),
      prenom:     clean(state.prenom),
      fonction:   clean(state.fonction),
      telephone:  clean(state.telephone),
      email:      clean(state.email),
      est_principal: state.est_principal,
      notes:      clean(state.notes),
    }

    startTransition(async () => {
      const result = contact
        ? await mettreAJourContact(contact.id, payload)
        : await creerContact({ ...payload, etablissement_id: etablissementId })
      if (result.erreur) {
        setErreur('Impossible d\'enregistrer.')
        return
      }
      onSuccess()
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {contact ? 'Modifier le contact' : 'Nouveau contact'}
          </SheetTitle>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 px-4 pb-4"
        >
          {!contact && (
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                disabled={!pickerSupported || picking}
                onClick={importerDepuisContacts}
                className="h-12 w-full text-base"
              >
                {picking
                  ? 'Ouverture…'
                  : '📱 Choisir dans mes contacts'}
              </Button>
              {!pickerSupported && (
                <p className="text-center text-xs text-muted-foreground">
                  Non disponible sur ce navigateur.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-prenom">Prénom</Label>
              <Input
                id="c-prenom"
                value={state.prenom}
                onChange={(e) => set('prenom', e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-nom">Nom *</Label>
              <Input
                id="c-nom"
                value={state.nom}
                onChange={(e) => set('nom', e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-fonction">Fonction</Label>
            <Input
              id="c-fonction"
              placeholder="Sommelier, Patron, Acheteur…"
              value={state.fonction}
              onChange={(e) => set('fonction', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-tel">Téléphone</Label>
            <Input
              id="c-tel"
              inputMode="tel"
              value={state.telephone}
              onChange={(e) => set('telephone', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              value={state.email}
              onChange={(e) => set('email', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <label className="flex items-center gap-3 rounded-md border p-3 tap-target">
            <input
              type="checkbox"
              checked={state.est_principal}
              onChange={(e) => set('est_principal', e.target.checked)}
              className="size-5"
            />
            <span className="text-sm">Contact principal</span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea
              id="c-notes"
              rows={3}
              value={state.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="text-base"
            />
          </div>
          {erreur && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {erreur}
            </p>
          )}
          <SheetFooter className="mt-2 flex-row gap-2 px-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 flex-1 text-base"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-12 flex-1 text-base"
            >
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
