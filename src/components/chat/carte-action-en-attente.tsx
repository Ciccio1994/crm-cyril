'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ActionEnAttente } from '@/types/conversation'

interface Props {
  action: ActionEnAttente
  onDecider: (accepte: boolean) => void
}

export function CarteActionEnAttente({ action, onDecider }: Props) {
  return (
    <Card className="space-y-2 border-amber-300 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-amber-800">
        ⚡ Confirmation requise
      </div>
      <p className="text-sm">{action.description_humaine}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Détails</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-white p-2">
          {JSON.stringify(action.parametres, null, 2)}
        </pre>
      </details>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onDecider(true)}>
          ✓ Confirmer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onDecider(false)}>
          Refuser
        </Button>
      </div>
    </Card>
  )
}
