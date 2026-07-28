import { lireStatistiquesFunnel, lireClientsEnRetard } from '@/actions/funnel'
import { lireHistoriqueHebdo } from '@/actions/objectif'
import { CamembertStatuts } from '@/components/funnel/camembert-statuts'
import { ListeEnDanger } from '@/components/funnel/liste-en-danger'
import { BoutonActualiser } from '@/components/funnel/bouton-actualiser'
import { HistoriqueHebdoChart } from '@/components/funnel/historique-hebdo'
import { Card } from '@/components/ui/card'

export default async function FunnelPage() {
  const [stats, enRetard, histo] = await Promise.all([
    lireStatistiquesFunnel(),
    lireClientsEnRetard(),
    lireHistoriqueHebdo(),
  ])

  if (stats.erreur || !stats.data) {
    return (
      <p className="p-6 text-sm text-destructive">
        Erreur de chargement du funnel.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Funnel commercial</h1>
        <p className="text-sm text-muted-foreground">
          {stats.data.total} établissements au total.
        </p>
      </header>

      <Card className="p-3">
        <CamembertStatuts stats={stats.data} />
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <div>
            Prospects : <b>{stats.data.prospect}</b>
          </div>
          <div>
            Clients actifs : <b>{stats.data.client_actif}</b>
          </div>
          <div>
            Clients inactifs : <b>{stats.data.client_inactif}</b>
          </div>
          <div>
            Abandonnés : <b>{stats.data.prospect_abandonne}</b>
          </div>
          <div>
            Pas intéressés : <b>{stats.data.pas_interesse}</b>
          </div>
          <div>
            Fermés : <b>{stats.data.ferme}</b>
          </div>
        </div>
      </Card>

      {histo.data && <HistoriqueHebdoChart h={histo.data} />}

      <BoutonActualiser />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Clients en retard ({enRetard.data?.length ?? 0})
        </h2>
        <ListeEnDanger etabs={enRetard.data ?? []} />
      </section>
    </div>
  )
}
