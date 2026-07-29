'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { lireEtablissements } from '@/actions/etablissement'
import { correspondRecherche, normaliserRecherche } from '@/lib/etablissements/recherche'
import type { Etablissement } from '@/types/database'

interface Props {
  valeurId: string | null
  onSelect: (etab: { id: string; enseigne: string } | null) => void
}

export function AutocompleteEtablissement({ valeurId, onSelect }: Props) {
  const [tous, setTous] = useState<Etablissement[]>([])
  const [q, setQ] = useState('')
  const [selection, setSelection] = useState<{ id: string; enseigne: string } | null>(null)

  useEffect(() => {
    void lireEtablissements().then(r => {
      if (r.data) setTous(r.data)
      if (valeurId) {
        const e = r.data?.find(x => x.id === valeurId)
        if (e) setSelection({ id: e.id, enseigne: e.enseigne })
      }
    })
  }, [valeurId])

  const suggestions = useMemo(() => {
    if (!q || selection) return []
    const norm = normaliserRecherche(q)
    return tous.filter(e => correspondRecherche(e, norm)).slice(0, 6)
  }, [q, tous, selection])

  if (selection) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
        <span className="truncate text-sm">{selection.enseigne}</span>
        <button
          type="button"
          onClick={() => { setSelection(null); setQ(''); onSelect(null) }}
          className="text-xs underline"
        >
          Changer
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        placeholder="Rechercher un établissement…"
        value={q}
        onChange={e => setQ(e.target.value)}
        className="h-12 text-base"
      />
      {suggestions.length > 0 && (
        <Card className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto p-1">
          {suggestions.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setSelection({ id: e.id, enseigne: e.enseigne })
                onSelect({ id: e.id, enseigne: e.enseigne })
              }}
              className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {e.enseigne}
              {e.ville && <span className="ml-2 text-xs text-muted-foreground">{e.ville}</span>}
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}
