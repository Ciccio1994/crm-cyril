'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { recupererHorairesDepuisGoogle } from '@/actions/horaires-google'
import { notifierChangement } from '@/lib/sync/revalidation'

const DEBOUNCE_MS = 500

interface Props {
  etablissementId: string
}

export function BoutonRecupererGoogle({ etablissementId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const dernierClickRef = useRef(0)

  function onClick() {
    const now = Date.now()
    if (now - dernierClickRef.current < DEBOUNCE_MS) return
    dernierClickRef.current = now

    setMessage(null)
    startTransition(async () => {
      const r = await recupererHorairesDepuisGoogle(etablissementId)
      if (r.erreur) {
        setMessage(`❌ ${r.erreur}`)
      } else {
        setMessage('Horaires trouvés ✅')
        notifierChangement()
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? 'Recherche en cours…' : '📍 Récupérer horaires depuis Google Maps'}
      </Button>
      {message && (
        <p
          className={`text-sm ${
            message.startsWith('❌') ? 'text-destructive' : 'text-emerald-600'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
