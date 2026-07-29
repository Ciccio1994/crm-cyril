'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  etablissements: Array<{ id: string; enseigne: string }>
  valeur: string | null
  onChange: (id: string | null) => void
}

export function FiltreEtablissement({ etablissements, valeur, onChange }: Props) {
  return (
    <Select
      value={valeur ?? 'tous'}
      onValueChange={(v) => onChange(v === 'tous' ? null : (v ?? null))}
    >
      <SelectTrigger className="h-10 w-full text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="tous">Tous les clients</SelectItem>
        {etablissements.map((e) => (
          <SelectItem key={e.id} value={e.id}>{e.enseigne}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
