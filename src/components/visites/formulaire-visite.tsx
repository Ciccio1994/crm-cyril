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
import { creerVisite } from '@/actions/visite'

interface FormulaireVisiteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  etablissementId: string
  dureeInitiale: number
  onSuccess: () => void
}

function nowLocalDatetime() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function FormulaireVisite({
  open,
  onOpenChange,
  etablissementId,
  dureeInitiale,
  onSuccess,
}: FormulaireVisiteProps) {
  const [dateLocale, setDateLocale] = useState(() => nowLocalDatetime())
  const [duree, setDuree] = useState(dureeInitiale)
  const [notes, setNotes] = useState('')
  const [prochaineAction, setProchaineAction] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setDateLocale(nowLocalDatetime())
      setDuree(dureeInitiale)
      setNotes('')
      setProchaineAction('')
      setErreur(null)
    }
  }, [open, dureeInitiale])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    const iso = new Date(dateLocale).toISOString()
    const payload = {
      etablissement_id: etablissementId,
      date_visite: iso,
      duree_minutes: duree > 0 ? duree : null,
      notes: notes.trim() || null,
      prochaine_action: prochaineAction.trim() || null,
    }
    startTransition(async () => {
      const result = await creerVisite(payload)
      if (result.erreur) {
        setErreur('Impossible d\'enregistrer la visite.')
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
          <SheetTitle>Nouvelle visite</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 px-4 pb-4"
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-date">Date & heure</Label>
              <Input
                id="v-date"
                type="datetime-local"
                value={dateLocale}
                onChange={(e) => setDateLocale(e.target.value)}
                className="h-12 text-base"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-duree">Durée (min)</Label>
              <Input
                id="v-duree"
                type="number"
                inputMode="numeric"
                min={1}
                max={480}
                value={duree}
                onChange={(e) => setDuree(Number(e.target.value))}
                className="h-12 text-base"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-notes">Notes</Label>
            <Textarea
              id="v-notes"
              rows={4}
              placeholder="Ce qui a été fait, dégustations, décisions…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-action">Prochaine action</Label>
            <Input
              id="v-action"
              placeholder="Rappeler jeudi, envoyer offre…"
              value={prochaineAction}
              onChange={(e) => setProchaineAction(e.target.value)}
              className="h-12 text-base"
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
