'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { mettreAJourParametre, type MapParametres } from '@/actions/parametres'

interface Props { initial: MapParametres }

const CHAMPS = [
  { cle: 'objectif_visites_clients_par_jour',   label: 'Objectif clients par jour', min: 0, max: 50 },
  { cle: 'objectif_visites_prospects_par_jour', label: 'Objectif prospects par jour', min: 0, max: 50 },
  { cle: 'seuil_inactivite_mois_global',        label: 'Seuil inactivité (mois)', min: 1, max: 60 },
] as const

export function FormulaireParametres({ initial }: Props) {
  const router = useRouter()
  const [valeurs, setValeurs] = useState<Record<string, number>>({
    objectif_visites_clients_par_jour: Number(initial.objectif_visites_clients_par_jour ?? 6),
    objectif_visites_prospects_par_jour: Number(initial.objectif_visites_prospects_par_jour ?? 2),
    seuil_inactivite_mois_global: Number(initial.seuil_inactivite_mois_global ?? 12),
  })
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function onChange(cle: string, v: string) {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    setValeurs((s) => ({ ...s, [cle]: n }))
  }

  function onSave(cle: string) {
    setMessages((m) => ({ ...m, [cle]: '' }))
    startTransition(async () => {
      const r = await mettreAJourParametre(cle, valeurs[cle])
      setMessages((m) => ({
        ...m,
        [cle]: r.erreur ?? '✓ Enregistré',
      }))
      if (!r.erreur) router.refresh()
    })
  }

  return (
    <Card className="space-y-4 p-4">
      {CHAMPS.map((c) => (
        <div key={c.cle} className="space-y-2">
          <Label htmlFor={c.cle}>{c.label}</Label>
          <div className="flex gap-2">
            <Input
              id={c.cle}
              type="number"
              inputMode="numeric"
              min={c.min}
              max={c.max}
              value={valeurs[c.cle]}
              onChange={(e) => onChange(c.cle, e.target.value)}
              className="h-12 flex-1 text-base"
            />
            <Button
              type="button"
              onClick={() => onSave(c.cle)}
              disabled={pending}
              className="h-12 px-4"
            >
              Enregistrer
            </Button>
          </div>
          {messages[c.cle] && (
            <p className={`text-xs ${messages[c.cle].startsWith('✓') ? 'text-emerald-600' : 'text-destructive'}`}>
              {messages[c.cle]}
            </p>
          )}
        </div>
      ))}
    </Card>
  )
}
