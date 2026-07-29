'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FormulaireRappel } from './formulaire-rappel'

export function BoutonNouveauRappel({ etablissementIdInitial }: { etablissementIdInitial?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="lg" className="h-10" onClick={() => setOpen(true)}>+ Nouveau</Button>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouveau rappel</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <FormulaireRappel
            etablissementIdInitial={etablissementIdInitial}
            onSuccess={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
