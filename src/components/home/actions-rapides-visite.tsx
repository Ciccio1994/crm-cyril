'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FormulaireVisite } from '@/components/visites/formulaire-visite'
import { BoutonVisiteManquee } from '@/components/visites/bouton-visite-manquee'
import { notifierChangement } from '@/lib/sync/revalidation'

interface Props {
  etablissementId: string
}

export function ActionsRapidesVisite({ etablissementId }: Props) {
  const router = useRouter()
  const [openVisite, setOpenVisite] = useState(false)
  const [, startTransition] = useTransition()

  function onSuccess() {
    startTransition(() => {
      router.refresh()
      notifierChangement()
    })
  }

  return (
    <div className="mt-2 flex gap-2">
      <Button
        type="button"
        onClick={() => setOpenVisite(true)}
        className="h-10 flex-1 text-sm"
      >
        Visité (60 min)
      </Button>
      <BoutonVisiteManquee
        etablissementId={etablissementId}
        onSuccess={onSuccess}
      />
      <FormulaireVisite
        open={openVisite}
        onOpenChange={setOpenVisite}
        etablissementId={etablissementId}
        dureeInitiale={60}
        onSuccess={onSuccess}
      />
    </div>
  )
}
