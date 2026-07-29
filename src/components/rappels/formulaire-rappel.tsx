'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AutocompleteEtablissement } from './autocomplete-etablissement'
import { creerRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'

type Canal = 'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre'

export function FormulaireRappel({ etablissementIdInitial, onSuccess }: {
  etablissementIdInitial?: string
  onSuccess: () => void
}) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [echeance, setEcheance] = useState('')
  const [canal, setCanal] = useState<Canal | ''>('')
  const [etabId, setEtabId] = useState<string | null>(etablissementIdInitial ?? null)
  const [pending, startTransition] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    startTransition(async () => {
      const r = await creerRappel({
        titre,
        description: description || null,
        echeance: new Date(echeance).toISOString(),
        canal: canal || null,
        etablissement_id: etabId,
        push_active: true,
      })
      if (r.erreur) { setErreur(r.erreur); return }
      notifierChangement()
      onSuccess()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="titre">Titre *</Label>
        <Input
          id="titre"
          value={titre}
          onChange={e => setTitre(e.target.value)}
          required
          maxLength={200}
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="echeance">Date / heure *</Label>
        <Input
          id="echeance"
          type="datetime-local"
          value={echeance}
          onChange={e => setEcheance(e.target.value)}
          required
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="canal">Canal</Label>
        <select
          id="canal"
          value={canal}
          onChange={e => setCanal(e.target.value as Canal | '')}
          className="h-12 w-full rounded-md border bg-background px-3 text-base"
        >
          <option value="">—</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="mail">Mail</option>
          <option value="telephone">Téléphone</option>
          <option value="sms">SMS</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Client lié (optionnel)</Label>
        <AutocompleteEtablissement
          valeurId={etabId}
          onSelect={e => setEtabId(e?.id ?? null)}
        />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        {pending ? 'Enregistrement…' : 'Créer le rappel'}
      </Button>
    </form>
  )
}
