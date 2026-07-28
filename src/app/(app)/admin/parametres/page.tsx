import { lireParametres } from '@/actions/parametres'
import { FormulaireParametres } from '@/components/admin/formulaire-parametres'

export default async function AdminParametresPage() {
  const r = await lireParametres()
  if (r.erreur || !r.data) {
    return <p className="p-6 text-sm text-destructive">Erreur de chargement.</p>
  }
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Objectifs quotidiens et seuils. Modifications appliquées immédiatement.
        </p>
      </header>
      <FormulaireParametres initial={r.data} />
    </div>
  )
}
