'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { recupererHorairesDepuisGoogle } from '@/actions/horaires-google'
import { notifierChangement } from '@/lib/sync/revalidation'

const DEBOUNCE_MS = 500

interface Props {
  etablissementId: string
  // 'initial' = grand bouton pleine largeur (fiche sans horaires)
  // 'actualiser' = bouton compact avec confirmation (fiche avec horaires existants)
  mode?: 'initial' | 'actualiser'
}

export function BoutonRecupererGoogle({ etablissementId, mode = 'initial' }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const dernierClickRef = useRef(0)

  function onClick() {
    const now = Date.now()
    if (now - dernierClickRef.current < DEBOUNCE_MS) return
    dernierClickRef.current = now

    if (mode === 'actualiser') {
      const ok = confirm(
        "Remplacer les horaires actuels par ceux de Google Maps ? Cette action est irréversible.",
      )
      if (!ok) return
    }

    setMessage(null)
    startTransition(async () => {
      const r = await recupererHorairesDepuisGoogle(etablissementId)
      if (r.erreur) {
        setMessage(`❌ ${r.erreur}`)
      } else {
        setMessage(mode === 'actualiser' ? 'Horaires actualisés ✅' : 'Horaires trouvés ✅')
        notifierChangement()
        router.refresh()
      }
    })
  }

  if (mode === 'actualiser') {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
          aria-label="Actualiser les horaires depuis Google Maps"
        >
          {pending ? 'Actualisation…' : '🔄 Actualiser'}
        </button>
        {message && (
          <p
            className={`text-xs ${
              message.startsWith('❌') ? 'text-destructive' : 'text-emerald-600'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    )
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
