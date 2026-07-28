'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  previewImport,
  importerBatch,
  reinitialiserImport,
  type PreviewImport,
  type LigneAImporter,
  type RapportImport,
} from '@/actions/import'

type Etape = 'idle' | 'uploading' | 'preview' | 'importing' | 'done'
const TAILLE_BATCH = 30
const CONFIRM_TIMEOUT_MS = 5000

export function ImporterExcel() {
  const [etape, setEtape] = useState<Etape>('idle')
  const [preview, setPreview] = useState<PreviewImport | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [progressionActuelle, setProgressionActuelle] = useState(0)
  const [progressionTotal, setProgressionTotal] = useState(0)
  const [rapport, setRapport] = useState<RapportImport | null>(null)

  // État du bouton "Réinitialiser" : idle → armed (5s) → confirmed (delete)
  const [resetState, setResetState] = useState<'idle' | 'armed' | 'busy'>('idle')
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  useEffect(() => {
    if (resetState !== 'armed') return
    const t = setTimeout(() => setResetState('idle'), CONFIRM_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [resetState])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setErreur(null)
      setRapport(null)
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
    },
    [],
  )

  function reset() {
    setEtape('idle')
    setPreview(null)
    setErreur(null)
    setRapport(null)
    setProgressionActuelle(0)
    setProgressionTotal(0)
  }

  async function lancerImport() {
    if (!preview) return
    // Onglet importable : tourneeId défini OU sansTournee (Prospects/Autres)
    const aImporter: LigneAImporter[] = preview.onglets.flatMap((o) =>
      o.tourneeId || o.sansTournee
        ? o.lignes.map((l) => ({
            tourneeId: o.tourneeId,
            numeroLigneExcel: l.numeroLigneExcel,
            nomOnglet: o.nomOnglet,
            payload: l.payload,
          }))
        : [],
    )
    setEtape('importing')
    setProgressionTotal(aImporter.length)
    setProgressionActuelle(0)
    const cumule: RapportImport = {
      etablissements: { crees: 0, misAJour: 0, ignores: 0 },
      contacts:       { crees: 0, misAJour: 0 },
      erreurs: [],
    }

    for (let i = 0; i < aImporter.length; i += TAILLE_BATCH) {
      const batch = aImporter.slice(i, i + TAILLE_BATCH)
      const r = await importerBatch(batch)
      if (r.data) {
        cumule.etablissements.crees    += r.data.etablissements.crees
        cumule.etablissements.misAJour += r.data.etablissements.misAJour
        cumule.etablissements.ignores  += r.data.etablissements.ignores
        cumule.contacts.crees          += r.data.contacts.crees
        cumule.contacts.misAJour       += r.data.contacts.misAJour
        cumule.erreurs.push(...r.data.erreurs)
      } else if (r.erreur) {
        cumule.erreurs.push({
          onglet: '(batch)',
          ligne: i,
          message: r.erreur,
        })
      }
      setProgressionActuelle(Math.min(i + batch.length, aImporter.length))
    }

    setRapport(cumule)
    setEtape('done')
  }

  async function onResetClick() {
    setResetMessage(null)
    if (resetState === 'idle') {
      setResetState('armed')
      return
    }
    if (resetState === 'armed') {
      setResetState('busy')
      const r = await reinitialiserImport()
      if (r.erreur) {
        setResetMessage(`Erreur : ${r.erreur}`)
      } else {
        setResetMessage(
          `${r.data?.supprimes ?? 0} établissement(s) supprimés (contacts + visites cascade). Tournées préservées.`,
        )
        reset()
      }
      setResetState('idle')
    }
  }

  const pct =
    progressionTotal > 0
      ? Math.round((progressionActuelle / progressionTotal) * 100)
      : 0

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Import Excel Schenk</h1>
        <p className="text-sm text-muted-foreground">
          Chaque onglet = une tournée. Dédup par code Schenk (N°), sinon par
          enseigne + code postal + tournée. Onglets « Prospects » / « 0. Autres »
          sont importés sans tournée.
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
            {preview.onglets.map((o) => {
              const importable = o.tourneeId || o.sansTournee
              return (
                <li key={o.nomOnglet} className="py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{o.nomOnglet}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.sansTournee
                          ? '→ Sans tournée (Prospects/Autres)'
                          : `→ ${o.tourneeDb ?? 'aucune tournée associée'}`}
                      </p>
                      {o.colonnesInconnues.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Colonnes ignorées : {o.colonnesInconnues.join(', ')}
                        </p>
                      )}
                    </div>
                    {importable ? (
                      <Badge variant="secondary">{o.nbLignes} lignes</Badge>
                    ) : (
                      <Badge variant="destructive">Ignoré</Badge>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <Button
            type="button"
            onClick={lancerImport}
            className="mt-4 h-12 w-full text-base"
          >
            Lancer l&apos;import
          </Button>
        </Card>
      )}

      {etape === 'importing' && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Import en cours…</span>
            <span>
              {progressionActuelle} / {progressionTotal}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>
      )}

      {etape === 'done' && rapport && (
        <Card className="space-y-4 p-4">
          <h2 className="font-semibold">Import terminé</h2>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Établissements
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.etablissements.crees}</p>
                <p className="text-xs text-muted-foreground">Créés</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.etablissements.misAJour}</p>
                <p className="text-xs text-muted-foreground">Mis à jour</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.etablissements.ignores}</p>
                <p className="text-xs text-muted-foreground">Ignorés</p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contacts principaux
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.contacts.crees}</p>
                <p className="text-xs text-muted-foreground">Créés</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.contacts.misAJour}</p>
                <p className="text-xs text-muted-foreground">Mis à jour</p>
              </div>
            </div>
          </div>
          {rapport.erreurs.length > 0 && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {rapport.erreurs.length} erreur(s)
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {rapport.erreurs.map((e, i) => (
                  <li key={i} className="text-destructive">
                    {e.onglet} L{e.ligne} : {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button type="button" onClick={reset} className="h-12 w-full">
            Nouvel import
          </Button>
        </Card>
      )}

      {/* Zone dangereuse : réinitialisation complète des imports */}
      <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h3 className="text-sm font-semibold">Zone dangereuse</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Supprime TOUS les établissements, contacts et visites. Les tournées
          BDD (18) sont préservées. Double-clic requis pour confirmer.
        </p>
        <Button
          type="button"
          variant="destructive"
          onClick={onResetClick}
          disabled={resetState === 'busy'}
          className="mt-3 h-12 w-full text-base"
        >
          {resetState === 'idle' && 'Réinitialiser tous les imports'}
          {resetState === 'armed' && '⚠️  Cliquer à nouveau pour confirmer'}
          {resetState === 'busy' && 'Suppression en cours…'}
        </Button>
        {resetMessage && (
          <p className="mt-2 text-xs text-muted-foreground">{resetMessage}</p>
        )}
      </div>
    </div>
  )
}
