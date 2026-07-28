'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { Card } from '@/components/ui/card'
import type { HistoriqueHebdo } from '@/actions/objectif'

export function HistoriqueHebdoChart({ h }: { h: HistoriqueHebdo }) {
  const data = h.jours.map((j) => ({
    jour: j.jour.slice(5),
    total: j.clients + j.prospects,
    atteint: j.atteint,
  }))

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Historique 28 jours
        </h2>
        <span className="text-xs text-muted-foreground">
          {h.joursAtteintCetteSemaine}/7 cette semaine · {h.joursAtteint28j}/28 sur 28 j
        </span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="jour" tick={{ fontSize: 10 }} interval={3} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              formatter={(value) => [`${value} visites`, '']}
              labelFormatter={(label) => `Jour : ${label}`}
            />
            <Bar dataKey="total">
              {data.map((d, i) => (
                <Cell key={i} fill={d.atteint ? '#10b981' : '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Vert = jour à objectif ({h.seuils.objectif_clients} clients + {h.seuils.objectif_prospects} prospects).
      </p>
    </Card>
  )
}
