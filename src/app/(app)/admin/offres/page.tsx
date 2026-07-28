import { lireOffres } from '@/actions/offres'
import { ListeOffres } from '@/components/offres/liste-offres'

export default async function AdminOffresPage() {
  const r = await lireOffres()
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Offres Schenk</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des cuvées en promotion.
        </p>
      </header>
      <ListeOffres offres={r.data ?? []} />
    </div>
  )
}
