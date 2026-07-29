'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { synchroniser } from '@/lib/sync/dispatcher'
import type { RapportSync } from '@/types/sync'
import { useOnline } from '@/hooks/use-online'
import { useQueueCount } from '@/hooks/use-queue-count'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  autoStart?: boolean
}

export function ModalSync({ open, onOpenChange, autoStart = false }: Props) {
  const online = useOnline()
  const queueCount = useQueueCount()
  const [rapport, setRapport] = useState<RapportSync | null>(null)
  const [pending, startTransition] = useTransition()

  function lancer() {
    setRapport(null)
    startTransition(async () => {
      const r = await synchroniser()
      setRapport(r)
    })
  }

  useEffect(() => {
    if (open && autoStart && online && !pending) lancer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoStart, online])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Synchronisation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm">
            {queueCount} opération(s) en attente ·{' '}
            {online ? '🟢 En ligne' : '🔴 Hors ligne'}
          </p>
          {pending && (
            <p className="text-center text-sm text-muted-foreground">
              Synchronisation en cours…
            </p>
          )}
          {rapport && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p>✓ {rapport.reussi} synchronisé(s)</p>
              <p>✗ {rapport.echec} en erreur</p>
              <p>… {rapport.restant} restant(s)</p>
              {rapport.erreurs.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">
                    Erreurs détaillées
                  </summary>
                  <ul className="mt-1 space-y-1 text-xs text-destructive">
                    {rapport.erreurs.map((e) => (
                      <li key={e.id}>
                        {e.nom_action} : {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button" variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 flex-1"
            >
              Fermer
            </Button>
            <Button
              type="button" onClick={lancer}
              disabled={pending || !online || queueCount === 0}
              className="h-12 flex-1"
            >
              {pending ? 'Sync…' : 'Synchroniser'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
