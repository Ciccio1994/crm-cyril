'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { actualiserFunnel, type RapportActualisation } from '@/actions/funnel'

export function BoutonActualiser() {
  const router = useRouter()
  const [rapport, setRapport] = useState<RapportActualisation | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    setRapport(null)
    startTransition(async () => {
      const r = await actualiserFunnel()
      if (r.data) {
        setRapport(r.data)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? 'Actualisation…' : 'Actualiser le funnel'}
      </Button>
      {rapport && (
        <p className="rounded-md border bg-muted/30 p-2 text-xs">
          {rapport.examines} examinés · {rapport.vers_inactif} → inactif ·{' '}
          {rapport.vers_abandonne} → abandonné
        </p>
      )}
    </div>
  )
}
