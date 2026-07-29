'use client'

import { useState, useTransition } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reporterRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

interface Props {
  rappel: Rappel | null
  onClose: () => void
}

export function BottomSheetReporter({ rappel, onClose }: Props) {
  const [nouvelleDate, setNouvelleDate] = useState('')
  const [pending, startTransition] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  function onValider() {
    if (!rappel) return
    startTransition(async () => {
      const r = await reporterRappel(rappel.id, new Date(nouvelleDate).toISOString())
      if (r.erreur) { setErreur(r.erreur); return }
      notifierChangement()
      onClose()
    })
  }

  return (
    <Sheet open={rappel !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Reporter « {rappel?.titre} »</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="nvdate">Nouvelle échéance</Label>
            <Input
              id="nvdate"
              type="datetime-local"
              value={nouvelleDate}
              onChange={e => setNouvelleDate(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
          <Button
            type="button"
            onClick={onValider}
            disabled={pending || !nouvelleDate}
            className="h-12 w-full"
          >
            {pending ? 'Enregistrement…' : 'Reporter'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
