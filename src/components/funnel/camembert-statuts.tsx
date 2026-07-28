'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { StatistiquesFunnel } from '@/actions/funnel'
import type { StatutCommercial } from '@/types/database'

const LIBELLES: Record<StatutCommercial, string> = {
  prospect: 'Prospects',
  client_actif: 'Clients actifs',
  client_inactif: 'Clients inactifs',
  pas_interesse: 'Pas intéressés',
  prospect_abandonne: 'Abandonnés',
  ferme: 'Fermés',
  contentieux: 'Contentieux',
}

const COULEURS: Record<StatutCommercial, string> = {
  prospect: '#3b82f6',
  client_actif: '#10b981',
  client_inactif: '#f59e0b',
  pas_interesse: '#94a3b8',
  prospect_abandonne: '#6b7280',
  ferme: '#ef4444',
  contentieux: '#a855f7',
}

export function CamembertStatuts({ stats }: { stats: StatistiquesFunnel }) {
  const data = (Object.keys(LIBELLES) as StatutCommercial[])
    .map((k) => ({ name: LIBELLES[k], value: stats[k], couleur: COULEURS[k] }))
    .filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Aucune donnée à afficher.
      </p>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={100}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.couleur} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
