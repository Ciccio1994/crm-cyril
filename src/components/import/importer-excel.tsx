'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { previewImport, type PreviewImport } from '@/actions/import'

type Etape = 'idle' | 'uploading' | 'preview' | 'importing' | 'done'

export function ImporterExcel() {
  const [etape, setEtape] = useState<Etape>('idle')
  const [preview, setPreview] = useState<PreviewImport | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErreur(null)
    setEtape('uploading')
    const fd = new FormData()
    fd.append('fichier', file)
    startTransition(async () => {
      const r = await previewImport(fd)
      if (r.erreur || !r.data) {
        setErreur(r.erreur ?? 'Erreur inconnue')
        setEtape('idle')
        return
      }
      setPreview(r.data)
      setEtape('preview')
    })
  }

  function reset() {
    setEtape('idle')
    setPreview(null)
    setErreur(null)
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Import Excel Schenk</h1>
        <p className="text-sm text-muted-foreground">
          Chaque onglet = une tournée. Les doublons sont fusionnés par
          enseigne + code postal + tournée.
        </p>
      </header>

      {(etape === 'idle' || etape === 'uploading') && (
        <label className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center">
          <span aria-hidden className="text-3xl">📄</span>
          <span className="text-sm font-medium">
            {pending ? 'Analyse en cours…' : 'Sélectionner un fichier .xlsx'}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFileChange}
            disabled={pending}
            className="sr-only"
          />
        </label>
      )}

      {erreur && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erreur}
        </p>
      )}

      {etape === 'preview' && preview && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              Aperçu ({preview.totalLignes} lignes / {preview.onglets.length} onglets)
            </h2>
            <Button type="button" variant="outline" onClick={reset}>
              Autre fichier
            </Button>
          </div>
          <ul className="divide-y">
            {preview.onglets.map((o) => (
              <li key={o.nomOnglet} className="py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{o.nomOnglet}</p>
                    <p className="text-xs text-muted-foreground">
                      → {o.tourneeDb ?? 'aucune tournée associée'}
                    </p>
                    {o.colonnesInconnues.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Colonnes ignorées : {o.colonnesInconnues.join(', ')}
                      </p>
                    )}
                  </div>
                  {o.tourneeId ? (
                    <Badge variant="secondary">{o.nbLignes} lignes</Badge>
                  ) : (
                    <Badge variant="destructive">Ignoré</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" disabled className="mt-4 h-12 w-full text-base">
            Lancer l&apos;import (branché en T7)
          </Button>
        </Card>
      )}
    </div>
  )
}
