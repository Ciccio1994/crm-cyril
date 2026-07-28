import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { lireObjectifDuJour } from '@/actions/objectif'

interface BarreProps {
  actuel: number
  cible: number
  couleur: 'bleu' | 'vert'
}
function Barre({ actuel, cible, couleur }: BarreProps) {
  const pct = cible === 0 ? 100 : Math.min(100, (actuel / cible) * 100)
  const bg = couleur === 'vert' ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div className={`h-full transition-all ${bg}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export async function WidgetObjectif() {
  const r = await lireObjectifDuJour()
  if (r.erreur || !r.data) return null
  const { compteur, seuils, atteint } = r.data

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Objectif du jour
        </h2>
        {atteint && (
          <Badge className="bg-emerald-500 hover:bg-emerald-500">
            🎯 Atteint !
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span>Clients visités</span>
          <span><b>{compteur.clients}</b> / {seuils.objectif_clients}</span>
        </div>
        <Barre
          actuel={compteur.clients}
          cible={seuils.objectif_clients}
          couleur={compteur.clients >= seuils.objectif_clients ? 'vert' : 'bleu'}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span>Prospects démarchés</span>
          <span><b>{compteur.prospects}</b> / {seuils.objectif_prospects}</span>
        </div>
        <Barre
          actuel={compteur.prospects}
          cible={seuils.objectif_prospects}
          couleur={compteur.prospects >= seuils.objectif_prospects ? 'vert' : 'bleu'}
        />
      </div>
    </Card>
  )
}
