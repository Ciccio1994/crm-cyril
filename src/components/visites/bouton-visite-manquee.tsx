'use client'

import { useState, useTransition } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { creerVisiteManquee } from '@/actions/visite'
import type { MotifVisiteManquee } from '@/types/database'

interface BoutonVisiteManqueeProps {
  etablissementId: string
  onSuccess: () => void
}

const MOTIFS: { value: MotifVisiteManquee; label: string; emoji: string }[] = [
  { value: 'ferme',                label: 'Fermé',              emoji: '🔒' },
  { value: 'absent',               label: 'Absent',             emoji: '🚪' },
  { value: 'urgence_personnelle',  label: 'Urgence perso',      emoji: '⚠️' },
  { value: 'autre',                label: 'Autre',              emoji: '❓' },
]

export function BoutonVisiteManquee({
  etablissementId,
  onSuccess,
}: BoutonVisiteManqueeProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function enregistrer(motif: MotifVisiteManquee | null) {
    const iso = new Date().toISOString()
    startTransition(async () => {
      await creerVisiteManquee({
        etablissement_id: etablissementId,
        date_visite: iso,
        motif_manquee: motif,
      })
      onSuccess()
      setOpen(false)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-16 flex-col gap-1 text-sm"
      >
        <span aria-hidden className="text-xl leading-none">🚫</span>
        Manquée
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Motif de la visite manquée</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            {MOTIFS.map((m) => (
              <Button
                key={m.value}
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => enregistrer(m.value)}
                className="h-20 flex-col gap-1 text-base"
              >
                <span aria-hidden className="text-2xl leading-none">
                  {m.emoji}
                </span>
                {m.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => enregistrer(null)}
              className="col-span-2 h-12 text-sm"
            >
              Enregistrer sans motif
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
