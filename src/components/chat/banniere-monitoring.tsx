'use client'

import type { EtatMonitoring } from '@/lib/claude/monitoring'

export function BanniereMonitoring({ monitoring }: { monitoring: EtatMonitoring | null }) {
  if (!monitoring || !monitoring.au_dela_seuil) return null

  const pct =
    monitoring.seuil_chf > 0
      ? Math.round((monitoring.cout_chf_mois / monitoring.seuil_chf) * 100)
      : 0

  return (
    <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
      ⚠️ Consommation Claude : {monitoring.cout_chf_mois.toFixed(2)} CHF / {monitoring.seuil_chf}{' '}
      CHF ({pct} %)
    </div>
  )
}
