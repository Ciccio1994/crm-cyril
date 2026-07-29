'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  creerOffre, mettreAJourOffre, supprimerOffre, uploadOffrePdf,
} from '@/actions/offres'
import { executerAvecSync, executerAvecSyncCible } from '@/lib/sync/wrapper'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { Offre } from '@/types/database'

interface Props { mode: 'creation' | 'edition'; initial?: Offre }

type FormState = {
  cuvee_text: string
  prix_promo_chf: string
  date_debut: string
  date_fin: string
  conditions: string
  notes: string
  source_pdf_url: string | null
}

function initFrom(o?: Offre): FormState {
  return {
    cuvee_text:     o?.cuvee_text ?? '',
    prix_promo_chf: o?.prix_promo_chf?.toString() ?? '',
    date_debut:     o?.date_debut ?? '',
    date_fin:       o?.date_fin ?? '',
    conditions:     o?.conditions ?? '',
    notes:          o?.notes ?? '',
    source_pdf_url: o?.source_pdf_url ?? null,
  }
}

function payloadFromState(s: FormState) {
  const clean = (v: string) => (v.trim() === '' ? null : v.trim())
  const prix = clean(s.prix_promo_chf)
  return {
    cuvee_text:     s.cuvee_text.trim(),
    prix_promo_chf: prix ? Number(prix) : null,
    date_debut:     clean(s.date_debut),
    date_fin:       clean(s.date_fin),
    conditions:     clean(s.conditions),
    notes:          clean(s.notes),
    source_pdf_url: s.source_pdf_url,
  }
}

export function FormulaireOffre({ mode, initial }: Props) {
  const router = useRouter()
  const [state, setState] = useState<FormState>(() => initFrom(initial))
  const [erreur, setErreur] = useState<string | null>(null)
  const [messagePdf, setMessagePdf] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((s) => ({ ...s, [k]: v }))
  }

  async function onPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessagePdf(null)
    const fd = new FormData()
    fd.append('fichier', file)
    const r = await uploadOffrePdf(fd)
    setUploading(false)
    if (r.erreur || !r.data) {
      setMessagePdf(`Erreur : ${r.erreur ?? 'inconnue'}`)
      return
    }
    set('source_pdf_url', r.data)
    setMessagePdf('✓ PDF joint')
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!state.cuvee_text.trim()) {
      setErreur('Cuvée obligatoire.')
      return
    }
    const payload = payloadFromState(state)
    startTransition(async () => {
      const r = mode === 'creation'
        ? await executerAvecSync('creerOffre', payload, (p) => creerOffre(p))
        : await executerAvecSyncCible(
            'mettreAJourOffre', initial!.id, payload,
            (id, p) => mettreAJourOffre(id, p),
          )
      if (r.erreur) {
        setErreur(typeof r.erreur === 'string' ? r.erreur : 'Erreur')
        return
      }
      notifierChangement()
      router.push('/admin/offres')
    })
  }

  async function onSupprimer() {
    if (!initial) return
    if (!window.confirm(`Supprimer l'offre "${initial.cuvee_text}" ?`)) return
    startTransition(async () => {
      await executerAvecSyncCible(
        'supprimerOffre', initial.id, {},
        (id) => supprimerOffre(id),
      )
      notifierChangement()
      router.push('/admin/offres')
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button" onClick={() => router.back()}
          className="tap-target -ml-2 rounded-md text-xl leading-none"
          aria-label="Retour"
        >‹</button>
        <h1 className="flex-1 truncate text-lg font-semibold">
          {mode === 'creation' ? 'Nouvelle offre' : 'Modifier offre'}
        </h1>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4 pb-32">
        <div className="space-y-1.5">
          <Label htmlFor="cuvee">Cuvée *</Label>
          <Input
            id="cuvee" value={state.cuvee_text}
            onChange={(e) => set('cuvee_text', e.target.value)}
            required placeholder="Fendant Mont d'Or 2023"
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prix">Prix promo (CHF)</Label>
          <Input
            id="prix" type="number" inputMode="decimal" step="0.05" min="0"
            value={state.prix_promo_chf}
            onChange={(e) => set('prix_promo_chf', e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="dd">Date début</Label>
            <Input
              id="dd" type="date" value={state.date_debut}
              onChange={(e) => set('date_debut', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="df">Date fin</Label>
            <Input
              id="df" type="date" value={state.date_fin}
              onChange={(e) => set('date_fin', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cond">Conditions</Label>
          <Textarea
            id="cond" rows={3} placeholder="Sur 6 bouteilles minimum"
            value={state.conditions}
            onChange={(e) => set('conditions', e.target.value)}
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes internes</Label>
          <Textarea
            id="notes" rows={3}
            value={state.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label>PDF joint</Label>
          <label
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'flex h-12 cursor-pointer items-center justify-center text-base',
            )}
          >
            <input
              type="file" accept="application/pdf"
              onChange={onPdfChange} disabled={uploading}
              className="sr-only"
            />
            {uploading ? 'Upload…' : state.source_pdf_url ? 'Remplacer le PDF' : 'Joindre un PDF'}
          </label>
          {state.source_pdf_url && (
            <a
              href={state.source_pdf_url}
              target="_blank" rel="noreferrer"
              className="block text-center text-sm underline"
            >
              Voir PDF
            </a>
          )}
          {messagePdf && (
            <p className={`text-xs ${messagePdf.startsWith('✓') ? 'text-emerald-600' : 'text-destructive'}`}>
              {messagePdf}
            </p>
          )}
        </div>

        {mode === 'edition' && (
          <Button
            type="button" variant="destructive"
            onClick={onSupprimer} disabled={pending}
            className="h-12 text-base"
          >
            Supprimer l&apos;offre
          </Button>
        )}

        {erreur && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {erreur}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-white/95 px-4 py-3 safe-bottom backdrop-blur">
        <div className="flex gap-2">
          <Link
            href="/admin/offres"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-base')}
          >
            Annuler
          </Link>
          <Button
            type="submit" disabled={pending || uploading}
            className="h-12 flex-1 text-base"
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  )
}
