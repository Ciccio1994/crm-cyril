import { lireEtablissements } from '@/actions/etablissement'
import { ListeEtablissements } from '@/components/etablissements/liste-etablissements'

export default async function EtablissementsPage() {
  const { data, erreur } = await lireEtablissements()

  if (erreur) {
    return (
      <div className="p-6 text-sm text-destructive">
        Erreur au chargement des établissements.
      </div>
    )
  }

  return <ListeEtablissements etablissements={data ?? []} />
}
