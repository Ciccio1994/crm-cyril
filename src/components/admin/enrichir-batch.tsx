'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { recupererNomEtHorairesDepuisGoogle } from '@/actions/horaires-google'
import type { CandidatEnrichissement } from '@/actions/enrichir-google'
import { notifierChangement } from '@/lib/sync/revalidation'

const DELAI_MS_ENTRE_APPELS = 500  // respect rate limit Google Places

type Statut = 'attente' | 'en_cours' | 'trouve' | 'non_trouve' | 'erreur'

interface ProgressEntry {
  id: string
  enseigne: string
  statut: Statut
  nouveau_nom?: string | null
  horaires_ecrites?: boolean
  erreur?: string
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function EnrichirBatch({ candidatsInitiaux }: { candidatsInitiaux: CandidatEnrichissement[] }) {
  const [candidats] = useState(candidatsInitiaux)
  const [progression, setProgression] = useState<ProgressEntry[]>(
    candidatsInitiaux.map((c) => ({ id: c.id, enseigne: c.enseigne, statut: 'attente' })),
  )
  const [enCours, setEnCours] = useState(false)
  const [indexCourant, setIndexCourant] = useState(0)
  const arretRef = useRef(false)

  const total = candidats.length
  const traites = progression.filter((p) => p.statut !== 'attente' && p.statut !== 'en_cours').length
  const trouves = progression.filter((p) => p.statut === 'trouve').length
  const nonTrouves = progression.filter((p) => p.statut === 'non_trouve' || p.statut === 'erreur').length

  function majEntry(id: string, patch: Partial<ProgressEntry>) {
    setProgression((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function lancerBatch() {
    if (candidats.length === 0) return
    setEnCours(true)
    arretRef.current = false
    // Repart de zéro
    setProgression(candidats.map((c) => ({ id: c.id, enseigne: c.enseigne, statut: 'attente' })))

    for (let i = 0; i < candidats.length; i++) {
      if (arretRef.current) break
      const c = candidats[i]
      setIndexCourant(i)
      majEntry(c.id, { statut: 'en_cours' })
      try {
        const r = await recupererNomEtHorairesDepuisGoogle(c.id)
        if (r.erreur) {
          majEntry(c.id, { statut: 'erreur', erreur: r.erreur })
        } else if (r.data) {
          if (r.data.enseigne_ecrasee || r.data.horaires_ecrites) {
            majEntry(c.id, {
              statut: 'trouve',
              nouveau_nom: r.data.nouveau_nom,
              horaires_ecrites: r.data.horaires_ecrites,
            })
          } else {
            majEntry(c.id, { statut: 'non_trouve', nouveau_nom: r.data.nouveau_nom })
          }
        }
      } catch (e) {
        majEntry(c.id, { statut: 'erreur', erreur: e instanceof Error ? e.message : 'inconnue' })
      }
      // Rate limit : 500 ms entre chaque appel
      if (i < candidats.length - 1) await delay(DELAI_MS_ENTRE_APPELS)
    }

    setEnCours(false)
    notifierChangement()
  }

  function stopper() {
    arretRef.current = true
  }

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Aucun établissement à enrichir : aucune enseigne ne ressemble à un nom de personne.
      </div>
    )
  }

  const pct = total > 0 ? Math.round((traites / total) * 100) : 0

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">
              <span className="font-semibold">{total}</span> établissement(s) candidat(s) à enrichir
            </p>
            {enCours && (
              <p className="mt-1 text-xs text-muted-foreground">
                En cours : {traites}/{total} traités · {trouves} trouvés · {nonTrouves} non trouvés
              </p>
            )}
            {!enCours && traites > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Terminé : {trouves} trouvés · {nonTrouves} non trouvés
              </p>
            )}
          </div>
          {!enCours && (
            <Button type="button" onClick={lancerBatch} disabled={total === 0}>
              🔍 Lancer l&apos;enrichissement batch
            </Button>
          )}
          {enCours && (
            <Button type="button" variant="outline" onClick={stopper}>
              Arrêter
            </Button>
          )}
        </div>
        {(enCours || traites > 0) && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {enCours && (
          <p className="text-xs text-muted-foreground">
            ⏳ Délai de {DELAI_MS_ENTRE_APPELS} ms entre chaque appel Google Places (rate limit).
            Ne ferme pas cet onglet.
          </p>
        )}
      </Card>

      <ul className="space-y-1.5">
        {progression.map((p, i) => {
          const c = candidats[i]
          return (
            <li key={p.id}>
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {p.statut === 'attente' && <Badge variant="outline">⏸ Attente</Badge>}
                      {p.statut === 'en_cours' && <Badge>⏳ En cours</Badge>}
                      {p.statut === 'trouve' && <Badge className="bg-emerald-500 hover:bg-emerald-500">✅ Trouvé</Badge>}
                      {p.statut === 'non_trouve' && <Badge variant="secondary">⚠️ Non trouvé</Badge>}
                      {p.statut === 'erreur' && <Badge variant="destructive">❌ Erreur</Badge>}
                    </div>
                    <p className="mt-1 text-sm">
                      <Link href={`/etablissements/${p.id}`} className="font-medium underline">
                        {p.enseigne}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[c?.code_postal, c?.ville, c?.telephone_principal].filter(Boolean).join(' · ')}
                    </p>
                    {p.statut === 'trouve' && p.nouveau_nom && (
                      <p className="mt-1 text-xs text-emerald-700">
                        → {p.nouveau_nom}
                        {p.horaires_ecrites && ' (+ horaires)'}
                      </p>
                    )}
                    {p.statut === 'non_trouve' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Rien à mettre à jour {p.nouveau_nom ? `(Google propose « ${p.nouveau_nom} » mais l'enseigne actuelle a été gardée)` : ''}
                      </p>
                    )}
                    {p.statut === 'erreur' && (
                      <p className="mt-1 text-xs text-destructive">{p.erreur}</p>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
